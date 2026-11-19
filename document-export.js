/* NAVA local document export. All conversion runs in the user's browser. */
(() => {
"use strict";
const CDN="https://unpkg.com/docx@9/dist/index.iife.js";
let loading=null;
const cleanName=s=>String(s||"NAVA-document").replace(/[\\/:*?"<>|]/g,"-").replace(/\s+/g,"-").slice(0,70)||"NAVA-document";
const uniqueName=(base,ext)=>{const d=new Date(),stamp=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0"),"-",String(d.getHours()).padStart(2,"0"),String(d.getMinutes()).padStart(2,"0"),String(d.getSeconds()).padStart(2,"0"),"-",String(d.getMilliseconds()).padStart(3,"0")].join("");return cleanName(base)+"-"+stamp+"."+ext;};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const lines=s=>String(s||"").replace(/\r\n?/g,"\n").split("\n").map(x=>x.trimEnd());
const rtlPattern=/[\u0590-\u08FF]/;
const latinPattern=/[A-Za-z]/;
function directionOf(value){
 const firstRtl=value.search(rtlPattern),firstLatin=value.search(latinPattern);
 if(firstRtl<0&&firstLatin<0)return "rtl";
 if(firstRtl<0)return "ltr";
 if(firstLatin<0)return "rtl";
 return firstRtl<firstLatin?"rtl":"ltr";
}
function inlineHtml(value){return esc(value).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");}
function htmlBody(text){
 let out="",list=null,listDirection="";
 const close=()=>{if(list)out+="</"+list+">";list=null;listDirection="";};
 for(const raw of lines(text)){
  const x=raw.trim();if(!x){close();continue;}
  const h=x.match(/^(#{1,3})\s+(.+)$/),b=x.match(/^[-*•]\s+(.+)$/),n=x.match(/^(\d+)[.)]\s+(.+)$/);
  const value=(h?h[2]:b?b[1]:n?n[2]:x),dir=directionOf(value);
  if(h){
   close();const tag="h"+h[1].length;
   out+="<"+tag+' dir="'+dir+'" style="direction:'+dir+';text-align:'+(dir==="rtl"?"right":"left")+'">'+inlineHtml(value)+"</"+tag+">";
  }else if(b||n){
   const tag=n?"ol":"ul";
   if(list!==tag||listDirection!==dir){
    close();list=tag;listDirection=dir;
    out+="<"+tag+' dir="'+dir+'" style="direction:'+dir+';text-align:'+(dir==="rtl"?"right":"left")+'">';
   }
   out+='<li dir="'+dir+'">'+inlineHtml(value)+"</li>";
  }else{
   close();
   out+='<p dir="'+dir+'" style="direction:'+dir+';text-align:'+(dir==="rtl"?"right":"left")+'">'+inlineHtml(x)+"</p>";
  }
 }
 close();return out;
}
function download(blob,name){
 const u=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=u;a.download=name;a.hidden=true;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(u),30000);
}
function loadDocx(){
 if(window.docx)return Promise.resolve(window.docx);
 if(loading)return loading;
 loading=new Promise((resolve,reject)=>{
  const s=document.createElement("script");s.src=CDN;s.async=true;
  s.onload=()=>window.docx?resolve(window.docx):reject(new Error("کتابخانه ساخت Word بارگذاری نشد."));
  s.onerror=()=>reject(new Error("ابزار رایگان Word بارگذاری نشد؛ اتصال اینترنت را بررسی کن."));
  document.head.appendChild(s);
 }).catch(e=>{loading=null;throw e;});
 return loading;
}
function cleanInline(value){return String(value||"").replace(/\*\*(.+?)\*\*/g,"$1");}
function makeTextRuns(value,rtl,docx,size,boldDefault){
 const parts=String(value||"").split(/(\*\*.+?\*\*)/g).filter(Boolean);
 return parts.map(part=>{
  const bold=part.startsWith("**")&&part.endsWith("**")&&part.length>4;
  return new docx.TextRun({text:bold?part.slice(2,-2):cleanInline(part),bold:boldDefault||bold,rightToLeft:rtl,font:"Arial",size});
 });
}
async function word(text,name,button,status){
 button.disabled=true;const label=button.textContent;button.textContent="در حال ساخت Word...";
 try{
  const d=await loadDocx();
  const {Document,Paragraph,Packer,HeadingLevel,AlignmentType}=d,children=[];
  for(const raw of lines(text)){
   const x=raw.trim();
   if(!x){children.push(new Paragraph({text:"",bidirectional:true,alignment:AlignmentType.RIGHT,spacing:{after:100}}));continue;}
   const h=x.match(/^(#{1,3})\s+(.+)$/),b=x.match(/^[-*•]\s+(.+)$/),n=x.match(/^(\d+)[.)]\s+(.+)$/);
   const value=h?h[2]:b?b[1]:n?n[2]:x;
   const rtl=directionOf(value)==="rtl",prefix=b?"• ":n?n[1]+". ":"",size=h?30:24;
   const opts={
    bidirectional:rtl,alignment:rtl?AlignmentType.RIGHT:AlignmentType.LEFT,
    spacing:{after:h?180:100,line:360},
    children:[...(prefix?[new d.TextRun({text:prefix,rightToLeft:rtl,font:"Arial",size})]:[]),...makeTextRuns(value,rtl,d,size,!!h)]
   };
   if(h)opts.heading=h[1].length===1?HeadingLevel.HEADING_1:h[1].length===2?HeadingLevel.HEADING_2:HeadingLevel.HEADING_3;
   children.push(new Paragraph(opts));
  }
  const doc=new Document({creator:"NAVA",title:cleanName(name.replace(/\.docx$/i,"")),description:"سند ساخته‌شده در استودیوی نوا",sections:[{properties:{page:{margin:{top:1134,right:1134,bottom:1134,left:1134}}},children}]});
  download(await Packer.toBlob(doc),name);status.textContent="فایل Word ساخته شد و دانلود آن آغاز شد.";
 }catch(e){status.textContent=e.message||"ساخت فایل Word ناموفق بود.";}
 finally{button.disabled=false;button.textContent=label;}
}
function pdf(text,name,status){
 const w=window.open("","_blank");
 if(!w){status.textContent="پنجره چاپ مسدود شد؛ اجازه بازشدن پنجره برای سایت را فعال کن.";return;}
 const html='<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>'+esc(name.replace(/\.pdf$/i,""))+'</title><style>@page{size:A4;margin:20mm}body{font-family:Tahoma,Arial,sans-serif;color:#202633;font-size:12pt;line-height:2;margin:0}h1{font-size:21pt;color:#17375e;border-bottom:2px solid #c89a4b;padding-bottom:9pt}h2{font-size:16pt;color:#244d75;margin-top:18pt}h3{font-size:13pt;color:#76541f;margin-top:14pt}p{margin:0 0 9pt;white-space:pre-wrap}ul,ol{padding-right:24pt;padding-left:24pt}li{margin-bottom:5pt}@media screen{body{max-width:850px;margin:35px auto;padding:35px 48px;box-shadow:0 2px 24px #0002;background:#fff}}</style></head><body>'+htmlBody(text)+'<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),350));<\/script></body></html>';
 w.document.open();w.document.write(html);w.document.close();
 status.textContent="پنجره چاپ باز شد؛ در مقصد چاپ، گزینه «ذخیره به‌صورت PDF» را انتخاب کن.";
}

function loadExternal(src,globalName){
 if(window[globalName])return Promise.resolve(window[globalName]);
 if(window["__navaOfficeLib_"+globalName])return window["__navaOfficeLib_"+globalName];
 window["__navaOfficeLib_"+globalName]=new Promise((resolve,reject)=>{
  const script=document.createElement("script");script.src=src;script.async=true;
  script.onload=()=>window[globalName]?resolve(window[globalName]):reject(new Error("کتابخانه ساخت فایل بارگذاری نشد."));
  script.onerror=()=>reject(new Error("دریافت ابزار ساخت فایل ناموفق بود؛ اتصال اینترنت را بررسی کن."));
  document.head.appendChild(script);
 }).catch(error=>{delete window["__navaOfficeLib_"+globalName];throw error;});
 return window["__navaOfficeLib_"+globalName];
}
function splitMarkdownRow(line){
 const raw=line.trim().replace(/^\|/,"").replace(/\|$/,"");
 const cells=[];let value="",escaped=false;
 for(let i=0;i<raw.length;i++){
  const ch=raw[i];
  if(ch==="\\"&&!escaped){escaped=true;continue;}
  if(ch==="|"&&!escaped){cells.push(value.trim());value="";continue;}
  value+=ch;escaped=false;
 }
 cells.push(value.trim());return cells;
}
function isTableRule(row){return row.length>0&&row.every(cell=>/^:?-{3,}:?$/.test(cell.replace(/\s/g,"")));}
function workbookSections(text){
 const report=[["بخش","محتوا"]],tables=[];
 let heading="گزارش",table=null;
 const flushTable=()=>{if(table&&table.rows.length)tables.push(table);table=null;};
 for(const raw of lines(text)){
  const x=raw.trim();if(!x)continue;
  const h=x.match(/^#{1,3}\s+(.+)$/);
  if(h){flushTable();heading=h[1].slice(0,80);report.push([heading,""]);continue;}
  if(x.startsWith("|")&&x.endsWith("|")){
   const cells=splitMarkdownRow(x);
   if(isTableRule(cells))continue;
   if(!table)table={name:heading,rows:[]};
   table.rows.push(cells);continue;
  }
  flushTable();
  const value=x.replace(/^[-*•]\s+/,"").replace(/^\d+[.)]\s+/,"");
  report.push([heading,value]);
 }
 flushTable();
 if(report.length===1&&!tables.length){
  lines(text).map(x=>x.trim()).filter(Boolean).forEach((x,i)=>report.push([i+1,x.replace(/^#{1,3}\s+|^[-*•]\s+|^\d+[.)]\s+/,"")]));
 }
 return {report,tables};
}
function excelCell(value){
 const original=String(value??"").trim();
 if(!original)return {t:"s",v:""};
 // Accept only common local formulas; external references and arbitrary expressions remain text.
 if(/^=(?:SUM|AVERAGE|MIN|MAX|COUNT|COUNTA|ROUND|IF)\([A-Z0-9_$:,. +*/()-]+\)$/i.test(original)||
    /^=[A-Z]{1,3}\d+(?:\s*[+*/-]\s*(?:[A-Z]{1,3}\d+|\d+(?:\.\d+)?))+$/.test(original)){
  return {f:original.slice(1)};
 }
 const normalized=original.replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[٬،]/g,",").replace(/٫/g,".");
 const numeric=normalized.replace(/,/g,"");
 if(/^-?(?:\d+\.?\d*|\.\d+)%$/.test(numeric))return {t:"n",v:Number(numeric.slice(0,-1))/100,z:"0.00%"};
 if(/^-?(?:\d+\.?\d*|\.\d+)$/.test(numeric))return {t:"n",v:Number(numeric)};
 return {t:"s",v:original};
}
function sheetFromRows(XLSX,rows){
 const sheet={};
 rows.forEach((row,r)=>row.forEach((value,c)=>{
  const cell=excelCell(value);
  sheet[XLSX.utils.encode_cell({r,c})]=cell.f?{t:"n",f:cell.f}:cell;
 }));
 const width=Math.max(1,...rows.map(row=>row.length)),height=Math.max(1,rows.length);
 sheet["!ref"]=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:height-1,c:width-1}});
 sheet["!cols"]=Array.from({length:width},(_,col)=>({wch:Math.min(42,Math.max(12,...rows.map(row=>String(row[col]??"").length+2)))}));
 if(rows.length>1)sheet["!autofilter"]={ref:sheet["!ref"]};
 return sheet;
}
function appendSheet(XLSX,book,rows,requestedName,index){
 let name=String(requestedName||"Sheet "+(index+1)).replace(/[\\/?*\[\]:]/g," ").trim().slice(0,31)||"Sheet "+(index+1);
 const base=name;let suffix=2;
 while(book.SheetNames.includes(name))name=(base.slice(0,27)+" "+suffix++);
 XLSX.utils.book_append_sheet(book,sheetFromRows(XLSX,rows),name);
}
async function excel(text,name,button,status){
 button.disabled=true;const label=button.textContent;button.textContent="در حال ساخت Excel...";
 try{
  const XLSX=await loadExternal("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js","XLSX");
  const book=XLSX.utils.book_new(),parsed=workbookSections(text);
  appendSheet(XLSX,book,parsed.report,"گزارش",0);
  parsed.tables.slice(0,30).forEach((table,index)=>appendSheet(XLSX,book,table.rows,table.name+" "+(index+1),index+1));
  book.Workbook=book.Workbook||{};
  book.Workbook.CalcPr={calcMode:"auto",fullCalcOnLoad:true,forceFullCalc:true};
  XLSX.writeFile(book,name,{compression:true});
  status.textContent="فایل Excel ساخته شد؛ جدول‌ها در شیت‌های جدا، متن توضیحی در شیت گزارش و مقادیر عددی به‌صورت عدد قابل محاسبه ذخیره شدند. فرمول‌های ساده و امن نیز هنگام بازشدن در Excel محاسبه می‌شوند.";
 }catch(error){status.textContent=error.message||"ساخت فایل Excel ناموفق بود.";}
 finally{button.disabled=false;button.textContent=label;}
}
function splitLongText(value,max=210){
 const text=String(value||"").trim();if(text.length<=max)return [text];
 const parts=[];let remaining=text;
 while(remaining.length>max){
  let cut=Math.max(remaining.lastIndexOf("。",max),remaining.lastIndexOf("؟",max),remaining.lastIndexOf(".",max),remaining.lastIndexOf("،",max),remaining.lastIndexOf(" ",max));
  if(cut<Math.floor(max*.55))cut=max;
  parts.push(remaining.slice(0,cut+1).trim());remaining=remaining.slice(cut+1).trim();
 }
 if(remaining)parts.push(remaining);return parts;
}
function splitPresentation(text){
 const slides=[];let title="خلاصه",items=[],used=0;
 const push=()=>{if(items.length){slides.push({title,items});items=[];used=0;}};
 const add=item=>{
  for(const piece of splitLongText(item.text)){
   const cost=Math.max(1,Math.ceil(piece.length/95));
   if(items.length>=4||used+cost>4)push();
   items.push({text:piece,bullet:item.bullet});used+=cost;
  }
 };
 for(const raw of lines(text)){
  const x=raw.trim();if(!x)continue;
  const h=x.match(/^#{1,3}\s+(.+)$/);
  if(h){push();title=h[1];continue;}
  const bullet=x.match(/^[-*•]\s+(.+)$/),number=x.match(/^\d+[.)]\s+(.+)$/);
  add({text:bullet?bullet[1]:number?number[1]:x,bullet:!!(bullet||number)});
 }
 push();
 return slides.length?slides:[{title:"ارائه NAVI",items:[{text:"محتوایی برای ارائه ثبت نشده است.",bullet:false}]}];
}
async function powerpoint(text,name,button,status){
 button.disabled=true;const label=button.textContent;button.textContent="در حال ساخت PowerPoint...";
 try{
  const PptxGenJS=await loadExternal("https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js","PptxGenJS");
  const pptx=new PptxGenJS();pptx.layout="LAYOUT_WIDE";pptx.author="NAVA";pptx.subject="ارائه ساخته‌شده با NAVI";pptx.title="NAVA Presentation";
  pptx.theme={headFontFace:"Arial",bodyFontFace:"Arial",lang:"fa-IR"};
  const navy="101B2B",gold="D5AD65",white="F7F8FA",muted="B8C1CE";
  const addFooter=(slide,index)=>{slide.addShape(pptx.ShapeType.line,{x:.55,y:7.08,w:12.2,h:0,line:{color:"34445A",width:1}});slide.addText("NAVA  |  "+String(index).padStart(2,"0"),{x:.6,y:7.12,w:12,h:.2,fontFace:"Arial",fontSize:8,color:muted,align:"left",margin:0});};
  const cover=pptx.addSlide();cover.background={color:navy};cover.addShape(pptx.ShapeType.rect,{x:0,y:0,w:.18,h:7.5,fill:{color:gold},line:{color:gold}});
  cover.addText("NAVA",{x:.8,y:1.25,w:11.5,h:.55,fontFace:"Arial",fontSize:20,bold:true,color:gold,charSpacing:3,margin:0});
  cover.addText("ارائه تهیه‌شده با NAVI",{x:.8,y:2.1,w:11.5,h:1.15,fontFace:"Arial",fontSize:30,bold:true,color:white,rtlMode:true,align:"right",margin:0});
  cover.addText("محتوای ساختاریافته و قابل ویرایش",{x:.8,y:3.45,w:11.5,h:.5,fontFace:"Arial",fontSize:16,color:muted,rtlMode:true,align:"right",margin:0});addFooter(cover,1);
  splitPresentation(text).forEach((data,index)=>{
   const slide=pptx.addSlide();slide.background={color:navy};
   slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:.12,fill:{color:gold},line:{color:gold}});
   slide.addText(data.title,{x:.65,y:.48,w:12,h:.65,fontFace:"Arial",fontSize:24,bold:true,color:gold,rtlMode:true,align:"right",margin:0.03,fit:"shrink"});
   let y=1.45;
   data.items.forEach(item=>{
    const height=Math.min(.9,Math.max(.42,Math.ceil(item.text.length/95)*.23+.15));
    slide.addText((item.bullet?"•  ":"")+item.text,{x:.85,y,w:11.7,h:height,fontFace:"Arial",fontSize:17,color:white,rtlMode:true,align:"right",valign:"mid",margin:.08,fit:"shrink"});
    y+=height+.12;
   });
   addFooter(slide,index+2);
  });
  await pptx.writeFile({fileName:name});
  status.textContent="فایل PowerPoint ساخته شد؛ متن‌های بلند به چند بخش تقسیم شدند تا محتوایی از اسلایدها حذف نشود.";
 }catch(error){status.textContent=error.message||"ساخت فایل PowerPoint ناموفق بود.";}
 finally{button.disabled=false;button.textContent=label;}
}
function attach(target,service){
 if(!target||!["مقاله و وبلاگ","کارهای اداری و آفیس"].includes(service))return;
 const parent=target.parentElement;if(!parent)return;
 parent.querySelector("[data-nava-export-actions]")?.remove();
 const box=document.createElement("div");box.dataset.navaExportActions="true";box.className="nava-export-actions";
 const wb=document.createElement("button");wb.type="button";wb.className="btn-primary";wb.textContent="دریافت فایل Word";
 const pb=document.createElement("button");pb.type="button";pb.className="btn-secondary";pb.textContent="دریافت PDF";
 const note=document.createElement("p");note.className="nava-export-status";note.setAttribute("role","status");note.setAttribute("aria-live","polite");
 const getText=()=>typeof target.value==="string"?target.value:String(target.textContent||"");
 wb.addEventListener("click",()=>word(getText(),uniqueName(service==="مقاله و وبلاگ"?"NAVA-article":"NAVA-office-document","docx"),wb,note));
 pb.addEventListener("click",()=>pdf(getText(),uniqueName(service==="مقاله و وبلاگ"?"NAVA-article":"NAVA-office-document","pdf"),note));
 if(service==="کارهای اداری و آفیس"){
  const xb=document.createElement("button");xb.type="button";xb.className="btn-secondary";xb.textContent="ساخت فایل Excel";
  const sb=document.createElement("button");sb.type="button";sb.className="btn-secondary";sb.textContent="ساخت PowerPoint";
  xb.addEventListener("click",()=>excel(getText(),uniqueName("NAVA-office-data","xlsx"),xb,note));
  sb.addEventListener("click",()=>powerpoint(getText(),uniqueName("NAVA-office-presentation","pptx"),sb,note));
  box.append(wb,pb,xb,sb,note);
 }else box.append(wb,pb,note);
 target.insertAdjacentElement("afterend",box);
}
window.NavaDocumentExport=Object.freeze({attach});
})();
