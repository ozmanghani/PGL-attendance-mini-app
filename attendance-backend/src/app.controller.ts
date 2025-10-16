import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AttendanceService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly attendanceService: AttendanceService) {}

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

  private handleDeviceInfo(res: Response) {
    res.header('Content-Type', 'text/plain').send('OK');
  }
}
