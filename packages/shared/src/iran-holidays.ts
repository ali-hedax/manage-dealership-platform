const names:Record<string,string>={
 'Norooz':'نوروز','Norooz Holiday':'تعطیلات نوروز','Nature Day':'روز طبیعت','Islamic Republic Day':'روز جمهوری اسلامی','Revolution Day':'پیروزی انقلاب اسلامی','Oil Nationalization Day':'ملی شدن صنعت نفت',
 'Ashura':'عاشورا','Tassoua':'تاسوعا','Arbaeen':'اربعین','Eid-e-Fetr':'عید فطر','Eid-e-Fetr Holiday':'تعطیلات عید فطر','Eid-e-Ghadir':'عید غدیر','Eid-e-Ghorban':'عید قربان',
 "Anniversary of Khomeini's Death":'رحلت امام خمینی','Revolt of Khordad 15':'قیام پانزده خرداد',"Birthday of Imam Ali and Father's Day":'ولادت امام علی',"Imam Mahdi's birthday":'ولادت امام مهدی',"Prophet's Ascension":'مبعث پیامبر',
 'Birthday of Prophet Muhammad and Imam Sadeq':'ولادت پیامبر و امام صادق','Demise of Prophet Muhammad and Martyrdom of Imam Hassan':'رحلت پیامبر و شهادت امام حسن','Martyrdom of Hazrat Fatima':'شهادت حضرت فاطمه','Martyrdom of Imam Ali':'شهادت امام علی','Martyrdom of Imam Hasan al-Askari':'شهادت امام حسن عسکری','Martyrdom of Imam Reza':'شهادت امام رضا','Martyrdom of Imam Sadeq':'شهادت امام صادق',
 'Election Holiday':'تعطیلی انتخابات','Heat Wave Public Holiday':'تعطیلی به علت گرما','Public Holiday for Extreme Weather':'تعطیلی به علت شرایط جوی','Public Mourning Day':'تعطیلی عزای عمومی',
};
export interface IranHoliday {date:string;title:string;tentative:boolean}
/** Google's expanded all-day feed; observances never become workshop closures. */
export function parseIranHolidays(ics:string,from:string,to:string):IranHoliday[]{
 if(!ics.trim().startsWith('BEGIN:VCALENDAR')||!ics.includes('END:VCALENDAR'))throw new Error('INVALID_HOLIDAY_FEED');
 const unfolded=ics.replace(/\r?\n[ \t]/g,'');const result=new Map<string,IranHoliday>();
 for(const event of unfolded.split('BEGIN:VEVENT').slice(1)){
  const field=(key:string)=>event.match(new RegExp(`(?:^|\\r?\\n)${key}:(.*)`))?.[1]?.trim()??'';
  if(!/^Public holiday(?:\\n|$)/.test(field('DESCRIPTION'))||field('STATUS')==='CANCELLED')continue;
  if(/(?:^|\n)RRULE:/.test(event))throw new Error('UNSUPPORTED_HOLIDAY_RECURRENCE');
  const raw=field('DTSTART;VALUE=DATE');if(!/^\d{8}$/.test(raw))throw new Error('INVALID_HOLIDAY_DATE');
  const date=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6)}`;
  if(!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('INVALID_HOLIDAY_DATE');
  if(date<from||date>to)continue;
  const original=field('SUMMARY').replace(/\\([nN,;\\])/g,(_,c:string)=>c.toLowerCase()==='n'?' ':c);
  if(!original)throw new Error('INVALID_HOLIDAY_TITLE');
  const tentative=/tentative/i.test(original+' '+field('DESCRIPTION'));
  const title=(names[original.replace(/ \(tentative\)$/,'')]??original).slice(0,150);
  const previous=result.get(date);
  result.set(date,{date,title:previous&&previous.title!==title?`${previous.title} / ${title}`.slice(0,150):title,tentative:tentative||!!previous?.tentative});
 }
 return [...result.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
