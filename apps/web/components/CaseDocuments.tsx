 'use client';
import { useState, type FormEvent } from 'react';
import useSWR from 'swr';
import type { CaseDetail } from '@manage/shared';
import { api, fetcher, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
export function CaseDocuments({ kase, onChange }: { kase: CaseDetail; onChange: () => void }) {
  const { can } = useAuth();
  const endpoint = `/cases/${kase.id}/documents`;
  const { data, mutate, error } = useSWR<{ id: string; fileName: string }[]>(endpoint, fetcher);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const file = new FormData(e.currentTarget).get('file');
    if (!(file instanceof File) || !file.size) return;
    if (file.size > 3 * 1024 * 1024) { setFailure('حداکثر اندازهٔ مدرک ۳ مگابایت است'); return; }
    setBusy(true); setFailure('');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let raw = ''; for (const byte of bytes) raw += String.fromCharCode(byte);
      await api(endpoint, { body: { fileName: file.name, mime: file.type, dataBase64: btoa(raw), expectedVersion: kase.version } });
      await mutate(); onChange();
    } catch (e) { setFailure(errorMessage(e)); } finally { setBusy(false); }
  }
  return <section className="panel panel-body stack" aria-label="مدارک پرونده"><h2>مدارک پرونده</h2>
    {(error || failure) && <p role="alert">{failure || errorMessage(error)}</p>}
    <ul>{data?.map(d => <li key={d.id}><a href={`/api/v1${endpoint}/${d.id}`}>{d.fileName}</a></li>)}</ul>
    {can('assessment.manage') && kase.status === 'open' && <form onSubmit={submit} className="stack"><label className="field">بارگذاری مدرک (PDF، JPEG یا PNG، حداکثر ۳ مگابایت)<input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required /></label><button className="btn" disabled={busy}>بارگذاری مدرک</button></form>}
  </section>;
}
