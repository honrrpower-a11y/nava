/* NAVA Office — local document text extraction and OCR.
   Original files stay in the browser; only extracted text is included in a NAVI request. */
(() => {
  "use strict";
  const input=document.getElementById("officeSourceFile");
  const brief=document.getElementById("studioBrief-office");
  const status=document.getElementById("officeFileStatus");
  const clear=document.getElementById("officeClearFile");
  if(!input||!brief||!status||!clear)return;

  const MAX_BYTES=15*1024*1024,MAX_CHARS=12000,MAX_PDF_PAGES=40,MAX_OCR_PAGES=15;
  const OCR_SCRIPT="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  let originalBrief="";
  let extractionPromise=Promise.resolve();
  let extractionState="idle";
  let extractionFile=null;
  let extractionError="";
  let contextSynced=false;
  const setStatus=(message,state="")=>{status.textContent=message;status.dataset.state=state;};
  const loadScript=(src,globalName)=>new Promise((resolve,reject)=>{
    if(window[globalName])return resolve(window[globalName]);
    const existing=document.querySelector('script[data-office-lib="'+globalName+'"]');
    if(existing){existing.addEventListener("load",()=>window[globalName]?resolve(window[globalName]):reject(new Error("بارگذاری کتابخانه ناموفق بود.")),{once:true});existing.addEventListener("error",()=>reject(new Error("بارگذاری کتابخانه ناموفق بود.")),{once:true});return;}
    const script=document.createElement("script");script.src=src;script.async=true;script.dataset.officeLib=globalName;
    script.onload=()=>window[globalName]?resolve(window[globalName]):reject(new Error("کتابخانه در دسترس قرار نگرفت."));
    script.onerror=()=>reject(new Error("دریافت ابزار خواندن فایل ناموفق بود؛ اتصال اینترنت را بررسی کن."));
    document.head.appendChild(script);
  });

  async function createOcrWorker(){
    const Tesseract=await loadScript(OCR_SCRIPT,"Tesseract");
    setStatus("در حال آماده‌سازی موتور تشخیص متن فارسی؛ دریافت اولیه ممکن است کمی زمان ببرد...");
    return Tesseract.createWorker("fas+eng",1,{
      logger:message=>{
        if(message.status==="loading language traineddata")setStatus("در حال دریافت داده زبانی OCR فارسی...");
        else if(message.status==="recognizing text"&&Number.isFinite(message.progress)){
          setStatus("در حال تشخیص متن تصویر... "+Math.round(message.progress*100)+"٪");
        }
      }
    });
  }

  async function recognizeImage(file){
    const worker=await createOcrWorker();
    try{
      setStatus("در حال استخراج نوشته‌های تصویر...");
      const result=await worker.recognize(file);
      return String(result.data.text||"").trim();
    }finally{await worker.terminate();}
  }

  async function readDocx(file){
    const mammoth=await loadScript("https://unpkg.com/mammoth@1.9.1/mammoth.browser.min.js","mammoth");
    const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
    return result.value||"";
  }

  async function readPdf(file){
    const pdfjs=await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js","pdfjsLib");
    pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    let ocrWorker=null,ocrPages=0;
    const pages=[];
    try{
      if(doc.numPages>MAX_PDF_PAGES)throw new Error("این نسخه حداکثر ۴۰ صفحه از PDF را می‌خواند. لطفاً فایل را به بخش‌های کوچک‌تر تقسیم کن.");
      for(let n=1;n<=doc.numPages;n++){
        const page=await doc.getPage(n);
        const content=await page.getTextContent();
        const pageText=content.items.map(item=>item.str||"").join(" ").replace(/[ \t]+/g," ").trim();
        // Keep ordinary text PDFs on the existing fast path; OCR only image-like pages.
        if(pageText.length>=24){
          pages.push("صفحه "+n+":\n"+pageText);
          continue;
        }
        if(ocrPages>=MAX_OCR_PAGES){
          throw new Error("این PDF بیش از ۱۵ صفحه اسکن‌شده دارد. برای پردازش دقیق و سبک‌تر، آن را به چند فایل حداکثر ۱۵ صفحه‌ای تقسیم کن.");
        }
        if(!ocrWorker)ocrWorker=await createOcrWorker();
        ocrPages++;
        setStatus("در حال OCR صفحه "+n+" از "+doc.numPages+"؛ لطفاً این صفحه را باز نگه دار...");
        const base=page.getViewport({scale:1});
        const scale=Math.min(1.6,1800/base.width,2400/base.height);
        const viewport=page.getViewport({scale});
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.ceil(viewport.width));
        canvas.height=Math.max(1,Math.ceil(viewport.height));
        const context=canvas.getContext("2d",{willReadFrequently:true});
        await page.render({canvasContext:context,viewport}).promise;
        const result=await ocrWorker.recognize(canvas);
        const recognized=String(result.data.text||"").trim();
        canvas.width=0;canvas.height=0;
        if(pageText||recognized)pages.push("صفحه "+n+":\n"+[pageText,recognized].filter(Boolean).join("\n"));
        page.cleanup();
      }
      const output=pages.join("\n\n");
      if(!output.trim())throw new Error("از این PDF متن قابل تشخیصی پیدا نشد. کیفیت تصویر یا وضوح اسکن را بررسی کن.");
      return {text:output,ocrPages};
    }finally{
      if(ocrWorker)await ocrWorker.terminate();
      await doc.destroy();
    }
  }

  function clearFile(){
    brief.value=originalBrief;input.value="";originalBrief="";
    extractionFile=null;extractionState="idle";extractionError="";contextSynced=false;extractionPromise=Promise.resolve();
    window.NavaOfficeTools?.reset?.();
    clear.disabled=true;setStatus("فایل از درخواست حذف شد.");
  }
  clear.addEventListener("click",clearFile);

  // Expose a real readiness barrier so Office requests cannot race file extraction.
  window.NavaOfficeFile = Object.freeze({
    async waitForReady(){
      await extractionPromise;
      const selected=input.files&&input.files[0];
      if(!selected)return {selected:false,ready:false};
      if(selected!==extractionFile||extractionState!=="ready"){
        throw new Error(extractionError||"خواندن فایل هنوز کامل نشده است. وضعیت فایل را بررسی کن و دوباره تلاش کن.");
      }
      const textInBrief=brief.value||"";
      if(!textInBrief.includes("--- متن استخراج‌شده از فایل: "+selected.name+" ---")){
        throw new Error("متن فایل به درخواست آفیس متصل نشده است. فایل را دوباره انتخاب کن.");
      }
      return {selected:true,ready:true,name:selected.name};
    },
    getState(){return {state:extractionState,name:extractionFile?.name||"",error:extractionError,contextSynced};},
    markContextOutOfSync(){contextSynced=false;},
    updateExtractedContent(content){
      const selected=input.files&&input.files[0];
      if(!selected||selected!==extractionFile||extractionState!=="ready")return false;
      contextSynced=false;
      const extracted=String(content||"").replace(/\u0000/g,"").trim();
      if(!extracted)return false;
      const pattern=/(?:^|\n\n)--- متن استخراج‌شده از فایل: ([^\n]+) ---\n[\s\S]*?\n--- پایان متن فایل ---\s*$/;
      const current=String(brief.value||"");
      const match=pattern.exec(current);
      if(!match||match[1]!==selected.name)return false;
      const prefix=current.slice(0,match.index).trim();
      const wasTruncated=extracted.length>MAX_CHARS;
      const attachment="--- متن استخراج‌شده از فایل: "+selected.name+" ---\n"+extracted.slice(0,MAX_CHARS)+(wasTruncated?"\n\n[ادامه متن به دلیل محدودیت حجم در این مرحله ارسال نشد.]":"")+"\n--- پایان متن فایل ---";
      brief.value=(prefix?prefix+"\n\n":"")+attachment;
      brief.dispatchEvent(new Event("input",{bubbles:true}));
      contextSynced=true;
      setStatus("محتوای مرجع فایل «"+selected.name+"» از آخرین نسخه ویرایش‌شده به‌روز شد."+(wasTruncated?" فقط ۱۲ هزار نویسه اول در درخواست بعدی ارسال می‌شود.":""),"success");
      return true;
    },
    setEditStatus(details){
      const selected=input.files&&input.files[0];
      const summary=String(details||"").trim();
      if(!selected||selected!==extractionFile||extractionState!=="ready"||!summary)return false;
      setStatus("فایل «"+selected.name+"» — وضعیت: ویرایش‌شده. "+summary+" محتوای مرجع درخواست بعدی NAVI نیز به‌روز شد.","success");
      return true;
    }
  });

  input.addEventListener("change",()=>{
    const file=input.files&&input.files[0];
    if(!file){extractionFile=null;extractionState="idle";extractionError="";return;}
    extractionFile=file;extractionState="processing";extractionError="";contextSynced=false;
    const taskFile=file;
    extractionPromise=(async()=>{
      if(taskFile.size>MAX_BYTES){input.value="";extractionState="error";extractionError="حجم فایل بیشتر از ۱۵ مگابایت است.";setStatus(extractionError,"error");return;}
      const ext=(taskFile.name.split(".").pop()||"").toLowerCase();
      const supported=["docx","pdf","txt","png","jpg","jpeg","webp","pptx","xlsx"];
      if(!supported.includes(ext)){input.value="";extractionState="error";extractionError="فرمت پشتیبانی‌شده: DOCX، PDF، PPTX، XLSX، TXT و تصاویر PNG، JPG و WEBP.";setStatus(extractionError,"error");return;}
      clear.disabled=true;setStatus("در حال خواندن فایل روی دستگاه شما؛ تا پایان پردازش درخواست را ارسال نکن...");
      try{
        originalBrief=brief.value.trim();
        let extracted="",ocrPages=0;
        if(ext==="pptx"||ext==="xlsx")extracted=await window.NavaOfficeStructured.read(file);
        else if(ext==="docx")extracted=await readDocx(taskFile);
        else if(ext==="pdf"){const result=await readPdf(taskFile);extracted=result.text;ocrPages=result.ocrPages;}
        else if(ext==="txt")extracted=await taskFile.text();
        else extracted=await recognizeImage(taskFile);
        if(input.files?.[0]!==taskFile)return;
        extracted=String(extracted||"").replace(/\u0000/g,"").trim();
        if(!extracted)throw new Error("متن قابل استفاده‌ای در فایل پیدا نشد. ممکن است تصویر تار یا کم‌کیفیت باشد.");
        const wasTruncated=extracted.length>MAX_CHARS;
        extracted=extracted.slice(0,MAX_CHARS);
        const attachment="\n\n--- متن استخراج‌شده از فایل: "+taskFile.name+" ---\n"+extracted+(wasTruncated?"\n\n[ادامه متن به دلیل محدودیت حجم در این مرحله ارسال نشد.]":"")+"\n--- پایان متن فایل ---";
        // Preserve any instruction the user typed while the file was being parsed.
        const currentBrief=String(brief.value||"").replace(/\n\n--- متن استخراج‌شده از فایل:[\s\S]*?--- پایان متن فایل ---\s*/g,"").trim();
        brief.value=(currentBrief?currentBrief+"\n\n":"")+attachment;
        brief.dispatchEvent(new Event("input",{bubbles:true}));
        clear.disabled=false;
        extractionState="ready";contextSynced=true;
        const ocrNote=ocrPages?" با OCR فارسی از "+ocrPages+" صفحه اسکن‌شده.":(["png","jpg","jpeg","webp"].includes(ext)?" با OCR فارسی.":ext==="pptx"?"؛ اسلایدها و یادداشت‌های متنی استخراج شدند.":ext==="xlsx"?"؛ شیت‌ها، داده‌های سلولی و فرمول‌های موجود استخراج شدند.":"");
        setStatus("متن فایل «"+taskFile.name+"» استخراج شد"+ocrNote+" و آماده ارسال به NAVI است."+(wasTruncated?" فقط ۱۲ هزار نویسه اول خوانده شد.":""),"success");
      }catch(error){
        if(input.files?.[0]!==taskFile)return;
        input.value="";originalBrief="";
        extractionState="error";contextSynced=false;extractionError=error.message||"خواندن فایل ناموفق بود.";
        setStatus(extractionError,"error");
        throw error;
      }
    })();
    // Avoid an unhandled rejection; waitForReady reports the same error to the form.
    extractionPromise=extractionPromise.catch(error=>{throw error;});
    extractionPromise.catch(()=>{});
  });;
})();
