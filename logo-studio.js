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
      personalityValue:fields.personality.value,
      typography:fields.typography.selectedOptions[0]?.textContent.trim()||"",
      typographyValue:fields.typography.value,
      format:fields.format.value,
      formatLabel:fields.format.selectedOptions[0]?.textContent.trim()||"",
      palette:paletteNames[paletteKey]||paletteKey,
      primaryColor:paletteKey==="custom"?fields.primaryColor.value:(fields.palette.selectedOptions[0]?.dataset.foreground||""),
      darkColor:paletteKey==="custom"?fields.darkColor.value:(fields.palette.selectedOptions[0]?.dataset.background||"")
    };
  }
  function addTextLockup(card,data) {
    const lockup=document.createElement("div");
    lockup.className="logo-ai-lockup";
    lockup.style.setProperty("--logo-primary",data.primaryColor||"#c99b48");
    lockup.style.setProperty("--logo-dark",contrastInk(data.darkColor));
    lockup.style.backgroundColor=data.darkColor||"#172238";
    const name=document.createElement("strong");name.textContent=data.brandName;
    lockup.appendChild(name);
    if(data.slogan){const slogan=document.createElement("span");slogan.textContent=data.slogan;slogan.style.color=contrastInk(data.darkColor);lockup.appendChild(slogan);}
    card.appendChild(lockup);
  }
  async function downloadPng(url,data,index) {
    status.textContent="در حال آماده‌سازی فایل PNG لوگو...";
    const image=new Image();
    image.onload=()=>{
      try{
        const canvas=document.createElement("canvas");
        canvas.width=1200;canvas.height=data.slogan?1450:1380;
        const ctx=canvas.getContext("2d");
        if(!ctx){status.textContent="ساخت PNG در این مرورگر پشتیبانی نمی‌شود.";return;}
        const background=data.darkColor||"#172238",ink=contrastInk(background);
        ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(image,0,0,1200,1200);
        ctx.direction="rtl";ctx.textAlign="center";ctx.fillStyle=ink;
        const nameSize=Math.max(38,Math.min(76,Math.floor(1040/Math.max(5,[...data.brandName].length)*1.55)));
        ctx.font="800 "+nameSize+"px Tahoma, Arial, sans-serif";
        ctx.fillText(data.brandName,600,1300,1080);
        if(data.slogan){
          ctx.font="400 30px Tahoma, Arial, sans-serif";
          ctx.fillText(data.slogan,600,1370,1080);
        }
        canvas.toBlob(output=>{
          if(!output){status.textContent="ساخت PNG ناموفق بود.";return;}
          const outputUrl=URL.createObjectURL(output),link=document.createElement("a");
          link.href=outputUrl;link.download=safeFileName(data.brandName)+"-logo-concept-"+(index+1)+".png";
          document.body.appendChild(link);link.click();link.remove();
          setTimeout(()=>URL.revokeObjectURL(outputUrl),1500);
          status.textContent="فایل PNG لوگو همراه با نام برند آماده شد.";
        },"image/png");
      }catch(_){status.textContent="آماده‌سازی فایل PNG ناموفق بود.";}
    };
    image.onerror=()=>{status.textContent="تصویر لوگو برای دانلود بارگذاری نشد.";};
    image.src=url;
  }
  const feedbackKey="nava_logo_feedback_v1";
  const hexToRgb=hex=>{const m=/^#([0-9a-f]{6})$/i.exec(String(hex||""));return m?[parseInt(m[1].slice(0,2),16),parseInt(m[1].slice(2,4),16),parseInt(m[1].slice(4,6),16)]:null;};
  function selectedPalette(data){
    return [hexToRgb(data.primaryColor),hexToRgb(data.darkColor)].filter(Boolean);
  }
  function contrastInk(hex){
    const rgb=hexToRgb(hex);if(!rgb)return "#172238";
    const channels=rgb.map(value=>{value/=255;return value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4);});
    const luminance=.2126*channels[0]+.7152*channels[1]+.0722*channels[2];
    return luminance>.42?"#172238":"#FFFFFF";
  }
  function analyzeImage(img,data){
    try{
      const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});canvas.width=96;canvas.height=96;ctx.drawImage(img,0,0,96,96);
      const pixels=ctx.getImageData(0,0,96,96).data,palette=selectedPalette(data),background=hexToRgb(data.darkColor);let transparent=0,ink=0,near=0,backgroundNear=0,sampled=0;
      for(let i=0;i<pixels.length;i+=16){const r=pixels[i],g=pixels[i+1],b=pixels[i+2],a=pixels[i+3];sampled++;if(a<245){transparent++;continue;}ink++;if(palette.some(c=>Math.hypot(r-c[0],g-c[1],b-c[2])<58))near++;if(background&&Math.hypot(r-background[0],g-background[1],b-background[2])<42)backgroundNear++;}
      const colored=ink?Math.round(near/ink*100):0,backgroundPct=Math.round(backgroundNear/sampled*100),transparencyPct=Math.round(transparent/sampled*100),notes=[];
      if(colored<65)notes.push("بخشی از رنگ‌های تصویر با پالت انتخابی فاصله دارد؛ نتیجه را دستی بررسی کن.");
      if(backgroundPct<55)notes.push("رنگ زمینه با رنگ پس‌زمینه انتخاب‌شده تطابق کافی ندارد.");
      if(transparencyPct>2)notes.push("تصویر دارای پیکسل‌های شفاف است.");
      if(!notes.length)notes.push("کنترل پایه رنگ و زمینه قابل‌قبول است؛ این بررسی درباره زیبایی یا معنای لوگو قضاوت نمی‌کند.");
      return{width:img.naturalWidth,height:img.naturalHeight,colored,backgroundPct,notes};
    }catch(_){return{width:img.naturalWidth,height:img.naturalHeight,colored:null,backgroundPct:null,notes:["مرورگر اجازه خواندن پیکسل‌های تصویر را نداد؛ بررسی فنی انجام نشد."]};}
  }
  function addQualityPanel(card,img,data){
    const panel=document.createElement("div");panel.className="logo-ai-visual-review";
    const heading=document.createElement("strong");heading.textContent="کنترل فنی تصویر (بدون امتیازدهی سلیقه‌ای)";
    const render=report=>{panel.replaceChildren(heading);const details=document.createElement("p");details.textContent="ابعاد: "+report.width+"×"+report.height+" · انطباق رنگ نمونه‌برداری‌شده: "+(report.colored===null?"نامشخص":report.colored+"٪")+" · انطباق زمینه: "+(report.backgroundPct===null?"نامشخص":report.backgroundPct+"٪");panel.appendChild(details);report.notes.forEach(note=>{const p=document.createElement("p");p.textContent=note;panel.appendChild(p);});};
    if(img.complete&&img.naturalWidth)render(analyzeImage(img,data));else img.addEventListener("load",()=>render(analyzeImage(img,data)),{once:true});
    img.addEventListener("error",()=>render({width:0,height:0,colored:null,whitePct:null,notes:["بارگذاری تصویر ناموفق بود."]}),{once:true});card.appendChild(panel);
  }
  function addPreferenceFeedback(card,image){
    const wrap=document.createElement("div");wrap.className="logo-ai-feedback";const label=document.createElement("strong");label.textContent="نظرت درباره این مسیر طراحی چیست؟";
    let saved={};try{saved=JSON.parse(localStorage.getItem(feedbackKey)||"{}");}catch(_){}
    [["like","می‌پسندم"],["dislike","نمی‌پسندم"]].forEach(([value,title])=>{const button=document.createElement("button");button.type="button";button.className="btn-secondary";button.textContent=(saved[image.directionId]===value?"✓ ":"")+title;button.setAttribute("aria-pressed",String(saved[image.directionId]===value));button.addEventListener("click",()=>{let current={};try{current=JSON.parse(localStorage.getItem(feedbackKey)||"{}");}catch(_){}current[image.directionId]=value;try{localStorage.setItem(feedbackKey,JSON.stringify(current));}catch(_){}wrap.querySelectorAll("button").forEach(b=>{b.setAttribute("aria-pressed","false");b.textContent=b.textContent.replace(/^✓ /,"");});button.setAttribute("aria-pressed","true");button.textContent="✓ "+title;});wrap.appendChild(button);});
    wrap.prepend(label);card.appendChild(wrap);
  }
  function buildCard(image,index,data) {
    const card=document.createElement("article");card.className="logo-concept-card logo-ai-card";
    const preview=document.createElement("div");preview.className="logo-concept-preview logo-ai-preview";
    const img=document.createElement("img");img.src=image.url;img.alt="کانسپت "+image.concept+" برای برند "+data.brandName;
    img.loading="lazy";img.decoding="async";img.referrerPolicy="no-referrer";
    preview.appendChild(img);card.appendChild(preview);
    addTextLockup(card,data);
    addQualityPanel(card,img,data);
    addPreferenceFeedback(card,image);
    const copy=document.createElement("div");copy.className="logo-concept-copy";
    const title=document.createElement("h3");title.textContent=image.concept||("کانسپت "+(index+1));
    const desc=document.createElement("p");desc.textContent=image.description||"منطق این مسیر طراحی از بریف برند استخراج شده است.";
    const visual=document.createElement("p");visual.className="logo-concept-visual-direction";
    visual.textContent=image.visualDirection||"ساختار بصری بر اساس مسیر هنری انتخاب‌شده شکل گرفته است.";
    const rubric=document.createElement("div");rubric.className="logo-ai-rubric";
    ["ساختار متمایز","ارتباط با بریف","خوانایی در اندازه کوچک","رعایت پالت انتخابی"].forEach(label=>{
      const item=document.createElement("span");item.textContent=label;rubric.appendChild(item);
    });
    copy.append(title,desc,visual);
    if(image.review){
      const review=document.createElement("div");review.className="logo-ai-visual-review";
      const score=document.createElement("strong");score.textContent="ارزیابی تصویری: "+image.review.overall+"/۱۰";
      const details=document.createElement("p");
      details.textContent="ارتباط با برند: "+image.review.relevance+"/۱۰ · تمایز: "+image.review.distinctiveness+"/۱۰ · رنگ: "+image.review.palette+"/۱۰ · خوانایی: "+image.review.legibility+"/۱۰";
      const strengths=document.createElement("p");strengths.textContent="نقطه قوت: "+(image.review.strengths||"مشخص نشده");
      const issues=document.createElement("p");issues.textContent="نیاز به اصلاح: "+(image.review.issues||"موردی گزارش نشده");
      const recommendation=document.createElement("p");recommendation.textContent="پیشنهاد: "+(image.review.recommendation||"—");
      review.append(score,details,strengths,issues,recommendation);copy.appendChild(review);
    }
    copy.append(rubric);card.appendChild(copy);
    const actions=document.createElement("div");actions.className="logo-concept-actions";
    const button=document.createElement("button");button.type="button";button.className="btn-primary";
    button.textContent="دریافت لوگو با نام برند (PNG)";
    button.addEventListener("click",()=>downloadPng(image.url,data,index));
    actions.appendChild(button);card.appendChild(actions);
    return card;
  }
  fields.palette.addEventListener("change",()=>{customColors.hidden=fields.palette.value!=="custom";});
  form.addEventListener("reset",()=>setTimeout(()=>{customColors.hidden=fields.palette.value!=="custom";},0));
  async function requestLogo() {
    const data=readData();
    if(!data.brandName){status.textContent="نام برند را وارد کن.";fields.name.focus();return;}
    let token="";
    try { token=localStorage.getItem("nava_navi_session")||sessionStorage.getItem("nava_navi_session")||""; } catch (_) {}
    let visitorId="";
    if(!token){
      try { visitorId=localStorage.getItem("nava_guest_trial_id")||""; } catch (_) {}
      if(!/^[a-f0-9-]{32,40}$/i.test(visitorId)){
        visitorId=typeof crypto.randomUUID==="function"?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,"0")).join("");
        try { localStorage.setItem("nava_guest_trial_id",visitorId); } catch (_) {}
      }
    }
    const headers={"Content-Type":"application/json"};
    if(token)headers.Authorization="Bearer "+token;
    const submit=form.querySelector('button[type="submit"]');
    submit.disabled=true;submit.textContent="NAVI در حال طراحی لوگو...";
    status.textContent="NAVI در حال تحلیل بریف است؛ سپس موتور تصویر سه طرح واقعی و متفاوت می‌سازد. این مرحله ممکن است کمی زمان ببرد.";
    try {
      const response=await fetch("https://nava-music-api.honrrpower.workers.dev/logo/generate",{
        method:"POST",headers,cache:"no-store",
        body:JSON.stringify({...data,visitorId})
      });
      const result=await response.json();
      if(!response.ok||!result.success)throw new Error(result.error||"ساخت لوگو انجام نشد.");
      results.replaceChildren();
      if(result.planning){
        const strategy=document.createElement("section");strategy.className="logo-ai-strategy-summary";
        const heading=document.createElement("h3");heading.textContent="مسیر طراحی انتخاب‌شده توسط NAVI";
        const core=document.createElement("p");core.textContent=result.planning.brandCore||"";
        const detail=document.createElement("p");detail.textContent=result.planning.strategy||"";
        strategy.append(heading,core,detail);results.appendChild(strategy);
      }
      result.images.forEach((image,index)=>results.appendChild(buildCard(image,index,data)));
      empty.hidden=true;
      status.textContent="سه تصویر لوگو آماده شد. نام و شعار فارسی جدا از تصویر و با متن دقیق اضافه شده‌اند.";
      results.scrollIntoView({behavior:"smooth",block:"start"});
    } catch(error) {
      status.textContent=error.message||"ساخت لوگو ناموفق بود؛ کمی بعد دوباره تلاش کن.";
    } finally {
      submit.disabled=false;submit.textContent="طراحی لوگو با NAVI";
    }
  }

  form.addEventListener("submit",event=>{event.preventDefault();requestLogo();});

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
