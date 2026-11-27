import type { Me } from '@manage/shared';
import { createHarness, type Client, type Harness } from './harness';

// H2 central switch (owner, 2026-11-27): «خودروهای متوقف» is closed for everyone except the owner —
// the API answers 404, even with stoppage.read — until the server lists it in OPEN_FEATURES.
describe('Central switch of unfinished modules', () => {
  describe('default (nothing opened)', () => {
    let h: Harness;
    let owner: Client;
    let reader: Client;
    beforeAll(async () => {
      h = await createHarness({ config: { DEMO_OWNER_USERNAME: 'manager' } });
      owner = await h.login('manager');
      reader = await h.loginAs('h2-reader', ['parts_clerk'], ['stoppage.read', 'stoppage.import', 'stoppage.manage']);
    });
    afterAll(async () => h.close());

    it('a non-owner gets 404 on every stoppage route, before the permission check', async () => {
      for (const path of ['/stoppages', '/stoppages/report', '/stoppages/followers']) {
        const res = await reader.get(path).expect(404);
        expect(res.body.code).toBe('NOT_FOUND');
      }
      const guest = await h.loginAs('h2-guest', ['guest']);
      await guest.get('/stoppages').expect(404);
    });

    it('the owner opens them; /auth/me lists nothing opened', async () => {
      const me = (await owner.get('/auth/me').expect(200)).body as Me;
      expect(me.isOwner).toBe(true);
      expect(me.openFeatures).toEqual([]);
      await owner.get('/stoppages').expect(200);
      await owner.get('/stoppages/report').expect(200);
      expect(((await reader.get('/auth/me').expect(200)).body as Me).openFeatures).toEqual([]);
    });
  });

  describe('OPEN_FEATURES=stoppages', () => {
    let h: Harness;
    beforeAll(async () => { h = await createHarness({ config: { OPEN_FEATURES: 'stoppages, unknown' } }); });
    afterAll(async () => h.close());

    it('opens the module to staff with the permission; permissions still apply', async () => {
      const reader = await h.loginAs('h2-open-reader', ['parts_clerk'], ['stoppage.read']);
      expect(((await reader.get('/auth/me').expect(200)).body as Me).openFeatures).toEqual(['stoppages']);
      await reader.get('/stoppages').expect(200);
      const plain = await h.loginAs('h2-open-plain', ['accident_expert']);
      await plain.get('/stoppages').expect(403);
    });
  });
});
