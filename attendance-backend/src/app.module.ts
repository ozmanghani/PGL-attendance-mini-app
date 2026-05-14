import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AttendanceService } from './app.service';
import { AttendanceGateway } from './attendance.gateway';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from './settings.service';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [AppController],
  providers: [
    SettingsService,
    AttendanceService,
    AttendanceGateway,
    {
      provide: PrismaClient,
      useFactory: () => {
        const url = process.env.DATABASE_URL;
        if (url && url.trim() !== '') {
          return new PrismaClient({ datasourceUrl: url });
        }
        return new PrismaClient();
      },
    },
  ],
})
export class AppModule {}
