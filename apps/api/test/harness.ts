import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { loadConfig } from '../src/config';
import { DATABASE, type DatabaseHandle } from '../src/db/database';
import { DemoSeedService } from '../src/demo/demo-seed.service';

export const TEST_PASSWORD = 'test-only-password-1';

export interface Harness {
  app: INestApplication;
  db: DatabaseHandle;
  seeder: DemoSeedService;
  login(username: string, tenantCode?: string): Promise<Client>;
  close(): Promise<void>;
}

/** HTTP client that keeps the session cookie and sends the CSRF header. */
export class Client {
  constructor(
    private readonly app: INestApplication,
    readonly cookie: string,
  ) {}

  private withAuth(req: request.Test) {
    return req.set('Cookie', this.cookie).set('x-manage-client', 'test');
  }
  get(url: string) {
    return this.withAuth(request(this.app.getHttpServer()).get(`/api/v1${url}`));
  }
  post(url: string, body: object = {}) {
    return this.withAuth(request(this.app.getHttpServer()).post(`/api/v1${url}`)).send(body);
  }
  patch(url: string, body: object) {
    return this.withAuth(request(this.app.getHttpServer()).patch(`/api/v1${url}`)).send(body);
  }
}

export async function createHarness(opts: { withCases?: boolean } = {}): Promise<Harness> {
  const cfg = loadConfig({ APP_ENV: 'test', DB_DRIVER: 'pglite', PGLITE_DATA_DIR: 'memory://', NODE_ID: 'test' });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(cfg)] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, cfg);
  await app.init();
  const seeder = app.get(DemoSeedService);
  await seeder.seed({ password: TEST_PASSWORD, withCases: opts.withCases ?? false });

  return {
    app,
    db: app.get<DatabaseHandle>(DATABASE),
    seeder,
    async login(username: string, tenantCode?: string) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('x-manage-client', 'test')
        .send({ username, password: TEST_PASSWORD, tenantCode });
      if (res.status !== 200) throw new Error(`login ${username} failed: ${res.status} ${JSON.stringify(res.body)}`);
      const setCookie = res.headers['set-cookie'] as unknown as string[];
      return new Client(app, setCookie.map((c) => c.split(';')[0]).join('; '));
    },
    async close() {
      await app.close();
    },
  };
}

export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
export const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
