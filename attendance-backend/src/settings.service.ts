import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

export interface AppSettings {
  hrmisUrl: string;
  port: number;
}

const DEFAULTS: AppSettings = {
  hrmisUrl: 'https://people-api.pglsystem.com',
  port: 4001,
};

@Injectable()
export class SettingsService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SettingsService.name);
  private current: AppSettings = { ...DEFAULTS };
  private watcher: fs.FSWatcher | null = null;
  private reloadTimer: NodeJS.Timeout | null = null;

  static dataDir(): string {
    if (process.env.PGL_DATA_DIR && process.env.PGL_DATA_DIR.trim() !== '') {
      return process.env.PGL_DATA_DIR;
    }
    if (process.platform === 'win32') {
      const programData = process.env.ProgramData || 'C:\\ProgramData';
      return path.join(programData, 'PGL Attendance');
    }
    return path.join(process.cwd(), 'data');
  }

  static settingsFile(): string {
    return path.join(SettingsService.dataDir(), 'settings.json');
  }

  static loadSync(): AppSettings {
    const file = SettingsService.settingsFile();
    let merged: AppSettings = {
      ...DEFAULTS,
      hrmisUrl: process.env.HRMIS_URL || DEFAULTS.hrmisUrl,
      port: process.env.PORT ? Number(process.env.PORT) : DEFAULTS.port,
    };
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        if (typeof parsed.hrmisUrl === 'string' && parsed.hrmisUrl.trim() !== '') {
          merged.hrmisUrl = parsed.hrmisUrl.trim().replace(/\/+$/, '');
        }
        if (typeof parsed.port === 'number' && Number.isFinite(parsed.port)) {
          merged.port = parsed.port;
        }
      }
    } catch (err) {
      // Fall through with defaults; we don't want a malformed file to take the service down.
    }
    return merged;
  }

  onModuleInit() {
    this.current = SettingsService.loadSync();
    this.logger.log(
      `Settings loaded: hrmisUrl=${this.current.hrmisUrl} port=${this.current.port} (file=${SettingsService.settingsFile()})`,
    );
    this.ensureDirAndFile();
    this.startWatcher();
  }

  onModuleDestroy() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
  }

  get(): AppSettings {
    return { ...this.current };
  }

  get hrmisUrl(): string {
    return this.current.hrmisUrl.replace(/\/+$/, '');
  }

  get port(): number {
    return this.current.port;
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const next: AppSettings = { ...this.current };
    if (typeof patch.hrmisUrl === 'string' && patch.hrmisUrl.trim() !== '') {
      next.hrmisUrl = patch.hrmisUrl.trim().replace(/\/+$/, '');
    }
    if (
      typeof patch.port === 'number' &&
      Number.isFinite(patch.port) &&
      patch.port > 0 &&
      patch.port < 65536
    ) {
      next.port = Math.floor(patch.port);
    }
    await this.writeFile(next);
    this.applyChange(next, 'api');
    return this.get();
  }

  private ensureDirAndFile() {
    try {
      const dir = SettingsService.dataDir();
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const file = SettingsService.settingsFile();
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(this.current, null, 2), 'utf8');
      }
    } catch (err: any) {
      this.logger.warn(`Could not ensure settings file: ${err?.message}`);
    }
  }

  private async writeFile(next: AppSettings): Promise<void> {
    const file = SettingsService.settingsFile();
    const tmp = `${file}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }

  private startWatcher() {
    const file = SettingsService.settingsFile();
    const dir = path.dirname(file);
    try {
      this.watcher = fs.watch(dir, (_event, filename) => {
        if (!filename) return;
        if (path.basename(filename) !== path.basename(file)) return;
        if (this.reloadTimer) clearTimeout(this.reloadTimer);
        this.reloadTimer = setTimeout(() => this.reloadFromDisk(), 250);
      });
    } catch (err: any) {
      this.logger.warn(`Could not watch settings dir ${dir}: ${err?.message}`);
    }
  }

  private reloadFromDisk() {
    const next = SettingsService.loadSync();
    if (
      next.hrmisUrl === this.current.hrmisUrl &&
      next.port === this.current.port
    ) {
      return;
    }
    this.applyChange(next, 'disk');
  }

  private applyChange(next: AppSettings, source: 'api' | 'disk') {
    const prev = this.current;
    this.current = next;
    this.logger.log(
      `Settings changed (${source}): hrmisUrl ${prev.hrmisUrl} -> ${next.hrmisUrl}, port ${prev.port} -> ${next.port}`,
    );
    this.emit('change', next, prev);
    if (prev.port !== next.port) {
      this.emit('portChange', next.port, prev.port);
    }
  }
}
