/* NAVA Office local editor: original files are never overwritten. */
(() => {
 "use strict";
 const input=document.getElementById("officeSourceFile"),panel=document.getElementById("officeEditPanel"),status=document.getElementById("officeEditStatus");
 if(!input||!panel||!status)return;
 const $=id=>document.getElementById(id);
 let sourceFile=null,workbook=null,currentSheet="",zip=null,kind="",editorReadyPromise=Promise.resolve();
 const setStatus=(message,error=false)=>{status.textContent=message;status.dataset.state=error?"error":"success";};
 const libraryLoads=Object.create(null);
 const load=(src,name)=>{
  if(window[name])return Promise.resolve(window[name]);
  if(libraryLoads[name])return libraryLoads[name];
  libraryLoads[name]=new Promise((resolve,reject)=>{
   const existing=Array.from(document.scripts).find(script=>script.src===src);
   const script=existing||document.createElement("script");
   script.addEventListener("load",()=>window[name]?resolve(window[name]):reject(new Error("ابزار ویرایش بارگذاری نشد.")),{once:true});
   script.addEventListener("error",()=>reject(new Error("دریافت ابزار ویرایش ناموفق بود.")),{once:true});
   if(!existing){script.src=src;script.async=true;document.head.appendChild(script);}
  }).catch(error=>{delete libraryLoads[name];throw error;});
  return libraryLoads[name];
 };
 const safeName=name=>String(name||"NAVA-edited").replace(/[\\/:*?"<>|]/g,"-").replace(/\.[^.]+$/,"").slice(0,65)||"NAVA-edited";
 function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.hidden=true;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 function show(){panel.hidden=false;}
 function hide(){panel.hidden=true;sourceFile=null;workbook=null;zip=null;kind="";input.value="";}
 function renderExcel(){
  const select=$("officeEditSheet");
  select.replaceChildren(...workbook.SheetNames.map(name=>{const o=document.createElement("option");o.value=name;o.textContent=name;return o;}));
  currentSheet=workbook.SheetNames[0];select.value=currentSheet;drawGrid();
 }
 function drawGrid(){
  const XLSX=window.XLSX,sheet=workbook.Sheets[currentSheet],grid=$("officeEditGrid");
  grid.replaceChildren();
  const range=XLSX.utils.decode_range(sheet["!ref"]||"A1:A1");
  const startRow=range.s.r,endRow=Math.min(range.e.r,startRow+39),startCol=range.s.c,endCol=Math.min(range.e.c,startCol+11);
  const table=document.createElement("table");table.className="office-edit-table";
  const head=document.createElement("tr"),corner=document.createElement("th");corner.textContent="سلول";head.append(corner);
  for(let c=startCol;c<=endCol;c++){const th=document.createElement("th");th.textContent=XLSX.utils.encode_col(c);head.append(th);}table.append(head);
  for(let r=startRow;r<=endRow;r++){
   const tr=document.createElement("tr"),th=document.createElement("th");th.textContent=String(r+1);tr.append(th);
   for(let c=startCol;c<=endCol;c++){
    const td=document.createElement("td"),address=XLSX.utils.encode_cell({r,c}),cell=sheet[address],field=document.createElement("input");
    field.type="text";field.value=cell?(cell.f?"="+cell.f:String(cell.w??cell.v??"")):"";
    field.setAttribute("aria-label","ویرایش سلول "+address);
    field.addEventListener("change",()=>{
     const value=field.value.trim();
     const previous=sheet[address]||{};
     if(value.startsWith("=")&&/^=(?:SUM|AVERAGE|MIN|MAX|COUNT|COUNTA|ROUND|IF)\([A-Z0-9_$:,. +*/()-]+\)$/i.test(value)){
      sheet[address]={...previous,t:"n",f:value.slice(1)};delete sheet[address].v;delete sheet[address].w;
     }
     else if(value.startsWith("=")){const current=sheet[address];setStatus("این نسخه فقط فرمول‌های رایج و محدود را می‌پذیرد. مقدار سلول تغییر نکرد.",true);field.value=current?(current.f?"="+current.f:String(current.w??current.v??"")):"";return;}
     else{
      const n=value.replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[٬،]/g,"").replace(/٫/g,".");
      sheet[address]=value!==""&&/^-?(?:\d+\.?\d*|\.\d+)$/.test(n)?{...previous,t:"n",v:Number(n)}:{...previous,t:"s",v:value};
      delete sheet[address].f;delete sheet[address].w;
     }
     setStatus("تغییر سلول "+address+" ثبت شد؛ برای دریافت نسخه جدید، «ذخیره نسخه ویرایش‌شده» را بزن.");
    });
    td.append(field);tr.append(td);
   }
   table.append(tr);
  }
  grid.append(table);
  const limited=range.e.r-startRow+1>40||range.e.c-startCol+1>12;
  $("officeEditGridNote").textContent="نمایش حداکثر ۴۰ ردیف و ۱۲ ستون نخست؛ سایر سلول‌ها و شیت‌ها در فایل خروجی حفظ می‌شوند."+(limited?" محدوده بزرگ‌تر است.":"");
 }
 async function openFile(file){
  sourceFile=file;workbook=null;zip=null;kind="";
  const ext=file.name.split(".").pop().toLowerCase();
  if(!["xlsx","pptx","docx"].includes(ext)){sourceFile=null;workbook=null;zip=null;kind="";panel.hidden=true;return;}
  show();$("officeEditExcel").hidden=ext!=="xlsx";$("officeEditReplace").hidden=ext==="xlsx";
  $("officeEditReplaceLabel").textContent=ext==="pptx"?"جست‌وجو و جایگزینی متن در اسلایدها":"جست‌وجو و جایگزینی متن در سند Word";
  try{
   if(ext==="xlsx"){
    await load("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js","XLSX");
    const nextWorkbook=window.XLSX.read(await file.arrayBuffer(),{type:"array",cellFormula:true,cellStyles:true,bookVBA:false});
    if(input.files?.[0]!==file)return;
    kind="xlsx";workbook=nextWorkbook;
    renderExcel();setStatus("فایل Excel برای ویرایش محلی آماده است. مقدار سلول‌ها را تغییر بده و نسخه جدید را ذخیره کن.");
   }else{
    await load("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js","JSZip");
    const nextZip=await window.JSZip.loadAsync(file);
    if(input.files?.[0]!==file)return;
    kind=ext;zip=nextZip;
    setStatus("فایل برای جست‌وجو و جایگزینی متن آماده است. بسته و چیدمان کلی حفظ می‌شود؛ فقط متن‌های منطبق در قطعه‌های متنی مستقل تغییر می‌کنند.");
   }
  }catch(error){if(input.files?.[0]===file){hide();setStatus(error.message||"آماده‌سازی ویرایشگر ناموفق بود.",true);}throw error;}
 }
 $("officeEditSave")?.addEventListener("click",()=>{
  if(kind!=="xlsx"||!workbook)return;
  try{
   workbook.Workbook=workbook.Workbook||{};workbook.Workbook.CalcPr={calcMode:"auto",fullCalcOnLoad:true,forceFullCalc:true};
   const bytes=window.XLSX.write(workbook,{bookType:"xlsx",type:"array",cellStyles:true,compression:true});
   download(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),safeName(sourceFile.name)+"-edited.xlsx");
   setStatus("نسخه ویرایش‌شده Excel دانلود شد. فایل اصلی تغییر نکرد.");
  }catch(error){setStatus(error.message||"ذخیره فایل Excel ناموفق بود.",true);}
 });
 $("officeEditReplaceRun")?.addEventListener("click",async()=>{
  if(!zip||!sourceFile||!["pptx","docx"].includes(kind))return;
  const find=$("officeEditFind").value,replace=$("officeEditReplaceValue").value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  if(!find){setStatus("عبارت موردنظر برای جست‌وجو را وارد کن.",true);return;}
  try{
   let count=0;
   const files=Object.keys(zip.files).filter(name=>kind==="pptx"?/^ppt\/slides\/slide\d+\.xml$/.test(name):/^word\/(document|header\d+|footer\d+)\.xml$/.test(name));
   for(const name of files){
    const entry=zip.files[name];let xml=await entry.async("string");
    xml=xml.replace(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g,(whole,a,b)=>{
     const value=a??b??"",pieces=value.split(find);if(pieces.length<2)return whole;
     count+=pieces.length-1;
     const updated=pieces.join(replace);
     return whole.replace(value,updated);
    });
    zip.file(name,xml);
   }
   if(!count){setStatus("عبارت دقیق در قطعه‌های متنی مستقل پیدا نشد. اگر متن بین چند بخش شکسته شده باشد، این نسخه آن را تشخیص نمی‌دهد.",true);return;}
   const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE"});
   download(blob,safeName(sourceFile.name)+"-edited."+kind);
   setStatus(count+" جایگزینی انجام شد؛ نسخه جدید دانلود شد و فایل اصلی دست‌نخورده ماند.");
  }catch(error){setStatus(error.message||"ویرایش فایل ناموفق بود.",true);}
 });

 window.NavaOfficeTools = {
  async waitUntilReady(){
   await editorReadyPromise;
   const selected=input.files&&input.files[0];
   if(!selected)return {selected:false,ready:false};
   const ext=selected.name.split(".").pop().toLowerCase();
   if(!["xlsx","pptx","docx"].includes(ext))return {selected:true,ready:true,name:selected.name,kind:ext,editorRequired:false};
   const info=this.getActiveFileInfo();
   if(!info.ready||sourceFile!==selected){
    throw new Error("ویرایشگر فایل هنوز آماده نیست. چند لحظه صبر کن و دوباره تلاش کن.");
   }
   return {selected:true,ready:info.ready,name:info.name,kind:info.kind};
  },
  reset(){
   sourceFile=null;workbook=null;zip=null;kind="";editorReadyPromise=Promise.resolve();
   hide();
  },
  getActiveFileInfo(){
   const selected=input.files&&input.files[0];
   const ready=Boolean(sourceFile&&selected===sourceFile&&kind&&((kind==="xlsx"&&workbook)||(kind!=="xlsx"&&zip)));
   return {
    ready,
    name:sourceFile?.name||selected?.name||"",
    kind,
    sheetNames:ready&&kind==="xlsx"&&Array.isArray(workbook?.SheetNames)?[...workbook.SheetNames]:[]
   };
  },
  async executeAction(action) {
   const selected=input.files&&input.files[0];
   if(!sourceFile||selected!==sourceFile)throw new Error("فایل فعال تغییر کرده است؛ فایل را دوباره در ابزار آفیس بارگذاری کن.");
   if(action?.kind==="edit_cells"){
    if(kind!=="xlsx"||!workbook||!Array.isArray(action.edits)||action.edits.length<1||action.edits.length>20)throw new Error("این فایل یا عملیات Excel معتبر نیست.");
    const staged=[];
    for(const item of action.edits){
     if(!item||typeof item.sheet!=="string"||!workbook.SheetNames.includes(item.sheet)||typeof item.cell!=="string"||!/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(item.cell))throw new Error("نام شیت یا نشانی سلول معتبر نیست.");
     if(!(typeof item.value==="string"||typeof item.value==="number"||typeof item.value==="boolean")||(typeof item.value==="number"&&!Number.isFinite(item.value))||(typeof item.value==="string"&&(item.value.length>500||item.value.startsWith("="))))throw new Error("مقدار یکی از سلول‌ها مجاز نیست.");
     staged.push({sheet:item.sheet,cell:item.cell,value:item.value});
    }
    for(const item of staged){
     const sheet=workbook.Sheets[item.sheet],previous=sheet[item.cell]||{};
     sheet[item.cell]={...previous,t:typeof item.value==="number"?"n":typeof item.value==="boolean"?"b":"s",v:item.value};
     delete sheet[item.cell].f;delete sheet[item.cell].w;
    }
    workbook.Workbook=workbook.Workbook||{};workbook.Workbook.CalcPr={calcMode:"auto",fullCalcOnLoad:true,forceFullCalc:true};
    const bytes=window.XLSX.write(workbook,{bookType:"xlsx",type:"array",cellStyles:true,compression:true});
    download(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),safeName(sourceFile.name)+"-edited.xlsx");
    setStatus(staged.length+" سلول تغییر کرد؛ نسخه جدید دانلود شد و فایل اصلی دست‌نخورده ماند.");
    return {message:staged.length+" سلول تغییر کرد؛ نسخه جدید دانلود شد و فایل اصلی دست‌نخورده ماند."};
   }
   if(action?.kind==="append_row"){
    if(kind!=="xlsx"||!workbook||typeof action.sheet!=="string"||!workbook.SheetNames.includes(action.sheet)||!Array.isArray(action.values)||action.values.length<1||action.values.length>20)throw new Error("این فایل یا عملیات افزودن ردیف معتبر نیست.");
    const values=action.values;
    if(values.some(value=>!(typeof value==="string"||typeof value==="number"||typeof value==="boolean")||(typeof value==="number"&&!Number.isFinite(value))||(typeof value==="string"&&(value.length>500||value.startsWith("=")))))throw new Error("یکی از مقادیر ردیف مجاز نیست.");
    const sheet=workbook.Sheets[action.sheet];
    const XLSX=window.XLSX;
    const range=XLSX.utils.decode_range(sheet["!ref"]||"A1:A1");
    const width=range.e.c-range.s.c+1;
    if(values.length!==width)throw new Error("تعداد مقادیر پیشنهادی ("+values.length+") با تعداد ستون‌های جدول ("+width+") برابر نیست. مقادیر ردیف را کامل و دوباره ارسال کن.");
    if(range.e.r>=1048575)throw new Error("امکان افزودن ردیف بیشتر به این شیت وجود ندارد.");
    const newRow=range.e.r+1;
    values.forEach((value,index)=>{
     const address=XLSX.utils.encode_cell({r:newRow,c:range.s.c+index});
     const previous=sheet[XLSX.utils.encode_cell({r:range.e.r,c:range.s.c+index})]||{};
     sheet[address]={...(previous.s?{s:previous.s}:{}),t:typeof value==="number"?"n":typeof value==="boolean"?"b":"s",v:value};
    });
    sheet["!ref"]=XLSX.utils.encode_range({s:{r:range.s.r,c:range.s.c},e:{r:newRow,c:range.e.c}});
    workbook.Workbook=workbook.Workbook||{};workbook.Workbook.CalcPr={calcMode:"auto",fullCalcOnLoad:true,forceFullCalc:true};
    const bytes=XLSX.write(workbook,{bookType:"xlsx",type:"array",cellStyles:true,compression:true});
    download(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),safeName(sourceFile.name)+"-edited.xlsx");
    setStatus("یک ردیف به انتهای شیت «"+action.sheet+"» اضافه شد؛ نسخه جدید دانلود شد و فایل اصلی دست‌نخورده ماند.");
    return {message:"یک ردیف به انتهای شیت «"+action.sheet+"» اضافه شد؛ نسخه جدید دانلود شد و فایل اصلی دست‌نخورده ماند."};
   }
   if(action?.kind==="replace_text"){
    if(!["docx","pptx"].includes(kind)||!zip||typeof action.find!=="string"||!action.find.trim()||action.find.length>500||typeof action.replace!=="string"||action.replace.length>500)throw new Error("این فایل یا عملیات جایگزینی معتبر نیست.");
    const xmlEscape=value=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const find=xmlEscape(action.find),replace=xmlEscape(action.replace);
    let count=0;
    const names=Object.keys(zip.files).filter(name=>kind==="pptx"?/^ppt\/slides\/slide\d+\.xml$/.test(name):/^word\/(document|header\d+|footer\d+)\.xml$/.test(name));
    for(const name of names){
     const entry=zip.files[name];let xml=await entry.async("string");
     xml=xml.replace(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g,(whole,a,b)=>{
      const value=a??b??"",pieces=value.split(find);if(pieces.length<2)return whole;
      count+=pieces.length-1;return whole.replace(value,pieces.join(replace));
     });
     zip.file(name,xml);
    }
    if(!count)throw new Error("عبارت دقیق در قطعه‌های متنی مستقل پیدا نشد؛ فایل تغییری نکرد.");
    const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE"});
    download(blob,safeName(sourceFile.name)+"-edited."+kind);
    setStatus(count+" جایگزینی انجام شد؛ نسخه جدید دانلود شد و فایل اصلی دست‌نخورده ماند.");
    return {message:count+" جایگزینی انجام شد؛ نسخه جدید دانلود شد و فایل اصلی دست‌نخورده ماند."};
   }
   throw new Error("نوع عملیات NAVI پشتیبانی نمی‌شود.");
  }
 };
 input.addEventListener("change",()=>{const file=input.files&&input.files[0];if(file){editorReadyPromise=openFile(file);}else{editorReadyPromise=Promise.resolve();}});
 $("officeEditSheet")?.addEventListener("change",event=>{currentSheet=event.target.value;drawGrid();});
 $("officeEditClose")?.addEventListener("click",hide);
})();