import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DEFAULT_DEPARTMENTS, permissionsFor, ROLE_LABELS, type Role } from '@manage/shared';
import { hashPassword } from '../auth/password';
import type { Actor } from '../auth/auth.types';
import { BlockersService } from '../blockers/blockers.service';
import { CasesService } from '../cases/cases.service';
import { APP_CONFIG, type AppConfig } from '../config';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { departments, tenants, users } from '../db/schema';
import { TasksService } from '../tasks/tasks.service';

export const DEMO_TENANT_CODE = 'demo';
export const CREDENTIALS_FILE = resolve(__dirname, '../../.data/demo-credentials.local.txt');

const DEMO_USERS: { username: string; displayName: string; roles: Role[] }[] = [
  { username: 'expert', displayName: 'کارشناس نمونه', roles: ['accident_expert'] },
  { username: 'supervisor', displayName: 'سرپرست نمونه', roles: ['accident_supervisor'] },
  { username: 'manager', displayName: 'مدیر خدمات نمونه', roles: ['service_manager'] },
  { username: 'parts', displayName: 'کاربر قطعات نمونه', roles: ['parts_clerk'] },
  { username: 'cashier', displayName: 'کاربر صندوق نمونه', roles: ['cashier'] },
  { username: 'qc', displayName: 'کنترل کیفیت نمونه', roles: ['qc_inspector'] },
  { username: 'admin', displayName: 'مدیر سیستم نمونه', roles: ['system_admin'] },
];

const DAY = 86_400_000;
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

/**
 * Creates the synthetic demo dealership. Every row is flagged is_test and all
 * names, phones, plates and VINs are obviously fictitious (phones 0900…,
 * VINs TESTVIN…). Sample cases go through the real services, so they carry
 * the same audit trail and invariants as real data.
 */
@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger('DemoSeed');

  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly cases: CasesService,
    private readonly tasks: TasksService,
    private readonly blockers: BlockersService,
  ) {}

  async isSeeded(): Promise<boolean> {
    const rows = await this.handle.db.select({ id: tenants.id }).from(tenants).limit(1);
    return rows.length > 0;
  }

  /** Returns the password used for every demo account. */
  async seed(opts: { password?: string; withCases?: boolean } = {}): Promise<string> {
    const db = this.handle.db;
    const password = opts.password || this.cfg.SEED_DEMO_PASSWORD || randomBytes(9).toString('base64url');
    const passwordHash = await hashPassword(password);
    const tenantId = newId();

    await db.transaction(async (tx) => {
      await tx.insert(tenants).values({
        id: tenantId,
        code: DEMO_TENANT_CODE,
        name: 'نمایندگی نمونه (آزمایشی)',
        brand: 'ایران‌خودرو',
        isTest: true,
      });
      await tx.insert(departments).values(
        DEFAULT_DEPARTMENTS.map((d, i) => ({ id: newId(), tenantId, code: d.code, name: d.name, sortOrder: i })),
      );
      await tx.insert(users).values(
        DEMO_USERS.map((u) => ({
          id: newId(),
          tenantId,
          username: u.username,
          displayName: u.displayName,
          passwordHash,
          roles: u.roles,
          isTest: true,
        })),
      );
    });

    if (opts.withCases !== false) await this.seedCases(tenantId);
    return password;
  }

  writeCredentials(password: string): void {
    mkdirSync(dirname(CREDENTIALS_FILE), { recursive: true });
    const lines = [
      'Manage by HEDAX — demo accounts (synthetic data only). Do not share or commit.',
      `tenant code: ${DEMO_TENANT_CODE}`,
      `password (all accounts): ${password}`,
      '',
      ...DEMO_USERS.map((u) => `${u.username.padEnd(12)} ${u.roles.map((r) => ROLE_LABELS[r]).join('، ')}`),
      '',
    ];
    writeFileSync(CREDENTIALS_FILE, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
    this.logger.log(`Demo credentials written to ${CREDENTIALS_FILE}`);
  }

  private async actorFor(tenantId: string, username: string): Promise<Actor> {
    const [row] = await this.handle.db
      .select({ u: users, t: tenants })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(sql`${users.tenantId} = ${tenantId} and ${users.username} = ${username}`);
    const roles = row!.u.roles as Role[];
    return {
      user: {
        id: row!.u.id,
        tenantId,
        tenantCode: row!.t.code,
        tenantName: row!.t.name,
        isTestTenant: true,
        username,
        displayName: row!.u.displayName,
        roles,
        permissions: permissionsFor(roles),
        sessionId: 'seed',
      },
      requestId: 'demo-seed',
    };
  }

  private async seedCases(tenantId: string): Promise<void> {
    const expert = await this.actorFor(tenantId, 'expert');
    const supervisor = await this.actorFor(tenantId, 'supervisor');
    const depts = await this.handle.db.select().from(departments).where(eq(departments.tenantId, tenantId));
    const dept = (code: string) => depts.find((d) => d.code === code)!.id;

    // 1. Golden card, in repair: body work started, paint waits on body.
    const c1 = await this.cases.create(expert, {
      customer: { fullName: 'مشتری نمونه یک', phone: '09000000001' },
      vehicle: { brand: 'ایران‌خودرو', model: 'دنا پلاس', trim: 'توربو', modelYear: 1402, plate: '۱۱ ب ۱۱۱ - ۱۰', vin: 'TESTVIN0000000001', color: 'سفید' },
      odometerKm: 41200,
      admittedAt: ago(3 * DAY),
      damageDescription: 'تصادف از جلو؛ سپر، چراغ راست و گلگیر جلو راست آسیب دیده است.',
      vehicleLocation: 'سالن بدنه — جایگاه ۳',
      coverageType: 'golden_card',
      goldenCardFileNo: 'GC-TEST-1001',
      responsibleUserId: supervisor.user.id,
      officialDeadlineAt: ahead(4 * DAY),
      forecastDeliveryAt: ahead(3 * DAY),
    });
    const body1 = await this.tasks.create(supervisor, c1.id, {
      departmentId: dept('body'),
      title: 'صافکاری گلگیر و سینی جلو',
      technicianName: 'تکنسین نمونه الف',
      technicianCode: 'T-01',
      plannedStartAt: ago(2 * DAY),
      plannedEndAt: ahead(1 * DAY),
      weight: 3,
    });
    await this.tasks.create(supervisor, c1.id, {
      departmentId: dept('paint'),
      title: 'نقاشی گلگیر و سپر',
      technicianName: 'تکنسین نمونه ب',
      technicianCode: 'T-02',
      dependsOn: [body1.id],
      weight: 2,
    });
    await this.tasks.act(supervisor, body1.id, { action: 'start', expectedVersion: 1, at: ago(2 * DAY) });

    // 2. Body insurance, waiting for a part: blocker recorded a day after it occurred.
    const c2 = await this.cases.create(expert, {
      customer: { fullName: 'مشتری نمونه دو', phone: '09000000002' },
      vehicle: { brand: 'ایران‌خودرو', model: 'پژو ۲۰۷', trim: 'دنده‌ای', modelYear: 1401, plate: '۲۲ ج ۲۲۲ - ۲۰', vin: 'TESTVIN0000000002' },
      odometerKm: 68000,
      admittedAt: ago(6 * DAY),
      damageDescription: 'ضربه از عقب؛ درب صندوق و سپر عقب.',
      coverageType: 'insurance',
      insurerName: 'بیمه نمونه',
      insuranceClaimNo: 'INS-TEST-2002',
      responsibleUserId: supervisor.user.id,
      forecastDeliveryAt: ahead(1 * DAY),
      stage: 'awaiting_parts',
    });
    const t2 = await this.tasks.create(supervisor, c2.id, {
      departmentId: dept('assembly'),
      title: 'تعویض درب صندوق',
      technicianName: 'تکنسین نمونه ج',
      technicianCode: 'T-03',
      weight: 1,
    });
    await this.blockers.create(supervisor, c2.id, {
      reason: 'part_not_arrived',
      description: 'درب صندوق سفارش داده شده، هنوز به انبار نرسیده است.',
      taskId: t2.id,
      occurredAt: ago(4 * DAY),
    });

    // 3. Personal payment, just received; contact details still unknown.
    await this.cases.create(expert, {
      customer: { fullName: 'مشتری نمونه سه' },
      vehicle: { brand: 'ایران‌خودرو', model: 'تارا', plate: '۳۳ د ۳۳۳ - ۳۰' },
      admittedAt: ago(5 * HOUR),
      coverageType: 'personal',
      vehicleLocation: 'پارکینگ پذیرش',
    });

    // 4. Vehicle already in the workshop before Manage: legacy entry, overdue.
    const c4 = await this.cases.create(expert, {
      customer: { fullName: 'مشتری نمونه چهار', phone: '09000000004' },
      vehicle: { brand: 'ایران‌خودرو', model: 'سورن پلاس', modelYear: 1400, plate: '۴۴ س ۴۴۴ - ۴۰', vin: 'TESTVIN0000000004' },
      odometerKm: 120500,
      admittedAt: ago(20 * DAY),
      damageDescription: 'تصادف از پهلو؛ درب‌های سمت چپ.',
      coverageType: 'golden_card',
      goldenCardFileNo: 'GC-TEST-1004',
      responsibleUserId: supervisor.user.id,
      officialDeadlineAt: ago(3 * DAY),
      stage: 'in_repair',
      isLegacyEntry: true,
    });
    const t4 = await this.tasks.create(supervisor, c4.id, {
      departmentId: dept('body'),
      title: 'صافکاری درب‌های چپ',
      technicianName: 'تکنسین نمونه الف',
      technicianCode: 'T-01',
      weight: 1,
    });
    await this.tasks.act(supervisor, t4.id, { action: 'start', expectedVersion: 1, at: ago(10 * DAY) });

    // 5. Ready for delivery: all work approved.
    const c5 = await this.cases.create(expert, {
      customer: { fullName: 'مشتری نمونه پنج', phone: '09000000005' },
      vehicle: { brand: 'ایران‌خودرو', model: 'رانا پلاس', modelYear: 1401, plate: '۵۵ ص ۵۵۵ - ۵۰', vin: 'TESTVIN0000000005' },
      odometerKm: 30500,
      admittedAt: ago(9 * DAY),
      damageDescription: 'خط و خش درب جلو راست.',
      coverageType: 'personal',
      responsibleUserId: supervisor.user.id,
      forecastDeliveryAt: ahead(6 * HOUR),
    });
    const t5 = await this.tasks.create(supervisor, c5.id, {
      departmentId: dept('paint'),
      title: 'رنگ درب جلو راست',
      technicianName: 'تکنسین نمونه ب',
      technicianCode: 'T-02',
      weight: 1,
    });
    await this.tasks.act(supervisor, t5.id, { action: 'start', expectedVersion: 1, at: ago(3 * DAY) });
    await this.tasks.act(supervisor, t5.id, { action: 'complete', expectedVersion: 2, at: ago(1 * DAY) });
    await this.tasks.act(supervisor, t5.id, { action: 'approve', expectedVersion: 3, at: ago(20 * HOUR) });
    const fresh = await this.cases.detail(supervisor, c5.id);
    await this.cases.changeStage(supervisor, c5.id, { stage: 'ready_for_delivery', expectedVersion: fresh.version });
  }
}
