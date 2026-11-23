'use client';

import useSWR from 'swr';
import type { EmployeeScoreResult } from '@manage/shared';
import { fetcher } from '@/lib/api';
import { faNum, formatJalali } from '@/lib/format';

type Employee = {id:string;name:string;active:boolean;activity:Record<string,number>;score:EmployeeScoreResult|null;
  deskScores:{role:string;followups:number;closed:number;reviewed:number;delays:number;result:EmployeeScoreResult}[];reviewed:number;eligible:number;delays:number;holds:number;
  earnings:{source:'technician_wages';approvedJobs:number;jobsWithWage:number;jobsWithoutWage:number;amountRial:number|null}|null};
const titles:Record<string,string>={assessment_created:'کارشناسی ثبت‌شده',assessment_finalized:'کارشناسی نهایی',
  package_submitted:'ارسال کل کارشناسی',part_reviewed:'تصمیم بررسی فنی',work_started:'شروع کار',work_completed:'پایان کار',work_approved:'تأیید تحویل'};
export function EmployeePerformance() {
  const {data,error}=useSWR<{from:string;to:string;employees:Employee[]}>('/reports/employees',fetcher);
  if(error) return <p role="alert">گزارش عملکرد کارکنان دریافت نشد.</p>;
  if(!data) return <p role="status">در حال دریافت عملکرد کارکنان…</p>;
  return <section className="panel panel-body stack"><h2>عملکرد کارکنان در ماه جاری</h2>
    <p>{formatJalali(data.from)} تا {formatJalali(data.to)}</p>
    {data.employees.map(person=><details key={person.id}><summary>{person.name} · {person.score?.score!=null ? faNum(person.score.score)+' از ۱۰۰ (تکنسین)' : person.deskScores.some(d=>d.result.score!=null) ? 'امتیاز به تفکیک نقش' : 'شواهد کافی برای امتیاز وجود ندارد'}{!person.active && ' · غیرفعال'}</summary>
      <p>شناسه کارمند <bdi>{person.id}</bdi></p>
      <p>{Object.entries(person.activity).map(([key,n])=>(titles[key]??key)+' '+faNum(n)).join('، ') || 'فعالیت قابل انتساب در این بازه ثبت نشده است.'}</p>
      {person.deskScores.map(d=><section key={d.role}><h3>{d.role==='accident_expert'?'کارشناسی تصادفات':'مسئول قطعات'} · {d.result.score==null?'شواهد کافی نیست':faNum(d.result.score)+' از ۱۰۰'}</h3>
        <p>پیگیری ارجاع‌شده به نقش {faNum(d.followups)} · بسته‌شده {faNum(d.closed)} · اقلام دارای بررسی مستقل {faNum(d.reviewed)}</p>
        <dl>{([['progress','پیگیری بسته‌شده (۳۰)'],['timeliness','مشاهده پیش از یادآوری مجدد (۲۵)'],['accuracy',d.role==='accident_expert'?'قبول فنی مستقل اقلام نوشته‌شده (۲۵)':'ثبت شماره فنی در اقلام تأییدشده با نهایی‌سازی مستقل (۲۵)'],['accountability','پاسخ مستند در پیگیری بسته‌شده (۲۰)']] as const)
          .map(([key,title])=><div key={key}><dt>{title}</dt><dd>{d.result.breakdown[key]==null?'داده کافی نیست':faNum(d.result.breakdown[key]!)}</dd></div>)}</dl>
        {d.delays>0 && <p>{faNum(d.delays)} پیگیری تا موعد یادآوری مجدد دیده نشد. زمان ارجاع و دریافت را مرور کنید.</p>}
      </section>)}
      {person.score && <><p>کارهای واجد بررسی با موعد این ماه {faNum(person.eligible)} · تحویل با تأیید مستقل {faNum(person.reviewed)} · عبور از موعد {faNum(person.delays)} · دارای توقف ثبت‌شده {faNum(person.holds)}</p>
      <dl>{([['progress','تحویل تأییدشده از کارهای واجد بررسی (۳۰)'],['timeliness','تحویل در موعد برنامه اولیه (۲۵)'],['accuracy','تحویل بدون بازگشایی ثبت‌شده (۲۵)'],['accountability','ثبت پایان به دست خود تکنسین (۲۰)']] as const).map(([k,title])=><div key={k}><dt>{title}</dt><dd>{person.score?.breakdown[k]!=null ? faNum(person.score.breakdown[k]!) : 'داده کافی نیست'}</dd></div>)}</dl>
      {person.earnings && <p data-testid="employee-earnings">اجرت ثبت‌شدهٔ کارهای تأییدشدهٔ این ماه: {person.earnings.amountRial==null?'(نمایش مبلغ نیازمند مجوز گزارش اجرت است)':faNum(person.earnings.amountRial)+' ریال'} · از {faNum(person.earnings.jobsWithWage)} کار{person.earnings.jobsWithoutWage>0?` · ${faNum(person.earnings.jobsWithoutWage)} کار تأییدشده بدون اجرت ثبت‌شده`:''} · منبع: اجرت ثبت‌شده روی هر کار (نه برآورد)</p>}
      {person.holds>0 && <p>علت توقف کارهای این کارمند را در پرونده‌ها مرور کنید.</p>}
      {person.delays>0 && <p>برنامه کارهای گذشته از موعد را با زمان تحویل تطبیق دهید.</p>}</>}
    </details>)}</section>;
}
