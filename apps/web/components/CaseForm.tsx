'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import useSWR from 'swr';
import {
  CASE_STAGES,
  COVERAGE_LABELS,
  COVERAGE_TYPES,
  STAGE_LABELS,
  toLatinDigits,
  repairDayPlan,
  type CalendarRevision,
  type CaseDetail,
  type CaseStage,
  type CoverageType,
  type UserRef,
} from '@manage/shared';
import { api, errorMessage, fetcher, newKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import {formatJalali} from '@/lib/format';
import { JalaliInput } from './JalaliInput';
import { Plate } from './Plate';
import { ReferenceLookup } from './ReferenceLookup';
import { VehicleHistoryLookup } from './VehicleHistoryLookup';

// Common Iran Khodro models as suggestions; free text is always allowed.
const MODELS = ['دنا', 'دنا پلاس', 'پژو ۲۰۷', 'پژو ۲۰۶', 'پژو پارس', 'سمند', 'سورن پلاس', 'رانا پلاس', 'تارا', 'ری‌را', 'هایما'];
const DRAFT_KEY = 'manage.caseDraft.v1';

interface FormState {
  admissionNo: string;
  plate: string;
  vin: string;
  brand: string;
  model: string;
  trim: string;
  modelYear: string;
  color: string;
  odometerKm: string;
  fullName: string;
  phone: string;
  admittedAt: string | null;
  vehicleLocation: string;
  damageDescription: string;
  isLegacyEntry: boolean;
  stage: CaseStage;
  coverageType: CoverageType;
  goldenCardFileNo: string;
  insurerName: string;
  insuranceClaimNo: string;
  coverageNotes: string;
  responsibleUserId: string;
  officialDeadlineAt: string | null;
  forecastDeliveryAt: string | null;
  repairDurationDays: string;
  reason: string;
}

const empty = (): FormState => ({
  admissionNo: '',
  plate: '',
  vin: '',
  brand: 'ایران‌خودرو',
  model: '',
  trim: '',
  modelYear: '',
  color: '',
  odometerKm: '',
  fullName: '',
  phone: '',
  admittedAt: new Date().toISOString(),
  vehicleLocation: '',
  damageDescription: '',
  isLegacyEntry: false,
  stage: 'reception',
  coverageType: 'unknown',
  goldenCardFileNo: '',
  insurerName: '',
  insuranceClaimNo: '',
  coverageNotes: '',
  responsibleUserId: '',
  officialDeadlineAt: null,
  forecastDeliveryAt: null,
  repairDurationDays: '',
  reason: '',
});

function fromCase(c: CaseDetail): FormState {
  return {
    admissionNo: c.admissionNo??'',
    plate: c.vehicle.plate ?? '',
    vin: c.vehicle.vin ?? '',
    brand: c.vehicle.brand ?? '',
    model: c.vehicle.model ?? '',
    trim: c.vehicle.trim ?? '',
    modelYear: c.vehicle.modelYear ? String(c.vehicle.modelYear) : '',
    color: c.vehicle.color ?? '',
    odometerKm: c.odometerKm == null ? '' : String(c.odometerKm),
    fullName: c.customer?.fullName ?? '',
    phone: c.customer?.phoneMasked ? '' : (c.customer?.phone ?? ''),
    admittedAt: c.admittedAt,
    vehicleLocation: c.vehicleLocation ?? '',
    damageDescription: c.damageDescription ?? '',
    isLegacyEntry: c.isLegacyEntry,
    stage: c.stage,
    coverageType: c.coverageType,
    goldenCardFileNo: c.goldenCardFileNo ?? '',
    insurerName: c.insurerName ?? '',
    insuranceClaimNo: c.insuranceClaimNo ?? '',
    coverageNotes: c.coverageNotes ?? '',
    responsibleUserId: c.responsible?.id ?? '',
    officialDeadlineAt: c.officialDeadlineAt,
    forecastDeliveryAt: c.forecastDeliveryAt,
    repairDurationDays:c.repairPlan?String(c.repairPlan.days):'',
    reason: '',
  };
}

const intOrNull = (v: string) => {
  const n = parseInt(toLatinDigits(v).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {note && <span className="xs muted">{note}</span>}
      </div>
      <div className="panel-body grid-3">{children}</div>
    </section>
  );
}

export function CaseForm({ existing }: { existing?: CaseDetail }) {
  const router = useRouter();
  const toast = useToast();
  const { me, can } = useAuth();
  // A system administrator who is not the owner gives a reason when correcting a recorded value.
  const supportAccount = !me.isOwner && me.roles.includes('system_admin');
  const editing = !!existing;
  const [f, setF] = useState<FormState>(() => (existing ? fromCase(existing) : empty()));
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [historySource, setHistorySource] = useState('');
  const idempotencyKey = useRef(newKey());
  const { data: assignable } = useSWR<UserRef[]>('/users/assignable', fetcher);
  const {data:workCalendar}=useSWR<{current:CalendarRevision}>(can('workshop.read')?'/workshop/calendar':null,fetcher);
  const planChanged=!!f.repairDurationDays&&(!existing?.repairPlan||Number(toLatinDigits(f.repairDurationDays))!==existing.repairPlan.days||Date.parse(f.admittedAt??'')!==Date.parse(existing.admittedAt));
  let planPreview:string|null=null;
  try{const calendar=existing?.repairPlan?.calendar??workCalendar?.current;if(calendar&&f.admittedAt&&Number(f.repairDurationDays)>0)planPreview=repairDayPlan(f.admittedAt,Number(f.repairDurationDays),calendar).endAt;}catch{/* Validation remains authoritative on the server. */}

  // Draft: restore once, then save on every change (create mode only).
  useEffect(() => {
    if (editing) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        setF({ ...empty(), ...JSON.parse(raw) });
        setRestored(true);
      }
    } catch {
      /* storage unavailable */
    }
  }, [editing]);
  useEffect(() => {
    if (editing) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(f));
      } catch {
        /* storage unavailable */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [f, editing]);

  // Default responsible: the current user when they can own cases.
  useEffect(() => {
    if (!editing && !f.responsibleUserId && assignable?.some((u) => u.id === me.id)) {
      setF((s) => ({ ...s, responsibleUserId: me.id }));
    }
  }, [assignable, editing, f.responsibleUserId, me.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((s) => ({ ...s, [key]: value }));
  const text = (key: keyof FormState) => ({
    value: f[key] as string,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as never),
  });

  const sensitiveChanged =
    editing &&
    (planChanged||f.officialDeadlineAt !== existing!.officialDeadlineAt ||
      (f.admittedAt && new Date(f.admittedAt).getTime() !== new Date(existing!.admittedAt).getTime()));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!f.admittedAt) return setError('زمان پذیرش را وارد کنید');
    if(existing?.repairPlan&&!f.repairDurationDays)return setError('مدت برنامه قبلی را خالی نکنید؛ برای اصلاح، تعداد روز تازه وارد کنید');
    if(f.trim.length>1000)return setError('شرح تیپ خودرو بیش از ۱۰۰۰ نویسه است؛ متن حفظ شده، لطفاً آن را کوتاه کنید');
    if (sensitiveChanged && !f.reason.trim()) return setError('برای تغییر مهلت رسمی یا زمان پذیرش، دلیل را بنویسید');
    setBusy(true);
    const nul = (v: string) => (v.trim() === '' ? null : v.trim());
    const payload: Record<string, unknown> = {
      admissionNo: nul(f.admissionNo),
      vehicle: {
        plate: nul(f.plate),
        vin: nul(f.vin),
        brand: nul(f.brand),
        model: nul(f.model),
        trim: nul(f.trim),
        modelYear: intOrNull(f.modelYear),
        color: nul(f.color),
      },
      odometerKm: intOrNull(f.odometerKm),
      admittedAt: f.admittedAt,
      vehicleLocation: nul(f.vehicleLocation),
      damageDescription: nul(f.damageDescription),
      isLegacyEntry: f.isLegacyEntry,
      coverageType: f.coverageType,
      goldenCardFileNo: nul(f.goldenCardFileNo),
      insurerName: nul(f.insurerName),
      insuranceClaimNo: nul(f.insuranceClaimNo),
      coverageNotes: nul(f.coverageNotes),
      responsibleUserId: f.responsibleUserId || null,
      officialDeadlineAt: f.officialDeadlineAt,
      forecastDeliveryAt: f.forecastDeliveryAt,
      ...(planChanged?{repairDurationDays:Number(toLatinDigits(f.repairDurationDays))}:{}),
    };
    // A masked phone is not editable by this role; send only what is known.
    const customer: Record<string, string | null> = { fullName: nul(f.fullName) };
    if (!existing?.customer?.phoneMasked) customer.phone = nul(f.phone);
    payload.customer = customer;

    try {
      let saved: CaseDetail;
      if (editing) {
        saved = await api<CaseDetail>(`/cases/${existing!.id}`, {
          method: 'PATCH',
          body: { ...payload, expectedVersion: existing!.version, reason: nul(f.reason) },
          idempotencyKey: idempotencyKey.current,
        });
        toast('تغییرات پرونده ذخیره شد');
      } else {
        saved = await api<CaseDetail>('/cases', {
          body: { ...payload, stage: f.isLegacyEntry ? f.stage : 'reception' },
          idempotencyKey: idempotencyKey.current,
        });
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          /* storage unavailable */
        }
        toast(`پرونده ${saved.caseNumber} ثبت شد`);
      }
      router.push(`/cases/${saved.id}`);
    } catch (err) {
      idempotencyKey.current = newKey();
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {restored && (
        <div className="callout callout-blue row" style={{ justifyContent: 'space-between' }}>
          <span>پیش‌نویس ذخیره‌شده قبلی بازیابی شد.</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setF(empty());
              setRestored(false);
              try {
                localStorage.removeItem(DRAFT_KEY);
              } catch {
                /* storage unavailable */
              }
            }}
          >
            شروع فرم خالی
          </button>
        </div>
      )}

      {!editing && can('case.read') && <details className="intake-history" open><summary><strong>خودرو سابقه دارد؟</strong><span className="small muted">مشخصات را از آخرین پذیرش بیاورید</span></summary><div className="panel-body stack"><VehicleHistoryLookup onSelect={c => {
        if (f.vin.trim() && toLatinDigits(f.vin).replace(/\s/g,'').toUpperCase() !== (c.vehicle.vin || '').replace(/\s/g,'').toUpperCase()) { toast('VIN فرم با خودروی انتخاب‌شده متفاوت است؛ ابتدا هویت خودرو را بررسی کنید','error'); return; }
        setF(s => ({ ...s, plate: s.plate || c.vehicle.plate || '', vin: s.vin || c.vehicle.vin || '',
          brand: s.brand === 'ایران‌خودرو' ? c.vehicle.brand || s.brand : s.brand,
          model: s.model || c.vehicle.model || '', trim: s.trim || c.vehicle.trim || '',
          modelYear: s.modelYear || (c.vehicle.modelYear ? String(c.vehicle.modelYear) : ''), color: s.color || c.vehicle.color || '',
          fullName: s.fullName || c.customer?.fullName || '', phone: s.phone || (c.customer?.phoneMasked ? '' : c.customer?.phone) || '',
          odometerKm: s.odometerKm || (c.odometerKm == null ? '' : String(c.odometerKm)) }));
        setHistorySource(c.caseNumber); toast('مشخصات و کیلومتر آخرین پذیرش در خانه‌های خالی قرار گرفت؛ کیلومتر فعلی، مالک و تلفن را بررسی کنید');
      }} />{historySource && <p className="callout callout-blue small" role="status">مشخصات از پرونده <bdi>{historySource}</bdi> تکمیل شد. کیلومتر فعلی، مالک و تلفن را بررسی کنید؛ اطلاعات مراجعهٔ جدید را در ادامه بنویسید.</p>}</div></details>}
      {can('reference.customers.read')&&<details className="compact-disclosure panel"><summary>جست‌وجو در سوابق اطلاعات پایه</summary><div className="panel-body"><ReferenceLookup kind="customers" initialQuery={existing?.vehicle.vin||existing?.vehicle.chassisRef||''} onSelect={r=>{setF(s=>({...s,fullName:s.fullName||r.data.fullName||'',phone:s.phone||r.data.phone||'',vin:s.vin||r.data.vin||'',plate:s.plate||r.data.plate||'',model:s.model||r.data.model||'',trim:s.trim||r.data.trim||''}));toast('اطلاعات سابقه فقط در خانه‌های خالی قرار گرفت؛ مالک و شماره پذیرش فعلی را تأیید کنید');}}/></div></details>}
      <Section title="خودرو" note="پلاک یا VIN برای شناسایی کافی است">
        <label className="field">
          <span>پلاک</span>
          <input className="input" name="plate" placeholder="۱۲ ب ۳۴۵ - ۶۷" {...text('plate')} />
          <span className="hint">{f.plate ? <Plate value={f.plate} /> : 'دو رقم، حرف، سه رقم، کد شهر'}</span>
        </label>
        <label className="field">
          <span>VIN (شماره شاسی)</span>
          <input className="input ltr-input" name="vin" maxLength={32} {...text('vin')} />
        </label>
        <label className="field">
          <span>کیلومتر</span>
          <input className="input ltr-input num" name="odometerKm" inputMode="numeric" {...text('odometerKm')} />
        </label>
        <label className="field">
          <span>برند</span>
          <input className="input" name="brand" {...text('brand')} />
        </label>
        <label className="field">
          <span>مدل</span>
          <input className="input" name="model" list="ikco-models" {...text('model')} />
          <datalist id="ikco-models">
            {MODELS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>تیپ</span>
          <textarea className="input" aria-label="تیپ" name="trim" rows={3} {...text('trim')} />
          <span className="hint">شرح کامل تیپ و تجهیزات؛ {f.trim.length} از ۱۰۰۰ نویسه</span>
        </label>
        <label className="field">
          <span>سال ساخت</span>
          <input className="input ltr-input num" name="modelYear" inputMode="numeric" placeholder="۱۴۰۳" {...text('modelYear')} />
        </label>
        <label className="field">
          <span>رنگ</span>
          <input className="input" name="color" {...text('color')} />
        </label>
      </Section>

      <Section title="مالک">
        <label className="field">
          <span>نام و نام خانوادگی</span>
          <input className="input" name="fullName" autoComplete="off" {...text('fullName')} />
        </label>
        <label className="field">
          <span>تلفن همراه</span>
          {existing?.customer?.phoneMasked ? (
            <input className="input ltr-input" value={existing.customer.phone ?? ''} disabled />
          ) : (
            <input className="input ltr-input num" name="phone" inputMode="tel" placeholder="۰۹۱۲۱۲۳۴۵۶۷" {...text('phone')} />
          )}
        </label>
      </Section>

      <Section title="پذیرش و خسارت">
        <label className="field"><span>شماره کارت پذیرش ایران‌خودرو</span><input className="input ltr-input" aria-label="شماره کارت پذیرش ایران‌خودرو" name="admissionNo" maxLength={80} {...text('admissionNo')}/><span className="hint">اگر پذیرش ندارد خالی بگذارید؛ شماره پرونده منیج همیشه شناسه مستقل پرونده است.</span></label>
        <JalaliInput
          label="زمان پذیرش واقعی"
          name="admittedAt"
          value={f.admittedAt}
          onChange={(v) => set('admittedAt', v)}
          withTime
          required
          nowButton
          hint="زمان ورود خودرو به تعمیرگاه؛ برای خودروهای قبلی تاریخ گذشته را وارد کنید"
        />
        <label className="field">
          <span>محل فعلی خودرو</span>
          <input className="input" name="vehicleLocation" placeholder="مثلاً سالن بدنه، جایگاه ۳" {...text('vehicleLocation')} />
        </label>
        <div className="field" style={{ justifyContent: 'center' }}>
          {!editing && (
            <label className="check">
              <input
                type="checkbox"
                name="isLegacyEntry"
                checked={f.isLegacyEntry}
                onChange={(e) => set('isLegacyEntry', e.target.checked)}
              />
              خودرو از قبل در تعمیرگاه است
            </label>
          )}
          {!editing && f.isLegacyEntry && (
            <select
              className="input"
              aria-label="مرحله فعلی"
              value={f.stage}
              onChange={(e) => set('stage', e.target.value as CaseStage)}
              style={{ marginTop: 6 }}
            >
              {CASE_STAGES.filter((s) => s !== 'delivered').map((s) => (
                <option key={s} value={s}>
                  مرحله فعلی: {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          )}
        </div>
        <label className="field span-all">
          <span>شرح خسارت</span>
          <textarea className="input" name="damageDescription" {...text('damageDescription')} />
        </label>
      </Section>

      <section className="panel">
        <div className="panel-head">
          <h2>نوع پرداخت و پوشش</h2>
        </div>
        <div className="panel-body stack">
          <div className="segmented" role="group" aria-label="نوع پوشش">
            {COVERAGE_TYPES.map((c) => (
              <button key={c} type="button" aria-pressed={f.coverageType === c} onClick={() => set('coverageType', c)}>
                {COVERAGE_LABELS[c]}
              </button>
            ))}
          </div>
          <div className="grid-3">
            {(f.coverageType === 'golden_card' || f.coverageType === 'mixed') && (
              <label className="field">
                <span>شماره پرونده کارت طلایی / امداد</span>
                <input className="input ltr-input" name="goldenCardFileNo" {...text('goldenCardFileNo')} />
                <span className="hint">تأیید رسمی فقط با ثبت در سامانه شرکت معتبر است</span>
              </label>
            )}
            {(f.coverageType === 'insurance' || f.coverageType === 'mixed') && (
              <>
                <label className="field">
                  <span>شرکت بیمه</span>
                  <input className="input" name="insurerName" {...text('insurerName')} />
                </label>
                <label className="field">
                  <span>شماره خسارت</span>
                  <input className="input ltr-input" name="insuranceClaimNo" {...text('insuranceClaimNo')} />
                </label>
              </>
            )}
            <label className="field span-all">
              <span>توضیح پوشش</span>
              <input
                className="input"
                name="coverageNotes"
                placeholder="کارشناس، سهم مشتری، اقلام مجاز یا هر نکته لازم"
                {...text('coverageNotes')}
              />
            </label>
          </div>
        </div>
      </section>

      <Section title="مسئولیت و مدت تعمیر" note="تعداد روز کاری را وارد کنید؛ تاریخ پایان با تقویم نمایندگی محاسبه می‌شود">
        <label className="field">
          <span>مسئول پرونده</span>
          <select
            className="input"
            name="responsibleUserId"
            value={f.responsibleUserId}
            onChange={(e) => set('responsibleUserId', e.target.value)}
          >
            <option value="">تعیین نشده</option>
            {assignable?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="field"><span>مدت تعمیر (روز کاری)</span><input className="input" type="number" aria-label="مدت تعمیر (روز کاری)" name="repairDurationDays" min={1} max={365} step={1} value={f.repairDurationDays??''} onChange={e=>set('repairDurationDays',e.target.value)}/><span className="hint">یک روز معادل یک روز کاملِ ساعات تنظیم‌شده نمایندگی است؛ پنجشنبه نیمه‌وقت، استراحت و تعطیلات لحاظ می‌شوند.</span></label>
        {planPreview&&<p className="callout callout-blue">پایان محاسبه‌شده: {formatJalali(planPreview,{time:true})}</p>}
        <details className="span-all compact-disclosure"><summary>موعد رسمی یا پیش‌بینی ثبت‌شده از قبل</summary><div className="grid-2">
        <JalaliInput
          label="مهلت رسمی / تعهد اولیه"
          name="officialDeadlineAt"
          value={f.officialDeadlineAt}
          onChange={(v) => set('officialDeadlineAt', v)}
          withTime
          hint="مهلت شرکت یا تعهد داده‌شده به مشتری؛ با پیش‌بینی داخلی جایگزین نمی‌شود"
        />
        <JalaliInput
          label="پیش‌بینی تحویل"
          name="forecastDeliveryAt"
          value={f.forecastDeliveryAt}
          onChange={(v) => set('forecastDeliveryAt', v)}
          withTime
          hint="برآورد فعلی کارشناس با توجه به ظرفیت"
        />
        </div></details>
        {(sensitiveChanged || (editing && supportAccount)) && (
          <label className="field span-all">
            <span>{sensitiveChanged ? 'دلیل تغییر مهلت رسمی یا زمان پذیرش *' : 'دلیل اصلاح (مدیر سیستم)'}</span>
            <input className="input" name="reason" {...text('reason')} />
            <span className="hint">{supportAccount ? 'برای تغییر مقدار ثبت‌شده لازم است؛ تکمیل جای خالی دلیل نمی‌خواهد. در تاریخچه و گزارش مالک می‌ماند.' : 'در تاریخچه پرونده ثبت می‌شود'}</span>
          </label>
        )}
      </Section>

      {error && (
        <div className="callout callout-red" role="alert">
          {error}
        </div>
      )}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'در حال ذخیره…' : editing ? 'ذخیره تغییرات' : 'ثبت پرونده'}
        </button>
        <button className="btn" type="button" onClick={() => router.back()}>
          انصراف
        </button>
        {!editing && <span className="xs muted">فیلدهای نامعلوم را خالی بگذارید؛ پرونده با برچسب «نیازمند تکمیل» ثبت می‌شود.</span>}
      </div>
    </form>
  );
}
