import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import * as fs from 'fs';
import { SettingsService } from './settings.service';

function resolveFrontendPath(): string {
  if (process.env.RESOURCES_PATH) {
    return path.join(process.env.RESOURCES_PATH, 'attendance-frontend', 'out');
  }
  const candidates = [
    path.join(__dirname, '..', '..', 'attendance-frontend', 'out'),
    path.join(__dirname, '..', '..', '..', 'attendance-frontend', 'out'),
    path.join(process.cwd(), 'attendance-frontend', 'out'),
    path.join(process.cwd(), '..', 'attendance-frontend', 'out'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c;
  }
  return candidates[0];
}

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') {
    return;
  }
  if (process.platform === 'win32') {
    const dir = SettingsService.dataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const dbPath = path.join(dir, 'attendance.db').replace(/\\/g, '/');
    process.env.DATABASE_URL = `file:${dbPath}`;
  }
}

async function bootstrap() {
  ensureDatabaseUrl();

  const initial = SettingsService.loadSync();
  const port = initial.port;

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use('/iclock/cdata', bodyParser.text({ type: '*/*', limit: '10mb' }));

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    credentials: true,
  });

  const frontendPath = resolveFrontendPath();
  app.useStaticAssets(frontendPath);

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/', (_req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });

  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Server running on port ${port} — frontend: ${frontendPath}`);

  // If the port is changed via /api/settings, exit cleanly. NSSM (or any
  // supervisor) will restart us on the new port. We delay slightly so the
  // PUT /api/settings response can flush back to the caller first.
  const settingsSvc = app.get(SettingsService);
  settingsSvc.on('portChange', (next: number, prev: number) => {
    // eslint-disable-next-line no-console
    console.log(`Port changed ${prev} -> ${next}; exiting so supervisor can restart on the new port.`);
    setTimeout(async () => {
      try { await app.close(); } catch { /* ignore */ }
      process.exit(0);
    }, 1500);
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`Received ${signal}, closing...`);
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    // eslint-disable-next-line no-console
    console.error('uncaughtException:', err);
  });
  process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('unhandledRejection:', reason);
  });
}
bootstrap();
