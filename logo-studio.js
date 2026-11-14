"use strict";
(function initNavaLogoStudio() {
  const $ = id => document.getElementById(id);
  const form = $("logoStudioForm");
  if (!form) return;
  const fields = {
    name: $("logoBrandName"), slogan: $("logoSlogan"), industry: $("logoIndustry"),
    audience: $("logoAudience"), symbolIdea: $("logoSymbolIdea"),
    personality: $("logoPersonality"), typography: $("logoTypography"),
    format: $("logoFormat"), palette: $("logoPalette"),
    primaryColor: $("logoPrimaryColor"), darkColor: $("logoDarkColor")
  };
  const results = $("logoConceptResults"), status = $("logoStudioStatus"), empty = $("logoStudioEmpty");
  const customColors = $("logoCustomColors");
  const paletteNames = {
    gold:"طلایی و سرمه‌ای",blue:"آبی و نقره‌ای",green:"سبز و کرم",
    violet:"بنفش و یاسی",mono:"تک‌رنگ",custom:"رنگ اختصاصی"
  };
  const safeFileName = value => String(value || "nava-logo").trim()
    .replace(/[^\p{L}\p{N}-]+/gu,"-").replace(/^-+|-+$/g,"") || "nava-logo";
  function readData() {
    const paletteKey=fields.palette.value;
    return {
      brandName:fields.name.value.trim(), slogan:fields.slogan.value.trim(),
      industry:fields.industry.value.trim(), audience:fields.audience.value.trim(),
      symbolIdea:fields.symbolIdea.value.trim(),
      personality:fields.personality.selectedOptions[0]?.textContent.trim()||"",
      typography:fields.typography.selectedOptions[0]?.textContent.trim()||"",
      format:paletteKey?fields.format.value:"combination",
      formatLabel:fields.format.selectedOptions[0]?.textContent.trim()||"",
      palette:paletteNames[paletteKey]||paletteKey,
      primaryColor:fields.primaryColor.value,darkColor:fields.darkColor.value
    };
  }
  function addTextLockup(card,data) {
    const lockup=document.createElement("div");
    lockup.className="logo-ai-lockup";
    lockup.style.setProperty("--logo-primary",data.primaryColor||"#c99b48");
    lockup.style.setProperty("--logo-dark",data.darkColor||"#172238");
    const name=document.createElement("strong");name.textContent=data.brandName;
    lockup.appendChild(name);
    if(data.slogan){const slogan=document.createElement("span");slogan.textContent=data.slogan;lockup.appendChild(slogan);}
    card.appendChild(lockup);
  }
  async function downloadPng(url,data,index) {
    status.textContent="در حال آماده‌سازی فایل PNG...";
    try {
      const response=await fetch(url,{mode:"cors",credentials:"omit"});
      if(!response.ok)throw new Error("image fetch failed");
      const blob=await response.blob();
      const objectUrl=URL.createObjectURL(blob);
      const image=new Image();
      image.onload=()=>{
        const canvas=document.createElement("canvas");
        canvas.width=1200;canvas.height=1400;
        const ctx=canvas.getContext("2d");
        ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
        const size=1080;ctx.drawImage(image,60,20,size,size);
        ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.direction=/[\u0600-\u06FF]/.test(data.brandName)?"rtl":"ltr";
        ctx.fillStyle=data.darkColor||"#172238";
        ctx.font="700 82px Tahoma, Arial, sans-serif";
        ctx.fillText(data.brandName,600,1190,1060);
        if(data.slogan){
          ctx.fillStyle="#687386";ctx.font="400 34px Tahoma, Arial, sans-serif";
          ctx.fillText(data.slogan,600,1280,1040);
        }
        canvas.toBlob(output=>{
          URL.revokeObjectURL(objectUrl);
          if(!output){status.textContent="ساخت PNG ناموفق بود.";return;}
          const outputUrl=URL.createObjectURL(output),link=document.createElement("a");
          link.href=outputUrl;link.download=safeFileName(data.brandName)+"-logo-concept-"+(index+1)+".png";
          document.body.appendChild(link);link.click();link.remove();
          setTimeout(()=>URL.revokeObjectURL(outputUrl),1500);
          status.textContent="فایل PNG آماده شد. این خروجی تصویری است، نه فایل برداری SVG.";
        },"image/png");
      };
      image.onerror=()=>{URL.revokeObjectURL(objectUrl);status.textContent="تصویر دریافت شد اما آماده‌سازی فایل دانلود ممکن نشد.";};
      image.src=objectUrl;
    } catch(error) {
      status.textContent="مرورگر اجازه دریافت مستقیم فایل را نداد؛ تصویر را باز کن و از منوی مرورگر ذخیره کن.";
      window.open(url,"_blank","noopener");
    }
  }
  function buildCard(image,index,data) {
    const card=document.createElement("article");card.className="logo-concept-card logo-ai-card";
    const preview=document.createElement("div");preview.className="logo-concept-preview logo-ai-preview";
    const img=document.createElement("img");img.src=image.url;img.alt="کانسپت "+image.concept+" برای برند "+data.brandName;
    img.loading="lazy";img.decoding="async";img.referrerPolicy="no-referrer";
    preview.appendChild(img);card.appendChild(preview);
    addTextLockup(card,data);
    const copy=document.createElement("div");copy.className="logo-concept-copy";
    const title=document.createElement("h3");title.textContent=image.concept||("کانسپت "+(index+1));
    const desc=document.createElement("p");desc.textContent=image.description||"این مسیر طراحی بر اساس بریف برند ساخته شده؛ نام و شعار جداگانه و خوانا اضافه شده‌اند.";
    const rubric=document.createElement("div");rubric.className="logo-ai-rubric";
    ["تمایز سیلوئت","تناسب با برند","خوانایی در اندازه کوچک","تعادل طلایی و سرمه‌ای"].forEach(label=>{
      const item=document.createElement("span");item.textContent=label;rubric.appendChild(item);
    });
    copy.append(title,desc,rubric);card.appendChild(copy);
    const actions=document.createElement("div");actions.className="logo-concept-actions";
    const button=document.createElement("button");button.type="button";button.className="btn-primary";
    button.textContent="دریافت لوگو با نام برند";
    button.addEventListener("click",()=>downloadPng(image.url,data,index));
    actions.appendChild(button);card.appendChild(actions);
    return card;
  }
  fields.palette.addEventListener("change",()=>{customColors.hidden=fields.palette.value!=="custom";});
  form.addEventListener("reset",()=>setTimeout(()=>{customColors.hidden=fields.palette.value!=="custom";},0));
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const data=readData();
    if(!data.brandName){status.textContent="نام برند را وارد کن.";fields.name.focus();return;}
    const token=sessionStorage.getItem("nava_navi_session")||"";
    let visitorId="";
    if(!token){
      visitorId=localStorage.getItem("nava_guest_trial_id")||"";
      if(!/^[a-f0-9-]{32,40}$/i.test(visitorId)){
        visitorId=typeof crypto.randomUUID==="function"?crypto.randomUUID():
          Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,"0")).join("");
        localStorage.setItem("nava_guest_trial_id",visitorId);
      }
    }
    const headers={"Content-Type":"application/json"};
    if(token)headers.Authorization="Bearer "+token;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),125000);
    const submit=form.querySelector('button[type="submit"]');
    submit.disabled=true;submit.textContent="در حال طراحی سه کانسپت...";
    status.textContent="موتور طراحی در حال ساخت سه مسیر بصری مستقل است. این مرحله ممکن است کمی زمان ببرد.";
    try {
      const response=await fetch("https://nava-music-api.honrrpower.workers.dev/logo/generate",{
        method:"POST",headers,cache:"no-store",signal:controller.signal,
        body:JSON.stringify({...data,visitorId})
      });
      const result=await response.json();
      if(!response.ok||!result.success){
        status.textContent=result.error||"ساخت لوگو انجام نشد.";
        if(response.status===401){
          status.textContent="نشست ورود معتبر نیست یا منقضی شده است. از حساب NAVI خارج شو و دوباره وارد شو؛ این صفحه را ترک نکن.";
        } else if(response.status===429){
          status.textContent=result.error||"سهمیه ساخت لوگو فعلاً در دسترس نیست. این صفحه را ترک نکن؛ جزئیات محدودیت را همین‌جا بررسی می‌کنیم.";
        }
        return;
      }
      results.replaceChildren();
      result.images.forEach((image,index)=>results.appendChild(buildCard(image,index,data)));
      empty.hidden=true;
      status.textContent="سه مسیر هنری مستقل آماده شد. آن‌ها را از نظر تمایز سیلوئت، تناسب با برند، خوانایی و تعادل رنگ مقایسه کن."
      results.scrollIntoView({behavior:"smooth",block:"start"});
    } catch(error) {
      status.textContent=error.name==="AbortError"
        ?"زمان ساخت طولانی شد. وضعیت سرویس را بررسی کن و دوباره تلاش کن."
        :"ارتباط با موتور طراحی برقرار نشد. کمی بعد دوباره تلاش کن.";
    } finally {
      clearTimeout(timer);submit.disabled=false;submit.textContent="ساخت ۳ کانسپت با موتور تصویر";
    }
  });
  $("logoBriefToNavi")?.addEventListener("click",()=>{
    const data=readData();
    const context={
      brandName:data.brandName,slogan:data.slogan,industry:data.industry,audience:data.audience,
      symbolIdea:data.symbolIdea,personality:data.personality,typography:data.typography,
      format:data.formatLabel,palette:data.palette,primaryColor:data.primaryColor,darkColor:data.darkColor
    };
    const message="بریف طراحی لوگوی من را مثل یک مدیر هنری حرفه‌ای بررسی کن. سه مسیر بصری متمایز پیشنهاد بده؛ برای هر مسیر ایده نماد، منطق تایپوگرافی فارسی، ترکیب‌بندی، کاربردپذیری در اندازه کوچک و نقاط قوت و ضعف را توضیح بده. از کلیشه‌های رایج و نمادهای آماده دوری کن.";
    if(typeof window.openNaviAssistant==="function"){window.openNaviAssistant({service:"طراحی لوگو",context,message});return;}
    const composer=$("userRequest"),selector=$("serviceSelect");
    if(composer)composer.value=message+"\n\n"+Object.entries(context).map(([key,value])=>key+": "+value).join("\n");
    if(selector)selector.value="طراحی لوگو";
    $("naviWidgetToggle")?.click();
  });
})();
