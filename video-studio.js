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
  let scenes=[],musicUrl="",musicFile=null,musicElement=null,audioContext=null,audioSource=null,audioDestination=null,musicGain=null,previewMasterGain=null,previewMuted=false,previewFrame=0,recorder=null,chunks=[],recording=false,startedAt=0,previewing=false,previewOffset=0,outputUrl="",lowPowerRender=false;
  const storyList=$("navaVideoStoryList"),addStoryBtn=$("navaVideoAddScene");
  const fontInput=$("navaVideoFont"),manualMotionInput=$("navaVideoManualMotion");
  const briefInput=$("navaVideoBrief"),manualBriefInput=$("navaVideoManualBrief"),applyBriefBtn=$("navaVideoApplyBrief");
  let smartAutoBuild=false,smartAutoBuildMode=null,naviPlanRetryCount=0,depthMotionModule=null,depthMotionModulePromise=null;
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
      naviPhotosLabel:$("navaVideoNaviPhotosLabel")?.textContent||"هنوز عکسی انتخاب نشده است.",
      naviMusicLabel:$("navaVideoNaviMusicLabel")?.textContent||"موسیقی اختیاری است."
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
    const photosLabel=$("navaVideoNaviPhotosLabel");if(photosLabel)photosLabel.textContent=state?.naviPhotosLabel||"هنوز عکسی انتخاب نشده است.";
    const musicLabel=$("navaVideoNaviMusicLabel");if(musicLabel)musicLabel.textContent=state?.naviMusicLabel||"موسیقی اختیاری است.";
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
  const syncSetupMode=()=>{const mode=setupMode();root.classList.toggle("navi-build-active",mode==="navi");root.dataset.buildModeActive=mode;root.querySelectorAll("[data-build-mode]").forEach(tab=>{const active=tab.dataset.buildMode===mode;tab.classList.toggle("is-active",active);tab.setAttribute("aria-selected",String(active));});root.querySelectorAll("[data-build-panel]").forEach(panel=>{panel.hidden=panel.dataset.buildPanel!==mode;});if(mode==="manual"){if(fontInput)activateFont(fontInput.value||"sans-serif");textDirection="rtl";storyCards().forEach(card=>card.querySelectorAll("[data-layer-motion]").forEach(el=>{if(manualMotionInput)el.value=toLayerMotion(manualMotionInput.value);}));}resize();drawFrame(0);};root.querySelectorAll("[data-build-mode]").forEach(tab=>tab.addEventListener("click",()=>activateBuildMode(tab.dataset.buildMode)));$("navaVideoNaviChoosePhotos")?.addEventListener("click",()=>imageInput?.click());$("navaVideoNaviChooseMusic")?.addEventListener("click",()=>musicInput?.click());applyBriefBtn?.addEventListener("click",applyBrief);

  function buildNaviScenePlan(reply){
    const raw=String(reply||"");
    const blocks=[...raw.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)].map(m=>m[1]);
    blocks.push(raw);
    let plan=null;
    for(const candidate of blocks){
      const first=candidate.indexOf("{");if(first<0)continue;
      let depth=0,inString=false,escaped=false;
      for(let i=first;i<candidate.length;i++){
        const ch=candidate[i];
        if(inString){if(escaped)escaped=false;else if(ch==="\\")escaped=true;else if(ch==='"')inString=false;continue;}
        if(ch==='"'){inString=true;continue;}
        if(ch==="{")depth++;else if(ch==="}")depth--;
        if(depth===0){try{const parsed=JSON.parse(candidate.slice(first,i+1));if(parsed?.schema==="nava.video.scene-plan.v1"&&Array.isArray(parsed.scenes)){plan=parsed;break;}}catch(_){}break;}
      }
      if(plan)break;
    }
    if(!plan){resultStatusNavi("طرح ساختاریافته ناوی دریافت نشد؛ برای جلوگیری از اجرای حدسی، ویدئو ساخته نشد. دوباره درخواست طراحی را ارسال کن.");return false;}
    if(!plan.scenes.length||plan.scenes.length>20){resultStatusNavi("تعداد صحنه‌های طرح ناوی معتبر نیست؛ طرح باید بین ۱ تا ۲۰ صحنه داشته باشد.");return false;}
    const allowed={transition:["cut","fade","slide-left","slide-right","zoom","page-turn"],colorMode:["auto","manual"],layout:["single","diagonal","triptych","grid","stagger","hero-stack","polaroid","free"],photoMotion:["","slow-zoom","slow-pull","pan-left","pan-right","pan-up","pan-down","diagonal-in","diagonal-out","depth-parallax","none"],position:["top","center","bottom"],align:["right","center","left"],motion:["auto","from-right","from-left","from-top","from-bottom","fade","none","from-bottom-left","from-top-right","scale-in"],reveal:["none","word","char"],sound:["none","type","impact","whoosh","sparkle"],exit:["stay","fade","right","left","top","bottom"],font:["auto","Tahoma, sans-serif","IranNastaliq, serif","Dima Shekasteh, serif"],background:["default","black","light","warm"],frameShape:["landscape","portrait","square"],contentMode:["text","image","mixed"],style:["normal","italic"],orientation:["horizontal","vertical"]};
    const maxImages={single:1,diagonal:3,triptych:3,grid:4,stagger:4,"hero-stack":4,polaroid:4,free:4};
    const invalidScene=plan.scenes.findIndex(scene=>{
      if(!scene||!Number.isFinite(Number(scene.duration))||Number(scene.duration)<2||Number(scene.duration)>8)return true;
      if(!Array.isArray(scene.images)||scene.images.some(n=>!Number.isInteger(Number(n))||Number(n)<1||Number(n)>scenes.length))return true;
      if(!allowed.transition.includes(scene.transition||"cut")||!allowed.contentMode.includes(scene.contentMode)||!allowed.layout.includes(scene.layout)||!allowed.photoMotion.includes(scene.photoMotion)||!allowed.background.includes(scene.background))return true;
      if(scene.images.length>maxImages[scene.layout])return true;
      if(scene.transition==="page-turn"&&(scene.layout!=="single"||scene.images.length!==1))return true;
      if(!Number.isFinite(Number(scene.photoScale))||Number(scene.photoScale)<0.82||Number(scene.photoScale)>1.16||!Number.isFinite(Number(scene.photoY))||Number(scene.photoY)<0.16||Number(scene.photoY)>0.40||!Number.isFinite(Number(scene.photoSpread))||Number(scene.photoSpread)<0.7||Number(scene.photoSpread)>1.3||!/^#[0-9a-f]{6}$/i.test(String(scene.backgroundColor||"")))return true;
      if(!scene.frame||typeof scene.frame.enabled!=="boolean"||!allowed.frameShape.includes(scene.frame.shape))return true;
      if(!Array.isArray(scene.layers)||scene.layers.length>6)return true;
      const hasText=scene.layers.some(layer=>String(layer?.text||"").trim());
      if(scene.contentMode==="image"&&(hasText||!scene.images.length))return true;
      if(scene.contentMode==="text"&&(scene.images.length||!hasText))return true;
      if(scene.contentMode==="mixed"&&!hasText&&!scene.images.length)return true;
      if(!scene.images.length&&!hasText&&!scene.frame.enabled&&scene.background==="default")return true;
      return scene.layers.some(layer=>!layer||typeof layer.text!=="string"||!allowed.position.includes(layer.position)||!allowed.align.includes(layer.align)||!allowed.motion.includes(layer.motion)||!allowed.reveal.includes(layer.reveal||"none")||!allowed.sound.includes(layer.sound||"none")||!allowed.exit.includes(layer.exit)||!allowed.font.includes(layer.font)||!allowed.style.includes(layer.style)||!allowed.orientation.includes(layer.orientation)||!allowed.colorMode.includes(layer.colorMode||"auto")||!Number.isFinite(Number(layer.delay))||Number(layer.delay)<0||Number(layer.delay)>6||!Number.isFinite(Number(layer.size))||Number(layer.size)<24||Number(layer.size)>68||!/^#[0-9a-f]{6}$/i.test(String(layer.color||"")));
    });
    if(invalidScene>=0){resultStatusNavi("طرح ناوی در صحنه "+(invalidScene+1)+" با محدودیت‌های اجرایی موتور سازگار نیست؛ هیچ تنظیمی اعمال نشد. طرح را دوباره تولید کن.");return false;}
    const plannedImages=new Set(plan.scenes.flatMap(scene=>Array.isArray(scene.images)?scene.images.map(Number):[]));
    const unplannedImages=scenes.map((_,i)=>i+1).filter(n=>!plannedImages.has(n));
    if(unplannedImages.length){resultStatusNavi("ناوی این عکس‌ها را در سناریو قرار نداده است: "+unplannedImages.join("، ")+"؛ هیچ عکس به‌صورت خودکار به صحنه‌ای اضافه نشد.");return false;}
    if(!["portrait","landscape"].includes(plan.format)||!["keep","replace"].includes(plan.textPersistence)){resultStatusNavi("تنظیمات کلی طرح ناوی معتبر نیست؛ هیچ تغییری اعمال نشد.");return false;}
    while(storyCards().length<plan.scenes.length)addStoryBtn?.click();
    while(storyCards().length>plan.scenes.length){const last=storyCards().at(-1);last?.querySelector("[data-remove-story]")?.click();}
    const activeCards=storyCards();
    const set=(el,value,list)=>{if(!el||!list.includes(value))return false;const option=Array.from(el.options||[]).find(o=>o.value===String(value));if(!option)return false;el.value=String(value);return true;};
    const setNumber=(el,value,min,max)=>{if(!el||!Number.isFinite(Number(value)))return;const wanted=Math.max(min,Math.min(max,Number(value))),options=Array.from(el.options||[]);if(options.length){const closest=options.reduce((best,o)=>Math.abs(Number(o.value)-wanted)<Math.abs(Number(best.value)-wanted)?o:best,options[0]);el.value=closest.value;}else el.value=String(wanted);};
    plan.scenes.forEach((scene,index)=>{
      const card=activeCards[index];if(!card)return;
      const layers=Array.isArray(scene.layers)?scene.layers.slice(0,6):[],holder=card.querySelector(".nava-video-text-layers");
      while(holder.querySelectorAll("[data-story-layer]").length<layers.length)card.querySelector("[data-add-layer]")?.click();
      const layerNodes=Array.from(card.querySelectorAll("[data-story-layer]"));
      layerNodes.forEach((node,li)=>{
        const item=layers[li],field=node.querySelector("[data-layer-text]");
        if(field)field.value=String(item?.text||"").slice(0,420);
        if(!item)return;
        set(node.querySelector("[data-layer-color-mode]"),item.colorMode||"auto",allowed.colorMode);set(node.querySelector("[data-layer-position]"),item.position,allowed.position);set(node.querySelector("[data-layer-align]"),item.align,allowed.align);set(node.querySelector("[data-layer-motion]"),item.motion,allowed.motion);set(node.querySelector("[data-layer-reveal]"),item.reveal,allowed.reveal);set(node.querySelector("[data-layer-sound]"),item.sound,allowed.sound);setNumber(node.querySelector("[data-layer-delay]"),item.delay,0,6);set(node.querySelector("[data-layer-exit]"),item.exit,allowed.exit);set(node.querySelector("[data-layer-font]"),item.font,allowed.font);setNumber(node.querySelector("[data-layer-size]"),item.size,24,68);set(node.querySelector("[data-layer-style]"),item.style,allowed.style);set(node.querySelector("[data-layer-orientation]"),item.orientation,allowed.orientation);
        const color=node.querySelector("[data-layer-color]");if(color&&/^#[0-9a-f]{6}$/i.test(String(item.color||"")))color.value=item.color;
        const underline=node.querySelector("[data-layer-underline]");if(underline)underline.checked=!!item.underline;
      });
      const imageIndexes=Array.isArray(scene.images)?[...new Set(scene.images.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=scenes.length))]:[];
      const gallery=card.querySelector("[data-story-image-gallery]");if(gallery)gallery.dataset.selectedIds=imageIndexes.map(n=>scenes[n-1]).filter(Boolean).map(photoId).join(",");
      const mode=card.querySelector("[data-scene-content-mode]"),hasText=layers.some(x=>String(x?.text||"").trim()),hasImages=imageIndexes.length>0;
      if(!set(mode,scene.contentMode,allowed.contentMode)&&mode)mode.value=hasImages?(hasText?"mixed":"image"):(hasText?"text":"image");
      set(card.querySelector("[data-scene-transition]"),scene.transition||"cut",allowed.transition);setNumber(card.querySelector("[data-story-duration]"),scene.duration,2,8);set(card.querySelector("[data-story-layout]"),scene.layout,allowed.layout);set(card.querySelector("[data-photo-motion]"),scene.photoMotion,allowed.photoMotion);setNumber(card.querySelector("[data-photo-scale]"),scene.photoScale,.82,1.16);setNumber(card.querySelector("[data-photo-y]"),scene.photoY,.16,.40);setNumber(card.querySelector("[data-photo-spread]"),scene.photoSpread,.7,1.3);set(card.querySelector("[data-scene-background]"),scene.background,allowed.background);
      const frame=scene.frame&&typeof scene.frame==="object"?scene.frame:{},toggle=card.querySelector("[data-scene-frame]");if(toggle)toggle.checked=!!frame.enabled;
      set(card.querySelector("[data-scene-frame-shape]"),frame.shape,allowed.frameShape);
      const frameTitle=card.querySelector("[data-scene-frame-title]");if(frameTitle)frameTitle.value=String(frame.title||"").slice(0,32);
      const bgColor=card.querySelector("[data-scene-background-color]");if(bgColor&&/^#[0-9a-f]{6}$/i.test(String(scene.backgroundColor||"")))bgColor.value=scene.backgroundColor;
    });
    const persistence=$("navaVideoTextPersistence");if(persistence&&["keep","replace"].includes(plan.textPersistence))persistence.value=plan.textPersistence;
    if(["portrait","landscape"].includes(plan.format))formatInput.value=plan.format;
    refreshScenePhotoOptions();resize();drawFrame(0);updateReady();resultStatusNavi("طرح اختصاصی ناوی اعمال شد: "+plan.scenes.length+" صحنه با تنظیمات مستقل.");return true;
  }
  function resultStatusNavi(message){const el=$("navaVideoNaviResult");if(el)el.textContent=message;}
  window.addEventListener("nava:navi-reply",event=>{
    if(event.detail?.service!=="ویدئو و صدا")return;
    if(smartAutoBuildMode&&activeBuildMode()!==smartAutoBuildMode)activateBuildMode(smartAutoBuildMode);
    const reply=String(event.detail.reply||"").trim();
    if(!reply)return;
    const applied=buildNaviScenePlan(reply);
    if(smartAutoBuild){
      if(!applied&&naviPlanRetryCount<1&&typeof window.navaVideoNaviRequest==="function"){
        naviPlanRetryCount++;
        resultStatusNavi("طرح اولیه یک یا چند مقدار نامعتبر داشت؛ ناوی در حال بازبینی و اصلاح طرح خودش است…");
        const repairPrompt="پاسخ JSON قبلی تو در استودیوی ویدئو از نظر اعتبارسنجی موتور نامعتبر بود. خودت طرح را بازبینی و اصلاح کن و فقط یک JSON کامل و معتبر با schema nava.video.scene-plan.v1 بفرست؛ هیچ توضیحی بیرون JSON ننویس. حداکثر ۲۰ صحنه مجاز است. فقط همان صحنه‌ای که transition=page-turn دارد باید دقیقاً یک عکس و layout=single داشته باشد؛ سایر صحنه‌ها را آزادانه و متناسب با بریف با چیدمان‌های چندعکسی طراحی کن. transition فقط cut/fade/slide-left/slide-right/zoom/page-turn، colorMode فقط auto/manual و photoMotion فقط مقادیر مجاز از جمله depth-parallax باشد؛ همه enumها دقیقاً مطابق راهنمای قبلی باشند. photoY باید بین 0.16 و 0.40، photoScale بین 0.82 و 1.16 و photoSpread بین 0.7 و 1.3 باشد. از تمام عکس‌های انتخاب‌شده استفاده کن. پاسخ نامعتبر قبلی برای اصلاح: "+reply;
        if(window.navaVideoNaviRequest({message:repairPrompt,videoPlan:true}))return;
      }
      smartAutoBuild=false;
      if(applied)setTimeout(()=>{if(!renderBtn.disabled)renderBtn.click();else say("طرح ناوی اعمال شد، اما هنوز محتوای قابل‌رندر آماده نیست.");},250);
      smartAutoBuildMode=null;
      naviPlanRetryCount=0;
      if(!applied)resultStatusNavi("ناوی پس از یک بار بازبینی هم طرح معتبر تولید نکرد؛ هیچ تنظیمی حدسی اعمال نشد. بریف را دوباره ارسال کن.");
    }
  });
  manualMotionInput?.addEventListener("change",()=>{if(setupMode()==="manual")storyCards().forEach(card=>card.querySelectorAll("[data-layer-motion]").forEach(el=>{el.value=manualMotionInput.value==="slide-right"?"from-right":manualMotionInput.value==="slide-left"?"from-left":manualMotionInput.value==="rise"?"from-bottom":manualMotionInput.value;}));drawFrame(0);});
  fontInput?.addEventListener("change",()=>activateFont(fontInput.value));

  const storyCards=()=>storyList?Array.from(storyList.querySelectorAll("[data-story-scene]")):[];
  const transitionOptions=[["cut","بدون انتقال"],["fade","محو سینمایی"],["slide-left","ورود از راست"],["slide-right","ورود از چپ"],["zoom","زوم سینمایی"],["page-turn","ورق‌زدن صفحه"]];
  function ensureDepthMotionOption(card){
    const select=card?.querySelector("[data-photo-motion]");if(!select||select.querySelector('option[value="depth-parallax"]'))return;
    const option=document.createElement("option");option.value="depth-parallax";option.textContent="حرکت عمقی سه‌بعدی (AI)";select.append(option);
  }
  function ensureSceneTransitionControl(card){
    const fields=card?.querySelector(".nava-video-story-fields");if(!fields||fields.querySelector("[data-scene-transition]"))return;
    const label=document.createElement("label");label.textContent="انتقال از صحنه قبل";
    const select=document.createElement("select");select.setAttribute("data-scene-transition","");
    transitionOptions.forEach(([value,title])=>{const option=document.createElement("option");option.value=value;option.textContent=title;select.append(option);});
    select.value="cut";label.append(select);fields.append(label);
  }
  function ensureLayerColorMode(layer){
    if(!layer||layer.querySelector("[data-layer-color-mode]"))return;
    const colorLabel=layer.querySelector("[data-layer-color]")?.closest("label");if(!colorLabel)return;
    const label=document.createElement("label");label.textContent="انتخاب رنگ متن";
    const select=document.createElement("select");select.setAttribute("data-layer-color-mode","");
    [["auto","هوشمند بر اساس عکس و خوانایی"],["manual","رنگ دلخواه من"]].forEach(([value,title])=>{const option=document.createElement("option");option.value=value;option.textContent=title;select.append(option);});
    select.value="auto";label.append(select);colorLabel.before(label);
  }
  storyCards().forEach(card=>{ensureSceneTransitionControl(card);ensureDepthMotionOption(card);card.querySelectorAll("[data-story-layer]").forEach(ensureLayerColorMode);});
  const imageVisualCache=new WeakMap();
  function imageVisualSummary(scene){
    const img=scene?.image;if(!img?.complete||!img.naturalWidth)return "اطلاعات رنگی در دسترس نیست";
    if(imageVisualCache.has(img))return imageVisualCache.get(img);
    let summary="تصویر";
    try{
      const sample=document.createElement("canvas");sample.width=24;sample.height=24;
      const sampleCtx=sample.getContext("2d",{willReadFrequently:true});sampleCtx.drawImage(img,0,0,24,24);
      const pixels=sampleCtx.getImageData(0,0,24,24).data;let r=0,g=0,b=0,count=0;
      for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<32)continue;r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];count++;}
      if(count){r=Math.round(r/count);g=Math.round(g/count);b=Math.round(b/count);const hex="#"+[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("");const bright=(.2126*r+.7152*g+.0722*b)/255;const max=Math.max(r,g,b),min=Math.min(r,g,b);const tone=max-min<22?"خنثی":r>g*1.12&&r>b*1.08?"گرم":b>r*1.08?"سرد":"ترکیبی";summary="نسبت "+(img.naturalWidth/img.naturalHeight).toFixed(2)+"، رنگ میانگین "+hex+"، "+(bright>.58?"روشن":bright<.34?"تیره":"میانه")+"، طیف "+tone;}
    }catch(_){summary="نسبت "+(img.naturalWidth/img.naturalHeight).toFixed(2)+"؛ نمونه‌برداری رنگ ممکن نشد";}
    imageVisualCache.set(img,summary);return summary;
  }
  let nextPhotoId=1;
  const photoId=scene=>scene.id||(scene.id="photo-"+(nextPhotoId++));
  const refreshScenePhotoOptions=()=>storyCards().forEach(card=>{const gallery=card.querySelector("[data-story-image-gallery]");if(!gallery)return;const selected=new Set((gallery.dataset.selectedIds||"").split(",").filter(Boolean));gallery.innerHTML="";scenes.forEach((scene,i)=>{const id=photoId(scene),tile=document.createElement("button");tile.type="button";tile.className="nava-video-photo-tile";tile.disabled=gallery.closest("[data-story-scene]")?.querySelector("[data-scene-content-mode]")?.value==="text";tile.dataset.photoId=id;tile.setAttribute("aria-pressed",String(selected.has(id)));const img=document.createElement("img");img.src=scene.url;img.alt="";const name=document.createElement("span");name.textContent=(i+1)+". "+scene.file.name;const mark=document.createElement("b");mark.textContent=selected.has(id)?"✓":"+";tile.append(img,name,mark);gallery.append(tile);});gallery.dataset.selectedIds=Array.from(selected).filter(id=>scenes.some(scene=>photoId(scene)===id)).join(",");});
  const storyData=()=>storyCards().map(card=>({cardRef:card,transition:card.querySelector("[data-scene-transition]")?.value||"cut",contentMode:card.querySelector("[data-scene-content-mode]")?.value||"mixed",photoBlur:Number(card.querySelector("[data-scene-photo-blur]")?.value)||0,layers:(card.querySelector("[data-scene-content-mode]")?.value==="image"?[]:Array.from(card.querySelectorAll("[data-story-layer]"))).map(layer=>({text:layer.querySelector("[data-layer-text]").value.trim(),position:layer.querySelector("[data-layer-position]").value,offset:Number(layer.querySelector("[data-layer-offset]")?.value)||0,align:layer.querySelector("[data-layer-align]").value,motion:layer.querySelector("[data-layer-motion]").value,reveal:layer.querySelector("[data-layer-reveal]")?.value||"none",sound:layer.querySelector("[data-layer-sound]")?.value||"none",font:layer.querySelector("[data-layer-font]")?.value||"auto",size:Number(layer.querySelector("[data-layer-size]").value)||42,delay:Number(layer.querySelector("[data-layer-delay]")?.value)||0,exit:layer.querySelector("[data-layer-exit]")?.value||"stay",underline:!!layer.querySelector("[data-layer-underline]")?.checked,underlineAlign:layer.querySelector("[data-layer-underline-align]")?.value||"match",underlineColor:layer.querySelector("[data-layer-underline-color]")?.value||"#ffffff",underlineThickness:Number(layer.querySelector("[data-layer-underline-thickness]")?.value)||4,underlineWidth:Number(layer.querySelector("[data-layer-underline-width]")?.value)||0.7,style:layer.querySelector("[data-layer-style]")?.value||"normal",orientation:layer.querySelector("[data-layer-orientation]")?.value||"horizontal",reveal:layer.querySelector("[data-layer-reveal]")?.value||"none",sound:layer.querySelector("[data-layer-sound]")?.value||"none",colorMode:layer.querySelector("[data-layer-color-mode]")?.value||"auto",color:layer.querySelector("[data-layer-color]")?.value||"#ffffff",})).filter(layer=>layer.text),duration:Number(card.querySelector("[data-story-duration]").value)||4,imageIds:(card.querySelector("[data-scene-content-mode]")?.value==="text"?[]:(card.querySelector("[data-story-image-gallery]")?.dataset.selectedIds||"").split(",").filter(Boolean)),layout:card.querySelector("[data-story-layout]")?.value||"single",autoLayoutSeed:(card.dataset.autoLayoutSeed||(card.dataset.autoLayoutSeed=Math.random().toString(36).slice(2))),photoScale:Number(card.querySelector("[data-photo-scale]")?.value)||1,photoY:Number(card.querySelector("[data-photo-y]")?.value)||.28,photoSpread:Number(card.querySelector("[data-photo-spread]")?.value)||1,photoMotion:card.querySelector("[data-photo-motion]")?.value||"",background:card.querySelector("[data-scene-background]")?.value||"default",backgroundColor:card.querySelector("[data-scene-background-color]")?.value||"#18243b",frame:!!card.querySelector("[data-scene-frame]")?.checked,frameShape:card.querySelector("[data-scene-frame-shape]")?.value||"landscape",frameTitle:card.querySelector("[data-scene-frame-title]")?.value||"",imageIndex:-1})).filter(s=>s.layers.length||s.imageIds.length||s.frame||s.background!=="default"||s.imageIndex>=0);
  const layerMarkup=(index=1)=>'<div class="nava-video-text-layer" data-story-layer><div class="nava-video-layer-head"><strong>لایه متن '+index+'</strong><button type="button" data-remove-layer>حذف لایه</button></div><label>متن<textarea data-layer-text rows="2" maxlength="420" placeholder="متن این لایه را بنویس..."></textarea></label><details class="nava-video-layer-settings"><summary>تنظیمات بیشتر</summary><div class="nava-video-layer-fields"><label>جای متن<select data-layer-position><option value="top">بالای تصویر</option><option value="center">وسط تصویر</option><option value="bottom" selected>پایین تصویر</option></select></label><label>فاصله عمودی<select data-layer-offset><option value="-30">خیلی بالاتر</option><option value="-20">بالاتر</option><option value="-10">کمی بالاتر</option><option value="0" selected>بدون جابه‌جایی</option><option value="10">کمی پایین‌تر</option><option value="20">پایین‌تر</option><option value="30">خیلی پایین‌تر</option></select></label><label>تراز<select data-layer-align><option value="right" selected>راست‌چین</option><option value="center">وسط‌چین</option><option value="left">چپ‌چین</option></select></label><label>ورود متن<select data-layer-motion><option value="auto" selected>هوشمند و متنوع بین صحنه‌ها</option><option value="from-right">از بیرون کادر راست</option><option value="from-left">از بیرون کادر چپ</option><option value="from-top">از بیرون کادر بالا</option><option value="from-bottom">از بیرون کادر پایین</option><option value="fade">محو و ظاهر شدن</option><option value="none">ثابت</option></select></label><label>روش نمایش متن<select data-layer-reveal><option value="none" selected>نمایش یک‌باره</option><option value="word">کلمه‌به‌کلمه</option><option value="char">حرف‌به‌حرف</option></select></label><label>افکت صوتی متن<select data-layer-sound><option value="none" selected>بدون افکت</option><option value="type">صدای تایپ</option><option value="impact">ضربه سینمایی</option><option value="whoosh">عبور نرم</option><option value="sparkle">درخشش</option></select></label><label>تأخیر شروع<select data-layer-delay><option value="0">بدون تأخیر</option><option value="0.5">نیم ثانیه</option><option value="1">۱ ثانیه</option><option value="1.5">۱٫۵ ثانیه</option><option value="2">۲ ثانیه</option><option value="2.5">۲٫۵ ثانیه</option><option value="3">۳ ثانیه</option><option value="4">۴ ثانیه</option><option value="5">۵ ثانیه</option><option value="6">۶ ثانیه</option></select></label><label>خروج هنگام ورود متن بعدی<select data-layer-exit><option value="stay" selected>باقی بماند</option><option value="fade">محو شود</option><option value="right">حرکت به بیرون راست</option><option value="left">حرکت به بیرون چپ</option><option value="top">حرکت به بیرون بالا</option><option value="bottom">حرکت به بیرون پایین</option></select></label><label>فونت نوشته<select data-layer-font><option value="auto" selected>انتخاب هوشمند و متنوع</option><option value="Tahoma, sans-serif">ساده و خوانا</option><option value="IranNastaliq, serif">ایران نستعلیق</option><option value="Dima Shekasteh, serif">شکسته</option></select></label><label>اندازه نوشته<select data-layer-size><option value="30">کوچک</option><option value="42" selected>متوسط</option><option value="56">بزرگ</option><option value="68">خیلی بزرگ</option></select></label><label>حالت نوشته<select data-layer-style><option value="normal">معمولی</option><option value="italic">اریب</option></select></label><label>جهت نوشته<select data-layer-orientation><option value="horizontal">افقی</option><option value="vertical">عمودی</option></select></label><label>انتخاب رنگ متن<select data-layer-color-mode><option value="auto" selected>هوشمند بر اساس عکس و خوانایی</option><option value="manual">رنگ دلخواه من</option></select></label><label>رنگ فونت<input type="color" data-layer-color value="#ffffff"></label><div class="nava-video-underline-tools"><label class="nava-video-underline-toggle"><input type="checkbox" data-layer-underline> کشیدن خط زیر این متن</label><label>رنگ خط<select data-layer-underline-color><option value="#ffffff">سفید</option><option value="nava-gradient">ترکیبی نوا (طلایی، فیروزه‌ای، آبی)</option><option value="#e5bd62">طلایی</option><option value="#69c7bd">فیروزه‌ای</option><option value="#7da8ff">آبی</option><option value="#ff8d8d">قرمز ملایم</option></select></label><label>ضخامت خط<select data-layer-underline-thickness><option value="2">نازک</option><option value="4" selected>معمولی</option><option value="7">ضخیم</option></select></label><label>طول خط<select data-layer-underline-width><option value="0.4">کوتاه</option><option value="0.7" selected>متوسط</option><option value="1">به‌اندازه متن</option></select></label><label>تراز خط زیر<select data-layer-underline-align><option value="match" selected>هم‌تراز با متن</option><option value="right">راست‌چین</option><option value="center">وسط‌چین</option><option value="left">چپ‌چین</option></select></label></div></div></details></div>';
  // Bring the original first layer into the same compact settings layout as newly added layers.
  storyCards().forEach(layer=>{if(layer.querySelector(".nava-video-layer-settings"))return;const fields=layer.querySelector(".nava-video-layer-fields");if(!fields)return;const details=document.createElement("details");details.className="nava-video-layer-settings";const summary=document.createElement("summary");summary.textContent="تنظیمات بیشتر";details.append(summary);layer.insertBefore(details,fields);details.append(fields);const position=fields.querySelector("[data-layer-position]")?.closest("label");if(position){const label=document.createElement("label");label.textContent="فاصله عمودی";const select=document.createElement("select");select.setAttribute("data-layer-offset","");[["-30","خیلی بالاتر"],["-20","بالاتر"],["-10","کمی بالاتر"],["0","بدون جابه‌جایی"],["10","کمی پایین‌تر"],["20","پایین‌تر"],["30","خیلی پایین‌تر"]].forEach(([value,text])=>{const option=document.createElement("option");option.value=value;option.textContent=text;if(value==="0")option.selected=true;select.append(option);});label.append(select);position.after(label);}});
  storyCards().forEach(layer=>{if(layer.querySelector("[data-layer-font]"))return;const fields=layer.querySelector(".nava-video-layer-fields");if(!fields)return;const label=document.createElement("label");label.textContent="فونت نوشته";const select=document.createElement("select");select.setAttribute("data-layer-font","");[["auto","انتخاب هوشمند و متنوع"],["Tahoma, sans-serif","ساده و خوانا"],["IranNastaliq, serif","ایران نستعلیق"],["Dima Shekasteh, serif","شکسته"]].forEach(([value,title])=>{const option=document.createElement("option");option.value=value;option.textContent=title;if(value==="auto")option.selected=true;select.append(option);});label.append(select);const size=fields.querySelector("[data-layer-size]")?.closest("label");if(size)size.before(label);else fields.append(label);});
  const storyTotal=()=>storyData().reduce((sum,s)=>sum+s.duration,0);
  const totalDuration=()=>storyTotal()||Number(durationInput?.value)||8;
  const say=m=>{status.textContent=m;};
  async function prepareDepthMotion(story){
    const requested=(Array.isArray(story)?story:[]).filter(scene=>scene.photoMotion==="depth-parallax");
    if(!requested.length)return;
    // Prepare each distinct photo NAVI assigned to depth motion; keep work sequential on mobile.
    const targetIds=[...new Set(requested.flatMap(scene=>Array.isArray(scene.imageIds)?scene.imageIds:[]))].slice(0,4);
    const targets=targetIds.map(id=>scenes.find(scene=>photoId(scene)===id)).filter(Boolean);
    if(!targets.length){say("ناوی حرکت عمقی را انتخاب کرده، اما برای آن صحنه عکسی تعیین نشده است؛ طرح ناوی را بررسی کن.");return;}
    try{
      say("در حال آماده‌سازی حرکت عمقی برای "+targets.length+" عکس؛ تحلیل روی همین دستگاه انجام می‌شود…");
      if(!depthMotionModulePromise)depthMotionModulePromise=import("./video-engine/depth-parallax.js");
      depthMotionModule=await depthMotionModulePromise;
      if(!depthMotionModule.canRenderDepthParallax())throw new Error("WebGL برای رندر عمقی در این مرورگر در دسترس نیست.");
      for(let i=0;i<targets.length;i++){
        const source=targets[i];
        if(!source.depthMap){say("در حال تحلیل عمق عکس "+(i+1)+" از "+targets.length+"…");source.depthMap=await depthMotionModule.estimateDepth(source.image);}
        if(!depthMotionModule.renderDepthParallax(source.image,source.depthMap,0))throw new Error("رندر عمقی عکس آماده نشد.");
      }
      say("حرکت عمقی برای "+targets.length+" عکس آماده شد؛ پیش‌نمایش و خروجی از همین نقشه‌های عمق استفاده می‌کنند.");
      if(new Set(requested.flatMap(scene=>scene.imageIds||[])).size>4)say("حرکت عمقی برای ۴ عکس اول آماده شد؛ برای حفظ روانی گوشی، عکس‌های اضافه با حرکت سینمایی جایگزین می‌شوند.");
    }catch(error){
      console.warn("NAVA depth motion fallback:",error);depthMotionModule=null;depthMotionModulePromise=null;
      say("حرکت عمقی در این دستگاه آماده نشد ("+(error?.message||"خطای ناشناخته")+"). طرح ناوی حفظ شد و فقط در این اجرا زوم سینمایی جایگزین می‌شود.");
    }
  }
  function dimensions(){const landscape=formatInput.value==="landscape";if(previewing&&!recording)return landscape?[960,540]:[540,960];return landscape?[1280,720]:[720,1280];}
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
  function chooseAutoPhotoLayout(images,seed){
    const count=images.length;
    if(!count)return "single";
    // A per-scene seed keeps the chosen composition stable during preview and recording,
    // while new scenes/builds can naturally receive a different arrangement.
    let hash=2166136261;
    for(const ch of String(seed||"nava")){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}
    const ratios=images.map(img=>(img.naturalWidth||1)/(img.naturalHeight||1));
    const average=ratios.reduce((sum,value)=>sum+value,0)/ratios.length;
    let choices;
    if(count===1){
      // Preserve full-bleed for wide images more often; portrait/square photos
      // are more likely to benefit from a floating framed composition.
      choices=average>1.28?["single","single","polaroid"]:average<0.82?["polaroid","single","polaroid"]:["single","polaroid","single"];
    }else if(count===2){
      choices=["hero-stack","polaroid","free"];
    }else if(count===3){
      choices=["diagonal","stagger","hero-stack","polaroid","free"];
    }else{
      choices=["grid","stagger","hero-stack","polaroid","free"];
    }
    return choices[(hash>>>0)%choices.length];
  }
  const imageLuminanceCache=new WeakMap();
  function imageLuminance(img){
    if(!img?.naturalWidth)return .5;if(imageLuminanceCache.has(img))return imageLuminanceCache.get(img);
    let value=.5;try{const sample=document.createElement("canvas");sample.width=18;sample.height=18;const c=sample.getContext("2d",{willReadFrequently:true});c.drawImage(img,0,0,18,18);const data=c.getImageData(0,0,18,18).data;let sum=0,n=0;for(let i=0;i<data.length;i+=4){if(data[i+3]<32)continue;sum+=(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])/255;n++;}if(n)value=sum/n;}catch(_){}imageLuminanceCache.set(img,value);return value;
  }
  const hexLuminance=hex=>{const value=String(hex||"#ffffff").replace("#","");if(!/^[0-9a-f]{6}$/i.test(value))return 1;const rgb=[0,2,4].map(i=>parseInt(value.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
  const contrastRatio=(a,b)=>{const x=hexLuminance(a),y=hexLuminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  function resolveLayerTextColor(layer,images,background){
    const requested=layer.color||"#ffffff";if(layer.colorMode!=="auto")return requested;
    const light=background==="light"?.88:background==="warm"?.22:background==="black"?.02:images.length?imageLuminance(images[0]):.08;
    if(contrastRatio(requested,light>=.5?"#ffffff":"#111827")>=3.2)return requested;
    return contrastRatio("#fff4dc",light>=.5?"#ffffff":"#111827")>=contrastRatio("#111827",light>=.5?"#ffffff":"#111827")?"#fff4dc":"#111827";
  }
  let transitionCurrentCanvas=null,transitionPreviousCanvas=null;
  function transitionBuffers(w,h){
    if(!transitionCurrentCanvas){transitionCurrentCanvas=document.createElement("canvas");transitionPreviousCanvas=document.createElement("canvas");}
    for(const buffer of [transitionCurrentCanvas,transitionPreviousCanvas])if(buffer.width!==w||buffer.height!==h){buffer.width=w;buffer.height=h;}
  }
  function drawFrame(seconds,storyOverride,durationOverride,skipTransition=false){
    const [w,h]=dimensions();
    const sf=w/1080;if(canvas.width!==w||canvas.height!==h)resize();
    const duration=Number(durationOverride)||totalDuration(),hasImages=scenes.length>0,per=hasImages?duration/scenes.length:duration,index=hasImages?Math.min(scenes.length-1,Math.floor(Math.min(seconds,duration-.001)/per)):0,local=hasImages?(seconds-index*per)/per:seconds/duration;
    const story=Array.isArray(storyOverride)?storyOverride:storyData();let activeStory=null,activeStoryIndex=-1,storyLocal=seconds;
    if(story.length){let cursor=0;for(let i=0;i<story.length;i++){const item=story[i];if(seconds<cursor+item.duration){activeStory=item;activeStoryIndex=i;storyLocal=seconds-cursor;break;}cursor+=item.duration;}if(!activeStory){activeStory=story[story.length-1];activeStoryIndex=story.length-1;storyLocal=activeStory.duration;}}
    const activeImages=story.length?(activeStory?(activeStory.contentMode==="text"?[]:(activeStory.imageIds?.length?activeStory.imageIds.map(id=>scenes.find(scene=>photoId(scene)===id)).filter(Boolean):(activeStory.imageIndex>=0?[scenes[activeStory.imageIndex]].filter(Boolean):[]))):[]):(hasImages?[scenes[index]]:[]);
    ctx.fillStyle="#050912";ctx.fillRect(0,0,w,h);
    const drawImageCover=(img,x,y,bw,bh,progress=local,layerIndex=0,blur=0)=>{const iw=img.naturalWidth,ih=img.naturalHeight,modes=["slow-zoom","pan-left","pan-right","slow-pull","pan-up","pan-down","diagonal-in","diagonal-out","depth-parallax"],requestedMode=story.length?(activeStory?.photoMotion||modes[(activeStoryIndex*3+layerIndex*2)%modes.length]):modes[(index*3+layerIndex*2)%modes.length],sourceScene=scenes.find(item=>item.image===img),mode=requestedMode==="depth-parallax"&&!sourceScene?.depthMap?"slow-zoom":requestedMode,p=Math.max(0,Math.min(1,progress)),ease=p*p*(3-2*p),base=Math.max(bw/iw,bh/ih);let zoom=mode==="none"?1:mode==="slow-pull"?1.035:mode==="pan-left"||mode==="pan-right"?1.055:1.06;const scale=base*(mode==="slow-pull"?1.06-.06*ease:1+(zoom-1)*ease),dw=iw*scale,dh=ih*scale;let dx=0,dy=0;if(mode==="slow-zoom"||mode==="cinematic-depth"){dx=Math.sin(p*Math.PI*.5)*bw*.012;dy=-ease*bh*.018;}else if(mode==="pan-left"){dx=(.5-ease)*bw*.035;dy=-ease*bh*.008;}else if(mode==="pan-right"){dx=(ease-.5)*bw*.035;dy=ease*bh*.008;}else if(mode==="slow-pull"||mode==="ken-burns"){dx=(.5-p)*bw*.035;dy=(p-.5)*bh*.025;}else if(mode==="pan-up"){dx=Math.sin(p*Math.PI)*bw*.012;dy=(.5-ease)*bh*.055;}else if(mode==="pan-down"){dx=-Math.sin(p*Math.PI)*bw*.012;dy=(ease-.5)*bh*.055;}else if(mode==="diagonal-in"){dx=(.5-ease)*bw*.035;dy=(.5-ease)*bh*.035;}else if(mode==="diagonal-out"){dx=(ease-.5)*bw*.035;dy=(ease-.5)*bh*.035;}ctx.save();ctx.beginPath();ctx.rect(x,y,bw,bh);ctx.clip();ctx.filter=blur>0?"blur("+Math.min(24,blur)*sf+"px)":"none";const depthFrame=mode==="depth-parallax"&&depthMotionModule&&sourceScene?.depthMap?depthMotionModule.renderDepthParallax(img,sourceScene.depthMap,p):null;ctx.drawImage(depthFrame||img,x+(bw-dw)/2+dx,y+(bh-dh)/2+dy,dw,dh);ctx.filter="none";ctx.restore();};
    const allUsableImages=activeImages.map(item=>item?.image).filter(img=>img?.complete&&img.naturalWidth>0&&img.naturalHeight>0);const usableImages=story.length&&activeStory?.transition==="page-turn"?allUsableImages.slice(0,1):allUsableImages;
    if(usableImages.length){
      const requestedLayout=story.length?(activeStory?.layout||"single"):"single";const sceneLayout=story.length&&activeStory?.transition==="page-turn"?"single":requestedLayout;const photoScale=story.length?(activeStory?.photoScale||1):1,photoY=story.length?(activeStory?.photoY||.28):.28,photoSpread=story.length?(activeStory?.photoSpread||1):1;
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
      ctx.save();const layerFont=layer.font&&layer.font!=="auto"?layer.font:(["Tahoma, sans-serif","IranNastaliq, serif","Dima Shekasteh, serif"][Math.max(0,layer.layerIndex||0)%3]);ctx.font=(layer.style==="italic"?"italic ":"")+"650 "+fontSize+"px "+layerFont;ctx.fillStyle=resolveLayerTextColor(layer,usableImages,activeStory?.background);ctx.textAlign="left";ctx.direction=textDirection;ctx.shadowColor="rgba(0,0,0,.72)";ctx.shadowBlur=18*sf;
      const layerElapsed=elapsed-(Number(layer.delay)||0);if(layerElapsed<0)return;const revealMode=layer.reveal||"none";let displayBody=body;if(revealMode!=="none"){const units=revealMode==="word"?body.split(/\s+/).filter(Boolean):Array.from(body);const rate=revealMode==="word"?1.8:8;const visible=Math.min(units.length,Math.ceil(Math.max(0,layerElapsed)*rate));if(visible<=0)return;displayBody=revealMode==="word"?units.slice(0,visible).join(" "):units.slice(0,visible).join("");}const words=displayBody.split(/\s+/).filter(Boolean),lines=[];let line="";
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
      const motion=layer.motion||"from-right",p=Math.max(0,Math.min(1,layerElapsed/.9)),ease=1-Math.pow(1-p,3);
      // layer delay was applied before measuring and revealing the text.
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
    if(!skipTransition&&story.length>1&&activeStoryIndex>0){
      let sceneStart=0;for(let i=0;i<activeStoryIndex;i++)sceneStart+=Number(story[i].duration)||0;
      const transition=activeStory.transition||"cut",transitionDuration=.72;
      if(transition!=="cut"&&storyLocal<transitionDuration){
        const progress=Math.max(0,Math.min(1,storyLocal/transitionDuration));transitionBuffers(w,h);
        const currentCtx=transitionCurrentCanvas.getContext("2d"),previousCtx=transitionPreviousCanvas.getContext("2d");
        currentCtx.clearRect(0,0,w,h);currentCtx.drawImage(canvas,0,0,w,h);
        drawFrame(Math.max(0,sceneStart-.001),story,duration,true);
        previousCtx.clearRect(0,0,w,h);previousCtx.drawImage(canvas,0,0,w,h);
        ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.filter="none";ctx.clearRect(0,0,w,h);
        if(transition==="fade"){
          ctx.drawImage(transitionPreviousCanvas,0,0,w,h);ctx.globalAlpha=progress;ctx.drawImage(transitionCurrentCanvas,0,0,w,h);ctx.globalAlpha=1;
        }else if(transition==="slide-left"||transition==="slide-right"){
          const direction=transition==="slide-left"?1:-1;ctx.drawImage(transitionPreviousCanvas,-direction*progress*w,0,w,h);ctx.drawImage(transitionCurrentCanvas,direction*(1-progress)*w,0,w,h);
        }else if(transition==="zoom"){
          ctx.drawImage(transitionPreviousCanvas,0,0,w,h);const scale=.84+.16*progress;ctx.globalAlpha=progress;ctx.drawImage(transitionCurrentCanvas,(w-w*scale)/2,(h-h*scale)/2,w*scale,h*scale);ctx.globalAlpha=1;
        }else if(transition==="page-turn"){
          // A single-photo page: reveal the next page underneath while the previous sheet curls away.
          ctx.drawImage(transitionCurrentCanvas,0,0,w,h);
          const pageWidth=Math.max(0,w*(1-progress)),strips=48,stripWidth=w/strips;
          if(pageWidth>0){
            for(let i=0;i<strips;i++){
              const t=(i+.5)/strips;
              const sourceX=i*stripWidth,sourceW=Math.min(stripWidth,w-sourceX),fold=1-progress;
              const destX=sourceX*fold,destW=sourceW*fold;
              const curl=Math.sin(t*Math.PI)*Math.sin(progress*Math.PI)*h*.035;
              ctx.drawImage(transitionPreviousCanvas,sourceX,0,sourceW,h,destX,curl,destW,h);
            }
            const edge=pageWidth;
            const shadow=ctx.createLinearGradient(Math.max(0,edge-42),0,Math.min(w,edge+34),0);shadow.addColorStop(0,"rgba(0,0,0,.02)");shadow.addColorStop(.48,"rgba(0,0,0,.38)");shadow.addColorStop(.78,"rgba(0,0,0,.16)");shadow.addColorStop(1,"rgba(255,255,255,.22)");ctx.fillStyle=shadow;ctx.fillRect(Math.max(0,edge-42),0,76,h);
            ctx.strokeStyle="rgba(255,255,255,.58)";ctx.lineWidth=Math.max(1.5,w*.0022);ctx.beginPath();ctx.moveTo(edge,0);ctx.quadraticCurveTo(edge-18,h*.5,edge,h);ctx.stroke();
          }
        }
      }
    }
  }
  const previewSoundNodes=[];
  function stopSoundNodes(){while(previewSoundNodes.length){const node=previewSoundNodes.pop();try{node.stop(0);}catch(_){}}}
  function scheduleSoundEffects(story,destination,startAt,offset=0){
    if(!audioContext||!destination)return;
    let cursor=0;const events=[];
    (Array.isArray(story)?story:[]).forEach(scene=>{const transitionSound=({ "page-turn":"page-turn","slide-left":"whoosh","slide-right":"whoosh",zoom:"impact",fade:"sparkle" })[scene.transition];if(cursor>0&&transitionSound)events.push({type:transitionSound,time:cursor,source:"transition"});(scene.layers||[]).forEach(layer=>{if(layer.sound&&layer.sound!=="none")events.push({type:layer.sound,time:cursor+(Number(layer.delay)||0),length:String(layer.text||"").length,wordCount:String(layer.text||"").trim().split(/\s+/).filter(Boolean).length,reveal:layer.reveal||"none"});});cursor+=Number(scene.duration)||0;});
    const readyEvents=events.filter(event=>event.time>=offset-.01);
    const transitionEvents=readyEvents.filter(event=>event.source==="transition");
    const otherEvents=readyEvents.filter(event=>event.source!=="transition").slice(0,48);
    [...transitionEvents,...otherEvents].sort((a,b)=>a.time-b.time).forEach(event=>{
      const at=startAt+Math.max(0,event.time-offset);
      const makeTone=(frequency,endFrequency,offset,duration,volume,wave="sine")=>{
        const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=wave;osc.frequency.setValueAtTime(frequency,at+offset);if(endFrequency)osc.frequency.exponentialRampToValueAtTime(Math.max(30,endFrequency),at+offset+duration);gain.gain.setValueAtTime(.0001,at+offset);gain.gain.exponentialRampToValueAtTime(volume,at+offset+.012);gain.gain.exponentialRampToValueAtTime(.0001,at+offset+duration);osc.connect(gain);gain.connect(destination);osc.start(at+offset);osc.stop(at+offset+duration+.03);previewSoundNodes.push(osc);
      };
      if(event.type==="impact")makeTone(125,48,0,.38,.42,"sine");
      else if(event.type==="sparkle"){makeTone(1150,1950,0,.55,.13);makeTone(1720,2400,.06,.43,.08);}
      else if(event.type==="whoosh"){
        const length=Math.ceil(audioContext.sampleRate*.7),buffer=audioContext.createBuffer(1,length,audioContext.sampleRate),data=buffer.getChannelData(0);
        for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.sin(Math.PI*i/length);
        const src=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();filter.type="highpass";filter.frequency.value=550;gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(.2,at+.24);gain.gain.linearRampToValueAtTime(.0001,at+.7);src.buffer=buffer;src.connect(filter);filter.connect(gain);gain.connect(destination);src.start(at);src.stop(at+.72);previewSoundNodes.push(src);
      }else if(event.type==="page-turn"){
        const length=Math.ceil(audioContext.sampleRate*.72),buffer=audioContext.createBuffer(1,length,audioContext.sampleRate),data=buffer.getChannelData(0);
        for(let i=0;i<length;i++){const p=i/length;data[i]=(Math.random()*2-1)*Math.sin(Math.PI*p)*(.72-.25*p)+Math.sin(2*Math.PI*(180-95*p)*i/audioContext.sampleRate)*Math.sin(Math.PI*p)*.16;}
        const src=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();filter.type="bandpass";filter.frequency.value=760;filter.Q.value=.55;gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(.36,at+.09);gain.gain.linearRampToValueAtTime(.0001,at+.72);src.buffer=buffer;src.connect(filter);filter.connect(gain);gain.connect(destination);src.start(at);src.stop(at+.74);previewSoundNodes.push(src);
      }else if(event.type==="type"){
        const units=event.reveal==="word"?Math.max(1,event.wordCount||1):Math.max(1,event.length||1);
        const count=event.reveal==="none"?4:Math.min(80,units);
        const interval=event.reveal==="word"?1/1.8:event.reveal==="char"?1/8:.16;
        for(let i=0;i<count;i++)makeTone(1750,1380,i*interval,.022,.038,"square");
      }
    });
  }
  function stopPreview(){if(previewFrame)cancelAnimationFrame(previewFrame);previewFrame=0;previewing=false;stopSoundNodes();if(musicElement){musicElement.pause();musicElement.loop=false;}if(audioContext&&musicGain&&previewMasterGain){try{musicGain.disconnect(previewMasterGain);}catch(_){}}}
  function animate(now){if(!previewing)return;if(!startedAt)startedAt=now;if(now-(animate.lastFrame||0)>=33){const t=(previewOffset+(now-startedAt)/1000)%totalDuration();drawFrame(t);animate.lastFrame=now;}previewFrame=requestAnimationFrame(animate);}
  async function startPreviewAudio(story){
    const hasEffects=story.some(scene=>scene.transition==="page-turn"||scene.layers?.some(layer=>layer.sound&&layer.sound!=="none"));
    if(!musicElement&&!hasEffects)return;
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return;
    if(!audioContext||audioContext.state==="closed")audioContext=new AudioContextClass();
    if(!previewMasterGain){previewMasterGain=audioContext.createGain();previewMasterGain.connect(audioContext.destination);}
    previewMasterGain.gain.setValueAtTime(previewMuted?0:1,audioContext.currentTime);
    await audioContext.resume();
    if(musicElement){
      if(!audioSource||!musicGain){
        audioSource=audioContext.createMediaElementSource(musicElement);
        musicGain=audioContext.createGain();
        audioSource.connect(musicGain);
      }
      musicGain.connect(previewMasterGain);
      musicGain.gain.setValueAtTime(Math.max(0,Number(musicVolume.value)/100),audioContext.currentTime);
      musicElement.loop=true;
      const duration=Number(musicElement.duration);
      const offset=Math.max(0,Number(previewOffset)||0);
      try{musicElement.currentTime=Number.isFinite(duration)&&duration>0?offset%duration:offset;}catch(_){musicElement.currentTime=0;}
      await musicElement.play();
    }
    if(hasEffects)scheduleSoundEffects(story,previewMasterGain,audioContext.currentTime+.1,previewOffset);
  }
  async function preview(){if(!scenes.length&&!storyData().length&&!titleInput.value.trim()&&!subtitleInput.value.trim()&&!textInput?.value.trim()){say("برای پیش‌نمایش، یک صحنه متنی یا عکس اضافه کن؛ عنوان و نام اختیاری‌اند.");return;}stopPreview();const previewStory=storyData();await prepareDepthMotion(previewStory);startedAt=0;animate.lastFrame=0;previewing=true;resize();drawFrame(previewOffset,previewStory,totalDuration());startPreviewAudio(previewStory).catch(error=>{console.warn("NAVA preview audio:",error);say("پیش‌نمایش تصویر فعال است؛ پخش موسیقی در این مرورگر ممکن نشد.");});previewFrame=requestAnimationFrame(animate);say(scenes.length?"پیش‌نمایش تصویر و صدای ویدئو فعال است.":"پیش‌نمایش تصویر و صدای ویدئوی متن‌محور فعال است.");}
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
      const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{
        if(!(img.naturalWidth>0&&img.naturalHeight>0)){URL.revokeObjectURL(url);reject(new Error("تصویر قابل‌خواندن نیست: "+file.name));return;}
        // Downsample oversized camera photos once at import. The editor and final
        // render then reuse this decoded surface instead of repeatedly handling
        // multi-megapixel originals on every frame.
        const maxEdge=1920,scale=Math.min(1,maxEdge/Math.max(img.naturalWidth,img.naturalHeight));
        if(scale<1){
          const width=Math.max(1,Math.round(img.naturalWidth*scale)),height=Math.max(1,Math.round(img.naturalHeight*scale));
          const optimized=document.createElement("canvas");optimized.width=width;optimized.height=height;
          const optimizedCtx=optimized.getContext("2d",{alpha:false});
          if(optimizedCtx){optimizedCtx.drawImage(img,0,0,width,height);optimized.naturalWidth=width;optimized.naturalHeight=height;optimized.complete=true;resolve({file,url,image:optimized});}
          else resolve({file,url,image:img});
        }else resolve({file,url,image:img});
      };
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("خواندن تصویر ناموفق بود: "+file.name));};
      img.src=url;
    }))).then(items=>{
      scenes=items;resize();renderSceneList();refreshScenePhotoOptions();if(activeBuildMode()==="navi"&&storyCards().length){const card=storyCards()[0],gallery=card.querySelector("[data-story-image-gallery]");if(gallery)gallery.dataset.selectedIds=scenes.map(photoId).join(",");const mode=card.querySelector("[data-scene-content-mode]");if(mode)mode.value=card.querySelector("[data-layer-text]")?.value.trim()?"mixed":"image";refreshScenePhotoOptions();const label=$("navaVideoNaviPhotosLabel");if(label)label.textContent=scenes.length+" عکس انتخاب شد.";}drawFrame(0);updateReady();
      saveModeState(activeBuildMode());say(items.length+" عکس با موفقیت بارگذاری شد؛ حالا می‌توانی آن‌ها را به صحنه‌ها اضافه کنی.");
    }).catch(e=>{sceneList.textContent="بارگذاری عکس ناموفق بود؛ دوباره انتخاب کن.";say(e.message||"خواندن عکس‌ها ناموفق بود.");});
  });
  musicInput.addEventListener("change",()=>{const file=musicInput.files&&musicInput.files[0];if(!file)return;if(!file.type.startsWith("audio/")){say("فایل صوتی معتبر انتخاب کن.");musicInput.value="";return;}if(musicUrl)URL.revokeObjectURL(musicUrl);musicUrl=URL.createObjectURL(file);musicFile=file;if(!musicElement){musicElement=new Audio();musicElement.preload="auto";musicElement.loop=false;}musicElement.src=musicUrl;if(activeBuildMode()==="navi"){const label=$("navaVideoNaviMusicLabel");if(label)label.textContent="موسیقی انتخاب شد: "+file.name;}saveModeState(activeBuildMode());say("موسیقی آماده است.");});
  [titleInput,subtitleInput,formatInput,motionInput,textInput,wordMotionInput,wordSpeedInput,durationInput].filter(Boolean).forEach(el=>el.addEventListener("input",()=>{resize();drawFrame(0);updateReady();}));
  previewBtn.addEventListener("click",preview);const previewMuteBtn=$("navaVideoPreviewMute");previewMuteBtn?.addEventListener("click",()=>{previewMuted=!previewMuted;if(audioContext&&previewMasterGain)previewMasterGain.gain.setTargetAtTime(previewMuted?0:1,audioContext.currentTime,.015);previewMuteBtn.textContent=previewMuted?"وصل صدا":"قطع صدا";previewMuteBtn.setAttribute("aria-pressed",String(previewMuted));previewMuteBtn.setAttribute("aria-label",previewMuted?"وصل صدای پیش‌نمایش":"قطع صدای پیش‌نمایش");});
  if(storyList){
    const refreshStory=()=>{storyCards().forEach((card,i)=>{card.querySelector(".nava-video-story-card-head strong").textContent="صحنه "+(i+1);card.querySelector("[data-remove-story]").disabled=storyCards().length===1;});resize();drawFrame(0);updateReady();};
    addStoryBtn?.addEventListener("click",()=>{const card=document.createElement("article");card.className="nava-video-story-card";card.setAttribute("data-story-scene","");card.innerHTML='<div class="nava-video-story-card-head"><strong></strong><button type="button" data-remove-story>حذف صحنه</button></div><div class="nava-video-text-layers">'+layerMarkup(1)+'</div><button class="nava-video-add-layer" type="button" data-add-layer>＋ افزودن لایه متن</button><details class="nava-video-scene-design"><summary>پس‌زمینه و قاب مستقل صحنه</summary><div class="nava-video-scene-design-grid"><label>پس‌زمینه<select data-scene-background><option value="default" selected>پیش‌فرض متن (سرمه‌ای و خاکستری)</option><option value="black">مشکی</option><option value="light">روشن</option><option value="warm">خاکستری گرم</option></select></label><label>رنگ دلخواه پس‌زمینه<input type="color" data-scene-background-color value="#18243b"></label><label class="nava-video-scene-frame-toggle"><input type="checkbox" data-scene-frame> قاب ظریف مستقل</label><label>شکل قاب<select data-scene-frame-shape><option value="landscape">مستطیل افقی</option><option value="portrait">مستطیل عمودی</option><option value="square">مربع</option></select></label><label>حرکت عکس<select data-photo-motion><option value="" selected>هوشمند و متنوع</option><option value="slow-zoom">زوم به داخل</option><option value="slow-pull">زوم معکوس</option><option value="pan-left">حرکت چپ</option><option value="pan-right">حرکت راست</option><option value="pan-up">حرکت بالا</option><option value="pan-down">حرکت پایین</option><option value="diagonal-in">حرکت مورب به داخل</option><option value="diagonal-out">حرکت مورب به بیرون</option><option value="none">بدون حرکت</option></select></label><label>نوشته گوشه قاب<input type="text" data-scene-frame-title maxlength="32" placeholder="مثلاً NAVA"></label></div></details><div class="nava-video-scene-content-tools"><label>محتوای صحنه<select data-scene-content-mode><option value="text">فقط متن</option><option value="image">فقط عکس</option><option value="mixed" selected>متن و عکس</option></select></label><label>میزان تاری عکس <output data-scene-photo-blur-value>۰</output><input type="range" data-scene-photo-blur min="0" max="12" step="1" value="0"></label></div><div class="nava-video-scene-media"><label>عکس‌های این صحنه <small>(برای انتخاب، روی عکس‌ها بزن)</small><div class="nava-video-photo-gallery" data-story-image-gallery data-selected-ids="" role="group" aria-label="انتخاب عکس‌های این صحنه"></div></label><label>چیدمان عکس‌ها<select data-story-layout><option value="single">تک‌عکس</option><option value="diagonal">سه عکس اریب با سایه</option><option value="triptych">سه قاب کنار هم</option><option value="grid">چهارخانه</option><option value="stagger">پلکانی</option><option value="hero-stack">یک قاب بزرگ با قاب‌های کوچک</option><option value="polaroid">قاب‌های شناور</option><option value="free">ترکیب آزاد</option></select></label><details class="nava-video-photo-settings"><summary>تنظیمات چیدمان عکس‌ها</summary><div class="nava-video-photo-setting-grid"><label>اندازه عکس‌ها<select data-photo-scale><option value="0.82">کوچک</option><option value="1" selected>متوسط</option><option value="1.16">بزرگ</option></select></label><label>جایگاه عمودی<select data-photo-y><option value="0.16">بالاتر</option><option value="0.28" selected>وسط</option><option value="0.40">پایین‌تر</option></select></label><label>فاصله و زاویه<select data-photo-spread><option value="0.7">جمع‌وجور</option><option value="1" selected>معمولی</option><option value="1.3">بازتر و چرخش بیشتر</option></select></label></div></details></div><div class="nava-video-story-fields"><label>مدت نمایش<select data-story-duration><option value="2">۲ ثانیه</option><option value="3">۳ ثانیه</option><option value="4" selected>۴ ثانیه</option><option value="5">۵ ثانیه</option><option value="6">۶ ثانیه</option><option value="8">۸ ثانیه</option></select></label></div>';storyList.append(card);ensureSceneTransitionControl(card);ensureDepthMotionOption(card);card.querySelectorAll("[data-story-layer]").forEach(ensureLayerColorMode);refreshScenePhotoOptions();refreshStory();card.querySelector("[data-layer-text]").focus();});storyList.addEventListener("input",e=>{if(e.target.matches("[data-scene-photo-blur]")){const out=e.target.closest("[data-story-scene]")?.querySelector("[data-scene-photo-blur-value]");if(out)out.textContent=String(e.target.value);}refreshStory();});storyList.addEventListener("change",async e=>{if(e.target.matches("[data-scene-content-mode]"))refreshScenePhotoOptions();refreshStory();if(e.target.matches("[data-story-layout]")){const card=e.target.closest("[data-story-scene]");let elapsed=0;for(const prior of storyCards()){if(prior===card)break;const priorImage=!!prior.querySelector("[data-story-image-gallery]")?.dataset.selectedIds;const priorHasText=Array.from(prior.querySelectorAll("[data-layer-text]")).some(el=>el.value.trim());if(priorHasText||priorImage)elapsed+=Number(prior.querySelector("[data-story-duration]")?.value)||4;}requestAnimationFrame(()=>{const targetTime=Math.min(Math.max(0,totalDuration()-.001),elapsed+.015);previewOffset=targetTime;drawFrame(targetTime);});}});
    storyList.addEventListener("click",e=>{const photo=e.target.closest("[data-photo-id]");if(photo){if(photo.disabled)return;const gallery=photo.closest("[data-story-image-gallery]"),ids=new Set((gallery.dataset.selectedIds||"").split(",").filter(Boolean)),id=photo.dataset.photoId;ids.has(id)?ids.delete(id):ids.add(id);gallery.dataset.selectedIds=Array.from(ids).join(",");refreshScenePhotoOptions();refreshStory();const card=photo.closest("[data-story-scene]");let elapsed=0;for(const prior of storyCards()){if(prior===card)break;if(prior.querySelector("[data-layer-text]")?.value.trim()||prior.querySelector("[data-story-image-gallery]")?.dataset.selectedIds)elapsed+=Number(prior.querySelector("[data-story-duration]")?.value)||4;}previewOffset=Math.min(Math.max(0,totalDuration()-.001),elapsed+.015);drawFrame(previewOffset);return;}const add=e.target.closest("[data-add-layer]");if(add){const card=add.closest("[data-story-scene]"),holder=card.querySelector(".nava-video-text-layers");const nextIndex=holder.querySelectorAll("[data-story-layer]").length+1;holder.insertAdjacentHTML("beforeend",layerMarkup(nextIndex));const added=holder.querySelectorAll("[data-story-layer]")[nextIndex-1];const offset=added.querySelector("[data-layer-offset]"),delay=added.querySelector("[data-layer-delay]");if(offset)offset.value=String(Math.min(30,(nextIndex-1)*10));if(delay)delay.value=String(Math.min(6,nextIndex-1));refreshStory();return;}const remove=e.target.closest("[data-remove-layer]");if(remove){const card=remove.closest("[data-story-scene]"),holder=card.querySelector(".nava-video-text-layers");if(holder.querySelectorAll("[data-story-layer]").length>1){remove.closest("[data-story-layer]").remove();holder.querySelectorAll("[data-story-layer]").forEach((el,i)=>el.querySelector(".nava-video-layer-head strong").textContent="لایه متن "+(i+1));refreshStory();}}});$("navaVideoTextPersistence")?.addEventListener("change",()=>drawFrame(0));
    storyList.addEventListener("click",e=>{const btn=e.target.closest("[data-remove-story]");if(btn&&storyCards().length>1){btn.closest("[data-story-scene]").remove();refreshStory();}});
  }
  const sharedOutput=root.querySelector(".nava-video-shared-output");
  root.querySelectorAll("[data-video-tab]").forEach(btn=>btn.addEventListener("click",()=>{root.querySelectorAll("[data-video-tab]").forEach(b=>{const active=b===btn;b.classList.toggle("is-active",active);b.setAttribute("aria-selected",String(active));});root.querySelectorAll(".nava-video-panel").forEach(p=>{const active=p.id===btn.getAttribute("aria-controls");p.hidden=!active;p.classList.toggle("is-active",active);});if(sharedOutput&&btn.dataset.videoTab==="text")root.querySelector("#navaVideoPanelText").append(sharedOutput);}));

  $("navaVideoAskNavi")?.addEventListener("click",()=>{
    const brief=(briefInput?.value||"").trim(),result=$("navaVideoNaviResult");
    if(!brief){result.textContent="ابتدا بریف ویدئو را بنویس.";return;}
    if(!scenes.length){result.textContent="برای ساخت با ناوی، ابتدا دست‌کم یک عکس انتخاب کن.";return;}
    const imageNames=scenes.map((scene,i)=>(i+1)+". "+scene.file.name+" | تحلیل رنگ و کادر: "+imageVisualSummary(scene));
    const selectedMusicFile=musicFile;
    const musicInfo=selectedMusicFile?selectedMusicFile.name+" ("+selectedMusicFile.type+")":"انتخاب نشده";
    const quoted=brief.match(/[«“"]([^»”"]+)[»”"]/);
    if(quoted&&storyCards()[0]?.querySelector("[data-layer-text]"))storyCards()[0].querySelector("[data-layer-text]").value=quoted[1];
    const first=storyCards()[0],gallery=first?.querySelector("[data-story-image-gallery]");
    if(gallery)gallery.dataset.selectedIds=scenes.map(photoId).join(",");
    const contentMode=first?.querySelector("[data-scene-content-mode]");
    if(contentMode)contentMode.value=quoted?"mixed":"image";
    refreshScenePhotoOptions();
    naviPlanRetryCount=0;smartAutoBuild=true;smartAutoBuildMode="navi";
    result.textContent="ناوی در حال بررسی بریف، عکس‌ها و موسیقی و طراحی ویدئو است…";
    const prompt = [
      "نقش تو: کارگردان خلاق، تدوین‌گر روایت و طراح موشن‌گرافیک حرفه‌ای برای ویدئوی کوتاه شبکه‌های اجتماعی.",
      "هدف: بریف خام کاربر را به یک نقشه اجرایی دقیق، خوش‌ریتم و قابل‌رندر تبدیل کن؛ خروجی نباید شبیه اسلایدشو یا مجموعه‌ای از عکس‌های ثابت با نوشته‌های تکراری باشد.",
      "",
      "۱) طراحی روایت:",
      "- ابتدا پیام اصلی، مخاطب، حس غالب و نتیجه‌ای را که بیننده باید بگیرد از بریف استخراج کن. روایت باید شروعِ جلب‌توجه‌کننده، میانه معنادار و پایان هدفمند داشته باشد؛ حتی اگر ویدئو فقط ۲ یا ۳ صحنه دارد.",
      "- ترتیب عکس‌ها را بر اساس جریان روایت انتخاب کن، نه صرفاً ترتیب بارگذاری. هر عکس انتخاب‌شده باید حداقل یک بار در scenes استفاده شود؛ عکس را بی‌دلیل در چند صحنه تکرار نکن.",
      "- تعداد صحنه‌ها را متناسب با تعداد عکس‌ها و پیچیدگی پیام انتخاب کن؛ صحنه اضافه و بی‌دلیل نساز. هر صحنه باید یک وظیفه روایی روشن داشته باشد.",
      "- نام فایل‌ها فقط سرنخ متنی هستند؛ محتوای بصری عکس را از روی نام فایل قطعی فرض نکن و جزئیات تصویری ساختگی نساز.",
      "",
      "۲) کارگردانی تصویر و حرکت:",
      "- برای هر صحنه جداگانه تصمیم بگیر: تک‌عکس یا ترکیب چندعکس، layout، photoMotion، transition، مقیاس و جایگاه عکس، رنگ پس‌زمینه و قاب. یک نسخه ثابت را برای همه صحنه‌ها تکرار نکن. انتقال هر صحنه از قبلی را با توجه به روایت انتخاب کن؛ page-turn فقط وقتی حس ورق‌زدن واقعاً به روایت کمک می‌کند. نکته مهم: اگر page-turn انتخاب می‌کنی، هر صحنه باید دقیقاً یک عکس و layout=single داشته باشد؛ عکس‌ها را آلبومی، شبکه‌ای، پلکانی یا چندتایی در یک صفحه نچین. برای نمایش همه عکس‌ها، صحنه‌های جدا بساز و هر عکس را مثل یک صفحه مستقل ورق بزن. عکس اول transition=cut و صفحات بعدی page-turn باشند.",
      "- حرکت عکس را آگاهانه انتخاب کن: slow-zoom یا pan فقط وقتی به تصویر جان می‌دهد؛ از حرکت‌های سریع، بی‌هدف یا لرزش‌مانند پرهیز کن. در صحنه‌های متوالی حرکت‌ها را متنوع اما هماهنگ انتخاب کن. اگر سوژه و پس‌زمینه عمق قابل‌تفکیک دارند، photoMotion=depth-parallax را برای ایجاد اختلاف حرکت لایه‌های نزدیک و دور انتخاب کن؛ این تحلیل روی دستگاه کاربر انجام می‌شود. برای عکس تخت یا وقتی عمق مطمئن نیست، زوم یا پن را ترجیح بده.",
      "- عکس‌ها را بیش از حد کوچک نکن. ترکیب‌بندی باید در قاب عمودی موبایل خوانا باشد و فضای امن کافی برای متن داشته باشد. متن روی بخش مهم عکس قرار نگیرد. از خلاصه رنگ، روشنایی و نسبت کادر هر عکس که در ورودی آمده برای انتخاب رنگ و جایگاه متن استفاده کن.",
      "- قاب تزئینی، چیدمان چندتایی و پس‌زمینه رنگی را فقط وقتی انتخاب کن که به روایت کمک کند؛ سادگی حرفه‌ای بهتر از تزئینات بی‌دلیل است.",
      "",
      "۳) تایپوگرافی و زمان‌بندی:",
      "- متن‌های روی تصویر را کوتاه، دقیق و وفادار به بریف بنویس؛ پیام را بازنویسی کن، نه اینکه یک جمله را در همه صحنه‌ها تکرار کنی. غلط املایی و عبارت‌های کلیشه‌ای نداشته باش.",
      "- در هر صحنه سلسله‌مراتب مشخص بساز: در صورت نیاز یک تیتر اصلی و حداکثر یک عبارت مکمل. لایه‌های متعدد را روی هم انباشته نکن.",
      "- delay زمان شروع هر لایه از ابتدای همان صحنه است. ورود لایه‌ها را مرحله‌ای و با فاصله معنادار طراحی کن؛ دو متن مهم را هم‌زمان وارد نکن.",
      "- برای هر لایه motion و exit متناسب با معنا تعیین کن. اگر متن دوم باید جای متن اول را بگیرد، برای متن اول exit مناسب انتخاب کن؛ اگر متن باید باقی بماند از stay استفاده کن. زمان ورود و خروج باید داخل مدت همان صحنه جا شود.",
      "- جایگاه و align را با راست‌به‌چپ بودن فارسی و فضای خالی عکس هماهنگ کن. اندازه متن باید روی صفحه موبایل خوانا باشد؛ از متن طولانی و فونت تزئینی برای متن‌های چندکلمه‌ای پرهیز کن. colorMode را معمولاً auto انتخاب کن تا موتور رنگ پیشنهادی تو را با روشنایی واقعی عکس تطبیق دهد؛ فقط در صورت نیاز واقعی manual باشد.",
      "- زیرخط یا تأکید بصری را فقط در صورت نیاز استفاده کن؛ در غیر این صورت از رنگ و اندازه برای سلسله‌مراتب کمک بگیر.",
      "",
      "۴) ریتم و کیفیت نهایی:",
      "- مدت هر صحنه را بین ۲ تا ۸ ثانیه و متناسب با حجم متن و حرکت انتخاب کن. صحنه دارای متن طولانی‌تر زمان بیشتری می‌خواهد؛ صحنه تصویری کوتاه‌تر و پویا‌تر باشد.",
      "- شروع را سریع و روشن طراحی کن؛ پایان باید جمع‌بندی یا دعوت به اقدام واقعیِ متناسب با بریف باشد، نه یک شعار عمومی و تکراری.",
      "- از تکرار پشت‌سرهم یک جایگاه متن، یک حرکت، یک رنگ پس‌زمینه یا یک چیدمان خودداری کن؛ تنوع باید هدفمند باشد، نه تصادفی.",
      "- اگر موسیقی انتخاب شده، ریتم کلی و شدت متن‌ها را با آن هماهنگ کن؛ چون زمان‌بندی ضرب موسیقی در ورودی موجود نیست، ادعای هم‌زمانی دقیق با ضرب نکن.",
      "",
      "۵) قرارداد خروجی:",
      "فقط یک شیء JSON معتبر با schema دقیق nava.video.scene-plan.v1 برگردان؛ هیچ توضیح، Markdown یا متن اضافه بیرون JSON ننویس. فقط کلیدهای نمونه را استفاده کن و کلید تازه نساز.",
      "نمونه ساختار؛ مقادیر را بر اساس بریف انتخاب کن و این نمونه را عیناً کپی نکن:",
      "{",
      '  "schema": "nava.video.scene-plan.v1",',
      '  "format": "portrait",',
      '  "textPersistence": "keep",',
      '  "scenes": [{',
      '    "duration": 5,',
      '    "images": [1, 2, 3],',
      '    "contentMode": "mixed",',
      '    "layout": "triptych",',
      '    "photoMotion": "slow-zoom",',
      '    "transition": "fade",',
      '    "photoScale": 1, "photoY": 0.28, "photoSpread": 1,',
      '    "background": "default", "backgroundColor": "#18243b",',
      '    "frame": {"enabled": false, "shape": "portrait", "title": ""},',
      '    "layers": [{"text": "تیتر کوتاه", "colorMode": "auto", "position": "top", "align": "center", "motion": "from-bottom", "delay": 0, "exit": "stay", "font": "auto", "size": 42, "style": "normal", "orientation": "horizontal", "color": "#ffffff", "underline": false}]',
      "  }]",
      "}",
      "",
      "مقادیر مجاز: transition=cut|fade|slide-left|slide-right|zoom|page-turn (صحنه اول cut)؛ colorMode=auto|manual؛ photoMotion شامل slow-zoom|slow-pull|pan-left|pan-right|pan-up|pan-down|diagonal-in|diagonal-out|depth-parallax|none؛ format=portrait|landscape؛ textPersistence=keep|replace؛ contentMode=text|image|mixed؛ layout=single|diagonal|triptych|grid|stagger|hero-stack|polaroid|free؛ photoMotion=slow-zoom|slow-pull|pan-left|pan-right|pan-up|pan-down|diagonal-in|diagonal-out|depth-parallax|none؛ background=default|black|light|warm؛ frame.shape=landscape|portrait|square؛ layer.position=top|center|bottom؛ layer.align=right|center|left؛ layer.motion=auto|from-right|from-left|from-top|from-bottom|fade|none|from-bottom-left|from-top-right|scale-in؛ layer.exit=stay|fade|right|left|top|bottom؛ layer.font=auto|Tahoma, sans-serif|IranNastaliq, serif|Dima Shekasteh, serif؛ layer.style=normal|italic؛ layer.orientation=horizontal|vertical.",
      "کارگردانی چیدمان: برای هر صحنه مستقل تصمیم بگیر؛ تک‌عکس پیش‌فرض نیست. بسته به روایت و تعداد عکس‌های مرتبط از single، diagonal، triptych، grid، stagger، hero-stack، polaroid یا free استفاده کن. عکس‌های یک موضوع را در صورت نیاز در یک ترکیب چندعکسی بیاور و در صحنه بعدی عمداً ترکیب متفاوت بساز؛ از تکرار یک چیدمان در همه صحنه‌ها خودداری کن. فقط صحنه‌ای که transition=page-turn دارد باید یک عکس و layout=single داشته باشد؛ این محدودیت به صحنه‌های دیگر سرایت نمی‌کند.",
      "محدودیت‌ها: حداکثر ۲۰ صحنه (در حالت ورق‌زدن ترجیحاً یک صحنه برای هر عکس)؛ مدت هر صحنه ۲ تا ۸ ثانیه؛ حداکثر ۶ لایه متن در هر صحنه؛ حداکثر تصاویر هر layout مطابق ظرفیت آن: single=1، diagonal/triptych=3، سایر layoutها=4. در page-turn حتماً single و یک عکس. همه شماره‌های images باید عدد صحیح و بین ۱ و " + scenes.length + " باشند.",
      "photoScale عددی بین 0.82 و 1.16؛ photoY بین 0.16 و 0.40 (مقدار عددی)؛ photoSpread عددی بین 0.7 و 1.3؛ delay عددی بین 0 و 6؛ size عددی بین 24 و 68. backgroundColor و layer.color باید کد هگز شش‌رقمی باشند. frame.enabled بولی باشد.",
      "قواعد اعتبار: اگر contentMode=image است layers باید خالی یا فاقد متن باشند؛ اگر contentMode=text است images باید خالی باشد؛ اگر contentMode=mixed است دست‌کم یک عکس یا یک لایه متن لازم است. هر عکس را حداقل یک بار در کل طرح بیاور. همه enumها را دقیقاً با حروف انگلیسی و از فهرست بالا بنویس. پیش از ارسال، JSON و تمام مقادیر را کنترل کن.",
      "",
      "بریف کاربر:",
      brief,
      "عکس‌های انتخاب‌شده به ترتیب:",
      imageNames.join(" | "),
      "موسیقی انتخاب‌شده: " + musicInfo
    ].join("\n");
    if(typeof window.openNaviAssistant==="function"&&typeof window.navaVideoNaviRequest==="function"){
      window.openNaviAssistant({service:"ویدئو و صدا",message:prompt,context:{studio:"ویدئو و صدا",brief,images:imageNames,imageCount:scenes.length,music:musicInfo,selectedMedia:{images:imageNames,music:musicInfo},mode:"navi-auto-build",capabilities:["multi-scene text and image composition","photo selection and ordering","per-layer text motion and delay","scene duration and background","photo layout and motion","depth-aware 2.5D image parallax","cinematic scene transitions","adaptive text color","background music","video render and export"]}});
      const submitted=window.navaVideoNaviRequest({message:prompt,videoPlan:true});
      if(!submitted){smartAutoBuild=false;result.textContent="درخواست به ناوی ارسال نشد؛ نشست ورود را بررسی کن.";}
    }else{smartAutoBuild=false;result.textContent="ارسال خودکار به NAVI در دسترس نیست؛ صفحه را به‌روزرسانی کن.";}

  });
  let renderTimer=0,renderWatchdog=0;
  let navaFfmpegInstance=null,navaFfmpegLoadPromise=null;
  async function transcodeWebmToMp4(webmBlob){
    if(!webmBlob||webmBlob.size>80000000)return null;
    const loadScript=()=>new Promise((resolve,reject)=>{
      if(window.FFmpegWASM?.FFmpeg){resolve(window.FFmpegWASM);return;}
      const existing=document.querySelector('script[data-nava-ffmpeg]');
      if(existing){existing.addEventListener("load",()=>resolve(window.FFmpegWASM),{once:true});existing.addEventListener("error",reject,{once:true});return;}
      const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd/ffmpeg.js";script.async=true;script.dataset.navaFfmpeg="1";script.onload=()=>resolve(window.FFmpegWASM);script.onerror=()=>reject(new Error("FFmpeg loader unavailable"));document.head.appendChild(script);
    });
    let coreUrl="",wasmUrl="",ffmpeg=null,progressHandler=null;
    try{
      say("در حال آماده‌سازی مبدل MP4؛ دریافت موتور تبدیل ممکن است حدود ۳۰ مگابایت باشد…");
      const api=await loadScript();
      if(!api?.FFmpeg)throw new Error("FFmpeg API unavailable");
      if(!navaFfmpegInstance){
        if(!navaFfmpegLoadPromise)navaFfmpegLoadPromise=(async()=>{
          const instance=new api.FFmpeg();
          const base="https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
          const toBlob=async(url,type)=>{const response=await fetch(url);if(!response.ok)throw new Error("FFmpeg core download failed");return URL.createObjectURL(new Blob([await response.arrayBuffer()],{type}));};
          coreUrl=await toBlob(base+"/ffmpeg-core.js","text/javascript");
          wasmUrl=await toBlob(base+"/ffmpeg-core.wasm","application/wasm");
          await instance.load({coreURL:coreUrl,wasmURL:wasmUrl});
          return instance;
        })();
        navaFfmpegInstance=await navaFfmpegLoadPromise;
      }
      ffmpeg=navaFfmpegInstance;
      progressHandler=({progress:ratio})=>{if(Number.isFinite(ratio))progress.style.width=Math.min(99,Math.max(0,ratio*100))+"%";};
      ffmpeg.on("progress",progressHandler);
      const input=new Uint8Array(await webmBlob.arrayBuffer());
      await ffmpeg.writeFile("nava-input.webm",input);
      say("در حال تبدیل ویدئو به MP4؛ در گوشی ممکن است کمی زمان ببرد…");
      const exitCode=await ffmpeg.exec(["-i","nava-input.webm","-c:v","libx264","-preset","ultrafast","-crf","24","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k","-movflags","+faststart","nava-output.mp4"]);
      if(exitCode!==0)throw new Error("FFmpeg conversion failed");
      const data=await ffmpeg.readFile("nava-output.mp4");
      if(!data||!data.length)throw new Error("Empty MP4 output");
      try{await ffmpeg.deleteFile("nava-input.webm");await ffmpeg.deleteFile("nava-output.mp4");}catch(_){}
      return new Blob([data],{type:"video/mp4"});
    }catch(error){
      if(!navaFfmpegInstance)navaFfmpegLoadPromise=null;
      console.warn("NAVA WebM to MP4 conversion:",error);
      say("تبدیل MP4 روی این گوشی در دسترس نشد؛ فایل WebM سالم نگه داشته می‌شود.");
      return null;
    }finally{
      if(ffmpeg&&progressHandler)try{ffmpeg.off("progress",progressHandler);}catch(_){}
      if(ffmpeg){try{ffmpeg.terminate();}catch(_){}if(navaFfmpegInstance===ffmpeg)navaFfmpegInstance=null;navaFfmpegLoadPromise=null;}
      if(coreUrl)URL.revokeObjectURL(coreUrl);
      if(wasmUrl)URL.revokeObjectURL(wasmUrl);
    }
  }
  async function tryMediabunnyMp4(renderStory,renderDuration){
    const MB=window.Mediabunny;
    if(!MB||!MB.Output||!MB.CanvasSource||!MB.Mp4OutputFormat||!MB.BufferTarget)return false;
    let output=null,videoSource=null,audioSource=null,audioEncodedPackets=0;
    try{
      const fps=20,[width,height]=dimensions();
      const quality=new MB.Quality({bitrate:2200000});
      let videoCodec=await MB.getFirstEncodableVideoCodec(["avc"],{width,height,frameRate:fps,quality});
      let isMp4=videoCodec==="avc";
      if(!isMp4){
        videoCodec=await MB.getFirstEncodableVideoCodec(["vp9"],{width,height,frameRate:fps,quality});
        if(videoCodec!=="vp9")return false;
      }
      let audioBuffer=null,audioCodec=isMp4?"aac":"opus";
      const soundEvents=[];let soundCursor=0;
      (Array.isArray(renderStory)?renderStory:[]).forEach(scene=>{
        const transitionSound=({ "page-turn":"page-turn","slide-left":"whoosh","slide-right":"whoosh",zoom:"impact",fade:"sparkle" })[scene.transition];if(soundCursor>0&&transitionSound)soundEvents.push({type:transitionSound,time:soundCursor,source:"transition"});
        (scene.layers||[]).forEach(layer=>{
          const sound=layer.sound||"none";
          if(sound!=="none")soundEvents.push({type:sound,time:soundCursor+(Number(layer.delay)||0),length:String(layer.text||"").length,wordCount:String(layer.text||"").trim().split(/\s+/).filter(Boolean).length,reveal:layer.reveal||"none"});
        });
        soundCursor+=Number(scene.duration)||0;
      });
      if(musicUrl||musicFile||soundEvents.length){
        const AudioContextClass=window.AudioContext||window.webkitAudioContext;
        if(!AudioContextClass)return false;
        if(!audioContext)audioContext=new AudioContextClass();
        await audioContext.resume();
        const sampleRate=48000,frameCount=Math.max(1,Math.ceil(renderDuration*sampleRate));
        audioBuffer=audioContext.createBuffer(2,frameCount,sampleRate);
        if(musicUrl||musicFile){
          let sourceBlob=musicFile;
          if(!sourceBlob&&musicUrl){const response=await fetch(musicUrl);if(!response.ok)return false;sourceBlob=await response.blob();}
          if(!sourceBlob)return false;
          const decoded=await audioContext.decodeAudioData(await sourceBlob.arrayBuffer());
          const gain=Math.max(0,Number(musicVolume.value)/100),fade=Math.max(0,Number(fadeInput.value)||0);
          for(let ch=0;ch<2;ch++){
            const input=decoded.getChannelData(Math.min(ch,decoded.numberOfChannels-1)),out=audioBuffer.getChannelData(ch);
            for(let n=0;n<frameCount;n++){
              const t=n/sampleRate,remaining=renderDuration-t,sourceIndex=Math.min(input.length-1,Math.floor(t*decoded.sampleRate));
              const envelope=fade>0?Math.max(0,Math.min(1,t/fade,remaining/fade)):1;
              out[n]+=input[sourceIndex]*gain*envelope;
            }
          }
        }
        const addSample=(index,value)=>{if(index<0||index>=frameCount)return;audioBuffer.getChannelData(0)[index]+=value;audioBuffer.getChannelData(1)[index]+=value*.94;};
        const transitionEvents=soundEvents.filter(event=>event.source==="transition");
        const otherSoundEvents=soundEvents.filter(event=>event.source!=="transition").slice(0,48);
        [...transitionEvents,...otherSoundEvents].sort((a,b)=>a.time-b.time).forEach(event=>{
          const start=Math.max(0,Math.floor(event.time*sampleRate));if(start>=frameCount)return;
          const typeCount=event.reveal==="word"?Math.max(1,event.wordCount||1):Math.max(1,event.length||1);const duration=event.type==="page-turn"?.72:event.type==="whoosh"?.72:event.type==="sparkle"?.62:event.type==="impact"?.42:event.type==="type"?(event.reveal==="word"?typeCount/1.8:event.reveal==="char"?typeCount/8:.64):.48;
          const count=Math.min(frameCount-start,Math.ceil(duration*sampleRate));
          for(let n=0;n<count;n++){
            const t=n/sampleRate,p=n/count;let sample=0;
            if(event.type==="impact"){
              sample=Math.sin(2*Math.PI*(105-58*p)*t)*Math.exp(-t*12)*.48+Math.sin(2*Math.PI*1450*t)*Math.exp(-t*95)*.12;
            }else if(event.type==="whoosh"){
              sample=Math.sin(n*12.9898)*Math.cos(n*4.1414)*Math.sin(Math.PI*p)*.2;
            }else if(event.type==="sparkle"){
              sample=(Math.sin(2*Math.PI*(1050+900*p)*t)+.55*Math.sin(2*Math.PI*(1680+700*p)*t))*Math.exp(-t*5)*.16;
            }else if(event.type==="page-turn"){
              sample=(Math.sin(n*12.9898)*Math.cos(n*4.1414)*Math.sin(Math.PI*p)*.23+Math.sin(2*Math.PI*(180-95*p)*t)*Math.sin(Math.PI*p)*.12);
            }else if(event.type==="type"){
              const interval=event.reveal==="word"?1/1.8:event.reveal==="char"?1/8:.16;
              const tick=t%interval;
              sample=tick<.018?Math.sin(2*Math.PI*1750*tick)*Math.exp(-tick*125)*.075:0;
            }
            const envelope=Math.min(1,p*18)*(event.type==="whoosh"?Math.min(1,(1-p)*8):1);
            addSample(start+n,sample*envelope);
          }
        });
        for(let ch=0;ch<2;ch++){
          const data=audioBuffer.getChannelData(ch);
          for(let n=0;n<data.length;n++)data[n]=Math.max(-.96,Math.min(.96,data[n]));
        }
        let audioReady=await MB.canEncodeAudio(audioCodec);
        if(!audioReady&&audioCodec==="aac"&&window.MediabunnyAacEncoder?.registerAacEncoder){
          window.MediabunnyAacEncoder.registerAacEncoder();
          audioReady=await MB.canEncodeAudio("aac");
        }
        if(!audioReady&&isMp4){
          videoCodec=await MB.getFirstEncodableVideoCodec(["vp9"],{width,height,frameRate:fps,quality});
          isMp4=false;audioCodec="opus";audioReady=videoCodec==="vp9"&&await MB.canEncodeAudio("opus");
        }
        if(!audioReady)return false;
      }
      const outputFormat=isMp4?new MB.Mp4OutputFormat():new MB.WebMOutputFormat();
      output=new MB.Output({format:outputFormat,target:new MB.BufferTarget()});
      videoSource=new MB.CanvasSource(canvas,{codec:videoCodec,quality,latencyMode:"quality",hardwareAcceleration:"prefer-hardware"});
      output.addVideoTrack(videoSource,{frameRate:fps});
      if(audioBuffer){
        audioSource=new MB.AudioBufferSource({
          codec:audioCodec,
          quality:new MB.Quality({bitrate:128000}),
          transform:{numberOfChannels:2,sampleRate:48000},
          onEncodedPacket:()=>{audioEncodedPackets++;}
        });
        output.addAudioTrack(audioSource);
      }
      await output.start();
      if(audioBuffer)await audioSource.add(audioBuffer);
      const totalFrames=Math.max(1,Math.ceil(renderDuration*fps));
      for(let frame=0;frame<totalFrames;frame++){
        if(!recording)throw new Error("render-cancelled");
        const t=frame/fps;
        drawFrame(t,renderStory,renderDuration);
        await videoSource.add(t,1/fps,{keyFrame:frame===0});
        if(frame%5===0){
          progress.style.width=Math.min(99,(frame+1)/totalFrames*100)+"%";
          if(frame%20===0)await new Promise(resolve=>setTimeout(resolve,0));
        }
      }
      videoSource.close();videoSource=null;
      if(audioSource){audioSource.close();audioSource=null;}
      await output.finalize();
      const buffer=output.target.buffer;
      if(!buffer||!buffer.byteLength)throw new Error("empty-render-output");
      let finalBlob=new Blob([buffer],{type:isMp4?"video/mp4":"video/webm"});
      if(audioBuffer){
        if(audioEncodedPackets<1)throw new Error("music-audio-encoder-produced-no-packets");
        if(!MB.Input||!MB.BlobSource||!MB.ALL_FORMATS)throw new Error("music-track-validation-unavailable");
        const checkInput=new MB.Input({source:new MB.BlobSource(finalBlob),formats:MB.ALL_FORMATS});
        try{
          const encodedAudioTrack=await checkInput.getPrimaryAudioTrack();
          if(!encodedAudioTrack)throw new Error("music-track-missing-from-rendered-file");
        }finally{try{checkInput.dispose();}catch(_){}}
      }
      let extension=isMp4?"mp4":"webm";
      if(!isMp4){
        say("ویدئو با زمان‌بندی دقیق ساخته شد؛ در حال تبدیل به MP4…");
        const converted=await transcodeWebmToMp4(finalBlob);
        if(converted){finalBlob=converted;extension="mp4";}
      }
      if(outputUrl)URL.revokeObjectURL(outputUrl);
      outputUrl=URL.createObjectURL(finalBlob);
      const video=$("navaVideoOutput");video.src=outputUrl;
      const link=$("navaVideoDownload");link.href=outputUrl;link.download="nava-multiphoto-video."+extension;link.hidden=false;
      result.hidden=false;progress.style.width="100%";
      resize();drawFrame(0);
      say(extension==="mp4"?"ویدئوی MP4 آماده شد؛ می‌توانی آن را پخش یا دریافت کنی.":"ویدئوی روان با فرمت WebM آماده شد؛ این مرورگر تبدیل MP4 را پشتیبانی نکرد.");
      return true;
    }catch(error){
      try{videoSource?.close();}catch(_){}
      try{audioSource?.close();}catch(_){}
      try{if(output&&output.state!=="finalized"&&output.state!=="canceled")await output.cancel();}catch(_){}
      if(error?.message!=="render-cancelled")console.warn("NAVA Mediabunny render:",error);
      return false;
    }
  }
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
      await prepareDepthMotion(renderStory);
      const renderDuration=renderStory.length?renderStory.reduce((sum,s)=>sum+s.duration,0):(Number(durationInput?.value)||8);
      if(renderStory.length>1) say("در حال ساخت "+renderStory.length+" صحنه متوالی…");
      resize();drawFrame(0,renderStory,renderDuration);
      if(window.Mediabunny){
        recording=true;renderBtn.disabled=true;previewBtn.disabled=true;progress.style.width="0%";
        say("در حال ساخت MP4 با موتور رندر مستقیم؛ لطفاً صفحه را باز و روشن نگه دار.");
        const mp4Ready=await tryMediabunnyMp4(renderStory,renderDuration);
        recording=false;renderBtn.disabled=false;previewBtn.disabled=false;
        if(mp4Ready)return;
        resize();drawFrame(0,renderStory,renderDuration);
        say("این گوشی از رمزگذاری مستقیم MP4 پشتیبانی نکرد؛ مسیر سازگار مرورگر فعال می‌شود…");
      }
      // Prefer broadly compatible MP4/H.264 + AAC when this browser can record it.
      // Keep WebM as a truthful fallback; never rename a WebM blob to .mp4.
      const isAndroid=/Android/i.test(navigator.userAgent||"");
      const mp4Candidates=[
        'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
        'video/mp4;codecs=avc1.42E01E',
        "video/mp4"
      ];
      const webmCandidates=[
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm"
      ];
      // Prefer native MP4/H.264 on every platform for compatibility with
      // gallery apps and social platforms. Use WebM only when this browser
      // does not advertise a usable MP4 recording type.
      const mimeCandidates=[...mp4Candidates,...webmCandidates]
        .filter(type=>{try{return MediaRecorder.isTypeSupported(type);}catch(_){return false;}});
      // WebM fallback uses a lighter render profile on mobile encoders.
      lowPowerRender=!!mimeCandidates[0]?.toLowerCase().startsWith("video/webm");
      resize();drawFrame(0,renderStory,renderDuration);
      const stream=canvas.captureStream(lowPowerRender?15:20);
      const renderStorySounds=renderStory.some(scene=>scene.transition==="page-turn"||(scene.layers||[]).some(layer=>layer.sound&&layer.sound!=="none"));
      if(musicElement||renderStorySounds){
        const AudioContextClass=window.AudioContext||window.webkitAudioContext;
        if(!AudioContextClass)throw new Error("مرورگر از پردازش صدای موسیقی و افکت‌ها پشتیبانی نمی‌کند.");
        if(!audioContext||audioContext.state==="closed")audioContext=new AudioContextClass();
        if(!audioDestination||audioDestination.stream.getAudioTracks().every(track=>track.readyState==="ended")){audioDestination=audioContext.createMediaStreamDestination();if(musicGain)musicGain.connect(audioDestination);}
        if(musicElement&&!musicGain){
          audioSource=audioContext.createMediaElementSource(musicElement);
          musicGain=audioContext.createGain();
          audioSource.connect(musicGain);musicGain.connect(audioDestination);
        }
        await audioContext.resume();
        if(!audioDestination)throw new Error("اتصال صدای خروجی آماده نشد.");
        if(musicElement&&musicGain)musicGain.gain.value=Math.max(0,Number(musicVolume.value)/100);
        audioDestination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
      }
      chunks=[];recording=true;renderBtn.disabled=true;previewBtn.disabled=true;progress.style.width="0%";
      let mime="";
      recorder=null;
      for(const candidate of mimeCandidates){
        try{
          recorder=new MediaRecorder(stream,{mimeType:candidate,videoBitsPerSecond:lowPowerRender?1100000:2200000});
          mime=recorder.mimeType||candidate;
          break;
        }catch(_){recorder=null;}
      }
      if(!recorder){
        stream.getTracks().forEach(t=>t.stop());
        recording=false;renderBtn.disabled=false;previewBtn.disabled=false;
        say("این مرورگر ضبط MP4 یا WebM سازگار را پشتیبانی نمی‌کند.");
        return;
      }
      recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
      recorder.onerror=()=>{
        stream.getTracks().forEach(t=>t.stop());if(musicElement)musicElement.pause();
        recording=false;renderBtn.disabled=false;previewBtn.disabled=false;
        if(renderTimer){clearInterval(renderTimer);renderTimer=0;}
        if(renderWatchdog){clearTimeout(renderWatchdog);renderWatchdog=0;}
        say("ضبط ویدئو با خطا متوقف شد؛ دوباره تلاش کن.");
      };
      recorder.onstop=async()=>{
        if(renderTimer){clearInterval(renderTimer);renderTimer=0;}
        if(renderWatchdog){clearTimeout(renderWatchdog);renderWatchdog=0;}
        stream.getTracks().forEach(t=>t.stop());if(musicElement)musicElement.pause();
        recording=false;renderBtn.disabled=true;previewBtn.disabled=true;
        lowPowerRender=false;resize();drawFrame(0);
        const actualMime=recorder?.mimeType||mime;
        let blob=new Blob(chunks,{type:actualMime});
        if(!blob.size){renderBtn.disabled=false;previewBtn.disabled=false;say("فایل ویدئو خالی ساخته شد؛ لطفاً دوباره تلاش کن.");return;}
        let extension=actualMime.toLowerCase().startsWith("video/mp4")?"mp4":"webm";
        if(extension==="webm"){
          const converted=await transcodeWebmToMp4(blob);
          if(converted){blob=converted;extension="mp4";}
        }
        renderBtn.disabled=false;previewBtn.disabled=false;
        if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=URL.createObjectURL(blob);
        const video=$("navaVideoOutput");video.src=outputUrl;
        const link=$("navaVideoDownload");link.href=outputUrl;link.download="nava-multiphoto-video."+extension;link.hidden=false;
        result.hidden=false;progress.style.width="100%";
        say(extension==="mp4"?"ویدئوی MP4 آماده شد؛ می‌توانی آن را پخش یا دریافت کنی.":"تبدیل MP4 روی این گوشی انجام نشد؛ فایل WebM آماده دریافت است.");
      };
      recorder.start(250);
      // Start captured audio only after MediaRecorder is running; otherwise short
      // opening effects can finish before the recorder begins collecting samples.
      if(renderStorySounds&&audioDestination&&audioContext){
        scheduleSoundEffects(renderStory,audioDestination,audioContext.currentTime+.18);
      }
      if(musicElement){
        musicElement.currentTime=0;
        try{await musicElement.play();}catch(error){console.warn("NAVA export music playback:",error);}
      }
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
      // Match drawing cadence to the 20 fps canvas capture stream. Drawing
      // at ~30 fps while captureStream samples at 20 fps wastes CPU and can
      // increase frame-time jitter on slower phones.
      renderTimer=setInterval(tick,lowPowerRender?66:50);
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