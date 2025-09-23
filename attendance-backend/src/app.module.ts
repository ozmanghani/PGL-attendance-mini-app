import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AttendanceService } from './app.service';
import { AttendanceGateway } from './attendance.gateway';
import { PrismaClient } from '@prisma/client';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [
    AttendanceService,
    AttendanceGateway,
    {
      provide: PrismaClient,
      useValue: new PrismaClient(),
    },
  ],
})
export class AppModule {}
