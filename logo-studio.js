"use strict";
(function initNavaLogoStudio() {
  const form=document.getElementById("logoStudioForm");
  if(!form)return;
  const nameInput=document.getElementById("logoBrandName");
  const sloganInput=document.getElementById("logoSlogan");
  const industryInput=document.getElementById("logoIndustry");
  const audienceInput=document.getElementById("logoAudience");
  const personalityInput=document.getElementById("logoPersonality");
  const formatInput=document.getElementById("logoFormat");
  const paletteInput=document.getElementById("logoPalette");
  const results=document.getElementById("logoConceptResults");
  const status=document.getElementById("logoStudioStatus");
  const empty=document.getElementById("logoStudioEmpty");
  const palettes={
    gold:{main:"#c99b48",dark:"#172238",light:"#f4e6c8",name:"طلایی و سرمه‌ای"},
    blue:{main:"#2879c7",dark:"#102b46",light:"#dceeff",name:"آبی و نقره‌ای"},
    green:{main:"#39866d",dark:"#173b32",light:"#d9eee5",name:"سبز و کرم"},
    violet:{main:"#8061b2",dark:"#302347",light:"#eee5fb",name:"بنفش و یاسی"},
    mono:{main:"#292929",dark:"#111111",light:"#eeeeee",name:"تک‌رنگ"}
  };
  const escapeHtml=value=>String(value||"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const escapeXml=escapeHtml;
  function initials(value){
    const words=String(value||"").trim().split(/\s+/).filter(Boolean);
    if(!words.length)return "ن";
    return words.length>1?Array.from(words[0])[0]+Array.from(words[1])[0]:Array.from(words[0]).slice(0,2).join("");
  }
  function symbolMarkup(kind,color,dark){
    if(kind===0)return '<circle cx="450" cy="170" r="88" fill="none" stroke="'+color+'" stroke-width="9"/><circle cx="450" cy="170" r="70" fill="'+dark+'"/><path d="M450 104 L466 153 L516 170 L466 187 L450 236 L434 187 L384 170 L434 153 Z" fill="'+color+'" opacity=".95"/>';
    if(kind===1)return '<path d="M450 68 L548 170 L450 272 L352 170 Z" fill="none" stroke="'+color+'" stroke-width="12" stroke-linejoin="round"/><path d="M450 104 L512 170 L450 236 L388 170 Z" fill="'+color+'" opacity=".18"/><circle cx="450" cy="170" r="23" fill="'+color+'"/><path d="M450 112 V228 M392 170 H508" stroke="'+dark+'" stroke-width="8" stroke-linecap="round"/>';
    return '<path d="M374 220 C350 142 408 84 468 92 C524 100 552 148 526 208 C501 264 431 280 385 238" fill="none" stroke="'+color+'" stroke-width="16" stroke-linecap="round"/><path d="M410 202 L450 126 L490 202" fill="none" stroke="'+color+'" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><circle cx="450" cy="202" r="9" fill="'+dark+'"/>';
  }
  function createSvg(data,kind){
    const name=escapeXml(data.name), slogan=escapeXml(data.slogan), letters=escapeXml(initials(data.name)), p=data.palette;
    let mark="";
    if(data.format==="wordmark"&&kind===2){
      mark='<text x="450" y="190" text-anchor="middle" font-size="92" font-weight="700" fill="'+p.main+'" font-family="Tahoma, Arial, sans-serif">'+name+'</text>';
    }else if(data.format==="monogram"&&kind===1){
      mark='<circle cx="450" cy="170" r="92" fill="'+p.dark+'"/><circle cx="450" cy="170" r="83" fill="none" stroke="'+p.main+'" stroke-width="8"/><text x="450" y="200" text-anchor="middle" font-size="82" font-weight="700" fill="'+p.light+'" font-family="Tahoma, Arial, sans-serif">'+letters+'</text>';
    }else{
      mark=symbolMarkup(kind,p.main,p.dark)+'<text x="450" y="190" text-anchor="middle" font-size="52" font-weight="700" fill="'+p.light+'" font-family="Tahoma, Arial, sans-serif">'+letters+'</text>';
    }
    const nameY=data.format==="wordmark"&&kind===2?315:365;
    const label=data.format==="wordmark"&&kind===2?"":'<text x="450" y="320" text-anchor="middle" font-size="13" letter-spacing="5" fill="'+p.main+'" font-family="Arial, sans-serif">BRAND IDENTITY</text>';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560" role="img" aria-label="پیشنهاد لوگوی '+name+'"><rect width="900" height="560" rx="34" fill="#ffffff"/><g>'+mark+'</g>'+label+'<text x="450" y="'+nameY+'" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-size="48" font-weight="700" fill="'+p.dark+'" font-family="Tahoma, Arial, sans-serif">'+name+'</text>'+(slogan?'<text x="450" y="'+(nameY+54)+'" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-size="22" fill="#687386" font-family="Tahoma, Arial, sans-serif">'+slogan+'</text>':"")+'</svg>';
  }
  function descriptionFor(personality,kind){
    const styles={
      minimal:["نشان ساده و متمرکز با جزئیات کم","ساختار هندسی متعادل و مدرن","تأکید بر تایپوگرافی و خوانایی"],
      bold:["نشان پرقدرت با کنتراست بالا","فرم هندسی جسور و قابل تشخیص","نوشتار برجسته و مستقیم"],
      elegant:["ترکیب متقارن و ظریف","فرم نمادین با حس لوکس","لوگوتایپ آرام و شکیل"],
      friendly:["فرم نرم و صمیمی","نماد پویا با گوشه‌های ملایم","نوشتار ساده و نزدیک به مخاطب"],
      tech:["نشان دقیق و ساختارمند","هندسه مدرن با حس فناوری","لوگوتایپ مینیمال و آینده‌نگر"]
    };
    return (styles[personality]||styles.minimal)[kind];
  }
  function safeFileName(value){
    return String(value||"nava-logo").trim().replace(/[^\p{L}\p{N}-]+/gu,"-").replace(/^-+|-+$/g,"")||"nava-logo";
  }
  function downloadSvg(svg,name,kind){
    const blob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"}), url=URL.createObjectURL(blob), link=document.createElement("a");
    link.href=url;link.download=safeFileName(name)+"-concept-"+(kind+1)+".svg";link.click();URL.revokeObjectURL(url);
  }
  function downloadPng(svg,name,kind){
    const blob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"}),url=URL.createObjectURL(blob),img=new Image();
    img.onload=()=>{
      const canvas=document.createElement("canvas");canvas.width=1800;canvas.height=1120;
      const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);
      canvas.toBlob(png=>{
        if(!png){status.textContent="ساخت فایل PNG انجام نشد؛ خروجی SVG همچنان در دسترس است.";return;}
        const pngUrl=URL.createObjectURL(png),link=document.createElement("a");link.href=pngUrl;link.download=safeFileName(name)+"-concept-"+(kind+1)+".png";link.click();URL.revokeObjectURL(pngUrl);
      },"image/png");
    };
    img.onerror=()=>{URL.revokeObjectURL(url);status.textContent="مرورگر نتوانست پیش‌نمایش را به PNG تبدیل کند.";};
    img.src=url;
  }
  function buildCard(data,kind,title){
    const card=document.createElement("article");card.className="logo-concept-card";
    const svg=createSvg(data,kind);
    card.innerHTML='<div class="logo-concept-preview">'+svg+'</div><div class="logo-concept-copy"><div><span class="logo-concept-kicker">CONCEPT 0'+(kind+1)+'</span><h3>'+escapeHtml(title)+'</h3></div><p>'+escapeHtml(descriptionFor(data.personality,kind))+'</p><span class="logo-concept-palette">'+escapeHtml(data.palette.name)+'</span></div><div class="logo-concept-actions"><button type="button" class="btn-secondary" data-download="svg">دریافت SVG</button><button type="button" class="btn-primary" data-download="png">دریافت PNG</button></div>';
    card.querySelector('[data-download="svg"]').addEventListener("click",()=>downloadSvg(svg,data.name,kind));
    card.querySelector('[data-download="png"]').addEventListener("click",()=>downloadPng(svg,data.name,kind));
    return card;
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const name=nameInput.value.trim();
    if(!name){status.textContent="برای شروع، نام برند را وارد کن.";nameInput.focus();return;}
    const data={
      name,slogan:sloganInput.value.trim(),industry:industryInput.value.trim(),audience:audienceInput.value.trim(),
      personality:personalityInput.value,format:formatInput.value,palette:palettes[paletteInput.value]||palettes.gold
    };

    let trialData;
    try {
      const token = sessionStorage.getItem("nava_navi_session") || "";
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = "Bearer " + token;
      let visitorId = "";
      if (!token) {
        visitorId = localStorage.getItem("nava_guest_trial_id") || "";
        if (!/^[a-f0-9-]{32,40}$/i.test(visitorId)) {
          visitorId = typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
          localStorage.setItem("nava_guest_trial_id", visitorId);
        }
      }
      const trialResponse = await fetch("https://nava-music-api.honrrpower.workers.dev/navi-guest-trial", {
        method: "POST",
        headers,
        body: JSON.stringify({ studio: "logo", visitorId }),
        cache: "no-store"
      });
      trialData = await trialResponse.json();
      if (!trialResponse.ok || !trialData.success) {
        status.textContent = trialData.error || "برای ادامه، ابتدا وارد حساب نوا شو.";
        if (trialResponse.status === 401 || trialResponse.status === 429) {
          if (typeof window.openNaviAssistant === "function") {
            window.openNaviAssistant({
              service: "طراحی لوگو",
              context: {
                brandName: data.name,
                slogan: data.slogan,
                industry: data.industry,
                audience: data.audience,
                personality: data.personality,
                format: data.format,
                palette: data.palette.name
              }
            });
          }
        }
        return;
      }
    } catch (error) {
      status.textContent = "فعلاً امکان بررسی سهمیه مهمان وجود ندارد. برای جلوگیری از ثبت نادرست سهمیه، ساخت طرح انجام نشد؛ کمی بعد دوباره تلاش کن.";
      return;
    }

    results.replaceChildren();
    ["نشان امضایی","نشان هندسی","لوگوتایپ"].forEach((title,index)=>results.appendChild(buildCard(data,index,title)));
    empty.hidden=true;
    status.textContent = trialData.remaining === null || trialData.remaining === undefined
      ? "سه مسیر اولیه آماده شد. آن‌ها را مقایسه کن و خروجی دلخواهت را دریافت کن."
      : "سه مسیر اولیه آماده شد. " + trialData.remaining + " فرصت آزمایشی دیگر داری.";
    results.scrollIntoView({behavior:"smooth",block:"start"});
  });
  document.getElementById("logoBriefToNavi")?.addEventListener("click",()=>{
    const context={
      brandName:nameInput.value.trim(),
      slogan:sloganInput.value.trim(),
      industry:industryInput.value.trim(),
      audience:audienceInput.value.trim(),
      personality:personalityInput.options[personalityInput.selectedIndex].text,
      format:formatInput.options[formatInput.selectedIndex].text,
      palette:(palettes[paletteInput.value]||palettes.gold).name
    };
    const message="می‌خواهم بریف برندم را بررسی کنیم و قبل از نهایی‌کردن لوگو، سه مسیر مفهومی واقعاً متفاوت پیشنهاد بدهی. اول نقاط قوت و ضعف اطلاعات فعلی را بگو و اگر اطلاعات مهمی کم است از من سؤال کن.";
    if(typeof window.openNaviAssistant==="function"){
      window.openNaviAssistant({service:"طراحی لوگو",context,message});
      return;
    }
    const composer=document.getElementById("userRequest"),selector=document.getElementById("serviceSelect");
    if(composer)composer.value=message+"\n\n"+Object.entries(context).map(([key,value])=>key+": "+value).join("\n");
    if(selector)selector.value="طراحی لوگو";
    document.getElementById("naviWidgetToggle")?.click();
  });
})();