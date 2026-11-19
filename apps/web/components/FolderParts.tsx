import { coverageTab, type CoverageType } from '@manage/shared';
import { AppIcon, type IconName } from './AppIcon';

// Shared pieces of the approved case-folder design (owner, 2026-11-18;
// docs/design/mockups/approved-2026-11-18): two different binder clips, the
// coverage and «تعویض اتاق» badges, and the vehicle picture.

/** The large gold binder clip of the case header: folded wire handles over a gold body. */
export function HeaderClip() {
  return (
    <svg className="clip-gold" width="92" height="112" viewBox="0 0 92 112" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="cg-body" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#F3D58C" />
          <stop offset=".45" stopColor="#D7A845" />
          <stop offset="1" stopColor="#A9792A" />
        </linearGradient>
        <linearGradient id="cg-wire" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#8E6A26" />
          <stop offset=".5" stopColor="#F2D891" />
          <stop offset="1" stopColor="#8E6A26" />
        </linearGradient>
      </defs>
      {/* Wire handles: two loops bent back over the top, meeting in a rounded fold. */}
      <path d="M22 70 L31 16 Q33 5 46 5 Q59 5 61 16 L70 70" fill="none" stroke="url(#cg-wire)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M29 70 L36 22 Q38 13 46 13 Q54 13 56 22 L63 70" fill="none" stroke="#7A5A1E" strokeWidth="1.4" strokeLinecap="round" opacity=".55" />
      {/* Body: trapezoid with a bevel, and the fold line where it grips the paper. */}
      <path d="M12 66 H80 L72 104 Q71 108 66 108 H26 Q21 108 20 104 Z" fill="url(#cg-body)" stroke="#8C6422" strokeWidth="1.2" />
      <path d="M14 66 H78 L76.6 73 H15.4 Z" fill="#FBE7AE" opacity=".85" />
      <path d="M22 100 H70" stroke="#8C6422" strokeWidth="1.6" strokeLinecap="round" opacity=".6" />
      <circle cx="16" cy="68.5" r="3.4" fill="url(#cg-wire)" stroke="#7A5A1E" strokeWidth=".8" />
      <circle cx="76" cy="68.5" r="3.4" fill="url(#cg-wire)" stroke="#7A5A1E" strokeWidth=".8" />
    </svg>
  );
}

/** The narrow paper clip of an accident-desk row: one bent wire, slanted over the case-number slip. */
export function RowClip() {
  return (
    <svg className="clip-row" width="26" height="64" viewBox="0 0 26 64" aria-hidden="true" focusable="false">
      <path d="M8 54 V12 Q8 4 14 4 Q20 4 20 12 V50 Q20 60 13 60 Q6 60 6 50 V18 Q6 14 10 14 Q14 14 14 18 V46" fill="none" stroke="#B98A2E" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 54 V12 Q8 4 14 4 Q20 4 20 12 V50" fill="none" stroke="#F2D58C" strokeWidth=".9" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}

const COVER_ICON: Record<'gold' | 'ins' | 'own', IconName> = { gold: 'shield', ins: 'shield', own: 'money' };

/** Coverage badge in the design colours: gold card, body insurance or customer cost. */
export function CoverageBadge({ coverage }: { coverage: CoverageType }) {
  const t = coverageTab(coverage);
  const label = coverage === 'insurance' ? 'بیمه بدنه' : coverage === 'personal' ? 'هزینه مشتری' : t.label;
  return <span className={`cov-badge cov-${t.key}`} data-testid="coverage-badge"><AppIcon name={COVER_ICON[t.key]} />{label}</span>;
}

/** «تعویض اتاق», shown only when recorded on the case. */
export function BodyBadge() {
  return <span className="body-badge" data-testid="body-replacement-badge"><AppIcon name="car" />تعویض اتاق</span>;
}

/**
 * Licensed, model-matched vehicle photos (brand + model key → file under /public/vehicles).
 * Empty until the dealership supplies photos it may use; every vehicle then shows the
 * neutral drawing below instead of a guessed picture (docs/TEST_REPORT.md).
 */
const VEHICLE_PHOTOS: Record<string, { src: string; credit: string }> = {};

const photoKey = (vehicle: string) => vehicle.replace(/\s+/g, ' ').trim();

export function VehicleImage({ vehicle, size = 'md' }: { vehicle: string; size?: 'sm' | 'md' | 'lg' }) {
  const photo = VEHICLE_PHOTOS[photoKey(vehicle)];
  if (photo) return <img className={`veh-img veh-${size}`} src={photo.src} alt={vehicle} title={photo.credit} loading="lazy" />;
  return (
    <span className={`veh-img veh-${size} veh-none`} role="img" aria-label={`تصویر تطبیق‌یافتهٔ ${vehicle} موجود نیست`} data-testid="vehicle-placeholder">
      <svg viewBox="0 0 160 70" aria-hidden="true" focusable="false">
        <path d="M14 50 Q12 40 22 37 L48 32 L66 18 Q72 14 82 14 H108 Q118 14 124 20 L138 33 Q150 35 150 44 V50 Q150 54 146 54 H18 Q14 54 14 50 Z" fill="#E9E6DF" stroke="#B9B3A7" strokeWidth="2" />
        <path d="M70 21 Q74 18 82 18 H96 V32 H56 Z M100 18 H108 Q115 18 119 22 L129 32 H100 Z" fill="#F7F6F2" stroke="#C9C3B7" strokeWidth="1.5" />
        <circle cx="44" cy="54" r="11" fill="#5F6672" /><circle cx="44" cy="54" r="5" fill="#C9C3B7" />
        <circle cx="120" cy="54" r="11" fill="#5F6672" /><circle cx="120" cy="54" r="5" fill="#C9C3B7" />
      </svg>
    </span>
  );
}

/**
 * «جزئیات فنی خودرو» (owner, 2026-11-19): everyday screens show the vehicle name once;
 * the full brand, model, trim and VIN stay one click away where parts matching needs them.
 */
export function VehicleTechDetails({ brand, model, trim, vin, modelYear }: { brand?: string | null; model?: string | null; trim?: string | null; vin?: string | null; modelYear?: number | null }) {
  if (!brand && !model && !trim && !vin) return null;
  return (
    <details className="veh-tech" data-testid="vehicle-tech-details">
      <summary>جزئیات فنی خودرو</summary>
      <dl>
        {brand && <><dt>برند</dt><dd>{brand}</dd></>}
        {model && <><dt>مدل کامل</dt><dd>{model}</dd></>}
        {trim && <><dt>تیپ</dt><dd>{trim}</dd></>}
        {modelYear && <><dt>سال ساخت</dt><dd>{modelYear}</dd></>}
        {vin && <><dt>VIN</dt><dd><bdi dir="ltr">{vin}</bdi></dd></>}
      </dl>
    </details>
  );
}
