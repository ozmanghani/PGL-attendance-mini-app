import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AttendanceGateway } from './attendance.gateway';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);
  private syncQueue: any[] = [];
  private failedQueue: any[] = [];
  private batchCollector: any[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isProcessingFailed = false;

  constructor(
    private prisma: PrismaClient,
    private attendanceGateway: AttendanceGateway,
  ) {
    this.startSyncProcess();
    this.startFailedRetryProcess();
  }

  async saveAttendance(rawData: string) {
    const lines = rawData
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const isBatch = lines.length > 1;

    for (const line of lines) {
      this.logger.log(`Saving raw attendance: ${line}`);
      const record = await this.prisma.rawAttendance.create({
        data: { rawData: line, isSynced: false },
      });

      const parsedRecord = {
        id: record.id,
        ...this.parseRawData(record.rawData),
        isSynced: record.isSynced,
        createdAt: record.createdAt,
        lastError: record.lastError,
      };

      if (
        !line.startsWith('OPLOG') &&
        line.includes('\t') &&
        parsedRecord.datetime !== '0'
      ) {
        this.attendanceGateway.emitNewRecord(parsedRecord);
        this.attendanceGateway.emitStatsUpdate();
      }

      if (!isBatch) {
        await this.syncAllRecords();
        this.syncQueue.push({
          id: record.id,
          rawData: line,
          retryCount: 0,
        });
      }
    }

    if (!isBatch) {
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }

      this.batchTimeout = setTimeout(() => this.processBatch(), 2000);
    }

    return { message: `Processed ${lines.length} records` };
  }

  private processBatch() {
    if (this.batchCollector.length === 0) return;

    const parsed = this.batchCollector.map((item) => ({
      ...item,
      parsed: this.parseRawData(item.rawData),
    }));

    const status0 = parsed
      .filter((p) => p.parsed.status === '0')
      .sort(
        (a, b) =>
          new Date(a.parsed.datetime).getTime() -
          new Date(b.parsed.datetime).getTime(),
      );

    const status1 = parsed
      .filter((p) => p.parsed.status === '1')
      .sort(
        (a, b) =>
          new Date(a.parsed.datetime).getTime() -
          new Date(b.parsed.datetime).getTime(),
      );

    const others = parsed
      .filter((p) => p.parsed.status !== '0' && p.parsed.status !== '1')
      .sort((a, b) => a.id - b.id);

    const sorted = [...others, ...status0, ...status1].map((p) => ({
      id: p.id,
      rawData: p.rawData,
      retryCount: p.retryCount,
    }));

    this.syncQueue.push(...sorted);

    this.batchCollector = [];
    this.batchTimeout = null;
  }

  private async startSyncProcess() {
    setInterval(async () => {
      if (this.syncQueue.length > 0 && !this.isProcessing) {
        this.isProcessing = true;
        const item = this.syncQueue.shift();
        await this.syncToHRMIS(item);
        this.isProcessing = false;
      }
    }, 1000);
  }
  // https://hrmis-api.pglsystem.com/iclock/cdata

  private async syncToHRMIS(item: any) {
    const hrmisUrl =
      process.env.HRMIS_URL || 'https://hrmis-api.pglsystem.com/iclock/cdata';
    console.log('hrmisUrl:', hrmisUrl);
    const fullUrl = `${hrmisUrl}/iclock/cdata`;
    this.logger.log(
      `Syncing record ID ${item.id}, attempt ${item.retryCount + 1}`,
    );
    try {
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: item.rawData,
      });
      console.log(item.rawData);

      const text = await response.text();
      if (text === 'OK') {
        await this.prisma.rawAttendance.update({
          where: { id: item.id },
          data: { isSynced: true },
        });
        this.logger.log(`Successfully synced record ID ${item.id}`);
        this.attendanceGateway.emitSyncUpdate({ id: item.id, isSynced: true });
      } else {
        throw new Error(`HRMIS returned: ${text}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to sync record ID ${item.id}: ${error.message}`,
      );
      item.retryCount++;
      if (item.retryCount < 10) {
        this.syncQueue.push(item);
      } else {
        this.failedQueue.push({
          ...item,
          nextRetry: Date.now() + 10 * 60 * 1000,
        });
        await this.prisma.rawAttendance.update({
          where: { id: item.id },
          data: { lastError: error.message },
        });
      }
    }
  }

  private async startFailedRetryProcess() {
    setInterval(async () => {
      if (this.failedQueue.length > 0 && !this.isProcessingFailed) {
        this.isProcessingFailed = true;
        const now = Date.now();
        const item = this.failedQueue.find((i) => i.nextRetry <= now);
        if (item) {
          this.failedQueue = this.failedQueue.filter((i) => i.id !== item.id);
          item.retryCount = 0;
          this.syncQueue.push(item);
        }
        this.isProcessingFailed = false;
      }
    }, 60000);
  }

  async getAttendance(page: number, limit: number, filter: string) {
    const skip = (page - 1) * limit;
    let where: any = {
      AND: [
        { rawData: { not: { startsWith: 'OPLOG' } } },
        { rawData: { contains: '\t' } },
      ],
    };

    if (filter === 'synced') {
      where.AND.push({ isSynced: true });
    } else if (filter === 'unsynced') {
      where.AND.push({ isSynced: false });
    }

    const [records, total] = await Promise.all([
      this.prisma.rawAttendance.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.rawAttendance.count({ where }),
    ]);

    const parsedRecords = records
      .map((record) => ({
        id: record.id,
        ...this.parseRawData(record.rawData),
        isSynced: record.isSynced,
        createdAt: record.createdAt,
        lastError: record.lastError,
      }))
      .filter(
        (record) =>
          record.datetime !== '0' && !record.userId.startsWith('OPLOG'),
      );

    return {
      data: parsedRecords,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private parseRawData(rawData: string) {
    const parts = rawData.split('\t');
    if (parts.length >= 4) {
      return {
        userId: parts[0],
        datetime: parts[1],
        status: parts[2],
        verifyType: parts[3],
      };
    }
    return { userId: '', datetime: '', status: '', verifyType: '' };
  }

  private async fetchEmployeeName(userId: string): Promise<string> {
    // Simple fallback - just return the userId
    return `ID: ${userId}`;
  }

  async syncSelectedRecords(ids: number[]) {
    const syncedRecords = await this.prisma.rawAttendance.findMany({
      where: {
        id: { in: ids },
        isSynced: true,
      },
      select: { id: true },
    });

    if (syncedRecords.length > 0) {
      return {
        success: false,
        message: `One or more records you are trying to sync are already synced. Please refresh the page and try again.`,
      };
    }

    const records = await this.prisma.rawAttendance.findMany({
      where: { id: { in: ids }, isSynced: false },
    });

    const parsed = records.map((rec) => ({
      id: rec.id,
      rawData: rec.rawData,
      retryCount: 0,
      parsed: this.parseRawData(rec.rawData),
    }));

    const status0 = parsed
      .filter((p) => p.parsed.status === '0')
      .sort(
        (a, b) =>
          new Date(a.parsed.datetime).getTime() -
          new Date(b.parsed.datetime).getTime(),
      );

    const status1 = parsed
      .filter((p) => p.parsed.status === '1')
      .sort(
        (a, b) =>
          new Date(a.parsed.datetime).getTime() -
          new Date(b.parsed.datetime).getTime(),
      );

    const others = parsed
      .filter((p) => p.parsed.status !== '0' && p.parsed.status !== '1')
      .sort((a, b) => a.id - b.id);

    const sortedItems = [...others, ...status0, ...status1].map((p) => ({
      id: p.id,
      rawData: p.rawData,
      retryCount: p.retryCount,
    }));

    for (const item of sortedItems) {
      this.syncQueue.push(item);
    }

    return {
      success: true,
      message: 'Sync initiated for selected records',
    };
  }

  async syncAllRecords() {
    const unsyncedRecords = await this.prisma.rawAttendance.findMany({
      where: {
        AND: [
          { isSynced: false },
          { rawData: { not: { startsWith: 'OPLOG' } } },
          { rawData: { contains: '\t' } },
        ],
      },
      select: { id: true, rawData: true },
      orderBy: { id: 'asc' },
    });

    if (unsyncedRecords.length === 0) {
      return { success: true, message: 'No unsynced records found' };
    }

    const sortedItems = unsyncedRecords.map((rec) => ({
      id: rec.id,
      rawData: rec.rawData,
      retryCount: 0,
    }));

    for (const item of sortedItems) {
      this.syncQueue.push(item);
    }

    return {
      success: true,
      message: `Sync initiated for ${unsyncedRecords.length} unsynced records`,
    };
  }

  async getAllUnsyncedIds() {
    const unsyncedRecords = await this.prisma.rawAttendance.findMany({
      where: {
        AND: [
          { isSynced: false },
          { rawData: { not: { startsWith: 'OPLOG' } } },
          { rawData: { contains: '\t' } },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ids: unsyncedRecords.map((record) => record.id),
      count: unsyncedRecords.length,
    };
  }

  async getRecordStats() {
    const whereFilter = {
      AND: [
        { rawData: { not: { startsWith: 'OPLOG' } } },
        { rawData: { contains: '\t' } },
      ],
    };

    const [totalCount, syncedCount, unsyncedCount] = await Promise.all([
      this.prisma.rawAttendance.count({ where: whereFilter }),
      this.prisma.rawAttendance.count({
        where: { ...whereFilter, isSynced: true },
      }),
      this.prisma.rawAttendance.count({
        where: { ...whereFilter, isSynced: false },
      }),
    ]);

    return {
      total: totalCount,
      synced: syncedCount,
      unsynced: unsyncedCount,
    };
  }
}
