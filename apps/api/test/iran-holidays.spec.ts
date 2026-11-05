import {parseIranHolidays} from '../src/workshop/iran-holidays';
const event=(date:string,title:string,description='Public holiday',extra='')=>`BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${date}\r\nSUMMARY:${title}\r\nDESCRIPTION:${description}\r\n${extra}END:VEVENT\r\n`;
const feed=(events:string)=>`BEGIN:VCALENDAR\r\n${events}END:VCALENDAR`;
it('only imports public holidays in range, translates, unfolds and flags tentative dates',()=>{
 const parsed=parseIranHolidays(feed(event('20270321','Norooz')+event('20270322','Norooz Holiday')+event('20270309','Ramadan Start','Observance')+event('20270310','Eid-e-Fetr (tentative)','Public holiday\\nDate is tentative and may change.')+event('20260321','Norooz')+event('20270401','Cancelled','Public holiday','STATUS:CANCELLED\r\n')+event('20270402','Long\\, title\r\n  continued')), '2027-01-01','2027-12-31');
 expect(parsed).toEqual([{date:'2027-03-10',title:'عید فطر',tentative:true},{date:'2027-03-21',title:'نوروز',tentative:false},{date:'2027-03-22',title:'تعطیلات نوروز',tentative:false},{date:'2027-04-02',title:'Long, title continued',tentative:false}]);
});
it('rejects malformed dates, incomplete feeds and unsupported recurrence rather than silently changing closures',()=>{
 expect(()=>parseIranHolidays('<html>unavailable</html>','2027-01-01','2027-12-31')).toThrow();
 expect(()=>parseIranHolidays(feed(event('20270230','Bad')),'2027-01-01','2027-12-31')).toThrow('INVALID_HOLIDAY_DATE');
 expect(()=>parseIranHolidays(feed(event('20270321','Norooz','Public holiday','RRULE:FREQ=YEARLY\r\n')),'2027-01-01','2027-12-31')).toThrow('UNSUPPORTED_HOLIDAY_RECURRENCE');
});
it('merges same-day holidays without duplicate dates and keeps uncertainty',()=>{
 const result=parseIranHolidays(feed(event('20270321','Norooz')+event('20270321','Eid-e-Fetr (tentative)','Public holiday\\nDate is tentative and may change.')),'2027-01-01','2027-12-31');
 expect(result).toEqual([{date:'2027-03-21',title:'نوروز / عید فطر',tentative:true}]);
});
