import { buildMenu, type Me } from '@manage/shared';
import { createHarness, type Client, type Harness } from './harness';

// Slice S05: the side menu ۰–۹ is built from the person's real session (/auth/me). Each demo role
// sees only its own sections; the modules not built yet (۳ سالن, ۷ مشتری و پیامک) never appear;
// a section appears only when the server grants one of its pages.
describe('Side menu ۰–۹ from the real permissions', () => {
  let h: Harness;
  beforeAll(async () => { h = await createHarness(); });
  afterAll(async () => h.close());

  const menuOf = async (c: Client, home: string, desks: string[] = []) => {
    const me = (await c.get('/auth/me').expect(200)).body as Me;
    return buildMenu({
      roles: me.roles, permissions: me.permissions, isOwner: !!me.isOwner, home, desks,
      receptionActive: me.modules.some((m) => m.key === 'reception' && m.status === 'active'),
    });
  };
  const nums = (m: Awaited<ReturnType<typeof menuOf>>) => m.map((s) => s.num);
  const hrefs = (m: Awaited<ReturnType<typeof menuOf>>) => m.flatMap((s) => s.items.map((i) => i.href));

  it('technician: only «۰ میزکار من», the own job list', async () => {
    const m = await menuOf(await h.login('technician'), '/workshop/technician');
    expect(nums(m)).toEqual([0]);
    expect(hrefs(m)).toEqual(['/workshop/technician']);
  });

  it('accident expert, parts clerk and system administrator see their own sections in number order', async () => {
    const expert = await menuOf(await h.login('expert'), '/accidents/expert', ['expert']);
    const parts = await menuOf(await h.login('parts'), '/accidents/parts', ['parts']);
    const admin = await menuOf(await h.login('admin'), '/accidents/admin', ['expert', 'manager', 'parts', 'admin', 'special_aid']);
    for (const m of [expert, parts, admin]) {
      expect(nums(m)[0]).toBe(0);
      expect(nums(m)).toEqual([...nums(m)].sort((a, b) => a - b));
      expect(nums(m)).not.toContain(3);
      expect(nums(m)).not.toContain(7);
      expect(hrefs(m).some((h) => h.startsWith('/modules/'))).toBe(false);
    }
    expect(nums(expert)).toContain(4);
    expect(nums(expert)).not.toContain(8);
    expect(hrefs(expert)).toContain('/cases');
    expect(hrefs(expert)).not.toContain('/users');
    expect(nums(parts)).toContain(6);
    expect(nums(parts)).not.toContain(8);
    expect(hrefs(admin)).toEqual(expect.arrayContaining(['/workshop', '/cases', '/stock', '/settings', '/users']));
  });

  it('a section appears only with a granted page: stoppage list alone opens «۱ پذیرش و جست‌وجو»', async () => {
    const none = await menuOf(await h.loginAs('menu-none', ['accident_expert']), '/accidents/expert', ['expert']);
    const withStoppage = await menuOf(await h.loginAs('menu-stoppage', ['accident_expert'], ['stoppage.read']), '/accidents/expert', ['expert']);
    expect(nums(none)).not.toContain(1);
    expect(withStoppage.find((s) => s.num === 1)?.items.map((i) => i.href)).toEqual(['/reception/stoppage']);
  });
});
