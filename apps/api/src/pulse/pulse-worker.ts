import { DynamicModule, Inject, Injectable, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { CoreModule } from '../app.module';
import { AuditService } from '../audit/audit.service';
import { APP_CONFIG, type AppConfig } from '../config';
import { DATABASE, type DatabaseHandle, type LeaderLock } from '../db/database';
import { PULSE_LOCK_KEY, PulseEngine } from './pulse-engine';

/**
 * The Manage Pulse process: every PULSE_TICK_MS (30 s) it reads the start/stop flag and queued
 * commands from the database and runs the due cycles. A PostgreSQL advisory lock
 * (pg_try_advisory_lock) keeps a second worker on standby. No HTTP server is started.
 */
@Injectable()
export class PulseWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('ManagePulse');
  private readonly engine: PulseEngine;
  private timer: NodeJS.Timeout | null = null;
  private lock: LeaderLock | null = null;
  private busy = false;
  private idleLogged = false;

  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    audit: AuditService,
  ) {
    this.engine = new PulseEngine(handle, cfg, audit);
  }

  onApplicationBootstrap() {
    if (this.cfg.APP_ENV === 'test') return;
    this.timer = setInterval(() => void this.beat(), this.cfg.PULSE_TICK_MS);
    void this.beat();
  }

  async beat(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      if (!this.cfg.PULSE_ENABLED) {
        if (!this.idleLogged) this.logger.log('PULSE_ENABLED is not true: the worker stays idle and never connects to کسب‌وکار');
        this.idleLogged = true;
        return;
      }
      if (!this.lock || this.lock.lost) {
        this.lock = await this.handle.leaderLock(PULSE_LOCK_KEY);
        if (!this.lock) return; // another worker is active
        this.logger.log('worker active (advisory lock held)');
      }
      await this.engine.tick();
    } catch (e) {
      this.logger.error(`tick failed: ${(e as { name?: string })?.name ?? 'Error'}`);
    } finally {
      this.busy = false;
    }
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.lock?.release().catch(() => undefined);
  }
}

@Module({})
export class PulseWorkerModule {
  static forRoot(cfg: AppConfig): DynamicModule {
    return { module: PulseWorkerModule, imports: [CoreModule.forRoot(cfg)], providers: [PulseWorker] };
  }
}
