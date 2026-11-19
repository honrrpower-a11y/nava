/* NAVA Office local editor: original files are never overwritten. */
(() => {
 "use strict";
 const input=document.getElementById("officeSourceFile"),panel=document.getElementById("officeEditPanel"),status=document.getElementById("officeEditStatus");
 if(!input||!panel||!status)return;
 const $=id=>document.getElementById(id);
 let sourceFile=null,workbook=null,currentSheet="",zip=null,kind="",editorReadyPromise=Promise.resolve();
 let pendingDownloadBlob=null,contextSyncPromise=Promise.resolve();
 const downloadButton=$("officeEditSave");
 function setDownloadReady(ready){if(downloadButton){downloadButton.disabled=!ready;downloadButton.textContent=kind==="xlsx"?"دانلود فایل ویرایش‌شده Excel":"دانلود فایل ویرایش‌شده";}}
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
 const decodeXmlText=value=>String(value||"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
 const escapeXmlText=value=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
 const officeMimeTypes={
  pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"
 };
 async function generateEditedBlob(){
  if(!zip)throw new Error("بسته فایل برای ساخت خروجی در دسترس نیست.");
  return zip.generateAsync({type:"blob",compression:"DEFLATE",mimeType:officeMimeTypes[kind]||"application/zip"});
 }
 function replaceTextAcrossRuns(xml,find,replace,prefix){
  const paragraphPattern=new RegExp("<("+prefix+":p)(?:\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>","g");
  let count=0;
  const updated=xml.replace(paragraphPattern,(paragraph,tag,body)=>{
   const runPattern=new RegExp("<("+prefix+":t)(?:\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>","g");
   const runs=Array.from(body.matchAll(runPattern));
   if(!runs.length)return paragraph;
   const combined=runs.map(run=>decodeXmlText(run[2])).join("");
   if(!combined.includes(find))return paragraph;
   const pieces=combined.split(find);
   count+=pieces.length-1;
   const nextText=pieces.join(replace);
   let first=true;
   const nextBody=body.replace(runPattern,run=>{
    if(first){first=false;return run.replace(/>([\s\S]*?)<\//,">"+escapeXmlText(nextText)+"</");}
    return run.replace(/>([\s\S]*?)<\//,"></");
   });
   return paragraph.replace(body,nextBody);
  });
  return {xml:updated,count};
 }

async function syncActiveFileContext(){
  if(!sourceFile||!kind)throw new Error("فایل فعال برای همگام‌سازی پیدا نشد.");
  const fileApi=window.NavaOfficeFile;
  if(!fileApi?.updateExtractedContent)throw new Error("ابزار به‌روزرسانی محتوای مرجع فایل آماده نیست.");
  fileApi.markContextOutOfSync?.();
  let extracted="";
  if(kind==="xlsx"){
   if(!workbook||!window.XLSX||!window.NavaOfficeStructured?.read)throw new Error("ابزار استخراج نسخه جدید Excel آماده نیست.");
   const bytes=window.XLSX.write(workbook,{bookType:"xlsx",type:"array",cellStyles:true,compression:true});
   const file=new File([bytes],sourceFile.name,{type:sourceFile.type||"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
   extracted=await window.NavaOfficeStructured.read(file);
  }else if(kind==="pptx"){
   if(!zip||!window.NavaOfficeStructured?.read)throw new Error("ابزار استخراج نسخه جدید PowerPoint آماده نیست.");
   if(typeof window.NavaOfficeStructured.readPowerPointArchive!=="function")throw new Error("ابزار استخراج مستقیم PowerPoint آماده نیست.");
   // Reuse the already-open JSZip archive. Re-wrapping the generated Blob in a
   // File and parsing it again invokes FileReader on some mobile browsers.
   extracted=await window.NavaOfficeStructured.readPowerPointArchive(zip);
  }else if(kind==="docx"){
   if(!zip)throw new Error("نسخه کاری Word در دسترس نیست.");
   const names=Object.keys(zip.files).filter(name=>/^word\/(document|header\d+|footer\d+)\.xml$/.test(name)).sort();
   const sections=[];
   for(const name of names){
    const xml=await zip.files[name].async("string");
    const doc=new DOMParser().parseFromString(xml,"application/xml");
    if(doc.querySelector("parsererror"))continue;
    const value=Array.from(doc.getElementsByTagName("*")).filter(node=>node.localName==="t").map(node=>node.textContent||"").join(" ").replace(/\s+/g," ").trim();
    if(value)sections.push((name.includes("/document.xml")?"متن اصلی سند":name.includes("/header")?"سربرگ":"پاورقی")+": "+value);
   }
   extracted=["نوع فایل: Word",...sections].join("\n");
   if(!sections.length)throw new Error("متن نسخه ویرایش‌شده Word برای همگام‌سازی پیدا نشد.");
  }else throw new Error("همگام‌سازی این نوع فایل پشتیبانی نمی‌شود.");
  if(!fileApi.updateExtractedContent(extracted))throw new Error("متن استخراج‌شده با فایل فعال تطبیق نداشت؛ برای جلوگیری از ارسال اطلاعات قدیمی، درخواست بعدی متوقف شد.");
  return true;
 }
 function queueContextSync(){
  contextSyncPromise=contextSyncPromise.catch(()=>{}).then(async()=>{const result=await syncActiveFileContext();await window.NavaOfficePreview?.refreshFromEditor?.();return result;});
  contextSyncPromise.catch(error=>setStatus("تغییر در ویرایشگر ثبت شد، اما همگام‌سازی محتوای مرجع ناموفق بود: "+(error.message||"خطای نامشخص")+". تا رفع مشکل درخواست بعدی اجرا نمی‌شود.",true));
  return contextSyncPromise;
 }
 function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.hidden=true;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 function show(){panel.hidden=false;}
 function hide(){panel.hidden=true;sourceFile=null;workbook=null;zip=null;kind="";pendingDownloadBlob=null;setDownloadReady(false);input.value="";}
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
     pendingDownloadBlob=null;setDownloadReady(true);
     setStatus("تغییر سلول "+address+" در ویرایشگر ثبت شد. در حال به‌روزرسانی محتوای مرجع برای درخواست بعدی...");
     contextSyncPromise=queueContextSync();
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
  sourceFile=file;workbook=null;zip=null;kind="";pendingDownloadBlob=null;contextSyncPromise=Promise.resolve();setDownloadReady(false);
  const ext=file.name.split(".").pop().toLowerCase();
  if(!["xlsx","pptx","docx"].includes(ext)){sourceFile=null;workbook=null;zip=null;kind="";panel.hidden=true;return;}
  show();$("officeEditExcel").hidden=ext!=="xlsx";$("officeEditReplace").hidden=ext==="xlsx";
  $("officeEditReplaceLabel").textContent=ext==="pptx"?"جست‌وجو و جایگزینی متن در اسلایدها":"جست‌وجو و جایگزینی متن در سند Word";
  try{
   if(ext==="xlsx"){
    await load("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js","XLSX");
    const nextWorkbook=window.XLSX.read(await file.arrayBuffer(),{type:"array",cellFormula:true,cellStyles:true,bookVBA:false});
    if(input.files?.[0]!==file)return;
    kind="xlsx";workbook=nextWorkbook;setDownloadReady(false);
    renderExcel();setStatus("فایل Excel برای ویرایش محلی آماده است. پس از اعمال یا ویرایش تغییرات، آن‌ها را در جدول بررسی کن و سپس دکمه دانلود را بزن.");
   }else{
    await load("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js","JSZip");
    const nextZip=await window.JSZip.loadAsync(file);
    if(input.files?.[0]!==file)return;
    kind=ext;zip=nextZip;setDownloadReady(false);
    setStatus("فایل برای جست‌وجو و جایگزینی متن آماده است. متن حتی اگر بین چند قطعه نوشتاری شکسته شده باشد شناسایی و اصلاح می‌شود.");
   }
  }catch(error){if(input.files?.[0]===file){hide();setStatus(error.message||"آماده‌سازی ویرایشگر ناموفق بود.",true);}throw error;}
 }
 $("officeEditSave")?.addEventListener("click",async()=>{
  if(!sourceFile||!kind)return;
  try{
   let blob=pendingDownloadBlob;
   if(kind==="xlsx"&&workbook){
    workbook.Workbook=workbook.Workbook||{};workbook.Workbook.CalcPr={calcMode:"auto",fullCalcOnLoad:true,forceFullCalc:true};
    const bytes=window.XLSX.write(workbook,{bookType:"xlsx",type:"array",cellStyles:true,compression:true});
    blob=new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
   }
   if(kind!=="xlsx"&&pendingDownloadBlob){blob=await generateEditedBlob();pendingDownloadBlob=blob;}
   if(!blob)throw new Error("هنوز تغییری برای دانلود آماده نشده است.");
   download(blob,safeName(sourceFile.name)+"-edited."+kind);
   setStatus("فایل ویرایش‌شده دانلود شد. نسخه اصلی بدون تغییر باقی ماند.");
  }catch(error){setStatus(error.message||"ساخت فایل خروجی ناموفق بود.",true);}
 });
 $("officeEditReplaceRun")?.addEventListener("click",async()=>{
  if(!zip||!sourceFile||!["pptx","docx"].includes(kind))return;
  const find=$("officeEditFind").value,replace=$("officeEditReplaceValue").value;
  if(!find){setStatus("عبارت موردنظر برای جست‌وجو را وارد کن.",true);return;}
  try{
   let count=0;
   const files=Object.keys(zip.files).filter(name=>kind==="pptx"?/^ppt\/slides\/slide\d+\.xml$/.test(name):/^word\/(document|header\d+|footer\d+)\.xml$/.test(name));
   for(const name of files){
    const prefix=kind==="pptx"?"a":"w";
    const result=replaceTextAcrossRuns(await zip.files[name].async("string"),find,replace,prefix);
    count+=result.count;
    if(result.count)zip.file(name,result.xml);
   }
   if(!count){setStatus("عبارت دقیق در قطعه‌های متنی مستقل پیدا نشد. اگر متن بین چند بخش شکسته شده باشد، این نسخه آن را تشخیص نمی‌دهد.",true);return;}
   pendingDownloadBlob=await generateEditedBlob();
   setDownloadReady(true);
   await syncActiveFileContext();
   await window.NavaOfficePreview?.refreshFromEditor?.();
   setStatus(count+" جایگزینی آماده شد و پیش‌نمایش نیز به‌روز شد. برای دریافت نسخه ویرایش‌شده، دکمه دانلود را بزن.");
  }catch(error){setStatus(error.message||"ویرایش فایل ناموفق بود.",true);}
 });

 window.NavaOfficeTools = {
  async waitUntilReady(){
   await editorReadyPromise;
   await contextSyncPromise;
   const selected=input.files&&input.files[0];
   if(!selected)return {selected:false,ready:false};
   const ext=selected.name.split(".").pop().toLowerCase();
   if(!["xlsx","pptx","docx"].includes(ext))return {selected:true,ready:true,name:selected.name,kind:ext,editorRequired:false};
   const info=this.getActiveFileInfo();
   if(!info.ready||sourceFile!==selected){
    throw new Error("ویرایشگر فایل هنوز آماده نیست. چند لحظه صبر کن و دوباره تلاش کن.");
   }
   if(window.NavaOfficeFile?.getState?.().contextSynced===false){
    throw new Error("محتوای مرجع هنوز با آخرین نسخه ویرایش‌شده همگام نیست؛ تغییرات را بررسی کن و دوباره تلاش کن.");
   }
   return {selected:true,ready:info.ready,name:info.name,kind:info.kind};
  },
  reset(){
   sourceFile=null;workbook=null;zip=null;kind="";pendingDownloadBlob=null;contextSyncPromise=Promise.resolve();setDownloadReady(false);editorReadyPromise=Promise.resolve();
   hide();
  },
  async createPreviewBlob(){
   if(!sourceFile||!kind)return null;
   if(kind==="xlsx"&&workbook){
    const bytes=window.XLSX.write(workbook,{bookType:"xlsx",type:"array",cellStyles:true,compression:true});
    return new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
   }
   if(zip&&["pptx","docx"].includes(kind))return generateEditedBlob();
   return null;
  },
  getActiveFileInfo(){
   const selected=input.files&&input.files[0];
   const ready=Boolean(sourceFile&&selected===sourceFile&&kind&&((kind==="xlsx"&&workbook)||(kind!=="xlsx"&&zip)));
   return {
    ready,
    contextSynced:window.NavaOfficeFile?.getState?.().contextSynced!==false,
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
    const XLSX=window.XLSX;
    for(const item of staged){
     const sheet=workbook.Sheets[item.sheet],previous=sheet[item.cell]||{};
     sheet[item.cell]={...previous,t:typeof item.value==="number"?"n":typeof item.value==="boolean"?"b":"s",v:item.value};
     delete sheet[item.cell].f;delete sheet[item.cell].w;
     // SheetJS uses !ref as the worksheet's visible/exported range. Expand it
     // when NAVI writes to a previously empty cell outside the current range.
     const range=XLSX.utils.decode_range(sheet["!ref"]||item.cell);
     const target=XLSX.utils.decode_cell(item.cell);
     range.s.r=Math.min(range.s.r,target.r);
     range.s.c=Math.min(range.s.c,target.c);
     range.e.r=Math.max(range.e.r,target.r);
     range.e.c=Math.max(range.e.c,target.c);
     sheet["!ref"]=XLSX.utils.encode_range(range);
    }
    workbook.Workbook=workbook.Workbook||{};workbook.Workbook.CalcPr={calcMode:"auto",fullCalcOnLoad:true,forceFullCalc:true};
    pendingDownloadBlob=null;setDownloadReady(true);drawGrid();
    await syncActiveFileContext();
    await window.NavaOfficePreview?.refreshFromEditor?.();
    setStatus(staged.length+" سلول تغییرات NAVI در ویرایش مستقیم اعمال و نمایش داده شد. محتوای مرجع درخواست بعدی نیز به‌روز شد. مقادیر را بررسی کن؛ سپس با دکمه دانلود فایل خروجی را دریافت کن.");
    window.NavaOfficeFile?.setEditStatus?.("تغییرات ثبت‌شده: "+staged.map(item=>item.sheet+"!"+item.cell).join("، ")+". فایل اصلی بدون تغییر است.");
    panel.scrollIntoView({behavior:"smooth",block:"nearest"});
    return {message:staged.length+" سلول در بخش ویرایش مستقیم اعمال شد و قابل بررسی است. پس از بررسی، دکمه «دانلود فایل ویرایش‌شده Excel» را بزن. فایل اصلی تغییر نکرده است."};
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
    pendingDownloadBlob=null;setDownloadReady(true);drawGrid();
    await syncActiveFileContext();
    await window.NavaOfficePreview?.refreshFromEditor?.();
    setStatus("ردیف جدید در ویرایش مستقیم نمایش داده شد. محتوای مرجع درخواست بعدی نیز به‌روز شد. اطلاعات را بررسی کن و سپس فایل را دانلود کن.");
    window.NavaOfficeFile?.setEditStatus?.("یک ردیف جدید در شیت «"+action.sheet+"» اضافه شد. فایل اصلی بدون تغییر است.");
    panel.scrollIntoView({behavior:"smooth",block:"nearest"});
    return {message:"یک ردیف به شیت «"+action.sheet+"» اضافه و در بخش ویرایش مستقیم نمایش داده شد. پس از بررسی، دکمه دانلود فایل ویرایش‌شده را بزن. فایل اصلی تغییر نکرده است."};
   }
   if(action?.kind==="delete_slide"||action?.kind==="delete_slide_text"){
    if(kind!=="pptx"||!zip)throw new Error("حذف فقط برای فایل PowerPoint پشتیبانی می‌شود.");
    if(!Number.isSafeInteger(action.slide)||action.slide<1||action.slide>500)throw new Error("شماره اسلاید معتبر نیست.");
    const presentationPath="ppt/presentation.xml";
    const relationshipsPath="ppt/_rels/presentation.xml.rels";
    if(!zip.files[presentationPath]||!zip.files[relationshipsPath])throw new Error("ساختار اصلی پاورپوینت قابل‌خواندن نیست؛ فایل تغییری نکرد.");
    const presentationXml=await zip.files[presentationPath].async("string");
    const relationshipsXml=await zip.files[relationshipsPath].async("string");
    const readAttribute=(source,name)=>{
     const escaped=name.replace(/[^a-zA-Z0-9_:]/g,char=>"\\"+char);
     const match=source.match(new RegExp('(?:^|\\s)'+escaped+'\\s*=\\s*"([^"]*)"'));
     return match?match[1]:"";
    };
    const resolvePart=(base,target)=>{
     const parts=(target.startsWith("/")?target.slice(1):base+"/"+target).split("/");
     const result=[];
     for(const part of parts){if(!part||part===".")continue;if(part==="..")result.pop();else result.push(part);}
     return result.join("/");
    };
    const relationshipMap=new Map();
    for(const match of relationshipsXml.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)\/?\s*>/g)){
     const id=readAttribute(match[1],"Id"),target=readAttribute(match[1],"Target"),type=readAttribute(match[1],"Type");
     if(id&&target)relationshipMap.set(id,{target,type});
    }
    const slideEntries=[];
    for(const match of presentationXml.matchAll(/<(?:[\w.-]+:)?sldId\b([^>]*)\/?\s*>/g)){
     const relId=readAttribute(match[1],"r:id");
     const rel=relationshipMap.get(relId);
     if(!rel||typeof rel.type!=="string"||!rel.type.endsWith("/slide"))throw new Error("ترتیب واقعی اسلایدها از روابط فایل قابل‌تشخیص نیست؛ هیچ تغییری اعمال نشد.");
     const slidePath=resolvePart("ppt",rel.target);
     if(!/^ppt\/slides\/slide\d+\.xml$/.test(slidePath)||!zip.files[slidePath])throw new Error("مسیر اسلاید در بسته پاورپوینت معتبر نیست؛ فایل تغییری نکرد.");
     slideEntries.push({relId,slidePath});
    }
    if(action.slide>slideEntries.length)throw new Error("اسلاید "+action.slide+" در فایل وجود ندارد؛ فایل تغییری نکرد.");
    const targetSlide=slideEntries[action.slide-1];
    if(action.kind==="delete_slide_text"){
     if(typeof action.find!=="string"||!action.find.trim()||action.find.length>3000)throw new Error("متن دقیق برای حذف معتبر نیست.");
     const xml=await zip.files[targetSlide.slidePath].async("string");
     const normalize=value=>String(value||"").normalize("NFKC").replace(/[\u00a0\u200b-\u200d\ufeff]/g," ").replace(/\s+/g," ").trim();
     const paragraphs=Array.from(xml.matchAll(/<(?:[\w.-]+:)?p(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?p>/g));
     const matches=paragraphs.filter(match=>{
      const runs=Array.from(match[1].matchAll(/<(?:[\w.-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?t>/g));
      return normalize(runs.map(run=>decodeXmlText(run[1])).join(""))===normalize(action.find);
     });
     if(matches.length!==1)throw new Error(matches.length===0?"متن کامل و دقیق در اسلاید "+action.slide+" پیدا نشد؛ فایل تغییری نکرد.":"این متن بیش از یک‌بار در اسلاید "+action.slide+" وجود دارد؛ برای جلوگیری از حذف اشتباه، فایل تغییری نکرد.");
     const paragraph=matches[0];
     const updated=xml.slice(0,paragraph.index)+xml.slice(paragraph.index+paragraph[0].length);
     zip.file(targetSlide.slidePath,updated);
     pendingDownloadBlob=await generateEditedBlob();
     setDownloadReady(true);
     await syncActiveFileContext();
     await window.NavaOfficePreview?.refreshFromEditor?.();
     setStatus("متن مشخص‌شده از اسلاید "+action.slide+" حذف شد؛ خود اسلاید و سایر متن‌ها حفظ شدند. فایل اصلی بدون تغییر است.");
     window.NavaOfficeFile?.setEditStatus?.("یک پاراگراف از اسلاید "+action.slide+" حذف شد.");
     return {message:"متن مشخص‌شده از اسلاید "+action.slide+" حذف شد و خود اسلاید باقی ماند. نسخه خروجی را بررسی و دانلود کن؛ فایل اصلی تغییر نکرده است."};
    }
    if(slideEntries.length<=1)throw new Error("برای جلوگیری از ساخت ارائه خالی، حذف آخرین اسلاید مجاز نیست.");
    const contentTypesPath="[Content_Types].xml";
    if(!zip.files[contentTypesPath])throw new Error("فهرست نوع محتوای پاورپوینت پیدا نشد؛ فایل تغییری نکرد.");
    let contentTypes=await zip.files[contentTypesPath].async("string");
    const slidePart="/"+targetSlide.slidePath;
    const updatedPresentation=presentationXml.replace(/<(?:[\w.-]+:)?sldId\b[^>]*\/>/g,tag=>readAttribute(tag,"r:id")===targetSlide.relId?"":tag);
    if(updatedPresentation===presentationXml)throw new Error("ارجاع اسلاید در فهرست ارائه پیدا نشد؛ فایل تغییری نکرد.");
    const updatedRelationships=relationshipsXml.replace(/<(?:[\w.-]+:)?Relationship\b[^>]*\/>/g,tag=>readAttribute(tag,"Id")===targetSlide.relId?"":tag);
    if(updatedRelationships===relationshipsXml)throw new Error("رابطه اسلاید در فایل پاورپوینت پیدا نشد؛ فایل تغییری نکرد.");
    contentTypes=contentTypes.replace(/<(?:[\w.-]+:)?Override\b[^>]*\/>/g,tag=>readAttribute(tag,"PartName")===slidePart?"":tag);
    const slideRelsPath=targetSlide.slidePath.replace("slides/","slides/_rels/")+".rels";
    if(zip.files[slideRelsPath]){
     const slideRels=await zip.files[slideRelsPath].async("string");
     const noteRel=Array.from(slideRels.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)\/?\s*>/g)).map(match=>({
      target:readAttribute(match[1],"Target"),type:readAttribute(match[1],"Type")
     })).find(rel=>typeof rel.type==="string"&&rel.type.endsWith("/notesSlide"));
     if(noteRel){
      const notesPath=resolvePart("ppt/slides",noteRel.target);
      if(/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(notesPath)){
       zip.remove(notesPath);
       zip.remove(notesPath.replace("notesSlides/","notesSlides/_rels/")+".rels");
       const notesPart="/"+notesPath;
       contentTypes=contentTypes.replace(/<(?:[\w.-]+:)?Override\b[^>]*\/>/g,tag=>readAttribute(tag,"PartName")===notesPart?"":tag);
      }
     }
    }
    zip.file(presentationPath,updatedPresentation);
    zip.file(relationshipsPath,updatedRelationships);
    zip.file(contentTypesPath,contentTypes);
    zip.remove(targetSlide.slidePath);
    zip.remove(slideRelsPath);
    pendingDownloadBlob=await generateEditedBlob();
    setDownloadReady(true);
    await syncActiveFileContext();
    await window.NavaOfficePreview?.refreshFromEditor?.();
    setStatus("اسلاید "+action.slide+" حذف شد. ترتیب اسلایدهای باقی‌مانده حفظ شده است. فایل اصلی بدون تغییر است.");
    window.NavaOfficeFile?.setEditStatus?.("اسلاید "+action.slide+" حذف شد.");
    return {message:"اسلاید "+action.slide+" از ارائه حذف شد و ترتیب اسلایدهای باقی‌مانده حفظ شده است. نسخه خروجی را بررسی و دانلود کن؛ فایل اصلی تغییر نکرده است."};
   }
   if(action?.kind==="edit_slide_text"){
    if(kind!=="pptx"||!zip||!Array.isArray(action.edits)||action.edits.length<1||action.edits.length>10)throw new Error("این فایل یا عملیات ویرایش متن اسلاید معتبر نیست.");
    const presentationXml=await zip.files["ppt/presentation.xml"]?.async("string");
    const presentationRels=await zip.files["ppt/_rels/presentation.xml.rels"]?.async("string");
    if(!presentationXml||!presentationRels)throw new Error("ترتیب اسلایدهای پاورپوینت قابل‌خواندن نیست.");
    const presentationDoc=new DOMParser().parseFromString(presentationXml,"application/xml");
    const relationshipsDoc=new DOMParser().parseFromString(presentationRels,"application/xml");
    if(presentationDoc.querySelector("parsererror")||relationshipsDoc.querySelector("parsererror"))throw new Error("ساختار روابط اسلایدها معتبر نیست.");
    const relationships=new Map(Array.from(relationshipsDoc.getElementsByTagName("*")).filter(node=>node.localName==="Relationship").map(node=>[node.getAttribute("Id"),node.getAttribute("Target")]));
    const slidePaths=Array.from(presentationDoc.getElementsByTagName("*")).filter(node=>node.localName==="sldId").map(node=>{
     const relId=node.getAttribute("r:id")||node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id");
     const target=relationships.get(relId);
     if(!target)throw new Error("رابطه یکی از اسلایدها پیدا نشد.");
     const parts=(target.startsWith("/")?target.slice(1):"ppt/"+target).split("/");
     const resolved=[];
     for(const part of parts){if(!part||part===".")continue;if(part==="..")resolved.pop();else resolved.push(part);}
     return resolved.join("/");
    });
    const staged=new Map();
    for(const item of action.edits){
     if(!item||!Number.isSafeInteger(item.slide)||item.slide<1||item.slide>500||typeof item.find!=="string"||!item.find.trim()||item.find.length>3000||typeof item.replace!=="string"||item.replace.length>3000)throw new Error("شماره اسلاید یا متن یکی از تغییرات معتبر نیست.");
     const path=slidePaths[item.slide-1];
     if(!path||!/^ppt\/slides\/slide\d+\.xml$/.test(path)||!zip.files[path])throw new Error("اسلاید "+item.slide+" در فایل پیدا نشد؛ هیچ تغییری اعمال نشد.");
     let xml=staged.has(path)?staged.get(path):await zip.files[path].async("string");
     const normalizeSlideText=value=>String(value||"").normalize("NFKC").replace(/[\u00a0\u200b-\u200d\ufeff]/g," ").replace(/\s+/g," ").trim();
     const paragraphMatches=Array.from(xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g));
     const paragraphs=paragraphMatches.map((match,index)=>{
      const runs=Array.from(match[1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g));
      return {index,text:runs.map(run=>decodeXmlText(run[1])).join("")};
     }).filter(item=>item.text.trim());
     const wanted=normalizeSlideText(item.find);
     const candidates=[];
     for(let start=0;start<paragraphs.length;start++){
      let combined="";
      for(let end=start;end<paragraphs.length;end++){
       combined=normalizeSlideText(combined+" "+paragraphs[end].text);
       if(combined===wanted)candidates.push({start,end});
       if(combined!==wanted&&!wanted.startsWith(combined+" "))break;
      }
     }
     if(candidates.length!==1)throw new Error(candidates.length===0
      ?"متن انتخاب‌شده در اسلاید "+item.slide+" پیدا نشد یا مرز پاراگراف‌ها با متن مرجع تطبیق نداشت؛ فایل تغییری نکرد."
      :"متن انتخاب‌شده بیش از یک‌بار در اسلاید "+item.slide+" وجود دارد؛ برای جلوگیری از تغییر اشتباه، فایل تغییری نکرد.");
     const target=candidates[0];
     let replacementParagraphs=String(item.replace).split(/\r\n|\n|\r/);
     const targetCount=target.end-target.start+1;
     if(replacementParagraphs.length!==targetCount){
      // NAVI may return a flattened full-text replacement when the request only
      // appends a sentence. Preserve every original paragraph and append only
      // the verified suffix to the final paragraph instead of rejecting it.
      const originalTargetText=paragraphs
       .slice(target.start,target.end+1)
       .map(paragraph=>paragraph.text)
       .join(" ");
      const normalizedOriginal=normalizeSlideText(originalTargetText);
      const normalizedReplacement=normalizeSlideText(replacementParagraphs.join(" "));
      if(replacementParagraphs.length===1&&targetCount>1&&
         normalizedReplacement.startsWith(normalizedOriginal+" ")){
       const appendedText=normalizedReplacement.slice(normalizedOriginal.length).trim();
       replacementParagraphs=paragraphs
        .slice(target.start,target.end+1)
        .map(paragraph=>paragraph.text);
       const lastIndex=replacementParagraphs.length-1;
       replacementParagraphs[lastIndex]=
        (replacementParagraphs[lastIndex].trim()?replacementParagraphs[lastIndex].trim()+" ":"")+appendedText;
      }else{
       // Accept complete rewrites with a different paragraph count. Keep the
       // existing slide paragraph structure: overflow is joined in the final
       // target paragraph and unused target paragraphs are cleared.
       const normalizedLines=replacementParagraphs.map(line=>String(line).trim()).filter(Boolean);
       replacementParagraphs=Array.from({length:targetCount},()=> "");
       if(normalizedLines.length<=targetCount){
        normalizedLines.forEach((line,index)=>{replacementParagraphs[index]=line;});
       }else{
        for(let index=0;index<targetCount-1;index++)replacementParagraphs[index]=normalizedLines[index]||"";
        replacementParagraphs[targetCount-1]=normalizedLines.slice(targetCount-1).join(" ");
       }
      }
     }
     const updates=[];
     for(let offset=0;offset<targetCount;offset++){
      const source=paragraphs[target.start+offset];
      const original=paragraphMatches[source.index];
      const body=original[1];
      let first=true,hasRun=false;
      const updatedBody=body.replace(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g,(whole,value)=>{
       hasRun=true;
       if(first){first=false;return whole.replace(value,escapeXmlText(replacementParagraphs[offset]));}
       return whole.replace(value,"");
      });
      if(!hasRun)throw new Error("ساختار متنی پاراگراف اسلاید "+item.slide+" قابل ویرایش نیست؛ فایل تغییری نکرد.");
      updates.push({index:source.index,value:original[0].replace(body,updatedBody)});
     }
     updates.sort((a,b)=>b.index-a.index).forEach(update=>{
      const original=paragraphMatches[update.index];
      xml=xml.slice(0,original.index)+update.value+xml.slice(original.index+original[0].length);
     });
     staged.set(path,xml);
    }
    for(const [path,xml] of staged)zip.file(path,xml);
    pendingDownloadBlob=await generateEditedBlob();
    setDownloadReady(true);
    await syncActiveFileContext();
    await window.NavaOfficePreview?.refreshFromEditor?.();
    setStatus(action.edits.length+" پاراگراف در اسلایدهای پاورپوینت بازنویسی شد. محتوای مرجع درخواست بعدی نیز به‌روز شد. برای دریافت نسخه ویرایش‌شده، دکمه دانلود را بزن.");
    window.NavaOfficeFile?.setEditStatus?.(action.edits.length+" پاراگراف پاورپوینت بازنویسی شد. فایل اصلی بدون تغییر است.");
    return {message:action.edits.length+" پاراگراف در اسلایدهای مشخص‌شده بازنویسی شد. چیدمان و ساختار اسلایدها حفظ شده است؛ پس از بررسی، فایل ویرایش‌شده را دانلود کن. فایل اصلی تغییر نکرده است."};
   }
   if(action?.kind==="replace_text"){
    if(!["docx","pptx"].includes(kind)||!zip||typeof action.find!=="string"||!action.find.trim()||action.find.length>500||typeof action.replace!=="string"||action.replace.length>500)throw new Error("این فایل یا عملیات جایگزینی معتبر نیست.");
    let count=0;
    const names=Object.keys(zip.files).filter(name=>kind==="pptx"?/^ppt\/slides\/slide\d+\.xml$/.test(name):/^word\/(document|header\d+|footer\d+)\.xml$/.test(name));
    for(const name of names){
     const prefix=kind==="pptx"?"a":"w";
     const result=replaceTextAcrossRuns(await zip.files[name].async("string"),action.find,action.replace,prefix);
     count+=result.count;
     if(result.count)zip.file(name,result.xml);
    }
    if(!count)throw new Error("عبارت دقیق در قطعه‌های متنی مستقل پیدا نشد؛ فایل تغییری نکرد.");
    pendingDownloadBlob=await generateEditedBlob();
    setDownloadReady(true);
    await syncActiveFileContext();
    await window.NavaOfficePreview?.refreshFromEditor?.();
    setStatus(count+" جایگزینی در فایل اعمال شد. محتوای مرجع درخواست بعدی نیز به‌روز شد. برای دریافت نسخه ویرایش‌شده، دکمه دانلود را بزن.");
    window.NavaOfficeFile?.setEditStatus?.(count+" مورد جایگزینی متن انجام شد. فایل اصلی بدون تغییر است.");
    return {message:count+" جایگزینی در فایل اعمال شد. برای دریافت نسخه ویرایش‌شده، دکمه دانلود را بزن. فایل اصلی تغییر نکرده است."};
   }
   throw new Error("نوع عملیات NAVI پشتیبانی نمی‌شود.");
  }
 };
 input.addEventListener("change",()=>{const file=input.files&&input.files[0];if(file){editorReadyPromise=openFile(file);}else{editorReadyPromise=Promise.resolve();}});
 $("officeEditSheet")?.addEventListener("change",event=>{currentSheet=event.target.value;drawGrid();});
 $("officeEditClose")?.addEventListener("click",hide);
})();