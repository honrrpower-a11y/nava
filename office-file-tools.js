/* NAVA Office — local document text extraction.
   Files stay in the browser; only extracted text is included when the user sends a NAVI request. */
(() => {
  "use strict";
  const input=document.getElementById("officeSourceFile");
  const brief=document.getElementById("studioBrief-office");
  const status=document.getElementById("officeFileStatus");
  const clear=document.getElementById("officeClearFile");
  if(!input||!brief||!status||!clear)return;
  const MAX_BYTES=15*1024*1024,MAX_CHARS=12000,MAX_PDF_PAGES=40;
  let originalBrief="";
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
  async function readDocx(file){
    const mammoth=await loadScript("https://unpkg.com/mammoth@1.9.1/mammoth.browser.min.js","mammoth");
    const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
    return result.value||"";
  }
  async function readPdf(file){
    const pdfjs=await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js","pdfjsLib");
    pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    if(doc.numPages>MAX_PDF_PAGES)throw new Error("این نسخه حداکثر ۴۰ صفحه از PDF را می‌خواند. لطفاً فایل را به بخش‌های کوچک‌تر تقسیم کن.");
    const pages=[];
    for(let n=1;n<=doc.numPages;n++){
      const page=await doc.getPage(n),content=await page.getTextContent();
      const text=content.items.map(item=>item.str||"").join(" ").replace(/[ \t]+/g," ").trim();
      if(text)pages.push("صفحه "+n+":\n"+text);
    }
    const output=pages.join("\n\n");
    if(!output.trim())throw new Error("از این PDF متن قابل استخراج پیدا نشد. احتمالاً فایل اسکن‌شده یا تصویری است؛ OCR در مرحله بعد اضافه می‌شود.");
    return output;
  }
  function clearFile(){
    brief.value=originalBrief;input.value="";originalBrief="";
    clear.disabled=true;setStatus("فایل از درخواست حذف شد.");
  }
  clear.addEventListener("click",clearFile);
  input.addEventListener("change",async()=>{
    const file=input.files&&input.files[0];if(!file)return;
    if(file.size>MAX_BYTES){input.value="";setStatus("حجم فایل بیشتر از ۱۵ مگابایت است.","error");return;}
    const ext=(file.name.split(".").pop()||"").toLowerCase();
    if(!["docx","pdf","txt"].includes(ext)){input.value="";setStatus("فعلاً فقط فایل Word با پسوند DOCX، PDF و TXT پشتیبانی می‌شود.","error");return;}
    clear.disabled=true;setStatus("در حال خواندن فایل روی دستگاه شما...");
    try{
      originalBrief=brief.value.trim();
      let extracted=ext==="docx"?await readDocx(file):ext==="pdf"?await readPdf(file):await file.text();
      extracted=String(extracted||"").replace(/\u0000/g,"").trim();
      if(!extracted)throw new Error("متن قابل استفاده‌ای در فایل پیدا نشد.");
      const wasTruncated=extracted.length>MAX_CHARS;
      extracted=extracted.slice(0,MAX_CHARS);
      const attachment="\n\n--- متن استخراج‌شده از فایل: "+file.name+" ---\n"+extracted+(wasTruncated?"\n\n[ادامه متن به دلیل محدودیت حجم در این مرحله ارسال نشد.]":"")+"\n--- پایان متن فایل ---";
      brief.value=(originalBrief?originalBrief+"\n\n":"")+attachment;
      brief.dispatchEvent(new Event("input",{bubbles:true}));
      clear.disabled=false;
      setStatus("متن فایل «"+file.name+"» استخراج شد و به درخواست NAVI اضافه شد."+(wasTruncated?" فقط ۱۲ هزار نویسه اول خوانده شد.":""),"success");
    }catch(error){input.value="";originalBrief="";setStatus(error.message||"خواندن فایل ناموفق بود.","error");}
  });
})();
