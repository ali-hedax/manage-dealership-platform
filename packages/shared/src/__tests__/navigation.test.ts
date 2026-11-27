import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMenu, menuItemActive, menuNumber, MENU_SECTIONS, permissionsFor, type MenuContext } from '../index';

const ctx = (roles: string[], over: Partial<MenuContext> = {}): MenuContext => ({
  roles, permissions: permissionsFor(roles), isOwner: false, home: '/accidents', desks: [], receptionActive: true, ...over,
});
const nums = (c: MenuContext) => buildMenu(c).map((s) => s.num);
const hrefs = (c: MenuContext) => buildMenu(c).flatMap((s) => s.items.map((i) => i.href));

test('the ten sections are fixed: 0–9 in order with the owner\'s labels', () => {
  assert.deepEqual(MENU_SECTIONS.map((s) => `${menuNumber(s.num)} ${s.label}`), [
    '۰ میزکار من', '۱ پذیرش و جست‌وجو', '۲ تقسیم کار', '۳ سالن', '۴ تصادفات',
    '۵ امداد ویژه و نوبت', '۶ انبار و قطعات', '۷ مشتری و پیامک', '۸ مدیر خدمات', '۹ تنظیمات',
  ]);
});

test('a technician sees only «میزکار من», which is their own job list', () => {
  const menu = buildMenu(ctx(['technician'], { home: '/workshop/technician' }));
  assert.deepEqual(menu.map((s) => s.num), [0]);
  assert.deepEqual(menu[0]!.items.map((i) => i.href), ['/workshop/technician']);
});

test('each role sees only its own sections; modules not built yet (۳ سالن, ۷ مشتری و پیامک) never show', () => {
  const expert = ctx(['accident_expert'], { home: '/accidents/expert', desks: ['expert'] });
  const parts = ctx(['parts_clerk'], { home: '/accidents/parts', desks: ['parts'] });
  const manager = ctx(['service_manager'], { home: '/accidents/manager', desks: ['manager'] });
  const admin = ctx(['system_admin'], { home: '/accidents/admin', desks: ['expert', 'manager', 'parts', 'admin', 'special_aid'] });
  const guest = ctx(['guest'], { home: '/special-aid', desks: ['special_aid'] });
  for (const c of [expert, parts, manager, admin, guest]) {
    const n = nums(c);
    assert.equal(n[0], 0, 'میزکار من is always first');
    assert.ok(!n.includes(3) && !n.includes(7), `hidden modules for ${c.roles}`);
    assert.deepEqual(n, [...n].sort((a, b) => a - b), 'sections in number order');
    assert.ok(!hrefs(c).some((h) => h.startsWith('/modules/')), 'no roadmap or «در دست توسعه» links');
  }
  // «مدیر خدمات» only for managers; case statistics move to «تصادفات» for everyone else.
  assert.ok(nums(expert).includes(4) && !nums(expert).includes(8) && !nums(expert).includes(1));
  assert.ok(hrefs(expert).includes('/'));
  assert.ok(nums(parts).includes(6) && !nums(parts).includes(8));
  assert.ok(nums(manager).includes(8) && hrefs(manager).includes('/reports'));
  assert.deepEqual(nums(admin), [0, 1, 2, 4, 5, 6, 8, 9]);
  assert.deepEqual(nums(guest), [0, 5]);
  assert.ok(!hrefs(guest).includes('/users') && !hrefs(guest).includes('/settings'));
  // The own desk is «میزکار من», never repeated inside a section.
  assert.equal(hrefs(expert).filter((h) => h === '/accidents/expert').length, 1);
  assert.equal(hrefs(parts).filter((h) => h === '/parts').length, 0);
  // Several desks: «انتخاب میزکار» under ۰.
  assert.ok(buildMenu(admin)[0]!.items.some((i) => i.href === '/launch'));
  assert.ok(!buildMenu(expert)[0]!.items.some((i) => i.href === '/launch'));
});

test('reception links need the active module and reception.read', () => {
  const admin = ctx(['system_admin'], { home: '/accidents/admin' });
  assert.ok(hrefs(admin).includes('/reception/night'));
  const off = hrefs({ ...admin, receptionActive: false });
  assert.ok(!off.includes('/reception') && !off.includes('/reception/night'));
});

test('H2 switch: stoppages are closed for non-owners, open with OPEN_FEATURES, and tagged «آزمایشی» for the owner', () => {
  const admin = ctx(['system_admin'], { home: '/accidents/admin' });
  assert.ok(!hrefs(admin).includes('/reception/stoppage') && !hrefs(admin).includes('/control-room/stoppages'));
  const opened = buildMenu({ ...admin, openFeatures: ['stoppages'] }).flatMap((s) => s.items);
  assert.ok(opened.some((i) => i.href === '/reception/stoppage' && !i.experimental));
  const owner = buildMenu({ ...admin, isOwner: true }).flatMap((s) => s.items);
  for (const href of ['/reception/stoppage', '/control-room/stoppages', '/special-aid/vehicles']) assert.equal(owner.find((i) => i.href === href)?.experimental, true, href);
  assert.ok(!owner.find((i) => i.href === '/cases')?.experimental);
  // Special Aid stays open to staff, without the tag.
  const staff = buildMenu(ctx(['special_aid_operator'], { home: '/special-aid', desks: ['special_aid'] })).flatMap((s) => s.items);
  assert.ok(staff.some((i) => i.href === '/special-aid/vehicles' && !i.experimental));
});

test('the active item follows nested pages (case folder, reception folder, stoppage folder)', () => {
  const all = buildMenu(ctx(['system_admin'], { home: '/accidents/admin', isOwner: true })).flatMap((s) => s.items);
  const find = (href: string) => all.find((i) => i.href === href)!;
  assert.ok(menuItemActive(find('/cases'), '/cases/abc'));
  assert.ok(!menuItemActive(find('/cases'), '/cases/new'));
  assert.ok(menuItemActive(find('/reception/open'), '/reception/0193'));
  assert.ok(!menuItemActive(find('/reception/open'), '/reception/night'));
  assert.ok(menuItemActive(find('/reception/stoppage'), '/reception/stoppage/xyz'));
  assert.ok(menuItemActive(find('/settings'), '/settings/nexus'));
});

test('H2 hides only the closed items, never a parent section that still has a visible item', () => {
  // System administrator (not owner): «۱ پذیرش و جست‌وجو» keeps its four reception pages, only the stoppage list goes.
  const admin = buildMenu(ctx(['system_admin'], { home: '/accidents/admin' }));
  assert.deepEqual(admin.find((s) => s.num === 1)?.items.map((i) => i.href), ['/reception', '/reception/open', '/reception/released', '/reception/night']);
  assert.ok(admin.find((s) => s.num === 8)?.items.some((i) => i.href === '/control-room'));
  // An accident expert who is granted reception.read sees the reception section; H2 does not touch it.
  const expert = buildMenu({ ...ctx(['accident_expert'], { home: '/accidents/expert', desks: ['expert'] }), permissions: [...permissionsFor(['accident_expert']), 'reception.read', 'stoppage.read'] });
  assert.deepEqual(expert.find((s) => s.num === 1)?.items.map((i) => i.href), ['/reception', '/reception/open', '/reception/released', '/reception/night']);
  // A section whose only item was the stoppage list (parts clerk, service manager defaults) has nothing left to show.
  assert.ok(!nums(ctx(['parts_clerk'], { home: '/accidents/parts', desks: ['parts'] })).includes(1));
});
