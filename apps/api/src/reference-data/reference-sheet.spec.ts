import {strToU8,zipSync} from 'fflate';
import {readWorkbook,XlsxError} from '../parts/xlsx';
const book=(xml:string,shared?:string)=>zipSync({'xl/worksheets/sheet1.xml':strToU8(xml),...(shared?{'xl/sharedStrings.xml':strToU8(shared)}:{})});
it('rejects sparse row/column allocations before expanding the grid',()=>{
 expect(()=>readWorkbook(book('<worksheet><row r="999999999"><c r="A999999999"><v>1</v></c></row></worksheet>'))).toThrow(XlsxError);
 expect(()=>readWorkbook(book('<worksheet><row r="1"><c r="XFD1"><v>1</v></c></row></worksheet>'))).toThrow(XlsxError);
});
it('bounds expanded shared-string references and individual cell text',()=>{
 const shared='<sst><si><t>'+'x'.repeat(10_001)+'</t></si></sst>';
 expect(()=>readWorkbook(book('<worksheet><row r="1"><c r="A1" t="s"><v>0</v></c></row></worksheet>',shared))).toThrow(XlsxError);
 const repeated=Array.from({length:501},(_,i)=>`<row r="${i+1}"><c r="A${i+1}" t="s"><v>0</v></c></row>`).join('');
 expect(()=>readWorkbook(book('<worksheet>'+repeated+'</worksheet>','<sst><si><t>'+'x'.repeat(9_000)+'</t></si></sst>'))).toThrow(XlsxError);
});
