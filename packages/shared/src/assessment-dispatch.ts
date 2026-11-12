import {normalizePersian,toLatinDigits} from './text';
import type {AssessmentItem,Part} from './types';

type Item=Pick<AssessmentItem,'id'|'originItemId'|'action'|'description'|'partNumber'|'quantity'|'approvalStatus'>;
type Request=Pick<Part,'id'|'assessmentItemId'|'description'|'partNumber'|'quantity'|'status'>;
/** Exact technical identity, never a stock family or a fuzzy description match. */
export function assessmentPartKey(item:{action?:string;partNumber:string|null;description:string;evidence?:string|null}){
 const labourCode=item.action==='repair'?item.evidence?.match(/، کد اجرت (.+)$/)?.[1]:null;
 const code=toLatinDigits(item.partNumber??labourCode??'').trim().toUpperCase();
 return `${item.action??'replace'}:${code?'code:'+code:'name:'+normalizePersian(item.description).replace(/\s+/g,' ').trim()}`;
}
export interface AssessmentDispatchLine {itemId:string;rootId:string;requestedQuantity:number;quantity:number;state:'ready'|'sent'|'review'|'excluded';message:string}
export function assessmentDispatchLines(current:readonly Item[],history:readonly Item[],requests:readonly Request[]):AssessmentDispatchLine[]{
 const byId=new Map(history.map(i=>[i.id,i]));
 const rootOf=(item:Item)=>{let root=item;const seen=new Set<string>();while(root.originItemId&&byId.has(root.originItemId)&&!seen.has(root.id)){seen.add(root.id);root=byId.get(root.originItemId)!;}return root;};
 // Parts of a rejected line are not supply for a replacement with the same code (task 3).
 const rejectedRoots=new Set(current.filter(i=>i.approvalStatus==='rejected').map(i=>rootOf(i).id));
 return current.map(item=>{
  const root=rootOf(item);
  const base={itemId:item.id,rootId:root.id,requestedQuantity:0,quantity:0};
  if(item.action!=='replace'||item.approvalStatus==='rejected')return {...base,state:'excluded',message:item.action==='replace'?'قلم ردشده':'اجرت / تعمیر'};
  const key=assessmentPartKey(item);
  const related=requests.filter(p=>p.status!=='cancelled'&&!(p.assessmentItemId&&rejectedRoots.has(p.assessmentItemId))&&(p.assessmentItemId===root.id||assessmentPartKey(p)===key));
  const requestedQuantity=related.reduce((n,p)=>n+p.quantity,0);const result={...base,requestedQuantity,quantity:Math.max(0,item.quantity-requestedQuantity)};
  if(current.filter(i=>i.action==='replace'&&i.approvalStatus!=='rejected'&&assessmentPartKey(i)===key).length>1)return {...result,state:'review',message:'شماره فنی تکراری در کارشناسی؛ ابتدا اقلام را اصلاح کنید'};
  if(related.some(p=>assessmentPartKey(p)!==key))return {...result,state:'review',message:'شماره فنی نیاز قبلی تغییر کرده؛ پیش از ارسال بررسی کنید'};
  if(requestedQuantity>item.quantity)return {...result,state:'review',message:'تعداد ارسال‌شده از تعداد کارشناسی بیشتر است؛ سوابق تأمین باید بررسی شوند'};
  return {...result,state:result.quantity?'ready':'sent',message:result.quantity?(requestedQuantity?'افزایش تعداد؛ فقط مابه‌التفاوت ارسال می‌شود':'آماده ارسال'):'ارسال شده به قطعات و تأمین'};
 });
}
