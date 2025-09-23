import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AttendanceService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AttendanceService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });
});
