'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  formatJalaliDateInput,
  formatTimeInput,
  parseJalali,
  toPersianDigits,
  toLatinDigits,
} from '@manage/shared';

interface Props {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  withTime?: boolean;
  required?: boolean;
  hint?: string;
  /** Shows a "now" shortcut (admission, actual times). */
  nowButton?: boolean;
  name?: string;
}

/**
 * Jalali (Solar Hijri) date + optional time, entered in Tehran local time.
 * Accepts Persian or Latin digits and / - . separators; stores ISO UTC.
 */
export function JalaliInput({ label, value, onChange, withTime, required, hint, nowButton, name }: Props) {
  const id = useId();
  const [dateText, setDateText] = useState('');
  const [timeText, setTimeText] = useState('');
  const [invalid, setInvalid] = useState(false);
  // Value this component emitted itself; re-syncing the text on our own commit
  // would overwrite a time the user is still typing.
  const emitted = useRef<string | null | undefined>(undefined);
  const dateInput=useRef<HTMLInputElement>(null);
  const timeInput=useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = undefined;
    dateInput.current?.setCustomValidity('');timeInput.current?.setCustomValidity('');setInvalid(false);
    if (!value) {
      setDateText('');
      setTimeText('');
      return;
    }
    const d = new Date(value);
    setDateText(toPersianDigits(formatJalaliDateInput(d)));
    setTimeText(toPersianDigits(formatTimeInput(d)));
  }, [value]);

  function commit(nextDate: string, nextTime: string) {
    if (!nextDate.trim()) {
      dateInput.current?.setCustomValidity(required?'تاریخ را وارد کنید':'');timeInput.current?.setCustomValidity('');
      setInvalid(!!required);
      emitted.current = null;
      onChange(null);
      return;
    }
    const parsed = parseJalali(nextDate, withTime ? nextTime || '00:00' : '12:00');
    setInvalid(!parsed);
    dateInput.current?.setCustomValidity(parsed?'':'تاریخ و ساعت را مطابق راهنمای همین فیلد وارد کنید');
    timeInput.current?.setCustomValidity(parsed?'':'تاریخ و ساعت را مطابق راهنمای همین فیلد وارد کنید');
    // Unchanged text keeps the precise stored value instead of truncating it to the minute.
    if (parsed && value) {
      const current = new Date(value);
      const same = withTime
        ? Math.floor(current.getTime() / 60_000) === Math.floor(parsed.getTime() / 60_000)
        : formatJalaliDateInput(current) === formatJalaliDateInput(parsed);
      if (same) return;
    }
    if (parsed) {
      emitted.current = parsed.toISOString();
      onChange(emitted.current);
    }
  }

  return (
    <label className="field" htmlFor={id}>
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input
          id={id}
          ref={dateInput}
          aria-label={label}
          name={name}
          className="input ltr-input num"
          inputMode="numeric"
          placeholder="۱۴۰۵/۰۸/۰۹"
          value={dateText}
          aria-invalid={invalid}
          onChange={(e) => {dateInput.current?.setCustomValidity('');const pasted=toLatinDigits(e.target.value).trim().match(/^(\d{4}[/.-]\d{1,2}[/.-]\d{1,2})\s+(\d{1,2}:\d{2})(?::\d{2})?$/);if(withTime&&pasted){setDateText(pasted[1]!);setTimeText(pasted[2]!);}else setDateText(e.target.value);}}
          onBlur={() => commit(dateText, timeText)}
          style={{ flex: 2 }}
        />
        {withTime && (
          <input
            ref={timeInput}
            aria-label={`${label} — ساعت`}
            name={name ? `${name}-time` : undefined}
            className="input ltr-input num"
            inputMode="numeric"
            placeholder="۱۴:۳۰"
            value={timeText}
            aria-invalid={invalid}
            onChange={(e) => {timeInput.current?.setCustomValidity('');setTimeText(e.target.value);}}
            onBlur={() => commit(dateText, timeText)}
            style={{ flex: 1 }}
          />
        )}
        {nowButton && (
          <button type="button" className="btn btn-sm" onClick={() => onChange(new Date().toISOString())}>
            اکنون
          </button>
        )}
      </div>
      {invalid ? (
        <span className="error">تاریخ را به شکل ۱۴۰۵/۰۸/۰۹{withTime ? ' و ساعت را به شکل ۱۴:۳۰' : ''} وارد کنید</span>
      ) : (
        hint && <span className="hint">{hint}</span>
      )}
    </label>
  );
}
