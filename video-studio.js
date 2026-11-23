/* NAVA multi-image + music video studio; all source media remains local to the browser. */
(() => {
  "use strict";
  const root=document.getElementById("navaVideoEngine"); if(!root||root.dataset.ready==="1")return; root.dataset.ready="1";
  const $=id=>root.querySelector("#"+id);
  const imageInput=$("navaVideoImage"),musicInput=$("navaVideoMusic"),canvas=$("navaVideoCanvas"),ctx=canvas.getContext("2d",{alpha:false});
  const previewBtn=$("navaVideoPreview"),renderBtn=$("navaVideoRender"),status=$("navaVideoStatus"),progress=$("navaVideoProgress"),result=$("navaVideoResult");
  const titleInput=$("navaVideoTitle"),subtitleInput=$("navaVideoSubtitle"),durationInput=$("navaVideoDuration"),formatInput=$("navaVideoFormat"),motionInput=$("navaVideoMotion"),textInput=$("navaVideoText");
  const sceneList=$("navaVideoSceneList"),musicVolume=$("navaVideoMusicVolume"),fadeInput=$("navaVideoFade");
  const wordMotionInput=$("navaVideoWordMotion"),wordSpeedInput=$("navaVideoWordSpeed");
  let scenes=[],musicUrl="",musicFile=null,musicElement=null,audioContext=null,audioSource=null,audioDestination=null,musicGain=null,previewFrame=0,recorder=null,chunks=[],recording=false,startedAt=0,previewing=false,previewOffset=0,outputUrl="";
  const storyList=$("navaVideoStoryList"),addStoryBtn=$("navaVideoAddScene");
  const fontInput=$("navaVideoFont"),manualMotionInput=$("navaVideoManualMotion");
  const briefInput=$("navaVideoBrief"),manualBriefInput=$("navaVideoManualBrief"),applyBriefBtn=$("navaVideoApplyBrief");
  let smartAutoBuild=false,smartAutoBuildMode=null,quickModePending=false;
  const activeBuildMode=()=>root.querySelector("[data-build-mode].is-active")?.dataset.buildMode||"navi";
  const setupMode=()=>activeBuildMode();
  // Keep each creation tab's media, brief, and scene editor completely separate.
  const initialStoryMarkup=storyList?.innerHTML||"";
  const initialSceneListMarkup=sceneList?.innerHTML||"";
  const modeStates=Object.create(null);
  function saveModeState(mode){
    modeStates[mode]={
      scenes,musicUrl,musicFile,
      storyMarkup:storyList?.innerHTML||initialStoryMarkup,
      sceneMarkup:sceneList?.innerHTML||initialSceneListMarkup,
      naviBrief:briefInput?.value||"",
      manualBrief:manualBriefInput?.value||"",
      quickPrompt:$("navaVideoQuickPrompt")?.value||"",
      naviPhotosLabel:$("navaVideoNaviPhotosLabel")?.textContent||"هنوز عکسی انتخاب نشده است.",
      naviMusicLabel:$("navaVideoNaviMusicLabel")?.textContent||"موسیقی اختیاری است.",
      quickFileLabel:$("navaVideoQuickFile")?.textContent||"هنوز عکسی انتخاب نشده است."
    };
  }
  function restoreModeState(mode){
    const state=modeStates[mode];
    scenes=state?.scenes||[];
    musicUrl=state?.musicUrl||"";
    musicFile=state?.musicFile||null;
    if(storyList)storyList.innerHTML=state?.storyMarkup||initialStoryMarkup;
    if(sceneList)sceneList.innerHTML=state?.sceneMarkup||initialSceneListMarkup;
    if(briefInput)briefInput.value=state?.naviBrief||"";
    if(manualBriefInput)manualBriefInput.value=state?.manualBrief||"";
    const quickPrompt=$("navaVideoQuickPrompt");if(quickPrompt)quickPrompt.value=state?.quickPrompt||"";
    const photosLabel=$("navaVideoNaviPhotosLabel");if(photosLabel)photosLabel.textContent=state?.naviPhotosLabel||"هنوز عکسی انتخاب نشده است.";
    const musicLabel=$("navaVideoNaviMusicLabel");if(musicLabel)musicLabel.textContent=state?.naviMusicLabel||"موسیقی اختیاری است.";
    const quickFile=$("navaVideoQuickFile");if(quickFile)quickFile.textContent=state?.quickFileLabel||"هنوز عکسی انتخاب نشده است.";
    if(imageInput)imageInput.value="";
    if(musicInput)musicInput.value="";
    if(musicElement)musicElement.src=musicUrl||"";
    refreshScenePhotoOptions();renderSceneList();resize();drawFrame(0);updateReady();
  }
  saveModeState("navi");
  function activateBuildMode(mode){
    const previous=activeBuildMode();
    if(previous===mode)return;
    saveModeState(previous);
    root.querySelectorAll("[data-build-mode]").forEach(tab=>tab.classList.toggle("is-active",tab.dataset.buildMode===mode));
    syncSetupMode();
    restoreModeState(mode);
    syncSetupMode();
  }
  const toLayerMotion=value=>({"slide-right":"from-right","slide-left":"from-left",rise:"from-bottom",cinematic:"from-bottom",type:"fade"}[value]||value);
  function applyBrief(){
    const source=activeBuildMode()==="manual"?manualBriefInput:briefInput;
    const brief=(source?.value||"").trim(),result=$("navaVideoNaviResult");
    if(!brief){result.textContent="ابتدا شرح درخواست را بنویس.";return;}
    const cards=storyCards();
    if(!cards.length){result.textContent="ابتدا حداقل یک صحنه بساز؛ سپس دستورها را اعمال کن.";return;}
    const norm=brief.replace(/[يى]/g,"ی").replace(/ك/g,"ک").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).toLowerCase();
    const has=(...terms)=>terms.some(t=>norm.includes(t));
    let changes=0,missing=[];
    const choose=(el,value)=>{if(!el)return false;const opt=Array.from(el.options||[]).find(o=>o.value===String(value));if(!opt||el.value===String(value))return false;el.value=String(value);changes++;return true;};
    const motionRules=[[/محو|fade|شفاف|آرام ظاهر/,"fade"],[/بزرگ.?شونده|از مرکز|پاپ|pop|scale.?in/,"scale-in"],[/مورب از پایین.?چپ|پایین چپ/,"from-bottom-left"],[/مورب از بالا.?راست|بالا راست/,"from-top-right"],[/از پایین|پایین وارد|بالا بیاید|rise/,"from-bottom"],[/از بالا|بالا وارد/,"from-top"],[/از (سمت )?راست|از راست به چپ|سمت راست وارد|ورود از راست|slide.?right/,"from-right"],[/از (سمت )?چپ|از چپ به راست|سمت چپ وارد|ورود از چپ|slide.?left/,"from-left"],[/ثابت|بدون حرکت|بدون افکت/,"none"]];
    const findMotion=t=>{for(const [re,val] of motionRules)if(re.test(t))return val;return null;};
    const fontRules=[[/وزیر|vazir/,"'Vazirmatn',sans-serif"],[/شکسته|shekasteh|dima/,"'Dima Shekasteh',serif"],[/نستعلیق|nastaliq|ایران.?نستعلیق|گلزار|gulzar/,"'Gulzar',serif"],[/نسخ|naskh|noto/,"'Noto Naskh Arabic',serif"],[/تاهوما|tahoma|ایران.?سن.?س|iransans/,"Tahoma, sans-serif"],[/آریال|arial/,"Arial, sans-serif"],[/جورجیا|georgia/,"Georgia, serif"]];
    let font=null;for(const [re,val] of fontRules)if(re.test(norm)){font=val;break;}
    if(font&&fontInput&&fontInput.value!==font){fontInput.value=font;activateFont(font);changes++;}
    const direction=/چپ.?چین|چپ به راست|left.?to.?right|\bltr\b/.test(norm)?"ltr":/راست.?چین|راست به چپ|right.?to.?left|\brtl\b/.test(norm)?"rtl":null;
    if(direction&&textDirection!==direction){textDirection=direction;changes++;}
    const persistence=$("navaVideoTextPersistence");
    if(has("فقط متن صحنه جاری","جایگزین","جایگزینی متن","متن قبلی حذف","متن قبلی نماند","فقط متن جدید"))choose(persistence,"replace");
    else if(has("متن‌های قبلی باقی","متن قبلی بماند","همه متن‌ها بمانند"))choose(persistence,"keep");
    const ordinalPattern=/(?:متن|لایه)\s*(اول|اولی|1|یکم|دوم|دومی|2|سوم|سومی|3)/g;
    const ordinals=Array.from(norm.matchAll(ordinalPattern)).map(m=>({index:/دوم|2/.test(m[1])?1:/سوم|3/.test(m[1])?2:0,pos:m.index}));
    const hasOrdinal=ordinals.length>0;
    cards.forEach(card=>{
      const layers=Array.from(card.querySelectorAll("[data-story-layer]"));
      layers.forEach((layer,li)=>{
        const target=ordinals.find(o=>o.index===li);
        if(hasOrdinal&&!target)return;
        let scoped=norm;
        if(hasOrdinal&&target){const next=ordinals.find(o=>o.pos>target.pos);scoped=norm.slice(target.pos,next?next.pos:norm.length);}
        const motion=findMotion(scoped);if(motion)choose(layer.querySelector("[data-layer-motion]"),motion);
        const delay=scoped.match(/(?:با|به)?\s*(?:تاخیر|تأخیر)\s*(\d+(?:\.\d+)?)\s*(?:ثانیه|ثانیه‌ای)?/);
        if(delay)choose(layer.querySelector("[data-layer-delay]"),String(Math.min(6,Math.max(0,Number(delay[1])))));
        const exit=/(?:حذف|ناپدید|محو|خارج|بیرون).{0,35}(?:متن قبلی|متن اول|این متن|کادر)|(?:متن قبلی|متن اول).{0,35}(?:حذف|ناپدید|محو|خارج)/.test(scoped);
        if(exit){const v=/به سمت راست|به راست|از راست خارج/.test(scoped)?"right":/به سمت چپ|به چپ|از چپ خارج/.test(scoped)?"left":/به بالا|از بالا خارج/.test(scoped)?"top":/به پایین|از پایین خارج/.test(scoped)?"bottom":"fade";choose(layer.querySelector("[data-layer-exit]"),v);}
        if(/زیرش خط|خط زیر|زیر متن خط|underline/.test(scoped)){const cb=layer.querySelector("[data-layer-underline]");if(cb&&!cb.checked){cb.checked=true;changes++;}}
        if(/وسط.?چین|وسط تصویر/.test(scoped))choose(layer.querySelector("[data-layer-align]"),"center");
        else if(/راست.?چین/.test(scoped))choose(layer.querySelector("[data-layer-align]"),"right");
        else if(/چپ.?چین/.test(scoped))choose(layer.querySelector("[data-layer-align]"),"left");
        if(/بالای تصویر|بالا قرار/.test(scoped))choose(layer.querySelector("[data-layer-position]"),"top");
        else if(/وسط تصویر|وسط قرار/.test(scoped))choose(layer.querySelector("[data-layer-position]"),"center");
        if(/عمودی/.test(scoped))choose(layer.querySelector("[data-layer-orientation]"),"vertical");
        else if(/افقی/.test(scoped))choose(layer.querySelector("[data-layer-orientation]"),"horizontal");
        if(/اریب|کج/.test(scoped))choose(layer.querySelector("[data-layer-style]"),"italic");
      });
      const duration=norm.match(/(?:مدت|زمان)\s*(?:نمایش\s*)?(\d+)\s*ثانیه/);
      if(duration)choose(card.querySelector("[data-story-duration]"),String(Math.min(8,Math.max(2,Number(duration[1])))));
      const bg=card.querySelector("[data-scene-background]");
      if(bg){const v=/پس.?زمینه.{0,20}(?:مشکی|سیاه)/.test(norm)?"black":/پس.?زمینه.{0,20}(?:روشن|سفید)/.test(norm)?"light":/پس.?زمینه.{0,20}(?:گرم|خاکستری گرم)/.test(norm)?"warm":null;if(v)choose(bg,v);}
      const frame=card.querySelector("[data-scene-frame]");
      if(frame&&has("قاب","کادر ظریف","قاب مستطیل","قاب مستطیلی")&&!frame.checked){frame.checked=true;changes++;}
      const frameShape=card.querySelector("[data-scene-frame-shape]");
      if(frameShape){const shape=/قاب عمودی|مستطیل عمودی/.test(norm)?"portrait":/قاب مربعی|قاب مربع/.test(norm)?"square":/قاب افقی|مستطیل افقی|قاب مستطیل/.test(norm)?"landscape":null;if(shape)choose(frameShape,shape);}
      const layout=card.querySelector("[data-story-layout]");
      if(layout){const v=/پلکانی|پله.?ای|stagger/.test(norm)?"stagger":/سه قاب کنار|سه تصویر کنار|سه.?تایی/.test(norm)?"triptych":/چهارخانه|شبکه.?ای|grid/.test(norm)?"grid":/قاب.?های شناور|پولاروید/.test(norm)?"polaroid":/ترکیب آزاد|آزادانه/.test(norm)?"free":/سه عکس اریب|اریب/.test(norm)?"diagonal":/قاب بزرگ و کوچک|یک عکس بزرگ/.test(norm)?"hero-stack":null;if(v)choose(layout,v);}
      const photoMotion=card.querySelector("[data-photo-motion]");
      if(photoMotion){const m=/زوم معکوس|عقب.?کشیدن|zoom.?out/.test(norm)?"slow-pull":/حرکت به چپ|پن به چپ|pan.?left/.test(norm)?"pan-left":/حرکت به راست|پن به راست|pan.?right/.test(norm)?"pan-right":/حرکت رو به بالا|پن به بالا|pan.?up/.test(norm)?"pan-up":/حرکت رو به پایین|پن به پایین|pan.?down/.test(norm)?"pan-down":/بدون حرکت عکس|عکس ثابت/.test(norm)?"none":/زوم|نزدیک.?شدن|zoom.?in/.test(norm)?"slow-zoom":null;if(m)choose(photoMotion,m);}
    });
    if(hasOrdinal)ordinals.forEach(o=>{if(!cards.some(card=>Array.from(card.querySelectorAll("[data-story-layer]")).length>o.index))missing.push("لایه متن "+(o.index+1));});
    if(changes===0){result.textContent=missing.length?"این فرمان به "+missing.join(" و ")+" اشاره می‌کند، اما چنین لایه‌ای وجود ندارد. ابتدا لایه متن را اضافه کن.":"هیچ تنظیمی تغییر نکرد. ممکن است فرمان پشتیبانی نشود یا تنظیم موردنظر از قبل همین مقدار باشد.";return;}
    result.textContent="اعمال شد: "+changes+" تغییر واقعی در تنظیمات انجام شد و پیش‌نمایش به‌روزرسانی شد."+ (missing.length?" توجه: "+missing.join(" و ")+" در این صحنه وجود ندارد.":"");
    refreshStory();resize();drawFrame(0);updateReady();
  }
  let activeFont=fontInput?.value||"sans-serif",textDirection="rtl",fontLoadToken=0;
  async function activateFont(font){activeFont=font||"sans-serif";const token=++fontLoadToken;try{if(document.fonts?.load){await document.fonts.load("650 42px "+activeFont);await document.fonts.ready;}}catch(_){}if(token===fontLoadToken){resize();drawFrame(0);}}
  const syncSetupMode=()=>{const mode=setupMode();root.classList.toggle("navi-build-active",mode==="navi");root.dataset.buildModeActive=mode;root.querySelectorAll("[data-build-mode]").forEach(tab=>{const active=tab.dataset.buildMode===mode;tab.classList.toggle("is-active",active);tab.setAttribute("aria-selected",String(active));});root.querySelectorAll("[data-build-panel]").forEach(panel=>{panel.hidden=panel.dataset.buildPanel!==mode;});if(mode==="manual"){if(fontInput)activateFont(fontInput.value||"sans-serif");textDirection="rtl";storyCards().forEach(card=>card.querySelectorAll("[data-layer-motion]").forEach(el=>{if(manualMotionInput)el.value=toLayerMotion(manualMotionInput.value);}));}resize();drawFrame(0);};root.querySelectorAll("[data-build-mode]").forEach(tab=>tab.addEventListener("click",()=>activateBuildMode(tab.dataset.buildMode)));$("navaVideoQuickChoosePhoto")?.addEventListener("click",()=>{quickModePending=true;imageInput?.click();});$("navaVideoNaviChoosePhotos")?.addEventListener("click",()=>imageInput?.click());$("navaVideoNaviChooseMusic")?.addEventListener("click",()=>musicInput?.click());$("navaVideoQuickCreate")?.addEventListener("click",()=>{const prompt=($("navaVideoQuickPrompt")?.value||"").trim();if(!scenes.length){$("navaVideoQuickStatus").textContent="ابتدا با دکمه انتخاب عکس، یک عکس بارگذاری کن.";return;}if(!prompt){$("navaVideoQuickStatus").textContent="خواسته‌ات را درباره عکس بنویس.";return;}const first=storyCards()[0];if(first){const q=prompt.match(/[«“"]([^»”"]+)[»”"]/);const layer=first.querySelector("[data-layer-text]");if(layer)layer.value=q?q[1]:prompt;const mode=first.querySelector("[data-scene-content-mode]");if(mode)mode.value="mixed";}smartAutoBuild=true;smartAutoBuildMode="quick";$("navaVideoQuickStatus").textContent="ناوی در حال طراحی و ساخت ویدئو است…";const ok=window.navaVideoNaviRequest?.({message:"یک ویدئوی کوتاه بر اساس عکس بارگذاری‌شده بساز. متن و خواسته کاربر: "+prompt+" . از عکس انتخاب‌شده در صحنه اول استفاده کن. تنظیمات و زمان‌بندی مناسب را خودت انتخاب کن. در پایان بخش «دستورهای اجرایی استودیو» را با فرمان‌های دقیق و قابل‌اعمال بنویس."});if(!ok){smartAutoBuild=false;$("navaVideoQuickStatus").textContent="ارتباط با ناوی برقرار نشد؛ ورود به حساب را بررسی کن.";}});
  applyBriefBtn?.addEventListener("click",applyBrief);

  function buildNaviScenePlan(reply,originalBrief){
    const story=String(reply||"");
    const digit=value=>String(value||"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d));
    const entries=[];
    const textLine=/^\s*متن\s*صحنه\s*([0-9۰-۹]+)\s*لایه\s*([0-9۰-۹]+)\s*[:：]\s*(.*?)\s*$/;
    story.split(/\r?\n/).forEach(line=>{
      const m=line.match(textLine);if(!m)return;
      const text=m[3].replace(/^[«“"']|[»”"']$/g,"").trim();
      if(text)entries.push({scene:Math.max(1,Number(digit(m[1]))||1),layer:Math.max(1,Number(digit(m[2]))||1),text:text.slice(0,420)});
    });
    const explicitMax=entries.length?Math.max(...entries.map(x=>x.scene)):1;
    const maxScene=Math.min(6,Math.max(1,explicitMax,Math.min(scenes.length,6)));
    while(storyCards().length<maxScene)addStoryBtn?.click();
    const cards=storyCards(),photoGroups=new Map();
    const photoRe=/عکس(?:‌های)?\s*صحنه\s*([0-9۰-۹]+)\s*[:：]\s*([0-9۰-۹،,\s]+)/g;
    let match;
    while((match=photoRe.exec(story))){
      const n=Math.max(1,Number(digit(match[1]))||1);
      const indexes=match[2].split(/[،,\s]+/).filter(Boolean).map(v=>Number(digit(v))).filter(v=>v>=1&&v<=scenes.length);
      if(indexes.length)photoGroups.set(n,indexes);
    }
    const usedPhotos=new Set();
    for(let i=0;i<cards.length;i++){
      const card=cards[i],sceneNo=i+1,items=entries.filter(x=>x.scene===sceneNo);
      const holder=card.querySelector(".nava-video-text-layers");
      const wanted=Math.min(6,Math.max(1,...items.map(x=>x.layer)));
      while(holder.querySelectorAll("[data-story-layer]").length<wanted)card.querySelector("[data-add-layer]")?.click();
      const layers=Array.from(card.querySelectorAll("[data-story-layer]"));
      items.forEach(item=>{const layer=layers[item.layer-1],field=layer?.querySelector("[data-layer-text]");if(field)field.value=item.text;if(layer&&items.length>1){const position=layer.querySelector("[data-layer-position]");if(position){const slots=items.length===2?["top","bottom"]:["top","center","bottom"];position.value=slots[(item.layer-1)%slots.length];}const font=layer.querySelector("[data-layer-font]");if(font)font.value=["Tahoma, sans-serif","IranNastaliq, serif","Dima Shekasteh, serif"][(item.layer-1)%3];const size=layer.querySelector("[data-layer-size]");if(size&&item.layer>1)size.value=item.layer===2?"42":"30";}});
      const group=photoGroups.get(sceneNo)||[];
      const assigned=photoGroups.has(sceneNo)?group:(scenes[i]?[sceneNo]:[]);
      assigned.forEach(n=>usedPhotos.add(n));
      const gallery=card.querySelector("[data-story-image-gallery]");
      if(gallery)gallery.dataset.selectedIds=assigned.map(n=>scenes[n-1]).filter(Boolean).map(photoId).join(",");
      const mode=card.querySelector("[data-scene-content-mode]");
      if(mode)mode.value=assigned.length?(items.length?"mixed":"image"):(items.length?"text":"image");
      const duration=story.match(new RegExp("مدت\\s*صحنه\\s*"+sceneNo+"\\s*[:：]\\s*([0-9۰-۹]+)\\s*ثانیه"));
      if(duration){const field=card.querySelector("[data-story-duration]");if(field){const val=String(Math.min(8,Math.max(2,Number(digit(duration[1]))||4)));if(Array.from(field.options).some(o=>o.value===val))field.value=val;}}
      else {const field=card.querySelector("[data-story-duration]");if(field&&Array.from(field.options).some(o=>o.value==="4"))field.value="4";}
    }
    const missingPhotos=scenes.map((_,i)=>i+1).filter(n=>!usedPhotos.has(n));
    missingPhotos.forEach((photoIndex,index)=>{
      const card=cards[index%cards.length],gallery=card.querySelector("[data-story-image-gallery]");
      if(gallery){const selected=(gallery.dataset.selectedIds||"").split(",").filter(Boolean);const id=photoId(scenes[photoIndex-1]);if(!selected.includes(id))selected.push(id);gallery.dataset.selectedIds=selected.join(",");}
      const mode=card.querySelector("[data-scene-content-mode]");if(mode&&mode.value==="text")mode.value="mixed";
    });
    refreshScenePhotoOptions();resize();drawFrame(0);updateReady();
  }
  function resultStatusNavi(message){const el=$("navaVideoNaviResult");if(el)el.textContent=message;}
  window.addEventListener("nava:navi-reply",event=>{
    if(event.detail?.service!=="ویدئو و صدا")return;
    if(smartAutoBuildMode&&activeBuildMode()!==smartAutoBuildMode)activateBuildMode(smartAutoBuildMode);
    const reply=String(event.detail.reply||"").trim();
    if(!reply)return;
    const marker=/دستورهای اجرایی استودیو\s*[:：]?/i;
    const markerMatch=reply.match(marker);
    const commands=markerMatch?reply.slice(markerMatch.index+markerMatch[0].length).trim():"";
    const originalBrief=briefInput?.value||"";
    buildNaviScenePlan(reply,originalBrief);
    if(commands){
      if(briefInput)briefInput.value=commands;
      applyBrief();
      if(briefInput)briefInput.value=originalBrief;
    }
    if(smartAutoBuild){
      smartAutoBuild=false;
      setTimeout(()=>{if(!renderBtn.disabled)renderBtn.click();else say("پاسخ ناوی دریافت شد، اما هنوز محتوای قابل‌رندر آماده نیست.");},250);
      smartAutoBuildMode=null;
      resultStatusNavi(commands?"دستورهای ناوی اعمال شد؛ رندر ویدئو آغاز می‌شود.":"سناریوی ناوی دریافت شد؛ ساخت ویدئو آغاز می‌شود.");
    }
  });
  manualMotionInput?.addEventListener("change",()=>{if(setupMode()==="manual")storyCards().forEach(card=>card.querySelectorAll("[data-layer-motion]").forEach(el=>{el.value=manualMotionInput.value==="slide-right"?"from-right":manualMotionInput.value==="slide-left"?"from-left":manualMotionInput.value==="rise"?"from-bottom":manualMotionInput.value;}));drawFrame(0);});
  fontInput?.addEventListener("change",()=>activateFont(fontInput.value));

  const storyCards=()=>storyList?Array.from(storyList.querySelectorAll("[data-story-scene]")):[];
  let nextPhotoId=1;
  const photoId=scene=>scene.id||(scene.id="photo-"+(nextPhotoId++));
  const refreshScenePhotoOptions=()=>storyCards().forEach(card=>{const gallery=card.querySelector("[data-story-image-gallery]");if(!gallery)return;const selected=new Set((gallery.dataset.selectedIds||"").split(",").filter(Boolean));gallery.innerHTML="";scenes.forEach((scene,i)=>{const id=photoId(scene),tile=document.createElement("button");tile.type="button";tile.className="nava-video-photo-tile";tile.disabled=gallery.closest("[data-story-scene]")?.querySelector("[data-scene-content-mode]")?.value==="text";tile.dataset.photoId=id;tile.setAttribute("aria-pressed",String(selected.has(id)));const img=document.createElement("img");img.src=scene.url;img.alt="";const name=document.createElement("span");name.textContent=(i+1)+". "+scene.file.name;const mark=document.createElement("b");mark.textContent=selected.has(id)?"✓":"+";tile.append(img,name,mark);gallery.append(tile);});gallery.dataset.selectedIds=Array.from(selected).filter(id=>scenes.some(scene=>photoId(scene)===id)).join(",");});
  const storyData=()=>storyCards().map(card=>({contentMode:card.querySelector("[data-scene-content-mode]")?.value||"mixed",photoBlur:Number(card.querySelector("[data-scene-photo-blur]")?.value)||0,layers:(card.querySelector("[data-scene-content-mode]")?.value==="image"?[]:Array.from(card.querySelectorAll("[data-story-layer]"))).map(layer=>({text:layer.querySelector("[data-layer-text]").value.trim(),position:layer.querySelector("[data-layer-position]").value,offset:Number(layer.querySelector("[data-layer-offset]")?.value)||0,align:layer.querySelector("[data-layer-align]").value,motion:layer.querySelector("[data-layer-motion]").value,font:layer.querySelector("[data-layer-font]")?.value||"auto",size:Number(layer.querySelector("[data-layer-size]").value)||42,delay:Number(layer.querySelector("[data-layer-delay]")?.value)||0,exit:layer.querySelector("[data-layer-exit]")?.value||"stay",underline:!!layer.querySelector("[data-layer-underline]")?.checked,underlineAlign:layer.querySelector("[data-layer-underline-align]")?.value||"match",underlineColor:layer.querySelector("[data-layer-underline-color]")?.value||"#ffffff",underlineThickness:Number(layer.querySelector("[data-layer-underline-thickness]")?.value)||4,underlineWidth:Number(layer.querySelector("[data-layer-underline-width]")?.value)||0.7,style:layer.querySelector("[data-layer-style]")?.value||"normal",orientation:layer.querySelector("[data-layer-orientation]")?.value||"horizontal",color:layer.querySelector("[data-layer-color]")?.value||"#ffffff",})).filter(layer=>layer.text),duration:Number(card.querySelector("[data-story-duration]").value)||4,imageIds:(card.querySelector("[data-scene-content-mode]")?.value==="text"?[]:(card.querySelector("[data-story-image-gallery]")?.dataset.selectedIds||"").split(",").filter(Boolean)),layout:card.querySelector("[data-story-layout]")?.value||"single",photoScale:Number(card.querySelector("[data-photo-scale]")?.value)||1,photoY:Number(card.querySelector("[data-photo-y]")?.value)||.28,photoSpread:Number(card.querySelector("[data-photo-spread]")?.value)||1,photoMotion:card.querySelector("[data-photo-motion]")?.value||"",background:card.querySelector("[data-scene-background]")?.value||"default",backgroundColor:card.querySelector("[data-scene-background-color]")?.value||"#18243b",frame:!!card.querySelector("[data-scene-frame]")?.checked,frameShape:card.querySelector("[data-scene-frame-shape]")?.value||"landscape",frameTitle:card.querySelector("[data-scene-frame-title]")?.value||"",imageIndex:-1})).filter(s=>s.layers.length||s.imageIds.length||s.frame||s.background!=="default"||s.imageIndex>=0);
  const layerMarkup=(index=1)=>'<div class="nava-video-text-layer" data-story-layer><div class="nava-video-layer-head"><strong>لایه متن '+index+'</strong><button type="button" data-remove-layer>حذف لایه</button></div><label>متن<textarea data-layer-text rows="2" maxlength="420" placeholder="متن این لایه را بنویس..."></textarea></label><details class="nava-video-layer-settings"><summary>تنظیمات بیشتر</summary><div class="nava-video-layer-fields"><label>جای متن<select data-layer-position><option value="top">بالای تصویر</option><option value="center">وسط تصویر</option><option value="bottom" selected>پایین تصویر</option></select></label><label>فاصله عمودی<select data-layer-offset><option value="-30">خیلی بالاتر</option><option value="-20">بالاتر</option><option value="-10">کمی بالاتر</option><option value="0" selected>بدون جابه‌جایی</option><option value="10">کمی پایین‌تر</option><option value="20">پایین‌تر</option><option value="30">خیلی پایین‌تر</option></select></label><label>تراز<select data-layer-align><option value="right" selected>راست‌چین</option><option value="center">وسط‌چین</option><option value="left">چپ‌چین</option></select></label><label>ورود متن<select data-layer-motion><option value="auto" selected>هوشمند و متنوع بین صحنه‌ها</option><option value="from-right">از بیرون کادر راست</option><option value="from-left">از بیرون کادر چپ</option><option value="from-top">از بیرون کادر بالا</option><option value="from-bottom">از بیرون کادر پایین</option><option value="fade">محو و ظاهر شدن</option><option value="none">ثابت</option></select></label><label>تأخیر شروع<select data-layer-delay><option value="0">بدون تأخیر</option><option value="0.5">نیم ثانیه</option><option value="1">۱ ثانیه</option><option value="1.5">۱٫۵ ثانیه</option><option value="2">۲ ثانیه</option><option value="2.5">۲٫۵ ثانیه</option><option value="3">۳ ثانیه</option><option value="4">۴ ثانیه</option><option value="5">۵ ثانیه</option><option value="6">۶ ثانیه</option></select></label><label>خروج هنگام ورود متن بعدی<select data-layer-exit><option value="stay" selected>باقی بماند</option><option value="fade">محو شود</option><option value="right">حرکت به بیرون راست</option><option value="left">حرکت به بیرون چپ</option><option value="top">حرکت به بیرون بالا</option><option value="bottom">حرکت به بیرون پایین</option></select></label><label>فونت نوشته<select data-layer-font><option value="auto" selected>انتخاب هوشمند و متنوع</option><option value="Tahoma, sans-serif">ساده و خوانا</option><option value="IranNastaliq, serif">ایران نستعلیق</option><option value="Dima Shekasteh, serif">شکسته</option></select></label><label>اندازه نوشته<select data-layer-size><option value="30">کوچک</option><option value="42" selected>متوسط</option><option value="56">بزرگ</option><option value="68">خیلی بزرگ</option></select></label><label>حالت نوشته<select data-layer-style><option value="normal">معمولی</option><option value="italic">اریب</option></select></label><label>جهت نوشته<select data-layer-orientation><option value="horizontal">افقی</option><option value="vertical">عمودی</option></select></label><label>رنگ فونت<input type="color" data-layer-color value="#ffffff"></label><div class="nava-video-underline-tools"><label class="nava-video-underline-toggle"><input type="checkbox" data-layer-underline> کشیدن خط زیر این متن</label><label>رنگ خط<select data-layer-underline-color><option value="#ffffff">سفید</option><option value="nava-gradient">ترکیبی نوا (طلایی، فیروزه‌ای، آبی)</option><option value="#e5bd62">طلایی</option><option value="#69c7bd">فیروزه‌ای</option><option value="#7da8ff">آبی</option><option value="#ff8d8d">قرمز ملایم</option></select></label><label>ضخامت خط<select data-layer-underline-thickness><option value="2">نازک</option><option value="4" selected>معمولی</option><option value="7">ضخیم</option></select></label><label>طول خط<select data-layer-underline-width><option value="0.4">کوتاه</option><option value="0.7" selected>متوسط</option><option value="1">به‌اندازه متن</option></select></label><label>تراز خط زیر<select data-layer-underline-align><option value="match" selected>هم‌تراز با متن</option><option value="right">راست‌چین</option><option value="center">وسط‌چین</option><option value="left">چپ‌چین</option></select></label></div></div></details></div>';
  // Bring the original first layer into the same compact settings layout as newly added layers.
  storyCards().forEach(layer=>{if(layer.querySelector(".nava-video-layer-settings"))return;const fields=layer.querySelector(".nava-video-layer-fields");if(!fields)return;const details=document.createElement("details");details.className="nava-video-layer-settings";const summary=document.createElement("summary");summary.textContent="تنظیمات بیشتر";details.append(summary);layer.insertBefore(details,fields);details.append(fields);const position=fields.querySelector("[data-layer-position]")?.closest("label");if(position){const label=document.createElement("label");label.textContent="فاصله عمودی";const select=document.createElement("select");select.setAttribute("data-layer-offset","");[["-30","خیلی بالاتر"],["-20","بالاتر"],["-10","کمی بالاتر"],["0","بدون جابه‌جایی"],["10","کمی پایین‌تر"],["20","پایین‌تر"],["30","خیلی پایین‌تر"]].forEach(([value,text])=>{const option=document.createElement("option");option.value=value;option.textContent=text;if(value==="0")option.selected=true;select.append(option);});label.append(select);position.after(label);}});
  storyCards().forEach(layer=>{if(layer.querySelector("[data-layer-font]"))return;const fields=layer.querySelector(".nava-video-layer-fields");if(!fields)return;const label=document.createElement("label");label.textContent="فونت نوشته";const select=document.createElement("select");select.setAttribute("data-layer-font","");[["auto","انتخاب هوشمند و متنوع"],["Tahoma, sans-serif","ساده و خوانا"],["IranNastaliq, serif","ایران نستعلیق"],["Dima Shekasteh, serif","شکسته"]].forEach(([value,title])=>{const option=document.createElement("option");option.value=value;option.textContent=title;if(value==="auto")option.selected=true;select.append(option);});label.append(select);const size=fields.querySelector("[data-layer-size]")?.closest("label");if(size)size.before(label);else fields.append(label);});
  const storyTotal=()=>storyData().reduce((sum,s)=>sum+s.duration,0);
  const totalDuration=()=>storyTotal()||Number(durationInput?.value)||8;
  const say=m=>{status.textContent=m;};
  function dimensions(){return formatInput.value==="landscape"?[1280,720]:[720,1280];}
  function resize(){const [w,h]=dimensions();canvas.width=w;canvas.height=h;const wrap=root.querySelector(".nava-video-canvas-wrap");if(wrap)wrap.style.aspectRatio=w+" / "+h;}
  function renderSceneList(){
    if(!scenes.length){sceneList.textContent="هنوز عکسی انتخاب نشده است.";return;}
    sceneList.innerHTML="";
    scenes.forEach((scene,i)=>{const row=document.createElement("div");row.className="nava-video-scene";
      const thumb=document.createElement("img");thumb.src=scene.url;thumb.alt="تصویر "+(i+1);
      const name=document.createElement("span");name.textContent=(i+1)+". "+scene.file.name;
      const up=document.createElement("button");up.type="button";up.textContent="↑";up.disabled=i===0;up.setAttribute("aria-label","انتقال به بالا");up.addEventListener("click",()=>moveScene(i,-1));
      const down=document.createElement("button");down.type="button";down.textContent="↓";down.disabled=i===scenes.length-1;down.setAttribute("aria-label","انتقال به پایین");down.addEventListener("click",()=>moveScene(i,1));
      const remove=document.createElement("button");remove.type="button";remove.textContent="×";remove.setAttribute("aria-label","حذف تصویر");remove.addEventListener("click",()=>{URL.revokeObjectURL(scene.url);scenes.splice(i,1);renderSceneList();refreshScenePhotoOptions();updateReady();drawFrame(0);});
      row.append(thumb,name,up,down,remove);sceneList.append(row);
    });
  }
  function moveScene(i,delta){const j=i+delta;if(j<0||j>=scenes.length)return;[scenes[i],scenes[j]]=[scenes[j],scenes[i]];renderSceneList();refreshScenePhotoOptions();drawFrame(0);}
  function drawFrame(seconds,storyOverride,durationOverride){
    const [w,h]=dimensions();
    const sf=w/1080;if(canvas.width!==w||canvas.height!==h)resize();
    const duration=Number(durationOverride)||totalDuration(),hasImages=scenes.length>0,per=hasImages?duration/scenes.length:duration,index=hasImages?Math.min(scenes.length-1,Math.floor(Math.min(seconds,duration-.001)/per)):0,local=hasImages?(seconds-index*per)/per:seconds/duration;
    const story=Array.isArray(storyOverride)?storyOverride:storyData();let activeStory=null,activeStoryIndex=-1,storyLocal=seconds;
    if(story.length){let cursor=0;for(let i=0;i<story.length;i++){const item=story[i];if(seconds<cursor+item.duration){activeStory=item;activeStoryIndex=i;storyLocal=seconds-cursor;break;}cursor+=item.duration;}if(!activeStory){activeStory=story[story.length-1];activeStoryIndex=story.length-1;storyLocal=activeStory.duration;}}
    const activeImages=story.length?(activeStory?(activeStory.contentMode==="text"?[]:(activeStory.imageIds?.length?activeStory.imageIds.map(id=>scenes.find(scene=>photoId(scene)===id)).filter(Boolean):(activeStory.imageIndex>=0?[scenes[activeStory.imageIndex]].filter(Boolean):[]))):[]):(hasImages?[scenes[index]]:[]);
    ctx.fillStyle="#050912";ctx.fillRect(0,0,w,h);
    const drawImageCover=(img,x,y,bw,bh,progress=local,layerIndex=0,blur=0)=>{const iw=img.naturalWidth,ih=img.naturalHeight,modes=["slow-zoom","pan-left","pan-right","slow-pull","pan-up","pan-down","diagonal-in","diagonal-out"],mode=story.length?(activeStory?.photoMotion||modes[(activeStoryIndex*3+layerIndex*2)%modes.length]):modes[(index*3+layerIndex*2)%modes.length],p=Math.max(0,Math.min(1,progress)),ease=p*p*(3-2*p),base=Math.max(bw/iw,bh/ih);let zoom=mode==="none"?1:mode==="slow-pull"?1.035:mode==="pan-left"||mode==="pan-right"?1.055:1.06;const scale=base*(1+(zoom-1)*ease),dw=iw*scale,dh=ih*scale;let dx=0,dy=0;if(mode==="slow-zoom"||mode==="cinematic-depth"){dx=Math.sin(p*Math.PI*.5)*bw*.012;dy=-ease*bh*.018;}else if(mode==="pan-left"){dx=(.5-ease)*bw*.035;dy=-ease*bh*.008;}else if(mode==="pan-right"){dx=(ease-.5)*bw*.035;dy=ease*bh*.008;}else if(mode==="slow-pull"||mode==="ken-burns"){dx=(.5-p)*bw*.035;dy=(p-.5)*bh*.025;}else if(mode==="pan-up"){dx=Math.sin(p*Math.PI)*bw*.012;dy=(.5-ease)*bh*.055;}else if(mode==="pan-down"){dx=-Math.sin(p*Math.PI)*bw*.012;dy=(ease-.5)*bh*.055;}else if(mode==="diagonal-in"){dx=(.5-ease)*bw*.035;dy=(.5-ease)*bh*.035;}else if(mode==="diagonal-out"){dx=(ease-.5)*bw*.035;dy=(ease-.5)*bh*.035;}ctx.save();ctx.beginPath();ctx.rect(x,y,bw,bh);ctx.clip();ctx.filter=blur>0?"blur("+Math.min(24,blur)*sf+"px)":"none";ctx.drawImage(img,x+(bw-dw)/2+dx,y+(bh-dh)/2+dy,dw,dh);ctx.filter="none";ctx.restore();};
    const usableImages=activeImages.map(item=>item?.image).filter(img=>img?.complete&&img.naturalWidth>0&&img.naturalHeight>0);
    if(usableImages.length){
      const sceneLayout=story.length?(activeStory?.layout||"single"):"single";const photoScale=story.length?(activeStory?.photoScale||1):1,photoY=story.length?(activeStory?.photoY||.28):.28,photoSpread=story.length?(activeStory?.photoSpread||1):1;
      const photo=(img,x,y,bw,bh,angle=0)=>{ctx.save();ctx.translate(x+bw/2,y+bh/2);ctx.rotate(angle*Math.PI/180);ctx.shadowColor="rgba(0,0,0,.48)";ctx.shadowBlur=Math.max(12,w*.022);ctx.shadowOffsetY=Math.max(5,h*.009);ctx.fillStyle="#f7f4ed";ctx.fillRect(-bw/2-5,-bh/2-5,bw+10,bh+10);ctx.shadowColor="transparent";drawImageCover(img,-bw/2,-bh/2,bw,bh,story.length?storyLocal/Math.max(.1,activeStory.duration):local,usableImages.indexOf(img),story.length?(activeStory?.photoBlur||0):0);ctx.strokeStyle="rgba(255,255,255,.86)";ctx.lineWidth=Math.max(1,w*.002);ctx.strokeRect(-bw/2,-bh/2,bw,bh);ctx.restore();};
      if(usableImages.length===1&&sceneLayout==="single")drawImageCover(usableImages[0],0,0,w,h,story.length?storyLocal/Math.max(.1,activeStory.duration):local,0,story.length?(activeStory?.photoBlur||0):0);
      else if(sceneLayout==="grid"){const gap=w*.025*photoSpread,cw=(w-gap*3)/2*photoScale,ch=(h*.58-gap*3)/2*photoScale;usableImages.slice(0,4).forEach((img,k)=>photo(img,w/2+(k%2===0?-1:1)*(cw/2+gap/2),h*photoY+(Math.floor(k/2)-.5)*(ch+gap),cw,ch));}
      else if(sceneLayout==="triptych"){const gap=w*.018*photoSpread,cw=(w-gap*4)/3*photoScale,ch=h*.58*photoScale;usableImages.slice(0,3).forEach((img,k)=>photo(img,w/2+(k-1)*(cw+gap),h*photoY,cw,ch));}
      else if(sceneLayout==="diagonal"){const bw=w*.43*photoScale,bh=h*.43*photoScale,dx=[-.24,0,.24],ang=[-9,0,9];usableImages.slice(0,3).forEach((img,k)=>photo(img,w/2-bw/2+dx[k]*w*photoSpread,h*photoY,bw,bh,ang[k]*photoSpread));}
      else if(sceneLayout==="stagger"){const bw=w*.56*photoScale,bh=h*.34*photoScale;usableImages.slice(0,4).forEach((img,k)=>photo(img,w*(k%2?.38:.06)*photoSpread,h*(photoY-.15+k*.17*photoSpread),bw,bh,k%2?5*photoSpread:-5*photoSpread));}
       else if(sceneLayout==="hero-stack"){const main=usableImages[0],bw=w*.68*photoScale,bh=h*.52*photoScale;photo(main,(w-bw)/2,h*(photoY-.13),bw,bh,0);usableImages.slice(1,4).forEach((img,k)=>{const sw=w*.25*photoScale,sh=h*.2*photoScale;photo(img,w*(.08+k*.23),h*(photoY+.37),sw,sh,(k%2?4:-4));});}
      else if(sceneLayout==="polaroid"||sceneLayout==="free"){const bw=w*.46*photoScale,bh=h*.42*photoScale,xs=[.04,.48,.12,.43],ys=[photoY-.08,photoY-.03,photoY+.21,photoY+.24],angs=sceneLayout==="free"?[-12,8,-5,11]:[-7,6,-3,9];usableImages.slice(0,4).forEach((img,k)=>photo(img,w*(.5+(xs[k]-.5)*photoSpread),h*ys[k],bw,bh,angs[k]*photoSpread));}
      else drawImageCover(usableImages[0],0,0,w,h,local);
    }else{const bg=activeStory?.background||"default",custom=activeStory?.backgroundColor||"#18243b";if(bg==="black"){ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);}else if(bg==="light"){ctx.fillStyle="#e8e5df";ctx.fillRect(0,0,w,h);}else if(bg==="warm"){ctx.fillStyle="#34302d";ctx.fillRect(0,0,w,h);}else{const gradient=ctx.createLinearGradient(0,0,w,h);gradient.addColorStop(0,custom);gradient.addColorStop(.58,bg==="default"?"#202f47":custom);gradient.addColorStop(1,"#080d18");ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);}}
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
    const shade=ctx.createLinearGradient(0,0,0,h);shade.addColorStop(0,"rgba(2,8,18,.12)");shade.addColorStop(.55,"rgba(2,8,18,.02)");shade.addColorStop(1,"rgba(2,8,18,.72)");ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    if(activeStory?.frame){const shape=activeStory.frameShape||"landscape",fw=shape==="portrait"?w*.58:shape==="square"?Math.min(w*.82,h*.82):w*.84,fh=shape==="portrait"?h*.84:shape==="square"?fw:h*.82,left=(w-fw)/2,right=left+fw,top=(h-fh)/2,bottom=top+fh;ctx.save();ctx.shadowBlur=0;ctx.strokeStyle="rgba(255,255,255,.72)";ctx.lineWidth=Math.max(1.2,1.5*sf);ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(left,bottom);ctx.lineTo(right,bottom);ctx.lineTo(right,top);ctx.stroke();const label=(activeStory.frameTitle||"").trim();if(label){ctx.font="700 "+Math.max(14,24*sf)+"px sans-serif";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillStyle="rgba(255,255,255,.94)";ctx.fillText(label,left+12*sf,top+24*sf);}ctx.restore();}ctx.textAlign=textDirection==="ltr"?"left":"center";ctx.direction=textDirection;ctx.shadowColor="rgba(0,0,0,.65)";ctx.shadowBlur=16*sf;
    if(titleInput.value.trim()){ctx.font="700 "+Math.round(54*sf)+"px sans-serif";ctx.fillStyle="#fff";ctx.fillText(titleInput.value.trim(),w/2,h*.79,w*.84);}
    if(subtitleInput.value.trim()){ctx.font="400 "+Math.round(27*sf)+"px sans-serif";ctx.fillStyle="#fff";ctx.fillText(subtitleInput.value.trim(),w/2,h*.84,w*.82);}
    const persistence=$("navaVideoTextPersistence")?.value||"keep";
    const visibleScenes=activeStory?(persistence==="keep"?story.slice(0,activeStoryIndex+1):[activeStory]):[];
    const layersToDraw=[];
    visibleScenes.forEach((scene,i)=>{(scene.layers||[]).forEach((layer,layerIndex)=>{const elapsed=i===visibleScenes.length-1?storyLocal:scene.duration,nextLayer=(scene.layers||[])[layerIndex+1],exitAt=nextLayer?Math.max(Number(layer.delay)||0,Number(nextLayer.delay)||0):scene.duration;layersToDraw.push({layer:{...layer,layerIndex},elapsed,sceneDuration:scene.duration,isCurrent:i===visibleScenes.length-1,exitAt});});});
    if(!story.length&&textInput?.value.trim())layersToDraw.push({layer:{text:textInput.value.trim(),position:"bottom",align:"center",motion:wordMotionInput?.value||"rise",size:42},elapsed:seconds,sceneDuration:duration});
    const textScale=w/1080,margin=w*.09,occupiedTextRegions=[];
    layersToDraw.forEach(({layer,elapsed,sceneDuration,isCurrent=true,exitAt=sceneDuration})=>{
      const body=String(layer.text||"").trim();if(!body)return;
      const fontSize=Math.round((layer.size||42)*textScale),lineH=fontSize*1.32,maxWidth=w*.82;
      ctx.save();const layerFont=layer.font&&layer.font!=="auto"?layer.font:(["Tahoma, sans-serif","IranNastaliq, serif","Dima Shekasteh, serif"][Math.max(0,layer.layerIndex||0)%3]);ctx.font=(layer.style==="italic"?"italic ":"")+"650 "+fontSize+"px "+layerFont;ctx.fillStyle=layer.color||"#ffffff";ctx.textAlign="left";ctx.direction=textDirection;ctx.shadowColor="rgba(0,0,0,.72)";ctx.shadowBlur=18*sf;
      const words=body.split(/\s+/).filter(Boolean),lines=[];let line="";
      words.forEach(word=>{const candidate=line?line+" "+word:word;if(line&&ctx.measureText(candidate).width>maxWidth){lines.push(line);line=word;}else line=candidate;});if(line)lines.push(line);
      const shown=lines.slice(0,6),blockHeight=shown.length*lineH,position=layer.position||"bottom",align=layer.align||"center";
      let baseY=(position==="top"?h*.15+fontSize:position==="center"?(h-blockHeight)/2+fontSize:h*.84-blockHeight+fontSize)+h*(Number(layer.offset)||0)/100;
      // Resolve collisions across every visible layer, including text retained from previous scenes.
      const regionAt=y=>({top:y-fontSize*.98,bottom:y+(shown.length-1)*lineH+fontSize*.38+(layer.underline?fontSize*.62:0)});
      const desiredY=baseY,minY=h*.105+fontSize,maxY=h*.89-(shown.length-1)*lineH-fontSize*.38;
      const candidates=[desiredY,...Array.from({length:9},(_,i)=>minY+(Math.max(0,maxY-minY)*i/8))].filter(y=>y>=minY&&y<=maxY).sort((a,b)=>Math.abs(a-desiredY)-Math.abs(b-desiredY));
      const collides=box=>occupiedTextRegions.some(other=>box.top<other.bottom+h*.018&&box.bottom>other.top-h*.018);
      const safeY=candidates.find(y=>!collides(regionAt(y)));
      if(safeY!==undefined)baseY=safeY;
      else if(candidates.length){baseY=candidates.reduce((best,y)=>{const box=regionAt(y),score=occupiedTextRegions.reduce((sum,other)=>sum+Math.max(0,Math.min(box.bottom,other.bottom)-Math.max(box.top,other.top)),0);return score<best.score?{y,score}:best;},{y:candidates[0],score:Infinity}).y;}
      occupiedTextRegions.push(regionAt(baseY));
      const anchorX=align==="right"?w-margin:align==="left"?margin:w/2;
      ctx.textAlign=align;ctx.textBaseline="alphabetic";
      const motion=layer.motion||"from-right",layerElapsed=elapsed-(Number(layer.delay)||0),p=Math.max(0,Math.min(1,layerElapsed/.9)),ease=1-Math.pow(1-p,3);
      if(layerElapsed<0)return;
      const autoTextMotions=["from-right","from-left","from-bottom","fade","from-top","from-bottom-left","from-top-right","scale-in"];
      const resolvedMotion=motion==="auto"?autoTextMotions[(activeStoryIndex*3+(layer.layerIndex||0)*5)%autoTextMotions.length]:motion;
      const enterAlpha=resolvedMotion==="fade"?p:1;
      const enterDx=resolvedMotion==="from-right"?(1-ease)*(w+maxWidth):resolvedMotion==="from-left"?-(1-ease)*(w+maxWidth):resolvedMotion==="from-bottom-left"?-(1-ease)*(w*.65+maxWidth):resolvedMotion==="from-top-right"?(1-ease)*(w*.65+maxWidth):0;
      const enterDy=resolvedMotion==="from-top"||resolvedMotion==="from-top-right"?-(1-ease)*(h*.35+blockHeight):resolvedMotion==="from-bottom"||resolvedMotion==="from-bottom-left"?(1-ease)*(h*.35+blockHeight):0;
      const exitMode=layer.exit||"stay",exitElapsed=elapsed-exitAt,exitProgress=exitMode==="stay"?0:Math.max(0,Math.min(1,exitElapsed/.7)),exitEase=1-Math.pow(1-exitProgress,3);
      const exitDx=exitMode==="right"?exitEase*(w+maxWidth):exitMode==="left"?-exitEase*(w+maxWidth):0;
      const exitDy=exitMode==="top"?-exitEase*(h*.45+blockHeight):exitMode==="bottom"?exitEase*(h*.45+blockHeight):0;
      const exitAlpha=exitMode==="fade"?1-exitProgress:1;
      const fadeOut=isCurrent?Math.max(0,Math.min(1,(sceneDuration-elapsed)/.28)):1;
      ctx.globalAlpha=Math.min(enterAlpha,exitAlpha,fadeOut);ctx.translate(enterDx+exitDx,enterDy+exitDy);if(resolvedMotion==="scale-in"){const scale=.72+.28*ease;ctx.translate(anchorX,baseY);ctx.scale(scale,scale);ctx.translate(-anchorX,-baseY);}
      if(layer.frame){const frameTop=h*.065,frameBottom=h*.955,frameLeft=w*.085,frameRight=w*.915;ctx.save();ctx.shadowBlur=0;ctx.strokeStyle=layer.color||"#ffffff";ctx.globalAlpha*=.72;ctx.lineWidth=Math.max(1.2,1.5*sf);ctx.strokeRect(frameLeft,frameTop,frameRight-frameLeft,frameBottom-frameTop);if(layer.frameTitle){ctx.font="600 "+Math.max(13,fontSize*.38)+"px "+activeFont;ctx.textAlign="left";ctx.textBaseline="middle";const labelW=ctx.measureText(layer.frameTitle).width+fontSize*.55;ctx.fillStyle="rgba(8,13,25,.72)";ctx.fillRect(frameLeft+fontSize*.28,frameTop-fontSize*.1,labelW,fontSize*.45);ctx.fillStyle=layer.color||"#ffffff";ctx.fillText(layer.frameTitle,frameLeft+fontSize*.55,frameTop+fontSize*.12);}ctx.restore();}if(layer.orientation==="vertical"){ctx.save();ctx.translate(anchorX,baseY);ctx.rotate(Math.PI/2);shown.forEach((text,i)=>ctx.fillText(text,-i*lineH,0,maxWidth));ctx.restore();}else{shown.forEach((text,i)=>ctx.fillText(text,anchorX,baseY+i*lineH,maxWidth));}
      if(layer.underline){const underlineWait=motion==="none"?0:.9,underlineProgress=Math.max(0,Math.min(1,(layerElapsed-underlineWait)/.55));if(underlineProgress>0){const measured=shown.map(text=>Math.min(maxWidth,ctx.measureText(text).width));const longest=Math.max(0,...measured);const lineW=Math.max(fontSize*.55,longest*(Number(layer.underlineWidth)||.7));const underlineAlign=layer.underlineAlign&&layer.underlineAlign!=="match"?layer.underlineAlign:align;const lineX=underlineAlign==="right"?w-margin-lineW:underlineAlign==="left"?margin:(w-lineW)/2;const lineY=baseY+(shown.length-1)*lineH+Math.max(22*sf,fontSize*.62);ctx.save();ctx.globalAlpha*=underlineProgress;ctx.shadowBlur=0;if(layer.underlineColor==="nava-gradient"){const gradient=ctx.createLinearGradient(lineX,lineY,lineX+lineW,lineY);gradient.addColorStop(0,"#e5b85e");gradient.addColorStop(.48,"#25caff");gradient.addColorStop(.82,"#2878ff");gradient.addColorStop(1,"#e5b85e");ctx.strokeStyle=gradient;}else{ctx.strokeStyle=layer.underlineColor||"#ffffff";}ctx.lineWidth=(Number(layer.underlineThickness)||4)*sf;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(lineX,lineY);ctx.lineTo(lineX+lineW*underlineProgress,lineY);ctx.stroke();ctx.restore();}}
      ctx.restore();
    });
    ctx.restore();
  }
  function stopPreview(){if(previewFrame)cancelAnimationFrame(previewFrame);previewFrame=0;previewing=false;}
  function animate(now){if(!previewing)return;if(!startedAt)startedAt=now;const t=(previewOffset+(now-startedAt)/1000)%totalDuration();drawFrame(t);previewFrame=requestAnimationFrame(animate);}
  function preview(){if(!scenes.length&&!storyData().length&&!titleInput.value.trim()&&!subtitleInput.value.trim()&&!textInput?.value.trim()){say("برای پیش‌نمایش، یک صحنه متنی یا عکس اضافه کن؛ عنوان و نام اختیاری‌اند.");return;}stopPreview();startedAt=0;previewing=true;previewFrame=requestAnimationFrame(animate);say(scenes.length?"پیش‌نمایش ویدئوی تصویری فعال است.":"پیش‌نمایش ویدئوی متن‌محور فعال است.");}
  function updateReady(){const ready=scenes.length>0||storyData().length>0||!!(titleInput.value.trim()||subtitleInput.value.trim()||textInput?.value.trim());previewBtn.disabled=!ready;renderBtn.disabled=!ready||!window.MediaRecorder||!canvas.captureStream;say(scenes.length?scenes.length+" عکس آماده تدوین است.":ready?"ویدیوی متن‌محور آماده ساخت است.":"عکس یا متن ویدئو را وارد کن.");}
  imageInput.addEventListener("change",()=>{
    const files=Array.from(imageInput.files||[]);if(!files.length)return;
    if(files.length>20){say("حداکثر ۲۰ عکس می‌توانی انتخاب کنی.");imageInput.value="";return;}
    const imageExtension=/\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i;
    const invalid=files.find(f=>(!(f.type||"").toLowerCase().startsWith("image/")&&!imageExtension.test(f.name||""))||f.size>20*1024*1024);
    if(invalid){say("هر فایل باید تصویر معتبر و حداکثر ۲۰ مگابایت باشد: "+invalid.name);imageInput.value="";return;}
    scenes.forEach(s=>URL.revokeObjectURL(s.url));scenes=[];stopPreview();
    sceneList.textContent="در حال بارگذاری "+files.length+" عکس…";
    say("در حال خواندن عکس‌های انتخاب‌شده…");
    Promise.all(files.map(file=>new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{if(img.naturalWidth>0&&img.naturalHeight>0)resolve({file,url,image:img});else{URL.revokeObjectURL(url);reject(new Error("تصویر قابل‌خواندن نیست: "+file.name));}};
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("خواندن تصویر ناموفق بود: "+file.name));};
      img.src=url;
    }))).then(items=>{
      scenes=items;resize();renderSceneList();refreshScenePhotoOptions();if(activeBuildMode()==="navi"&&storyCards().length){const card=storyCards()[0],gallery=card.querySelector("[data-story-image-gallery]");if(gallery)gallery.dataset.selectedIds=scenes.map(photoId).join(",");const mode=card.querySelector("[data-scene-content-mode]");if(mode)mode.value=card.querySelector("[data-layer-text]")?.value.trim()?"mixed":"image";refreshScenePhotoOptions();const label=$("navaVideoNaviPhotosLabel");if(label)label.textContent=scenes.length+" عکس انتخاب شد.";}if(quickModePending&&storyCards().length){const card=storyCards()[0],gallery=card.querySelector("[data-story-image-gallery]");if(gallery)gallery.dataset.selectedIds=photoId(scenes[0]);const mode=card.querySelector("[data-scene-content-mode]");if(mode)mode.value="mixed";const textArea=card.querySelector("[data-layer-text]");if(textArea&&$("navaVideoQuickPrompt")?.value){const q=$("navaVideoQuickPrompt").value;const quoted=q.match(/[«“"]([^»”"]+)[»”"]/);textArea.value=quoted?quoted[1]:q;}refreshScenePhotoOptions();$("navaVideoQuickFile").textContent="عکس انتخاب شد: "+scenes[0].file.name;quickModePending=false;}drawFrame(0);updateReady();
      saveModeState(activeBuildMode());say(items.length+" عکس با موفقیت بارگذاری شد؛ حالا می‌توانی آن‌ها را به صحنه‌ها اضافه کنی.");
    }).catch(e=>{sceneList.textContent="بارگذاری عکس ناموفق بود؛ دوباره انتخاب کن.";say(e.message||"خواندن عکس‌ها ناموفق بود.");});
  });
  musicInput.addEventListener("change",()=>{const file=musicInput.files&&musicInput.files[0];if(!file)return;if(!file.type.startsWith("audio/")){say("فایل صوتی معتبر انتخاب کن.");musicInput.value="";return;}if(musicUrl)URL.revokeObjectURL(musicUrl);musicUrl=URL.createObjectURL(file);musicFile=file;if(!musicElement){musicElement=new Audio();musicElement.preload="auto";musicElement.loop=false;}musicElement.src=musicUrl;if(activeBuildMode()==="navi"){const label=$("navaVideoNaviMusicLabel");if(label)label.textContent="موسیقی انتخاب شد: "+file.name;}saveModeState(activeBuildMode());say("موسیقی آماده است.");});
  [titleInput,subtitleInput,formatInput,motionInput,textInput,wordMotionInput,wordSpeedInput,durationInput].filter(Boolean).forEach(el=>el.addEventListener("input",()=>{resize();drawFrame(0);updateReady();}));
  previewBtn.addEventListener("click",preview);
  if(storyList){
    const refreshStory=()=>{storyCards().forEach((card,i)=>{card.querySelector(".nava-video-story-card-head strong").textContent="صحنه "+(i+1);card.querySelector("[data-remove-story]").disabled=storyCards().length===1;});resize();drawFrame(0);updateReady();};
    addStoryBtn?.addEventListener("click",()=>{const card=document.createElement("article");card.className="nava-video-story-card";card.setAttribute("data-story-scene","");card.innerHTML='<div class="nava-video-story-card-head"><strong></strong><button type="button" data-remove-story>حذف صحنه</button></div><div class="nava-video-text-layers">'+layerMarkup(1)+'</div><button class="nava-video-add-layer" type="button" data-add-layer>＋ افزودن لایه متن</button><details class="nava-video-scene-design"><summary>پس‌زمینه و قاب مستقل صحنه</summary><div class="nava-video-scene-design-grid"><label>پس‌زمینه<select data-scene-background><option value="default" selected>پیش‌فرض متن (سرمه‌ای و خاکستری)</option><option value="black">مشکی</option><option value="light">روشن</option><option value="warm">خاکستری گرم</option></select></label><label>رنگ دلخواه پس‌زمینه<input type="color" data-scene-background-color value="#18243b"></label><label class="nava-video-scene-frame-toggle"><input type="checkbox" data-scene-frame> قاب ظریف مستقل</label><label>شکل قاب<select data-scene-frame-shape><option value="landscape">مستطیل افقی</option><option value="portrait">مستطیل عمودی</option><option value="square">مربع</option></select></label><label>حرکت عکس<select data-photo-motion><option value="" selected>هوشمند و متنوع</option><option value="slow-zoom">زوم به داخل</option><option value="slow-pull">زوم معکوس</option><option value="pan-left">حرکت چپ</option><option value="pan-right">حرکت راست</option><option value="pan-up">حرکت بالا</option><option value="pan-down">حرکت پایین</option><option value="diagonal-in">حرکت مورب به داخل</option><option value="diagonal-out">حرکت مورب به بیرون</option><option value="none">بدون حرکت</option></select></label><label>نوشته گوشه قاب<input type="text" data-scene-frame-title maxlength="32" placeholder="مثلاً NAVA"></label></div></details><div class="nava-video-scene-content-tools"><label>محتوای صحنه<select data-scene-content-mode><option value="text">فقط متن</option><option value="image">فقط عکس</option><option value="mixed" selected>متن و عکس</option></select></label><label>میزان تاری عکس <output data-scene-photo-blur-value>۰</output><input type="range" data-scene-photo-blur min="0" max="12" step="1" value="0"></label></div><div class="nava-video-scene-media"><label>عکس‌های این صحنه <small>(برای انتخاب، روی عکس‌ها بزن)</small><div class="nava-video-photo-gallery" data-story-image-gallery data-selected-ids="" role="group" aria-label="انتخاب عکس‌های این صحنه"></div></label><label>چیدمان عکس‌ها<select data-story-layout><option value="single">تک‌عکس</option><option value="diagonal">سه عکس اریب با سایه</option><option value="triptych">سه قاب کنار هم</option><option value="grid">چهارخانه</option><option value="stagger">پلکانی</option><option value="hero-stack">یک قاب بزرگ با قاب‌های کوچک</option><option value="polaroid">قاب‌های شناور</option><option value="free">ترکیب آزاد</option></select></label><details class="nava-video-photo-settings"><summary>تنظیمات چیدمان عکس‌ها</summary><div class="nava-video-photo-setting-grid"><label>اندازه عکس‌ها<select data-photo-scale><option value="0.82">کوچک</option><option value="1" selected>متوسط</option><option value="1.16">بزرگ</option></select></label><label>جایگاه عمودی<select data-photo-y><option value="0.16">بالاتر</option><option value="0.28" selected>وسط</option><option value="0.40">پایین‌تر</option></select></label><label>فاصله و زاویه<select data-photo-spread><option value="0.7">جمع‌وجور</option><option value="1" selected>معمولی</option><option value="1.3">بازتر و چرخش بیشتر</option></select></label></div></details></div><div class="nava-video-story-fields"><label>مدت نمایش<select data-story-duration><option value="2">۲ ثانیه</option><option value="3">۳ ثانیه</option><option value="4" selected>۴ ثانیه</option><option value="5">۵ ثانیه</option><option value="6">۶ ثانیه</option><option value="8">۸ ثانیه</option></select></label></div>';storyList.append(card);refreshScenePhotoOptions();refreshStory();card.querySelector("[data-layer-text]").focus();});storyList.addEventListener("input",e=>{if(e.target.matches("[data-scene-photo-blur]")){const out=e.target.closest("[data-story-scene]")?.querySelector("[data-scene-photo-blur-value]");if(out)out.textContent=String(e.target.value);}refreshStory();});storyList.addEventListener("change",async e=>{if(e.target.matches("[data-scene-content-mode]"))refreshScenePhotoOptions();refreshStory();if(e.target.matches("[data-story-layout]")){const card=e.target.closest("[data-story-scene]");let elapsed=0;for(const prior of storyCards()){if(prior===card)break;const priorImage=!!prior.querySelector("[data-story-image-gallery]")?.dataset.selectedIds;const priorHasText=Array.from(prior.querySelectorAll("[data-layer-text]")).some(el=>el.value.trim());if(priorHasText||priorImage)elapsed+=Number(prior.querySelector("[data-story-duration]")?.value)||4;}requestAnimationFrame(()=>{const targetTime=Math.min(Math.max(0,totalDuration()-.001),elapsed+.015);previewOffset=targetTime;drawFrame(targetTime);});}});
    storyList.addEventListener("click",e=>{const photo=e.target.closest("[data-photo-id]");if(photo){if(photo.disabled)return;const gallery=photo.closest("[data-story-image-gallery]"),ids=new Set((gallery.dataset.selectedIds||"").split(",").filter(Boolean)),id=photo.dataset.photoId;ids.has(id)?ids.delete(id):ids.add(id);gallery.dataset.selectedIds=Array.from(ids).join(",");refreshScenePhotoOptions();refreshStory();const card=photo.closest("[data-story-scene]");let elapsed=0;for(const prior of storyCards()){if(prior===card)break;if(prior.querySelector("[data-layer-text]")?.value.trim()||prior.querySelector("[data-story-image-gallery]")?.dataset.selectedIds)elapsed+=Number(prior.querySelector("[data-story-duration]")?.value)||4;}previewOffset=Math.min(Math.max(0,totalDuration()-.001),elapsed+.015);drawFrame(previewOffset);return;}const add=e.target.closest("[data-add-layer]");if(add){const card=add.closest("[data-story-scene]"),holder=card.querySelector(".nava-video-text-layers");const nextIndex=holder.querySelectorAll("[data-story-layer]").length+1;holder.insertAdjacentHTML("beforeend",layerMarkup(nextIndex));const added=holder.querySelectorAll("[data-story-layer]")[nextIndex-1];const offset=added.querySelector("[data-layer-offset]"),delay=added.querySelector("[data-layer-delay]");if(offset)offset.value=String(Math.min(30,(nextIndex-1)*10));if(delay)delay.value=String(Math.min(6,nextIndex-1));refreshStory();return;}const remove=e.target.closest("[data-remove-layer]");if(remove){const card=remove.closest("[data-story-scene]"),holder=card.querySelector(".nava-video-text-layers");if(holder.querySelectorAll("[data-story-layer]").length>1){remove.closest("[data-story-layer]").remove();holder.querySelectorAll("[data-story-layer]").forEach((el,i)=>el.querySelector(".nava-video-layer-head strong").textContent="لایه متن "+(i+1));refreshStory();}}});$("navaVideoTextPersistence")?.addEventListener("change",()=>drawFrame(0));
    storyList.addEventListener("click",e=>{const btn=e.target.closest("[data-remove-story]");if(btn&&storyCards().length>1){btn.closest("[data-story-scene]").remove();refreshStory();}});
  }
  const sharedOutput=root.querySelector(".nava-video-shared-output");
  root.querySelectorAll("[data-video-tab]").forEach(btn=>btn.addEventListener("click",()=>{root.querySelectorAll("[data-video-tab]").forEach(b=>{const active=b===btn;b.classList.toggle("is-active",active);b.setAttribute("aria-selected",String(active));});root.querySelectorAll(".nava-video-panel").forEach(p=>{const active=p.id===btn.getAttribute("aria-controls");p.hidden=!active;p.classList.toggle("is-active",active);});if(sharedOutput&&btn.dataset.videoTab==="text")root.querySelector("#navaVideoPanelText").append(sharedOutput);}));

  $("navaVideoAskNavi")?.addEventListener("click",()=>{
    const brief=(briefInput?.value||"").trim(),result=$("navaVideoNaviResult");
    if(!brief){result.textContent="ابتدا بریف ویدئو را بنویس.";return;}
    if(!scenes.length){result.textContent="برای ساخت با ناوی، ابتدا دست‌کم یک عکس انتخاب کن.";return;}
    const imageNames=scenes.map((scene,i)=>(i+1)+". "+scene.file.name);
    const selectedMusicFile=musicFile;
    const musicInfo=selectedMusicFile?selectedMusicFile.name+" ("+selectedMusicFile.type+")":"انتخاب نشده";
    const quoted=brief.match(/[«“"]([^»”"]+)[»”"]/);
    if(quoted&&storyCards()[0]?.querySelector("[data-layer-text]"))storyCards()[0].querySelector("[data-layer-text]").value=quoted[1];
    const first=storyCards()[0],gallery=first?.querySelector("[data-story-image-gallery]");
    if(gallery)gallery.dataset.selectedIds=scenes.map(photoId).join(",");
    const contentMode=first?.querySelector("[data-scene-content-mode]");
    if(contentMode)contentMode.value=quoted?"mixed":"image";
    refreshScenePhotoOptions();
    smartAutoBuild=true;smartAutoBuildMode="navi";
    result.textContent="ناوی در حال بررسی بریف، عکس‌ها و موسیقی و طراحی ویدئو است…";
    const prompt="نقش تو کارگردان خلاق، استراتژیست روایت و طراح موشن این ویدئو است؛ صرفاً خلاصه‌نویس بریف نیستی. ابتدا منظور، مخاطب، هدف، لحن و پیام اصلی بریف را استخراج کن و سپس آن را به یک سناریوی تصویری حرفه‌ای و قابل‌اجرا تبدیل کن. تصمیم‌های خلاقانه را خودت بگیر، اما هیچ خواسته صریح کاربر را تغییر نده. از ایده‌های کلیشه‌ای، متن‌های تبلیغاتی بی‌ربط، تکرار یک جمله در چند صحنه و توصیف‌های مبهم پرهیز کن.\nبریف دقیق کاربر (مرجع اصلی؛ خواسته‌ها و محدودیت‌هایش را حفظ کن):\n"+brief+
      "\nرسانه‌های تصویری انتخاب‌شده به ترتیب:\n"+imageNames.join("\n")+
      "\nموسیقی انتخاب‌شده: "+musicInfo+
      "\nکیفیت سناریو: شروع ویدئو باید در ۱ تا ۲ ثانیه اول توجه مخاطب را جلب کند؛ سپس پیام را با توالی منطقی و بدون تکرار پیش ببر و در صورت تناسب با هدف، پایان‌بندی یا دعوت به اقدام طبیعی داشته باش. متن روی تصویر کوتاه، خوانا، دقیق و متناسب با همان تصویر باشد؛ متن خام بریف را عیناً روی فیلم نگذار، مگر کاربر صریحاً متن مشخصی خواسته باشد. اگر نام برند، محصول، عدد یا عبارت مشخصی در بریف آمده، آن را دقیق حفظ کن و چیزی جعل نکن. لحن، زبان و مخاطب بریف را رعایت کن؛ برای متن فارسی، عبارت‌ها طبیعی و کوتاه باشند.\nتمام عکس‌های انتخاب‌شده را حتماً در ویدئو به کار ببر و هیچ عکسی را حذف نکن. هر عکس باید حداقل یک بار در برنامه صحنه‌ها ارجاع داده شود؛ اگر چند عکس در یک صحنه مناسب‌اند، شماره همه آن‌ها را در فرمان عکس همان صحنه بیاور. تعداد صحنه‌ها حداکثر ۶ است و در صورت بیشتر بودن عکس‌ها، آن‌ها را منطقی بین صحنه‌ها تقسیم کن. برای هر صحنه متن اختصاصی و متفاوت بنویس. زمان هر صحنه را متناسب با محتوا تعیین کن؛ زمان کل برابر مجموع مدت صحنه‌ها باشد. موسیقی انتخاب‌شده را به‌عنوان صدای پس‌زمینه خروجی به کار ببر.\nطراحی تایپوگرافی: متن‌های هر صحنه نباید روی هم بیفتند یا در یک نقطه انباشته شوند. اگر دو لایه متن در یک صحنه وجود دارد، جایگاه‌های متفاوت مثل بالا و پایین بده؛ برای سه لایه از بالا، مرکز و پایین استفاده کن. سلسله‌مراتب اندازه بساز و در صورت تناسب فونت‌ها را متنوع کن؛ فونت ساده و خوانا را برای پیام اصلی و نستعلیق یا شکسته را فقط برای عبارت کوتاه و تأکیدی به کار ببر. هر لایه باید ترکیب‌بندی مستقل و فضای تنفس داشته باشد. قاب مستطیلی با خط بسیار نازک فقط وقتی واقعاً به خوانایی و ترکیب‌بندی کمک می‌کند استفاده شود؛ قاب را اجباری یا تزئینی نکن.\nحرکت عکس‌ها: حرکت‌ها آرام، نرم و متنوع باشند؛ بین زوم آهسته، حرکت افقی آرام به چپ یا راست و عقب‌کشیدن نرم تنوع ایجاد کن. از زوم تند، لرزش، چرخش شدید و حرکت یکسان برای همه عکس‌ها پرهیز کن.\n"+
      "پاسخ را با یک سناریوی کوتاه و روشن شروع کن. سپس بخش مستقل «دستورهای اجرایی استودیو» را بنویس. فرمان‌ها باید فقط از قابلیت‌های واقعی موتور استفاده کنند، هر فرمان در یک خط و با نام صحنه/لایه مشخص باشد. برای هر صحنه متن دقیق قابل‌نمایش را با قالب «متن صحنه ۱ لایه ۱: ...» بنویس؛ اگر چند لایه دارد شماره لایه را افزایش بده. عکس‌ها را با قالب «عکس صحنه ۱: ۱،۲» و مدت را با قالب «مدت صحنه ۱: ۵ ثانیه» مشخص کن. شماره صحنه‌ها را از ۱ و شماره لایه‌ها را از ۱ شروع کن. اگر بریف متن مشخصی ندارد، متن تبلیغاتی یا روایی مناسب خودت بنویس. فرمان‌های مبهم یا صرفاً توصیفی ننویس.";
    if(typeof window.openNaviAssistant==="function"&&typeof window.navaVideoNaviRequest==="function"){
      window.openNaviAssistant({service:"ویدئو و صدا",message:prompt,context:{studio:"ویدئو و صدا",brief,images:imageNames,imageCount:scenes.length,music:musicInfo,selectedMedia:{images:imageNames,music:musicInfo},mode:"navi-auto-build",capabilities:["multi-scene text and image composition","photo selection and ordering","per-layer text motion and delay","scene duration and background","photo layout and motion","background music","video render and export"]}});
      const submitted=window.navaVideoNaviRequest({message:prompt});
      if(!submitted){smartAutoBuild=false;result.textContent="درخواست به ناوی ارسال نشد؛ نشست ورود را بررسی کن.";}
    }else{smartAutoBuild=false;result.textContent="ارسال خودکار به NAVI در دسترس نیست؛ صفحه را به‌روزرسانی کن.";}

  });
  let renderTimer=0,renderWatchdog=0;
  function finishRender(message){
    if(renderTimer){clearInterval(renderTimer);renderTimer=0;}
    if(renderWatchdog){clearTimeout(renderWatchdog);renderWatchdog=0;}
    if(recorder&&recorder.state!=="inactive"){try{recorder.stop();}catch(_){}}
    else if(recording){recording=false;renderBtn.disabled=false;previewBtn.disabled=false;say(message||"ضبط ویدئو متوقف شد.");}
  }
  renderBtn.addEventListener("click",async()=>{
    if((!scenes.length&&!storyData().length&&!titleInput.value.trim()&&!subtitleInput.value.trim()&&!textInput?.value.trim())||recording)return;
    if(!window.MediaRecorder||!canvas.captureStream){say("این مرورگر ضبط ویدئو را پشتیبانی نمی‌کند.");return;}
    try{
      stopPreview();
      const renderStory=storyData();
      const renderDuration=renderStory.length?renderStory.reduce((sum,s)=>sum+s.duration,0):(Number(durationInput?.value)||8);
      if(renderStory.length>1) say("در حال ساخت "+renderStory.length+" صحنه متوالی…");
      resize();drawFrame(0,renderStory,renderDuration);
      const mime=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(t=>MediaRecorder.isTypeSupported(t));
      if(!mime){say("کدک سازگار پیدا نشد.");return;}
      const stream=canvas.captureStream(20);
      if(musicElement){
        if(!audioContext){audioContext=new (window.AudioContext||window.webkitAudioContext)();audioSource=audioContext.createMediaElementSource(musicElement);audioDestination=audioContext.createMediaStreamDestination();musicGain=audioContext.createGain();audioSource.connect(musicGain);musicGain.connect(audioDestination);}
        await audioContext.resume();
        musicGain.gain.value=Math.max(0,Number(musicVolume.value)/100);
        audioDestination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
        musicElement.currentTime=0;
        await musicElement.play();
      }
      chunks=[];recording=true;renderBtn.disabled=true;previewBtn.disabled=true;progress.style.width="0%";
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2200000});
      recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
      recorder.onerror=()=>{
        stream.getTracks().forEach(t=>t.stop());if(musicElement)musicElement.pause();
        recording=false;renderBtn.disabled=false;previewBtn.disabled=false;
        if(renderTimer){clearInterval(renderTimer);renderTimer=0;}
        if(renderWatchdog){clearTimeout(renderWatchdog);renderWatchdog=0;}
        say("ضبط ویدئو با خطا متوقف شد؛ دوباره تلاش کن.");
      };
      recorder.onstop=()=>{
        if(renderTimer){clearInterval(renderTimer);renderTimer=0;}
        if(renderWatchdog){clearTimeout(renderWatchdog);renderWatchdog=0;}
        stream.getTracks().forEach(t=>t.stop());if(musicElement)musicElement.pause();
        recording=false;renderBtn.disabled=false;previewBtn.disabled=false;
        const blob=new Blob(chunks,{type:mime});
        if(!blob.size){say("فایل ویدئو خالی ساخته شد؛ لطفاً دوباره تلاش کن.");return;}
        if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=URL.createObjectURL(blob);
        const video=$("navaVideoOutput");video.src=outputUrl;
        const link=$("navaVideoDownload");link.href=outputUrl;link.download="nava-multiphoto-video.webm";link.hidden=false;
        result.hidden=false;progress.style.width="100%";
        say("ویدئو آماده شد؛ از همین تب می‌توانی آن را پخش یا دریافت کنی.");
      };
      recorder.start(250);
      const start=performance.now(),duration=renderDuration,fade=Number(fadeInput.value),baseVolume=Math.max(0,Number(musicVolume.value)/100);
      const tick=()=>{
        if(!recording)return;
        const t=Math.min((performance.now()-start)/1000,duration);
        drawFrame(t,renderStory,duration);
        if(musicElement&&musicGain){
          const remaining=duration-t;
          const factor=fade>0?Math.max(0,Math.min(1,t/fade,remaining/fade)):1;
          musicGain.gain.setTargetAtTime(baseVolume*factor,audioContext.currentTime,0.04);
        }
        progress.style.width=Math.min(100,t/duration*100)+"%";
        if(t>=duration){finishRender();return;}
      };
      say("در حال ساخت ویدئو با تنظیمات سازگار با گوشی؛ لطفاً صفحه را باز و روشن نگه دار.");
      tick();
      renderTimer=setInterval(tick,33);
      renderWatchdog=setTimeout(()=>{if(recording)finishRender("ساخت ویدئو بیش از زمان مجاز طول کشید؛ دوباره با عکس‌های کم‌حجم‌تر امتحان کن.");},(duration+20)*1000);
    }catch(e){
      recording=false;
      if(recorder&&recorder.state!=="inactive"){try{recorder.stop();}catch(_){}}
      renderBtn.disabled=false;previewBtn.disabled=false;
      say("ساخت ویدئو ناموفق بود: "+(e.message||"خطای ناشناخته"));
    }
  });
  syncSetupMode();
  say("چند عکس یا صحنه متنی اضافه کن تا ساخت ویدئو را شروع کنیم.");
})();