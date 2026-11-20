import { useRef, useState, type FormEvent } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import {
  formatJalali, PICKING_BATCH_LIMIT, toLatinDigits,
  type ClosePickingBatch, type CreatePickingBatch, type PickingBatch, type PickingCandidate, type PickingDepartment,
} from '@manage/shared';
import { api, errorMessage, fetcher, newKey } from '@/lib/api';
import { faNum, parseRials } from '@/lib/format';
import { AppIcon } from './AppIcon';

const path = '/parts/picking-batches';
const statusLabel = { pending: 'در انتظار تحویل', delivered: 'تحویل‌شده', cancelled: 'لغوشده' };

type DeskData = { items: PickingCandidate[]; departments: PickingDepartment[]; batches: PickingBatch[] };
type Selection = CreatePickingBatch['items'][number];

export function PartsPicking() {
  const [started, setStarted] = useState(false);
  return <details className="panel compact-disclosure" onToggle={(event) => { if (event.currentTarget.open) setStarted(true); }}>
    <summary><AppIcon name="print" /> جمع‌آوری و تحویل مرحله‌ای قطعات</summary>
    {started && <PickingPanel />}
  </details>;
}

function PickingPanel() {
  const [history, setHistory] = useState(false);
  const { data, error, mutate } = useSWR<DeskData>(history ? path + '?history=1' : path, fetcher, { keepPreviousData: true });
  const { mutate: refresh } = useSWRConfig();
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [selected, setSelected] = useState<Record<string, Selection>>({});
  const [destinations, setDestinations] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const createId = useRef<string | null>(null);
  const pending = data?.batches.filter((batch) => batch.status === 'pending') ?? [];
  const closed = data?.batches.filter((batch) => batch.status !== 'pending') ?? [];
  const term = toLatinDigits(search.trim().toLowerCase());
  const destinationOf = (item: PickingCandidate) => item.partId in destinations ? destinations[item.partId] ?? null : item.departmentId;
  const groups = new Map<string, PickingCandidate[]>();
  for (const item of data?.items ?? []) {
    if (department && (destinationOf(item) ?? 'unknown') !== department) continue;
    if (term && ![item.vehicle, item.plate, item.caseNumber, item.admissionNo, item.description, item.code]
      .some((value) => toLatinDigits(value ?? '').toLowerCase().includes(term))) continue;
    const items = groups.get(item.caseId) ?? [];
    items.push(item);
    groups.set(item.caseId, items);
  }
  const visible = [...groups.values()].flat();
  const selectedItems = Object.values(selected);
  const candidateById = new Map((data?.items ?? []).map((item) => [item.partId, item]));
  const stale = selectedItems.some((item) => {
    const current = candidateById.get(item.partId);
    return !current || current.version !== item.expectedVersion || item.quantity > current.available;
  });

  function select(items: PickingCandidate[], checked: boolean) {
    const next = { ...selected };
    for (const item of items) {
      if (!checked) delete next[item.partId];
      else next[item.partId] ??= { partId: item.partId, expectedVersion: item.version, quantity: item.available, departmentId: destinationOf(item) };
    }
    if (Object.keys(next).length > PICKING_BATCH_LIMIT) {
      setFailure(`در هر نوبت حداکثر ${faNum(PICKING_BATCH_LIMIT)} قلم انتخاب کنید.`);
      return;
    }
    createId.current = null;
    setFailure('');
    setSelected(next);
  }

  function updateItem(item: PickingCandidate, change: Partial<Pick<Selection, 'quantity' | 'departmentId'>>) {
    createId.current = null;
    if (change.departmentId !== undefined) setDestinations((previous) => ({ ...previous, [item.partId]: change.departmentId ?? null }));
    const previous = selected[item.partId];
    if (previous) setSelected((all) => ({ ...all, [item.partId]: { ...previous, ...change } }));
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!selectedItems.length || busy || stale) return;
    setBusy(true);
    setMessage('');
    setFailure('');
    const id = createId.current ??= newKey();
    try {
      await api<PickingBatch>(path, { body: { id, items: selectedItems } satisfies CreatePickingBatch, idempotencyKey: id });
      setSelected({});
      createId.current = null;
      setMessage(`نوبت ${id.slice(0, 8).toUpperCase()} ثبت شد. PDF را از فهرست نوبت‌ها باز کنید.`);
      await mutate();
    } catch (err) {
      setFailure(errorMessage(err));
      void mutate();
    } finally {
      setBusy(false);
    }
  }

  function refreshAfterClosing(batch: PickingBatch) {
    const caseIds = new Set(batch.items.map(({ caseId }) => caseId));
    void refresh((key) => {
      if (typeof key !== 'string') return false;
      if (key === path || key.startsWith(path + '?') || key === '/desk/folders' || key.startsWith('/stock/') || key.startsWith('/parts/workbench')) return true;
      return [...caseIds].some((id) => key === `/cases/${id}` || key === `/cases/${id}/parts`);
    });
  }

  return <div className="panel-body stack" data-testid="parts-picking">
    {error && <p className="m-error" role="alert">{errorMessage(error)} <button type="button" className="btn btn-sm" onClick={() => void mutate()}>بارگیری دوباره</button></p>}
    {!data && !error && <p role="status">در حال دریافت قطعات آماده…</p>}
    {data && <>
      <form onSubmit={create} className="stack">
        <div className="row picking-controls">
          <label className="field">جست‌وجوی خودرو یا قطعه
            <input className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="پلاک، پذیرش، نام یا کد قطعه" />
          </label>
          <label className="field">صافی بخش کاری
            <select className="input" value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">همهٔ بخش‌ها</option><option value="unknown">بخش نامشخص</option>
              {data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <button className="btn" type="button" disabled={busy || !visible.length} onClick={() => select(visible, !visible.every((p) => selected[p.partId]))}>
            {visible.length > 0 && visible.every((p) => selected[p.partId]) ? 'برداشتن انتخاب اقلام نمایش‌داده‌شده' : 'انتخاب همهٔ اقلام نمایش‌داده‌شده'}
          </button>
        </div>
        <div className="row picking-controls">
          <button type="submit" className="btn btn-primary" disabled={busy || !selectedItems.length || stale}>ثبت نوبت جمع‌آوری</button>
          <span role="status">{faNum(selectedItems.length)} قلم انتخاب شده{selectedItems.length ? ` · ${faNum(new Set(selectedItems.map((p) => candidateById.get(p.partId)?.caseId).filter(Boolean)).size)} خودرو` : ''}</span>
          {!!selectedItems.length && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { setSelected({}); setFailure(''); createId.current = null; }}>پاک کردن انتخاب‌ها</button>}
        </div>
        {stale && <p role="status">بعضی از قطعات تغییر کرده‌اند. انتخاب‌ها را پاک و دوباره انتخاب کنید.</p>}
        {message && <p role="status" className="callout">{message}</p>}
        {failure && <p role="alert" className="m-error">{failure}</p>}
        {!visible.length && <p className="muted">قطعهٔ آماده‌ای مطابق این صافی برای نوبت جدید وجود ندارد.</p>}
        {[...groups.entries()].map(([caseId, items]) => {
          const car = items[0]!;
          return <details className="compact-disclosure picking-vehicle" key={caseId}>
            <summary>{car.vehicle} · <bdi>{car.plate ?? car.admissionNo ?? car.caseNumber}</bdi> · {faNum(items.filter((p) => selected[p.partId]).length)} از {faNum(items.length)} قلم انتخاب شده</summary>
            <div className="stack panel-body">
              <label className="row"><input type="checkbox" disabled={busy} checked={items.every((p) => selected[p.partId])} onChange={(e) => select(items, e.target.checked)} /> انتخاب گروهی این خودرو</label>
              {items.map((item) => <div className="row picking-controls" key={item.partId}>
                <label className="row"><input type="checkbox" checked={!!selected[item.partId]} disabled={busy} onChange={(e) => select([item], e.target.checked)} />
                  <span>{item.description} {item.code && <bdi dir="ltr">{item.code}</bdi>} · {faNum(item.available)} آماده</span>
                </label>
                <label className="field">بخش کاری
                  <select className="input" aria-label={`بخش کاری ${item.description}`} disabled={busy} value={destinationOf(item) ?? ''} onChange={(e) => updateItem(item, { departmentId: e.target.value || null })}>
                    <option value="">نامشخص</option>{data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
                {selected[item.partId] && item.available > 1 && <label className="field">تعداد این نوبت
                  <input className="input picking-quantity" aria-label={`تعداد ${item.description}`} type="number" required min={1} max={item.available} disabled={busy}
                    value={selected[item.partId]?.quantity ?? ''} onChange={(e) => updateItem(item, { quantity: Number(e.target.value) })} />
                </label>}
              </div>)}
            </div>
          </details>;
        })}
      </form>
      <section className="stack" aria-labelledby="picking-open">
        <h2 id="picking-open">نوبت‌های باز جمع‌آوری</h2>
        {!pending.length && <p className="muted">نوبت بازی وجود ندارد.</p>}
        {pending.map((batch) => <BatchCard key={batch.id} batch={batch} onClose={() => refreshAfterClosing(batch)} />)}
      </section>
      <details className="compact-disclosure" onToggle={(event) => setHistory(event.currentTarget.open)}>
        <summary>تاریخچهٔ نوبت‌ها</summary>
        {history && (closed.length ? closed.map((batch) => <BatchCard key={batch.id} batch={batch} onClose={() => {}} />)
          : <p className="muted">نوبت بسته‌شده‌ای ثبت نشده است.</p>)}
      </details>
    </>}
  </div>;
}

function BatchCard({ batch, onClose }: { batch: PickingBatch; onClose: () => void }) {
  const requestId = useRef<string | null>(null);
  const [action, setAction] = useState<'deliver' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const withoutPrice = batch.items.filter((item) => item.saleUnitRial === null);
  const id = batch.id.slice(0, 8).toUpperCase();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || busy) return;
    const form = new FormData(event.currentTarget);
    const expectedVersion = batch.version;
    const input: ClosePickingBatch = action === 'cancel' ? { action, expectedVersion } : {
      action, expectedVersion, recipientName: String(form.get('recipient') ?? ''),
      prices: withoutPrice.map((item) => ({ partId: item.partId, saleUnitRial: parseRials(form.get(item.partId)) ?? -1 })),
    };
    setBusy(true);
    setFailure('');
    try {
      await api(`${path}/${batch.id}/close`, { body: input, idempotencyKey: requestId.current ??= newKey() });
      setAction(null);
      onClose();
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return <article className="panel panel-body stack" data-testid="picking-batch">
    <div className="row picking-controls">
      <strong>نوبت <bdi>{id}</bdi></strong>
      <span>{statusLabel[batch.status]} · {faNum(batch.items.length)} قلم · {formatJalali(batch.createdAt)}</span>
      {batch.recipientName && <span>تحویل به {batch.recipientName}{batch.closedAt && ` · ${formatJalali(batch.closedAt)}`}</span>}
      <a className="btn btn-sm" href={`/api/v1${path}/${batch.id}/picking.pdf`} target="_blank" rel="noopener">
        <AppIcon name="print" /> {batch.status === 'pending' ? 'باز کردن PDF نوبت' : 'PDF بایگانی'}
      </a>
    </div>
    <details className="compact-disclosure">
      <summary>اقلام این نوبت</summary>
      <ul>{batch.items.map((item) => <li key={item.partId}>{item.description} · {faNum(item.quantity)} عدد · {item.vehicle} <bdi>{item.plate ?? item.caseNumber}</bdi>{item.department && ` · ${item.department}`}</li>)}</ul>
    </details>
    {batch.status === 'pending' && <div className="row picking-controls">
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => { requestId.current = null; setAction('deliver'); setFailure(''); }}>ثبت تحویل نوبت</button>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { requestId.current = null; setAction('cancel'); setFailure(''); }}>لغو نوبت</button>
    </div>}
    {action && <form key={action} onSubmit={save} onChange={() => { requestId.current = null; }} className="stack">
      {action === 'deliver' ? <>
        <label className="field">نام تحویل‌گیرنده<input className="input" name="recipient" required maxLength={120} /></label>
        {withoutPrice.map((item) => <label className="field" key={item.partId}>قیمت فروش واحد {item.description} (ریال)
          <input className="input" name={item.partId} inputMode="numeric" required dir="ltr" />
        </label>)}
      </> : <p>پس از لغو، قطعات آماده دوباره برای انتخاب در نوبت جدید نمایش داده می‌شوند.</p>}
      <div className="row picking-controls">
        <button type="submit" className="btn btn-primary" disabled={busy}>{action === 'deliver' ? 'تأیید تحویل همهٔ اقلام این نوبت' : 'تأیید لغو نوبت'}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => { setAction(null); setFailure(''); }}>بازگشت</button>
      </div>
      {failure && <p role="alert" className="m-error">{failure}</p>}
    </form>}
  </article>;
}
