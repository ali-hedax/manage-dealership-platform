import {badRequest} from '../common/errors';

// Public data only. Never accept a user-controlled URL or send account/customer data.
export const IRAN_HOLIDAY_FEED='https://calendar.google.com/calendar/ical/fa.ir%23holiday%40group.v.calendar.google.com/public/basic.ics';
export {parseIranHolidays} from '@manage/shared';
import {parseIranHolidays} from '@manage/shared';
let cached:{fetchedAt:string;expires:number;ics:string}|null=null;
let pending:Promise<{fetchedAt:string;expires:number;ics:string}>|null=null;
async function loadFeed(){
 const response=await fetch(IRAN_HOLIDAY_FEED,{signal:AbortSignal.timeout(12_000),redirect:'error'});
 if(!response.ok||Number(response.headers.get('content-length')??0)>2_000_000)throw new Error('HOLIDAY_FETCH_FAILED');
 const reader=response.body?.getReader();if(!reader)throw new Error('EMPTY_HOLIDAY_FEED');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000)throw new Error('HOLIDAY_FEED_TOO_LARGE');chunks.push(value);}}finally{await reader.cancel();}
 const ics=Buffer.concat(chunks).toString('utf8');parseIranHolidays(ics,'2000-01-01','2100-01-01');
 return {ics,fetchedAt:new Date().toISOString(),expires:Date.now()+60*60_000};
}
export async function iranHolidays(from:string,to:string){
 try{
  if(!cached||cached.expires<Date.now()){
   pending??=loadFeed();try{cached=await pending;}finally{pending=null;}
  }
  const items=parseIranHolidays(cached.ics,from,to);
  if(!items.length)throw new Error('EMPTY_HOLIDAY_RANGE');
  return {source:'google_iran_public_holidays',sourceUrl:IRAN_HOLIDAY_FEED,fetchedAt:cached.fetchedAt,from,to,items};
 }catch{throw badRequest('HOLIDAY_SOURCE_UNAVAILABLE','دریافت تعطیلات ایران از گوگل کامل نشد؛ تقویم ثبت‌شده تغییر نکرده است. دوباره تلاش کنید.');}
}
