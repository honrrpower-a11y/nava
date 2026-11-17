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
 box.append(wb,pb,note);target.insertAdjacentElement("afterend",box);
}
window.NavaDocumentExport=Object.freeze({attach});
})();