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
  const palettes = {
    gold:{main:"#c99b48",dark:"#172238",light:"#f4e6c8",preview:"#172238",name:"طلایی و سرمه‌ای"},
    blue:{main:"#7bb9ed",dark:"#17334e",light:"#e5f2ff",preview:"#edf4fa",name:"آبی و نقره‌ای"},
    green:{main:"#78b69b",dark:"#193d32",light:"#e3f2e9",preview:"#edf4ef",name:"سبز و کرم"},
    violet:{main:"#a98bd4",dark:"#332449",light:"#f0e8fa",preview:"#f2eef8",name:"بنفش و یاسی"},
    mono:{main:"#252525",dark:"#111111",light:"#f4f4f4",preview:"#eeeeee",name:"تک‌رنگ"}
  };
  const escapeXml = value => String(value || "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[ch]));
  const safeFileName = value => String(value || "nava-logo").trim().replace(/[^\p{L}\p{N}-]+/gu,"-").replace(/^-+|-+$/g,"") || "nava-logo";
  const initials = value => {
    const words=String(value||"").trim().split(/\s+/).filter(Boolean);
    if(!words.length)return "ن";
    return words.length>1?words.slice(0,2).map(word=>Array.from(word)[0]).join(""):Array.from(words[0]).slice(0,2).join("");
  };
  function readData() {
    const selected = palettes[fields.palette.value] || palettes.gold;
    const palette = fields.palette.value === "custom"
      ? {...selected,main:fields.primaryColor.value,dark:fields.darkColor.value,preview:"#f2f1ed",name:"رنگ اختصاصی"}
      : selected;
    return {
      name:fields.name.value.trim(), slogan:fields.slogan.value.trim(),
      industry:fields.industry.value.trim(), audience:fields.audience.value.trim(),
      symbolIdea:fields.symbolIdea.value.trim(), personality:fields.personality.value,
      typography:fields.typography.value, format:fields.format.value, palette
    };
  }
  function textStyle(data, size, fill, weight) {
    const family = data.typography === "elegant"
      ? 'Georgia, "Times New Roman", Tahoma, serif'
      : 'Vazirmatn, "IRANSans", Tahoma, Arial, sans-serif';
    return 'font-family="'+family+'" font-size="'+size+'" font-weight="'+weight+'" fill="'+fill+'" direction="rtl" unicode-bidi="plaintext"';
  }
  function mark(data, variant) {
    const p=data.palette, letter=escapeXml(initials(data.name));
    const stroke=data.personality==="elegant"?7:data.personality==="bold"?15:10;
    if (data.format === "monogram") {
      if (variant===0) return '<circle cx="450" cy="185" r="112" fill="none" stroke="'+p.main+'" stroke-width="'+stroke+'"/><text x="450" y="218" text-anchor="middle" '+textStyle(data,94,p.dark,700)+'>'+letter+'</text>';
      if (variant===1) return '<path d="M450 75 L555 185 L450 295 L345 185 Z" fill="'+p.dark+'"/><path d="M450 93 L538 185 L450 277 L362 185 Z" fill="none" stroke="'+p.main+'" stroke-width="9"/><text x="450" y="216" text-anchor="middle" '+textStyle(data,76,p.light,700)+'>'+letter+'</text>';
      return '<text x="450" y="220" text-anchor="middle" '+textStyle(data,142,p.main,700)+'>'+letter+'</text><path d="M320 255 H580" stroke="'+p.dark+'" stroke-width="5" stroke-linecap="round"/>';
    }
    if (variant===0) return '<circle cx="450" cy="178" r="112" fill="none" stroke="'+p.main+'" stroke-width="'+stroke+'"/><circle cx="450" cy="178" r="91" fill="none" stroke="'+p.main+'" stroke-width="2" opacity=".55"/><path d="M450 92 L470 155 L536 178 L470 201 L450 264 L430 201 L364 178 L430 155 Z" fill="'+p.main+'"/><circle cx="450" cy="178" r="14" fill="'+p.dark+'"/>';
    if (variant===1) return '<path d="M450 65 L558 175 L450 285 L342 175 Z" fill="'+p.dark+'"/><path d="M450 91 L532 175 L450 259 L368 175 Z" fill="none" stroke="'+p.main+'" stroke-width="9"/><path d="M450 120 V230 M395 175 H505" stroke="'+p.main+'" stroke-width="12" stroke-linecap="round"/>';
    return '<path d="M350 238 C335 160 389 91 458 88 C524 86 568 140 550 205 C532 270 454 298 389 262" fill="none" stroke="'+p.main+'" stroke-width="17" stroke-linecap="round"/><path d="M405 221 L450 132 L495 221" fill="none" stroke="'+p.dark+'" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><circle cx="450" cy="221" r="8" fill="'+p.main+'"/>';
  }
  function createSvg(data, variant) {
    const p=data.palette, name=escapeXml(data.name), slogan=escapeXml(data.slogan);
    const markUp=mark(data,variant);
    let content="";
    if (data.format === "wordmark") {
      if (variant===0) {
        content='<circle cx="450" cy="145" r="7" fill="'+p.main+'"/><text x="450" y="255" text-anchor="middle" '+textStyle(data,112,p.dark,700)+'>'+name+'</text><path d="M290 300 H610" stroke="'+p.main+'" stroke-width="7" stroke-linecap="round"/>';
      } else if (variant===1) {
        content='<text x="450" y="235" text-anchor="middle" '+textStyle(data,88,p.dark,700)+'>'+name+'</text><path d="M270 270 Q450 315 630 270" fill="none" stroke="'+p.main+'" stroke-width="8" stroke-linecap="round"/>';
      } else {
        content='<path d="M300 160 H600" stroke="'+p.main+'" stroke-width="2"/><text x="450" y="245" text-anchor="middle" '+textStyle(data,104,p.dark,700)+'>'+name+'</text><path d="M350 285 H550" stroke="'+p.main+'" stroke-width="5" stroke-linecap="round"/>';
      }
      if(slogan)content+='<text x="450" y="365" text-anchor="middle" '+textStyle(data,24,"#687386",400)+'>'+slogan+'</text>';
      return '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560" role="img" aria-label="لوگوتایپ '+name+'">'+content+'</svg>';
    }
    if (data.format === "monogram") {
      if (variant===0) {
        content='<g>'+markUp+'</g><text x="450" y="390" text-anchor="middle" '+textStyle(data,50,p.dark,700)+'>'+name+'</text>';
      } else if (variant===1) {
        content='<g transform="translate(-285 0)">'+markUp+'</g><text x="650" y="190" text-anchor="end" '+textStyle(data,58,p.dark,700)+'>'+name+'</text><path d="M620 230 H300" stroke="'+p.main+'" stroke-width="5" stroke-linecap="round"/>';
      } else {
        content='<g transform="translate(0 -28)">'+markUp+'</g><text x="450" y="390" text-anchor="middle" '+textStyle(data,28,p.main,700)+'>'+name+'</text>';
      }
      if(slogan)content+='<text x="450" y="455" text-anchor="middle" '+textStyle(data,22,"#687386",400)+'>'+slogan+'</text>';
      return '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560" role="img" aria-label="مونوگرام '+name+'">'+content+'</svg>';
    }
    if (variant===0) {
      content='<g>'+markUp+'</g><path d="M300 330 H600" stroke="'+p.main+'" stroke-width="2" opacity=".7"/><text x="450" y="400" text-anchor="middle" '+textStyle(data,58,p.dark,700)+'>'+name+'</text>';
      if(slogan)content+='<text x="450" y="450" text-anchor="middle" '+textStyle(data,23,"#687386",400)+'>'+slogan+'</text>';
    } else if (variant===1) {
      content='<g transform="translate(-285 0)">'+markUp+'</g><text x="650" y="190" text-anchor="end" '+textStyle(data,60,p.dark,700)+'>'+name+'</text>';
      content+='<path d="M620 230 H300" stroke="'+p.main+'" stroke-width="5" stroke-linecap="round"/>';
      if(slogan)content+='<text x="650" y="280" text-anchor="end" '+textStyle(data,22,"#687386",400)+'>'+slogan+'</text>';
    } else {
      content='<text x="450" y="245" text-anchor="middle" '+textStyle(data,112,p.dark,700)+'>'+name+'</text><path d="M245 285 Q450 325 655 285" fill="none" stroke="'+p.main+'" stroke-width="9" stroke-linecap="round"/>';
      if(slogan)content+='<text x="450" y="365" text-anchor="middle" '+textStyle(data,25,"#687386",400)+'>'+slogan+'</text>';
      content+='<circle cx="450" cy="150" r="8" fill="'+p.main+'"/>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560" role="img" aria-label="کانسپت لوگوی '+name+'">'+content+'</svg>';
  }
  function downloadSvg(svg,name,index) {
    const blob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download=safeFileName(name)+"-concept-"+(index+1)+".svg";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function downloadPng(svg,name,index) {
    const blob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"}),url=URL.createObjectURL(blob),img=new Image();
    img.onload=()=>{
      const canvas=document.createElement("canvas");canvas.width=1800;canvas.height=1120;
      const ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);
      canvas.toBlob(png=>{
        if(!png){status.textContent="ساخت فایل PNG انجام نشد؛ خروجی SVG همچنان در دسترس است.";return;}
        const pngUrl=URL.createObjectURL(png),link=document.createElement("a");link.href=pngUrl;link.download=safeFileName(name)+"-concept-"+(index+1)+".png";link.click();setTimeout(()=>URL.revokeObjectURL(pngUrl),1000);
      },"image/png");
    };
    img.onerror=()=>{URL.revokeObjectURL(url);status.textContent="مرورگر نتوانست پیش‌نمایش را به PNG تبدیل کند.";};
    img.src=url;
  }
  function buildCard(data,index,title,description) {
    const card=document.createElement("article");card.className="logo-concept-card";
    const svg=createSvg(data,index);
    const preview=document.createElement("div");preview.className="logo-concept-preview";preview.style.background=data.palette.preview;preview.innerHTML=svg;
    const copy=document.createElement("div");copy.className="logo-concept-copy";
    const head=document.createElement("div");head.innerHTML='<span class="logo-concept-kicker">CONCEPT 0'+(index+1)+'</span><h3>'+title+'</h3>';
    const desc=document.createElement("p");desc.textContent=description;
    const meta=document.createElement("span");meta.className="logo-concept-palette";meta.textContent=data.palette.name+" · "+(data.symbolIdea||"مفهوم آزاد");
    copy.append(head,desc,meta);
    const actions=document.createElement("div");actions.className="logo-concept-actions";
    const svgButton=document.createElement("button");svgButton.type="button";svgButton.className="btn-secondary";svgButton.textContent="دریافت SVG";svgButton.addEventListener("click",()=>downloadSvg(svg,data.name,index));
    const pngButton=document.createElement("button");pngButton.type="button";pngButton.className="btn-primary";pngButton.textContent="دریافت PNG";pngButton.addEventListener("click",()=>downloadPng(svg,data.name,index));
    actions.append(svgButton,pngButton);card.append(preview,copy,actions);return card;
  }
  fields.palette.addEventListener("change",()=>{customColors.hidden=fields.palette.value!=="custom";});
  form.addEventListener("reset",()=>setTimeout(()=>{customColors.hidden=fields.palette.value!=="custom";},0));
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const data=readData();
    if(!data.name){status.textContent="برای شروع، نام برند را وارد کن.";fields.name.focus();return;}
    status.textContent="در حال بررسی سهمیه و آماده‌سازی کانسپت‌ها...";
    let trialData;
    try {
      const token=sessionStorage.getItem("nava_navi_session")||"",headers={"Content-Type":"application/json"};
      if(token)headers.Authorization="Bearer "+token;
      let visitorId="";
      if(!token){
        visitorId=localStorage.getItem("nava_guest_trial_id")||"";
        if(!/^[a-f0-9-]{32,40}$/i.test(visitorId)){
          visitorId=typeof crypto.randomUUID==="function"?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,"0")).join("");
          localStorage.setItem("nava_guest_trial_id",visitorId);
        }
      }
      const response=await fetch("https://nava-music-api.honrrpower.workers.dev/navi-guest-trial",{method:"POST",headers,body:JSON.stringify({studio:"logo",visitorId}),cache:"no-store"});
      trialData=await response.json();
      if(!response.ok||!trialData.success){
        status.textContent=trialData.error||"برای ادامه، ابتدا وارد حساب نوا شو.";
        if((response.status===401||response.status===429)&&typeof window.openNaviAssistant==="function"){
          window.openNaviAssistant({service:"طراحی لوگو",context:{brandName:data.name,slogan:data.slogan,industry:data.industry,audience:data.audience,symbolIdea:data.symbolIdea,personality:data.personality,typography:data.typography,format:data.format,palette:data.palette.name}});
        }
        return;
      }
    } catch(error) {
      status.textContent="فعلاً امکان بررسی سهمیه وجود ندارد؛ برای جلوگیری از ثبت نادرست سهمیه، ساخت طرح انجام نشد. کمی بعد دوباره تلاش کن.";
      return;
    }
    results.replaceChildren();
    const concepts=[
      ["نشان امضایی","نشان مستقل و متقارن؛ مناسب آیکن، مهر و تصویر پروفایل."],
      ["ترکیب افقی","نماد و نام برند در یک ردیف؛ مناسب سربرگ، وب‌سایت و امضا."],
      ["لوگوتایپ","تمرکز بر نام برند و ریتم نوشتار؛ مناسب هویت نوشتاری." ]
    ];
    concepts.forEach((item,index)=>results.appendChild(buildCard(data,index,item[0],item[1])));
    empty.hidden=true;
    status.textContent=trialData.remaining===null||trialData.remaining===undefined
      ?"سه کانسپت آماده شد. نسخه‌ها را مقایسه کن؛ پیش از استفاده تجاری، تناسب و یکتایی طرح را بررسی کن."
      :"سه کانسپت آماده شد. "+trialData.remaining+" فرصت آزمایشی دیگر داری.";
    results.scrollIntoView({behavior:"smooth",block:"start"});
  });
  $("logoBriefToNavi")?.addEventListener("click",()=>{
    const data=readData();
    const context={
      brandName:data.name,slogan:data.slogan,industry:data.industry,audience:data.audience,
      symbolIdea:data.symbolIdea,personality:fields.personality.selectedOptions[0].textContent,
      typography:fields.typography.selectedOptions[0].textContent,
      format:fields.format.selectedOptions[0].textContent,palette:data.palette.name
    };
    const message="بریف طراحی لوگوی من را مثل یک مدیر هنری بررسی کن. سه مسیر بصری متمایز و قابل اجرا پیشنهاد بده؛ برای هر مسیر ایده نماد، منطق تایپوگرافی فارسی، ترکیب‌بندی، کاربردپذیری در اندازه کوچک و نقاط قوت/ضعف را مشخص کن. اگر اطلاعات مهمی کم است، پیش از جمع‌بندی سؤال بپرس.";
    if(typeof window.openNaviAssistant==="function"){window.openNaviAssistant({service:"طراحی لوگو",context,message});return;}
    const composer=$("userRequest"),selector=$("serviceSelect");
    if(composer)composer.value=message+"\n\n"+Object.entries(context).map(([key,value])=>key+": "+value).join("\n");
    if(selector)selector.value="طراحی لوگو";
    $("naviWidgetToggle")?.click();
  });
})();
