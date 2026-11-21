'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { ALERT_TABLE, CONTROL_RANGES, CONTROL_RANGE_LABELS, toPersianDigits, type ControlRange, type ControlRoomSnapshot, type JourneyStep, type UnansweredAlert, type ServiceKpiKey } from '@manage/shared';
import { fetcher } from '@/lib/api';
import { faNum, formatJalali } from '@/lib/format';
import { AppIcon, type IconName } from './AppIcon';
import { Plate, PlateText } from './Plate';
import { BodyBadge, CoverageBadge, HeaderClip, VehicleImage } from './FolderParts';
import { ReminderComposer, type ReminderDefaults } from './ReminderComposer';
import { WorkshopScene } from './WorkshopScene';

// Control room (spec §10, owner reference «اتاق کنترل مدیر خدمات»): dark
// petrol space, display and analysis only. The single action anywhere on this
// page is «فیدبک»; the workshop drawing comes from the live bays.
const fa1 = (n: number | null | undefined) => (n == null ? '—' : toPersianDigits(String(Math.round(n * 10) / 10).replace('.', '٫')));
const hours = (h: number) => (h >= 48 ? `${faNum(Math.round(h / 24))} روز` : `${faNum(h)} ساعت`);
const ROLE_TEXT = { accident_expert: 'کارشناس تصادفات', parts_clerk: 'مسئول قطعات', station: 'جایگاه' } as const;
const STAGE_ICON: Record<JourneyStep, IconName> = { reception: 'doc', assessment: 'clipboard', parts: 'box', repair: 'wrench', delivery: 'car' };
const ALERTS_SHOWN = 6;
const FOLLOW_SHOWN = 6;
const KPI_ICON: Record<ServiceKpiKey, IconName> = { present: 'car', overdue_official: 'clock', unassigned: 'user', blocked: 'alert' };
/** «۱۰:۳۰» for today, otherwise the Jalali date. */
const whenText = (iso: string) => (formatJalali(iso) === formatJalali(new Date()) ? formatJalali(iso, { time: true }).split(' ').at(-1)! : formatJalali(iso).slice(5));
/** The part or step an alert is about, without repeating the alert type. */
const detailOf = (a: UnansweredAlert) => {
  const i = a.text.indexOf(': ');
  const rest = i >= 0 ? a.text.slice(i + 2) : a.text;
  return rest === ALERT_TABLE[a.kind].label ? '' : rest;
};

export function ControlRoom({ title = 'اتاق کنترل مدیر خدمات', extra }: { title?: string; extra?: ReactNode }) {
  const [range, setRange] = useState<ControlRange>('today');
  const { data, error, mutate, isValidating } = useSWR<ControlRoomSnapshot>(`/control-room?range=${range}`, fetcher, { refreshInterval: 60_000, keepPreviousData: true });
  const [remind, setRemind] = useState<ReminderDefaults | null>(null);
  const [allAlerts, setAllAlerts] = useState(false);
  const [openKpi, setOpenKpi] = useState<ServiceKpiKey | null>(null);
  const [followAll, setFollowAll] = useState(false);
  const alertRemind = (a: UnansweredAlert): ReminderDefaults => ({
    userIds: a.recipientUserIds,
    caseId: a.caseId ?? undefined,
    plate: a.plate,
    body: `${ALERT_TABLE[a.kind].label}: ${a.text} — ${hours(a.waitingHours)} بی‌پاسخ. لطفاً پیگیری کنید.`.slice(0, 300),
    source: 'manager_report',
  });
  const max = data ? Math.max(1, ...data.funnel.map((x) => x.count)) : 1;
  const alertsByCase = new Map<string, UnansweredAlert[]>();
  for (const [index, alert] of (data?.alerts ?? []).entries()) {
    const key = alert.caseId ?? `unlinked-${index}`;
    const group = alertsByCase.get(key) ?? [];
    group.push(alert);
    alertsByCase.set(key, group);
  }
  const groups = [...alertsByCase.entries()];
  const visibleGroups = allAlerts ? groups : groups.slice(0, ALERTS_SHOWN);

  const kpi = data?.service.find((k) => k.key === openKpi) ?? null;
  return (
    <div className="sd" data-testid="control-room" aria-busy={!data && !error}>
      <header className="sd-head">
        <div className="sd-title">
          <span className="sd-title-ico" aria-hidden="true"><AppIcon name="wrench" /></span>
          <div>
            <h1>{title}</h1>
            <p className="sd-sub">داشبورد مدیریت خدمات{data ? ` · به‌روز ${formatJalali(data.generatedAt, { time: true }).split(' ').at(-1)}` : ''}{isValidating && data ? ' · در حال تازه‌سازی…' : ''}</p>
          </div>
        </div>
        <div className="sd-tools">
          <span className="sd-date"><AppIcon name="calendar" />امروز، {formatJalali(new Date())}</span>
          <div className="sd-seg" role="group" aria-label="بازهٔ زمانی">
            {CONTROL_RANGES.map((r) => (
              <button key={r} type="button" className={range === r ? 'on' : ''} aria-pressed={range === r} onClick={() => setRange(r)}>{CONTROL_RANGE_LABELS[r]}</button>
            ))}
          </div>
        </div>
      </header>
      {error && (
        <p role="alert" className="m-error">
          اتاق کنترل خوانده نشد؛ اتصال یا دسترسی را بررسی کنید.
          <button type="button" className="m-btn-s" onClick={() => void mutate()}>تلاش دوباره</button>
        </p>
      )}
      {!data && !error && <div className="sd-strip sd-skel" role="status"><span className="sr-only">در حال خواندن وضعیت تعمیرگاه…</span></div>}
      {extra}
      {data && <>
        <section className="sd-strip" aria-label="چهار شاخص مدیر خدمات">
          {data.service.map((k) => (
            <button key={k.key} type="button" className={`sd-kpi k-${k.key}${openKpi === k.key ? ' on' : ''}`} aria-expanded={openKpi === k.key} aria-controls="sd-kpi-list" title={k.definition} data-testid={`kpi-${k.key}`} onClick={() => setOpenKpi(openKpi === k.key ? null : k.key)}>
              <span className="sd-kpi-ico" aria-hidden="true"><AppIcon name={KPI_ICON[k.key]} /></span>
              <span className="sd-kpi-text"><span className="sd-kpi-lbl">{k.label}</span><b>{faNum(k.count)}</b><small>{k.unit}</small></span>
            </button>
          ))}
        </section>
        {kpi && (
          <section id="sd-kpi-list" className="sd-list" aria-label={`فهرست «${kpi.label}»`} data-testid="kpi-list">
            <div className="sd-list-head">
              <div>
                <h2>{kpi.label} <span>{faNum(kpi.count)} {kpi.unit}</span></h2>
                <p>{kpi.definition}</p>
              </div>
              <div className="row">
                <Link className="m-btn2-s" href={`/reports?view=manager${kpi.listQuery ? `&${kpi.listQuery}` : ''}`}>در گزارش مدیر</Link>
                <button type="button" className="m-btn2-s" onClick={() => setOpenKpi(null)}>بستن</button>
              </div>
            </div>
            {kpi.items.length ? (
              <div className="table-scroll">
                <table className="sd-table">
                  <thead><tr><th scope="col">پرونده</th><th scope="col">خودرو</th><th scope="col">پلاک</th><th scope="col">مسئول</th><th scope="col">مهلت رسمی</th><th scope="col">مانع باز</th></tr></thead>
                  <tbody>
                    {kpi.items.map((i) => (
                      <tr key={i.caseId}>
                        <td><Link href={`/cases/${i.caseId}`}><bdi>{toPersianDigits(i.caseNumber)}</bdi></Link></td>
                        <td>{i.vehicle}</td>
                        <td><PlateText value={i.plate} /></td>
                        <td>{i.responsibleName ?? <span className="m-tag warn">بدون مسئول</span>}</td>
                        <td>{i.officialDeadlineAt ? formatJalali(i.officialDeadlineAt) : '—'}</td>
                        <td>{i.openBlockers ? faNum(i.openBlockers) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="m-empty">در این فهرست خودرویی نیست.</p>}
          </section>
        )}

        <div className="sd-grid">
          <section className="sd-card sd-follow" aria-label="پیگیری امروز">
            <div className="sd-card-head"><h2><AppIcon name="clipboard" />پیگیری امروز</h2><span className="sd-count">{faNum(data.followUps.length)}</span></div>
            {data.followUps.length ? (
              <ol className="sd-rows">
                {data.followUps.slice(0, followAll ? undefined : FOLLOW_SHOWN).map((f, i) => {
                  const priority = i === 0 && f.tone === 'stop';
                  return (
                    <li key={f.caseId} className={`sd-row tone-${f.tone}${priority ? ' priority' : ''}`} data-testid="follow-up">
                      {priority && <span className="sd-prio-tab"><AppIcon name="folder" />پرونده اولویت‌دار</span>}
                      {priority && <HeaderClip />}
                      <Link className="sd-row-link" href={`/cases/${f.caseId}`} aria-label={`${f.vehicle}${f.plate ? `، پلاک ${toPersianDigits(f.plate)}` : ''}: ${f.reason}`}>
                        <span className="sd-row-plate"><Plate value={f.plate} size="row" /></span>
                        <span className="sd-row-car"><VehicleImage vehicle={f.vehicle} size="sm" /><b>{f.vehicle}</b></span>
                        <span className="sd-row-op">
                          <span className={`sd-reason tone-${f.tone}`}>{f.reason}</span>
                          <small>{f.operation}{f.responsibleName ? ` · ${f.responsibleName}` : ''}</small>
                          {(f.bodyReplacement || f.coverageType === 'golden_card') && <span className="sd-row-badges"><CoverageBadge coverage={f.coverageType} />{f.bodyReplacement && <BodyBadge />}</span>}
                        </span>
                        <span className="sd-row-time">{f.dueAt ? whenText(f.dueAt) : '—'}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            ) : <p className="m-empty">برای امروز پیگیری فوری‌ای نیست.</p>}
            {data.followUps.length > FOLLOW_SHOWN && (
              <button type="button" className="m-btn2-s" aria-expanded={followAll} onClick={() => setFollowAll((v) => !v)}>{followAll ? 'نمایش کمتر' : `نمایش همهٔ ${faNum(data.followUps.length)} مورد`}</button>
            )}
          </section>
          <section className="sd-card sd-map" aria-label="نقشهٔ زندهٔ کارگاه">
            <div className="sd-card-head"><h2><AppIcon name="layers" />نقشه کارگاه</h2><span className="sd-hint">برای دیدن خودروهای هر جایگاه، آن را انتخاب کنید</span></div>
            <WorkshopScene bays={data.bays} />
          </section>
        </div>

        <div className="cr cr-deck">
        <section className="cr-kpis cr-secondary" aria-label="شاخص‌های جریان کار">
          <div className="cr-glass cr-kpi2 teal">
            <span className="cr-kpi-head"><AppIcon name="car" /><span className="cr-lbl">پذیرش و تحویل</span></span>
            <b>{faNum(data.kpis.admitted)} / {faNum(data.kpis.delivered)}</b>
            <small>پذیرش / تحویل در {CONTROL_RANGE_LABELS[data.range]}</small>
          </div>
          <div className="cr-glass cr-kpi2 teal">
            <span className="cr-kpi-head"><AppIcon name="calendar" /><span className="cr-lbl">میانگین ماندگاری</span></span>
            <b>{fa1(data.kpis.avgStayDays)}<em>روز</em></b>
            <small>{data.kpis.deliveredAvgStayDays != null ? `تحویل‌شده‌های ${CONTROL_RANGE_LABELS[data.range]}: ${fa1(data.kpis.deliveredAvgStayDays)} روز` : 'در این بازه تحویلی نبوده'}</small>
          </div>
          <div className="cr-glass cr-kpi2 warm">
            <span className="cr-kpi-head"><AppIcon name="clock" /><span className="cr-lbl">عقب‌تر از برنامه</span></span>
            <b>{faNum(data.kpis.behind)}</b>
            <small>{faNum(data.kpis.behindOver3)} مورد بیش از ۳ روز</small>
          </div>
          <div className="cr-glass cr-kpi2 hot">
            <span className="cr-kpi-head"><AppIcon name="alert" /><span className="cr-lbl">هشدار بی‌پاسخ</span></span>
            <b>{faNum(data.kpis.unanswered)}</b>
            <small>{data.kpis.oldestUnansweredHours != null ? `قدیمی‌ترین: ${hours(data.kpis.oldestUnansweredHours)} پیش` : 'همه پاسخ گرفته‌اند'}</small>
          </div>
        </section>

        <section className="cr-glass cr-flow" aria-label="جریان پرونده‌ها بر اساس مرحله">
          <div className="cr-title"><h2>جریان پرونده‌ها بر اساس مرحله</h2></div>
          <ol className="cr-funnel">
            {data.funnel.map((s) => (
              <li key={s.key} className={s.bottleneck ? 'neck' : ''} style={{ ['--w' as string]: `${76 + 24 * (s.count / max)}%` }}>
                <span className="cr-fn">
                  <AppIcon name={STAGE_ICON[s.key]} />
                  <span className="cr-fn-text">
                    <span className="cr-stage">{s.label}</span>
                    <small>{s.count ? `میانگین ${fa1(s.avgDays)} روز` : 'خالی'}{s.bottleneck ? ' · گلوگاه' : ''}</small>
                  </span>
                  <b className="cr-fn-count">{faNum(s.count)}</b>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className="cr-grid">
          <section className="cr-folder" aria-label="تحلیل امروز">
            <div className="cr-folder-tab"><AppIcon name="chart" /><h2>تحلیل امروز</h2></div>
            <div className="cr-folder-sheet">
              <ul className="cr-analysis">{data.analysis.map((s) => <li key={s}>{s}</li>)}</ul>
              <button type="button" className="cr-btn" onClick={() => setRemind({ role: 'parts_clerk', source: 'manager_report' })}><AppIcon name="send" />ارسال فیدبک</button>
            </div>
          </section>

          <section className="cr-folder" aria-label="هشدارهای بی‌پاسخ">
            <div className="cr-folder-tab"><AppIcon name="alert" /><h2>هشدارهای بی‌پاسخ</h2>{data.alerts.length > 0 && <span className="cr-count">{faNum(data.alerts.length)}</span>}</div>
            <div className="cr-folder-sheet">
              {data.alerts.length ? (
                <table className="cr-table">
                  <caption className="sr-only">هشدارهای بی‌پاسخ، قدیمی‌ترین بالا</caption>
                  <thead>
                    <tr><th scope="col">پرونده</th><th scope="col">خودرو</th><th scope="col">هشدار و مسئول پیگیری</th><th scope="col">بیشترین انتظار</th></tr>
                  </thead>
                  <tbody>
                    {visibleGroups.map(([key, group]) => {
                      const first = group[0]!;
                      const longest = Math.max(...group.map((alert) => alert.waitingHours));
                      const renderAlert = (alert: UnansweredAlert, index: number) => (
                        <div key={index} className="cr-alert-item" data-testid="unanswered-alert">
                          <strong>{ALERT_TABLE[alert.kind].label}</strong>
                          {detailOf(alert) && <small>{detailOf(alert)}</small>}
                          <small>{alert.recipient} · {hours(alert.waitingHours)}</small>
                          <button type="button" className="cr-remind" onClick={() => setRemind(alertRemind(alert))} aria-label={`فیدبک به ${alert.recipient} دربارهٔ ${ALERT_TABLE[alert.kind].label}`}>فیدبک</button>
                        </div>
                      );
                      return (
                        <tr key={key}>
                          <td data-label="پرونده">{first.caseId ? <Link href={`/cases/${first.caseId}`}>{first.caseNumber ? <bdi dir="ltr">{toPersianDigits(first.caseNumber)}</bdi> : 'باز کردن'}</Link> : '—'}</td>
                          <td data-label="خودرو">{first.vehicle ?? '—'}{first.plate && <small><PlateText value={first.plate} /></small>}</td>
                          <td data-label="هشدار و مسئول پیگیری">
                            {renderAlert(first, 0)}
                            {group.length > 1 && <details className="cr-alert-more">
                              <summary>{faNum(group.length - 1)} هشدار دیگر این پرونده</summary>
                              {group.slice(1).map((alert, index) => renderAlert(alert, index + 1))}
                            </details>}
                          </td>
                          <td data-label="بیشترین انتظار"><span className={`cr-wait ${longest >= 24 ? 'hot' : 'warm'}`}>{hours(longest)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="cr-muted cr-ok-line"><AppIcon name="check" />هشدار بی‌پاسخی نیست؛ همه پاسخ گرفته‌اند.</p>
              )}
              {groups.length > ALERTS_SHOWN && (
                <button type="button" className="cr-link" aria-expanded={allAlerts} onClick={() => setAllAlerts((v) => !v)}>
                  {allAlerts ? 'نمایش کمتر' : `نمایش ${faNum(groups.length - ALERTS_SHOWN)} ردیف دیگر`}
                </button>
              )}
            </div>
          </section>
        </div>

        <section className="cr-folder" aria-label="عملکرد افراد">
          <div className="cr-folder-tab"><AppIcon name="team" /><h2>عملکرد افراد</h2><span className="cr-tab-note">بدون رتبه‌بندی؛ فقط وضعیت</span></div>
          <div className="cr-folder-sheet">
            <ul className="cr-rows">
              {data.people.map((p) => (
                <li key={`${p.role}:${p.userId ?? p.name}`} className="cr-row">
                  <div><strong>{p.name}</strong><small>{p.role === 'station' ? `${ROLE_TEXT.station} · ${p.detail} · ${faNum(p.open)} خودرو` : `${ROLE_TEXT[p.role]} · ${faNum(p.open)} ${p.role === 'parts_clerk' ? 'قلم در جریان' : 'پروندهٔ باز'}`}</small></div>
                  <div className="cr-row-end">
                    {p.avgDays != null && <span className="cr-lbl">میانگین {fa1(p.avgDays)} روز</span>}
                    {p.late > 0 ? <span className="cr-chip warm">{faNum(p.late)} تأخیر</span> : <span className="cr-chip ok">طبق برنامه</span>}
                    {p.unanswered > 0 && <span className="cr-chip hot">{faNum(p.unanswered)} هشدار بی‌پاسخ</span>}
                    {p.userId && <button type="button" className="cr-remind" onClick={() => setRemind({ userIds: [p.userId!], source: 'manager_report' })} aria-label={`فیدبک به ${p.name}`}>فیدبک</button>}
                  </div>
                </li>
              ))}
              {!data.people.length && <li className="cr-row cr-muted">هنوز کسی ثبت نشده است.</li>}
            </ul>
          </div>
        </section>
        </div>
      </>}
      <ReminderComposer open={!!remind} onClose={() => setRemind(null)} defaults={remind ?? undefined} onSent={() => void mutate()} />
    </div>
  );
}
