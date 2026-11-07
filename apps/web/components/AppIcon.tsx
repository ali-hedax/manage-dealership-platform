export type IconName='home'|'car'|'file'|'add'|'chart'|'user'|'team'|'box'|'money'|'check'|'settings'|'database'|'shield'|'clock'|'alert'|'grid'|'gauge'|'wrench'|'calendar'|'upload'|'desk';
const paths:Record<IconName,string>={home:'m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',car:'m5 6-2 7v6h3v-2h12v2h3v-6l-2-7H5Zm-1 7h16M7 15h.01M17 15h.01',file:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h6',add:'M12 5v14M5 12h14',chart:'M4 3v18h17M8 16v-5M13 16V6M18 16v-8',user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v3',team:'M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM5 21v-3a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v3M3 8v5M1 10h4M21 8v5M19 10h4',box:'m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 5 9-5M12 12v9M7 5l10 5',money:'M3 5h18v14H3V5Zm12 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM6 8h.01M18 16h.01',check:'m4 12 5 5L20 6',settings:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',database:'M3 6c0-4 18-4 18 0S3 10 3 6Zm0 0v12c0 4 18 4 18 0V6M3 12c0 4 18 4 18 0',shield:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 10 3 3 5-6',clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',alert:'m12 3 10 18H2L12 3Zm0 5v5M12 17h.01',grid:'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z',gauge:'M3.5 17a9 9 0 1 1 17 0M12 13l4-5M12 13h.01',wrench:'M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.1 2.1 0 0 1-3-3l9.4-9.4a4 4 0 0 0-5-5l2.6 2.6-.6 2.4-2.4.6-2.6-2.6',calendar:'M4 6h16v14H4V6Zm0 4h16M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01',upload:'M12 15V4m0 0-4 4m4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',desk:'M3 9h18M5 9v11M19 9v11M3 5h18v4H3V5Zm6 8h6'};
/* HEDAX Signature drawings: one 24px grid, straight runs with 45° chamfers instead of
   rounded corners, mitred joins, hexagonal "nut" geometry for people and settings,
   automotive silhouettes drawn front-on. Shown only when the Signature theme is active. */
const signature:Record<IconName,string>={
 home:'M3 11 12 4l9 7M5.5 9.5V20h13V9.5M10 20v-5.5h4V20',
 car:'M4.5 17v-5l2-5.5h11l2 5.5v5M4.5 17h15M6.5 17v2.5h3V17M14.5 17v2.5h3V17M6.5 11h11M7 14h2M15 14h2',
 file:'M6 3h8.5L19 7.5V21H6V3ZM14.5 3v4.5H19M9 12.5h7M9 16.5h5',
 add:'M12 5v14M5 12h14',
 chart:'M4 4v16h16M8 16.5V12M12 16.5V7.5M16 16.5v-6',
 user:'M12 3.5 15.5 5.5v3.5L12 11 8.5 9V5.5L12 3.5ZM5 20.5V18l3-3h8l3 3v2.5',
 team:'M9 4 11.8 5.6v3.1L9 10.3 6.2 8.7V5.6L9 4ZM16.5 6.3l2 1.15v2.3l-2 1.15-2-1.15v-2.3l2-1.15ZM3 20v-2.2L5.8 15h6.4l2.8 2.8V20M15.5 14h2.7L21 16.8V20',
 box:'M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9M8 5.25l8 4.5',
 money:'M3 6h18v12H3V6ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 9v6M18 9v6',
 check:'m4.5 12.5 5 5L19.5 7',
 settings:'M8.6 3h6.8L21 8.6v6.8L15.4 21H8.6L3 15.4V8.6L8.6 3ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
 database:'M4 6.5 7 4h10l3 2.5L17 9H7L4 6.5ZM4 6.5v11L7 20h10l3-2.5v-11M4 12l3 2.5h10L20 12',
 shield:'M12 3 20 6v6.5c0 4-3.5 7-8 8.5-4.5-1.5-8-4.5-8-8.5V6l8-3ZM8.5 12l2.5 2.5L15.5 10',
 clock:'M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3L8.3 3ZM12 7v5l3.5 2',
 alert:'M12 3.5 21.5 20h-19L12 3.5ZM12 10v4.5M12 17v1',
 grid:'M4 4h6.5v6.5H4V4ZM13.5 4H20v6.5h-6.5V4ZM4 13.5h6.5V20H4v-6.5ZM13.5 13.5H20V20h-6.5v-6.5Z',
 gauge:'M3.5 18a8.5 8.5 0 1 1 17 0M12 18l4.5-6.5M6.2 13.6l1.3.75M12 9.5V11M17.8 13.6l-1.3.75M10 18h4',
 wrench:'M14.5 4.5 17 2.5l4.5 4.5-2 2.5h-3l-2.5-2.5v-2.5ZM14.5 9.5 5 19M3.5 17.5l3 3',
 calendar:'M4 5.5h16V20H4V5.5ZM4 10h16M8.5 3v4.5M15.5 3v4.5M8 14h2M14 14h2M8 17h2',
 upload:'M12 15.5V4M7.5 8.5 12 4l4.5 4.5M4 14.5V20h16v-5.5',
 desk:'M3 4.5h18v4H3v-4ZM5 8.5V20M19 8.5V20M9 12.5h6',
};
export function AppIcon({name,className=''}:{name:IconName;className?:string}){return <svg className={`app-icon ${className}`} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path className="ico-c" d={paths[name]}/><path className="ico-s" d={signature[name]}/></svg>;}
