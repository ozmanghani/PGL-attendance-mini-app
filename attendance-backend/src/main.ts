import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use('/iclock/cdata', bodyParser.text({ type: '*/*', limit: '10mb' }));

  // Configure CORS for frontend
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  });

  // Serve static files from frontend build (use resources path in production)
  const frontendPath = process.env.RESOURCES_PATH
    ? path.join(process.env.RESOURCES_PATH, 'attendance-frontend/out')
    : path.join(__dirname, '../../../attendance-frontend/out');
  app.useStaticAssets(frontendPath);

  // Catch all handler: send back index.html for client-side routing
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });

  await app.listen(process.env.PORT ?? 4001);
  console.log(`Server running on port ${process.env.PORT ?? 4001}`);
}
bootstrap();
