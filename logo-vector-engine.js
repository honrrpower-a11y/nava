"use strict";
(function(){
  const form=document.getElementById("logoStudioForm");
  if(!form || document.getElementById("navaVectorEngine")) return;
  const $=id=>document.getElementById(id), results=$("logoConceptResults"), status=$("logoStudioStatus");
  const fields={name:$("logoBrandName"),slogan:$("logoSlogan"),industry:$("logoIndustry"),idea:$("logoSymbolIdea"),format:$("logoFormat"),palette:$("logoPalette"),primary:$("logoPrimaryColor"),dark:$("logoDarkColor"),personality:$("logoPersonality"),type:$("logoTypography")};
  const palettes={gold:["#C9A24A","#101D35"],blue:["#3F70A8","#DCE4ED"],green:["#356B55","#E9E1CE"],violet:["#7656A6","#DCCEF0"],mono:["#22252B","#FFFFFF"],custom:[fields.primary.value,fields.dark.value]};
  const esc=s=>String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const hash=s=>{let h=2166136261;for(const c of s){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;};
  function symbol(seed,kind,a,b){
    if(/موج|دریا|آب|wave|sea/i.test(kind)) return '<path d="M-48 0 Q-24 -28 0 0 T48 0 M-38 23 Q-18 3 2 23 T40 23" fill="none" stroke="'+a+'" stroke-width="9" stroke-linecap="round"/>';
    if(/رشد|برگ|طبیعت|leaf|grow|eco/i.test(kind)) return '<path d="M-4 42 C-52 10 -31 -42 38 -43 C43 20 13 43 -4 42Z" fill="'+a+'"/><path d="M-28 27 Q2 -2 27 -28" stroke="'+b+'" stroke-width="6" fill="none"/>';
    if(/نور|خورشید|ستاره|light|sun|star/i.test(kind)) return '<path d="M0 -49 L11 -12 L48 0 L11 12 L0 49 L-11 12 L-48 0 L-11 -12Z" fill="'+a+'"/><circle r="10" fill="'+b+'"/>';
    if(/فناوری|دیجیتال|هوش|tech|digital/i.test(kind)) return '<path d="M0 -43 L39 -21 L39 22 L0 44 L-39 22 L-39 -21Z" fill="none" stroke="'+a+'" stroke-width="9"/><circle r="13" fill="'+b+'"/>';
    const sides=seed%2?6:8, pts=[];for(let i=0;i<sides;i++){const t=2*Math.PI*i/sides-Math.PI/2,r=i%2?34:48;pts.push((Math.cos(t)*r)+","+(Math.sin(t)*r));}
    return '<polygon points="'+pts.join(" ")+'" fill="'+a+'" stroke="'+a+'" stroke-width="5"/><circle r="14" fill="'+b+'"/>';
  }
  function svg(data,n){
    const colors=palettes[fields.palette.value]||palettes.gold,a=colors[0],b=colors[1],first=esc(Array.from(data.name)[0]||"N"),name=esc(data.name),slogan=esc(data.slogan),seed=hash(data.name+data.idea+n);
    const isWord=fields.format.value==="wordmark",isMono=fields.format.value==="monogram",font=fields.type.value==="elegant"?"serif":"Tahoma,Arial,sans-serif";
    let mark=""; if(!isWord){
      const art=isMono?'<text text-anchor="middle" dominant-baseline="central" font-size="108" font-weight="700" fill="'+(n===1?b:a)+'" font-family="'+font+'">'+first+'</text>':symbol(seed,data.idea+" "+data.industry,a,b);
      if(n===0) mark='<circle cx="250" cy="190" r="92" fill="none" stroke="'+a+'" stroke-width="6"/><g transform="translate(250 190) rotate('+(seed%23-11)+')">'+art+'</g>';
      if(n===1) mark='<rect x="164" y="104" width="172" height="172" rx="38" transform="rotate(45 250 190)" fill="none" stroke="'+a+'" stroke-width="8"/><g transform="translate(250 190)">'+art+'</g>';
      if(n===2) mark='<path d="M250 82 C348 82 385 160 365 245 C350 320 300 350 250 368 C200 350 150 320 135 245 C115 160 152 82 250 82Z" fill="none" stroke="'+a+'" stroke-width="8"/><g transform="translate(250 205)">'+art+'</g>';
    }
    const y=isWord?225:365,sz=data.name.length>14?38:data.name.length>9?46:56;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 500 500"><rect width="500" height="500" fill="#fff"/>'+mark+'<text x="250" y="'+y+'" text-anchor="middle" font-size="'+sz+'" font-weight="700" fill="'+b+'" font-family="'+font+'" direction="auto">'+name+'</text>'+(slogan?'<text x="250" y="'+(y+43)+'" text-anchor="middle" font-size="18" fill="'+b+'" opacity=".72">'+slogan+'</text>':"")+'<text x="250" y="475" text-anchor="middle" font-size="10" letter-spacing="3" fill="'+a+'">NAVA VECTOR CONCEPT</text></svg>';
  }
  function save(blob,file){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=file;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function card(markup,data,i){
    const card=document.createElement("article");card.className="logo-concept-card nava-vector-card";
    const preview=document.createElement("div");preview.className="logo-concept-preview";const img=document.createElement("img");img.alt="کانسپت برداری "+(i+1)+" برای "+data.name;img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(markup);preview.appendChild(img);card.appendChild(preview);
    const copy=document.createElement("div");copy.className="logo-concept-copy";const h=document.createElement("h3");h.textContent=["نشان هندسی متوازن","ساختار مدرن زاویه‌دار","نشان رسمی و مستقل"][i];const p=document.createElement("p");p.textContent=["ترکیب متقارن و خوانا برای کاربردهای عمومی.","قاب زاویه‌دار با هویت مدرن برای محیط دیجیتال.","ساختار نشان‌واره‌ای با حس رسمی‌تر."][i];copy.append(h,p);card.appendChild(copy);
    const actions=document.createElement("div");actions.className="logo-concept-actions";const s=document.createElement("button");s.type="button";s.className="btn-primary";s.textContent="دریافت فایل برداری SVG";s.addEventListener("click",()=>save(new Blob([markup],{type:"image/svg+xml;charset=utf-8"}),data.file+"-concept-"+(i+1)+".svg"));
    const png=document.createElement("button");png.type="button";png.className="btn-secondary";png.textContent="دریافت PNG";png.addEventListener("click",()=>{const im=new Image();im.onload=()=>{const c=document.createElement("canvas");c.width=c.height=2000;const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,2000,2000);x.drawImage(im,0,0,2000,2000);c.toBlob(blob=>blob&&save(blob,data.file+"-concept-"+(i+1)+".png"),"image/png");};im.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(markup);});actions.append(s,png);card.appendChild(actions);return card;
  }
  function run(){const name=fields.name.value.trim();if(!name){status.textContent="ابتدا نام برند را وارد کن.";fields.name.focus();return;}const data={name,slogan:fields.slogan.value.trim(),idea:fields.idea.value.trim(),industry:fields.industry.value.trim(),file:name.replace(/[^\p{L}\p{N}-]+/gu,"-")||"nava-logo"};results.replaceChildren();for(let i=0;i<3;i++)results.appendChild(card(svg(data,i),data,i));
    const note=document.createElement("div");note.className="logo-ai-strategy-summary";const h=document.createElement("h3");h.textContent="موتور برداری مستقل نوا";const p=document.createElement("p");p.textContent="این طرح‌ها در مرورگر با JavaScript و SVG ساخته شده‌اند؛ هیچ درخواست API یا سهمیه تصویر مصرف نشده است. SVG قابل ویرایش است. این نسخه کانسپت‌ساز هندسی است و هنوز جایگزین طراحی اختصاصی و بازبینی حرفه‌ای نیست.";note.append(h,p);results.prepend(note);$("logoStudioEmpty").hidden=true;status.textContent="سه کانسپت برداری ساخته شد. فایل SVG یا PNG را دریافت کن.";results.scrollIntoView({behavior:"smooth",block:"start"});}
  const panel=document.createElement("div");panel.id="navaVectorEngine";panel.className="logo-brief-actions";const btn=document.createElement("button");btn.type="button";btn.className="btn-primary";btn.textContent="ساخت ۳ لوگوی برداری بدون سهمیه";btn.addEventListener("click",run);panel.appendChild(btn);
  const info=document.createElement("p");info.className="logo-studio-disclaimer";info.textContent="ساخت مستقیم در مرورگر؛ بدون مدل تصویرساز، API یا سهمیه. خروجی SVG قابل ویرایش و PNG.";panel.appendChild(info);form.querySelector('button[type="submit"]')?.insertAdjacentElement("afterend",panel);
})();