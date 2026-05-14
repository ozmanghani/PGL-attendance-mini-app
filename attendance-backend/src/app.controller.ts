import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AttendanceService } from './app.service';
import { SettingsService } from './settings.service';

@Controller()
export class AppController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly settings: SettingsService,
  ) {}

  @Post('iclock/cdata')
  async handleAttendanceData(@Body() body: any, @Res() res: Response) {
    try {
      const rawData = body.toString().trim();
      if (rawData.startsWith('~DeviceName=')) {
        console.log('Device info received:', rawData);
        return this.handleDeviceInfo(res);
      }
      await this.attendanceService.saveAttendance(rawData);
      res.header('Content-Type', 'text/plain').send('OK');
    } catch (error) {
      console.error('Error handling attendance data:', error);
      res.status(500).send('SERVER ERROR');
    }
  }

  @Get('attendance')
  async getAttendance(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('filter') filter: string = 'all',
  ) {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    return this.attendanceService.getAttendance(pageNum, limitNum, filter);
  }

  @Get('unsynced-ids')
  async getUnsyncedIds() {
    return this.attendanceService.getAllUnsyncedIds();
  }

  @Post('sync')
  async syncRecords(@Body() body: { ids: number[] }) {
    return this.attendanceService.syncSelectedRecords(body.ids);
  }

  @Post('sync-all')
  async syncAllRecords() {
    return this.attendanceService.syncAllRecords();
  }

  @Get('stats')
  async getStats() {
    return this.attendanceService.getRecordStats();
  }

  @Get('api/health')
  health() {
    const s = this.settings.get();
    return {
      ok: true,
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      port: s.port,
      hrmisUrl: s.hrmisUrl,
      now: new Date().toISOString(),
    };
  }

  @Get('api/settings')
  getSettings() {
    return this.settings.get();
  }

  @Put('api/settings')
  async putSettings(@Body() body: { hrmisUrl?: string; port?: number }) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Body required');
    }
    if (body.hrmisUrl !== undefined) {
      if (typeof body.hrmisUrl !== 'string' || body.hrmisUrl.trim() === '') {
        throw new BadRequestException('hrmisUrl must be a non-empty string');
      }
      try {
        const u = new URL(body.hrmisUrl);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          throw new Error('protocol');
        }
      } catch {
        throw new BadRequestException('hrmisUrl must be a valid http(s) URL');
      }
    }
    if (body.port !== undefined) {
      const p = Number(body.port);
      if (!Number.isFinite(p) || p < 1 || p > 65535) {
        throw new BadRequestException('port must be between 1 and 65535');
      }
      body.port = p;
    }
    const next = await this.settings.update(body);
    return { ok: true, settings: next };
  }

  private handleDeviceInfo(res: Response) {
    res.header('Content-Type', 'text/plain').send('OK');
  }
}
