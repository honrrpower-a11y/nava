/* NAVA multi-image + music video studio; all source media remains local to the browser. */
(() => {
  "use strict";
  const root=document.getElementById("navaVideoEngine"); if(!root||root.dataset.ready==="1")return; root.dataset.ready="1";
  const $=id=>root.querySelector("#"+id);
  const imageInput=$("navaVideoImage"),musicInput=$("navaVideoMusic"),canvas=$("navaVideoCanvas"),ctx=canvas.getContext("2d",{alpha:false});
  const previewBtn=$("navaVideoPreview"),renderBtn=$("navaVideoRender"),status=$("navaVideoStatus"),progress=$("navaVideoProgress"),result=$("navaVideoResult");
  const titleInput=$("navaVideoTitle"),subtitleInput=$("navaVideoSubtitle"),durationInput=$("navaVideoDuration"),formatInput=$("navaVideoFormat"),motionInput=$("navaVideoMotion"),layoutInput=$("navaVideoLayout"),textInput=$("navaVideoText");
  const sceneList=$("navaVideoSceneList"),musicVolume=$("navaVideoMusicVolume"),fadeInput=$("navaVideoFade");
  const wordMotionInput=$("navaVideoWordMotion"),wordSpeedInput=$("navaVideoWordSpeed");
  let scenes=[],musicUrl="",musicElement=null,audioContext=null,audioSource=null,audioDestination=null,musicGain=null,previewFrame=0,recorder=null,chunks=[],recording=false,startedAt=0,previewing=false,previewOffset=0,outputUrl="";
  const storyList=$("navaVideoStoryList"),addStoryBtn=$("navaVideoAddScene");
  const fontInput=$("navaVideoFont"),manualMotionInput=$("navaVideoManualMotion");
  const briefInput=$("navaVideoBrief"),applyBriefBtn=$("navaVideoApplyBrief");
  const setupRadios=Array.from(root.querySelectorAll('input[name="navaVideoSetupMode"]'));
  const setupMode=()=>setupRadios.find(r=>r.checked)?.value||"brief";
  const toLayerMotion=value=>({"slide-right":"from-right","slide-left":"from-left",rise:"from-bottom",cinematic:"from-bottom",type:"fade"}[value]||value);
  function applyBrief(){
    const brief=(briefInput?.value||"").trim();if(!brief){$("navaVideoNaviResult").textContent="ابتدا شرح درخواست را بنویس.";return;}
    let motion=null;
    if(/محو|fade|شفاف|آرام ظاهر/.test(brief))motion="fade";
    if(/از پایین|بالا بیاید|rise/.test(brief))motion="rise";
    if(/از (سمت )?راست|از راست به چپ|از سمت راست وارد|ورود از راست|slide.?right/i.test(brief))motion="slide-right";
    if(/از (سمت )?چپ|از چپ به راست|از سمت چپ وارد|slide.?left/i.test(brief))motion="slide-left";
    if(/مرحله.?ای|کلمه.?به.?کلمه|حرف.?به.?حرف|تایپ|typewriter/i.test(brief))motion="type";
    if(/سینمایی|cinematic/.test(brief))motion="cinematic";
    if(/بدون حرکت|ثابت بماند|بدون افکت/.test(brief))motion="none";
    let font=null;
    if(/وزیر|vazir/i.test(brief))font="'Vazirmatn',sans-serif";
    else if(/شکسته|shekasteh|dima/i.test(brief))font="'Dima Shekasteh',serif";
    else if(/نستعلیق|nastaliq|ایران.?نستعلیق/i.test(brief))font="'IranNastaliq',serif";
    else if(/گلزار|gulzar/i.test(brief))font="'Gulzar',serif";
    else if(/نسخ|naskh|noto/i.test(brief))font="'Noto Naskh Arabic',serif";
    else if(/ایران.?سن.?س|iransans/i.test(brief))font="Tahoma,sans-serif";
    else if(/تاهوما|tahoma/i.test(brief))font="Tahoma,sans-serif";
    else if(/آریال|arial/i.test(brief))font="Arial,sans-serif";
    if(motion)storyCards().forEach(card=>card.querySelectorAll("[data-layer-motion]").forEach(el=>el.value=toLayerMotion(motion)));
    if(font&&fontInput){fontInput.value=font;activateFont(font);}
    const direction=/چپ به راست|از چپ به راست|چپ.?چین|left.?to.?right|ltr/i.test(brief)?"ltr":/راست به چپ|راست.?چین|right.?to.?left|rtl/i.test(brief)?"rtl":null;
    if(direction)textDirection=direction;
    $("navaVideoNaviResult").textContent=(motion||font||direction)?"دستورهای قابل‌تشخیص اعمال شدند؛ پیش‌نمایش را بررسی کن. اگر بخشی از شرح شامل ویژگی پشتیبانی‌نشده باشد، هنوز خودکار اجرا نمی‌شود.":"دستور مشخصی از موارد فعلی شناسایی نشد؛ می‌توانی تنظیمات را دستی انتخاب کنی.";
    resize();drawFrame(0);updateReady();
  }
  let activeFont=fontInput?.value||"sans-serif",textDirection="rtl",fontLoadToken=0;
  async function activateFont(font){activeFont=font||"sans-serif";const token=++fontLoadToken;try{if(document.fonts?.load){await document.fonts.load("650 42px "+activeFont);await document.fonts.ready;}}catch(_){}if(token===fontLoadToken){resize();drawFrame(0);}}
  setupRadios.forEach(r=>r.addEventListener("change",()=>{const briefMode=setupMode()==="brief";$("navaVideoBriefSettings").hidden=!briefMode;$("navaVideoManualSettings").hidden=briefMode;if(!briefMode){activateFont(fontInput?.value||"sans-serif");textDirection="rtl";storyCards().forEach(card=>card.querySelectorAll("[data-layer-motion]").forEach(el=>{if(manualMotionInput)el.value=toLayerMotion(manualMotionInput.value);}));}resize();drawFrame(0);}));
  applyBriefBtn?.addEventListener("click",applyBrief);
  manualMotionInput?.addEventListener("change",()=>{if(setupMode()==="manual")storyCards().forEach(card=>card.querySelectorAll("[data-layer-motion]").forEach(el=>{el.value=manualMotionInput.value==="slide-right"?"from-right":manualMotionInput.value==="slide-left"?"from-left":manualMotionInput.value==="rise"?"from-bottom":manualMotionInput.value;}));drawFrame(0);});
  fontInput?.addEventListener("change",()=>activateFont(fontInput.value));

  const storyCards=()=>storyList?Array.from(storyList.querySelectorAll("[data-story-scene]")):[];
  const refreshScenePhotoOptions=()=>storyCards().forEach(card=>{const select=card.querySelector("[data-story-image]");if(!select)return;const previous=Array.from(select.selectedOptions||[]).map(o=>o.value);select.innerHTML="";scenes.forEach((scene,i)=>{const option=document.createElement("option");option.value=String(i);option.textContent="عکس "+(i+1)+" — "+scene.file.name;option.selected=previous.includes(String(i));select.append(option);});});
  const storyData=()=>storyCards().map(card=>({layers:Array.from(card.querySelectorAll("[data-story-layer]")).map(layer=>({text:layer.querySelector("[data-layer-text]").value.trim(),position:layer.querySelector("[data-layer-position]").value,offset:Number(layer.querySelector("[data-layer-offset]")?.value)||0,align:layer.querySelector("[data-layer-align]").value,motion:layer.querySelector("[data-layer-motion]").value,size:Number(layer.querySelector("[data-layer-size]").value)||42,delay:Number(layer.querySelector("[data-layer-delay]")?.value)||0,exit:layer.querySelector("[data-layer-exit]")?.value||"stay",underline:!!layer.querySelector("[data-layer-underline]")?.checked,underlineAlign:layer.querySelector("[data-layer-underline-align]")?.value||"match",underlineColor:layer.querySelector("[data-layer-underline-color]")?.value||"#ffffff",underlineThickness:Number(layer.querySelector("[data-layer-underline-thickness]")?.value)||4,underlineWidth:Number(layer.querySelector("[data-layer-underline-width]")?.value)||0.7,style:layer.querySelector("[data-layer-style]")?.value||"normal",orientation:layer.querySelector("[data-layer-orientation]")?.value||"horizontal",color:layer.querySelector("[data-layer-color]")?.value||"#ffffff",frame:!!layer.querySelector("[data-layer-frame]")?.checked,frameTitle:layer.querySelector("[data-layer-frame-title]")?.value||""})).filter(layer=>layer.text),duration:Number(card.querySelector("[data-story-duration]").value)||4,imageIndices:Array.from(card.querySelector("[data-story-image]")?.selectedOptions||[]).map(o=>Number(o.value)).filter(n=>Number.isInteger(n)&&n>=0),layout:card.querySelector("[data-story-layout]")?.value||"single",imageIndex:Number(card.querySelector("[data-story-image]")?.value??-1)})).filter(s=>s.layers.length||s.imageIndices.length||s.imageIndex>=0);
  const layerMarkup=(index=1)=>'<div class="nava-video-text-layer" data-story-layer><div class="nava-video-layer-head"><strong>لایه متن '+index+'</strong><button type="button" data-remove-layer>حذف لایه</button></div><label>متن<textarea data-layer-text rows="2" maxlength="420" placeholder="متن این لایه را بنویس..."></textarea></label><details class="nava-video-layer-settings"><summary>تنظیمات بیشتر</summary><div class="nava-video-layer-fields"><label>جای متن<select data-layer-position><option value="top">بالای تصویر</option><option value="center">وسط تصویر</option><option value="bottom" selected>پایین تصویر</option></select></label><label>فاصله عمودی<select data-layer-offset><option value="-30">خیلی بالاتر</option><option value="-20">بالاتر</option><option value="-10">کمی بالاتر</option><option value="0" selected>بدون جابه‌جایی</option><option value="10">کمی پایین‌تر</option><option value="20">پایین‌تر</option><option value="30">خیلی پایین‌تر</option></select></label><label>تراز<select data-layer-align><option value="right" selected>راست‌چین</option><option value="center">وسط‌چین</option><option value="left">چپ‌چین</option></select></label><label>ورود متن<select data-layer-motion><option value="from-right" selected>از بیرون کادر راست</option><option value="from-left">از بیرون کادر چپ</option><option value="from-top">از بیرون کادر بالا</option><option value="from-bottom">از بیرون کادر پایین</option><option value="fade">محو و ظاهر شدن</option><option value="none">ثابت</option></select></label><label>تأخیر شروع<select data-layer-delay><option value="0">بدون تأخیر</option><option value="0.5">نیم ثانیه</option><option value="1">۱ ثانیه</option><option value="1.5">۱٫۵ ثانیه</option><option value="2">۲ ثانیه</option><option value="2.5">۲٫۵ ثانیه</option><option value="3">۳ ثانیه</option><option value="4">۴ ثانیه</option><option value="5">۵ ثانیه</option><option value="6">۶ ثانیه</option></select></label><label>خروج هنگام ورود متن بعدی<select data-layer-exit><option value="stay" selected>باقی بماند</option><option value="fade">محو شود</option><option value="right">حرکت به بیرون راست</option><option value="left">حرکت به بیرون چپ</option><option value="top">حرکت به بیرون بالا</option><option value="bottom">حرکت به بیرون پایین</option></select></label><label>اندازه نوشته<select data-layer-size><option value="30">کوچک</option><option value="42" selected>متوسط</option><option value="56">بزرگ</option><option value="68">خیلی بزرگ</option></select></label><label>حالت نوشته<select data-layer-style><option value="normal">معمولی</option><option value="italic">اریب</option></select></label><label>جهت نوشته<select data-layer-orientation><option value="horizontal">افقی</option><option value="vertical">عمودی</option></select></label><label>رنگ فونت<input type="color" data-layer-color value="#ffffff"></label><div class="nava-video-frame-tools"><label><input type="checkbox" data-layer-frame> قاب مستطیلی ظریف</label><label>عنوان بالای قاب<input type="text" data-layer-frame-title maxlength="32" placeholder="مثلاً NAVA"></label></div><div class="nava-video-underline-tools"><label class="nava-video-underline-toggle"><input type="checkbox" data-layer-underline> کشیدن خط زیر این متن</label><label>رنگ خط<select data-layer-underline-color><option value="#ffffff">سفید</option><option value="nava-gradient">ترکیبی نوا (طلایی، فیروزه‌ای، آبی)</option><option value="#e5bd62">طلایی</option><option value="#69c7bd">فیروزه‌ای</option><option value="#7da8ff">آبی</option><option value="#ff8d8d">قرمز ملایم</option></select></label><label>ضخامت خط<select data-layer-underline-thickness><option value="2">نازک</option><option value="4" selected>معمولی</option><option value="7">ضخیم</option></select></label><label>طول خط<select data-layer-underline-width><option value="0.4">کوتاه</option><option value="0.7" selected>متوسط</option><option value="1">به‌اندازه متن</option></select></label><label>تراز خط زیر<select data-layer-underline-align><option value="match" selected>هم‌تراز با متن</option><option value="right">راست‌چین</option><option value="center">وسط‌چین</option><option value="left">چپ‌چین</option></select></label></div></div></details></div>';
  // Bring the original first layer into the same compact settings layout as newly added layers.
  storyCards().forEach(layer=>{if(layer.querySelector(".nava-video-layer-settings"))return;const fields=layer.querySelector(".nava-video-layer-fields");if(!fields)return;const details=document.createElement("details");details.className="nava-video-layer-settings";const summary=document.createElement("summary");summary.textContent="تنظیمات بیشتر";details.append(summary);layer.insertBefore(details,fields);details.append(fields);const position=fields.querySelector("[data-layer-position]")?.closest("label");if(position){const label=document.createElement("label");label.textContent="فاصله عمودی";const select=document.createElement("select");select.setAttribute("data-layer-offset","");[["-30","خیلی بالاتر"],["-20","بالاتر"],["-10","کمی بالاتر"],["0","بدون جابه‌جایی"],["10","کمی پایین‌تر"],["20","پایین‌تر"],["30","خیلی پایین‌تر"]].forEach(([value,text])=>{const option=document.createElement("option");option.value=value;option.textContent=text;if(value==="0")option.selected=true;select.append(option);});label.append(select);position.after(label);}});
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
  function moveScene(i,delta){const j=i+delta;if(j<0||j>=scenes.length)return;[scenes[i],scenes[j]]=[scenes[j],scenes[i]];renderSceneList();drawFrame(0);}
  function drawFrame(seconds,storyOverride,durationOverride){
    const [w,h]=dimensions();if(canvas.width!==w||canvas.height!==h)resize();
    const duration=Number(durationOverride)||totalDuration(),hasImages=scenes.length>0,per=hasImages?duration/scenes.length:duration,index=hasImages?Math.min(scenes.length-1,Math.floor(Math.min(seconds,duration-.001)/per)):0,local=hasImages?(seconds-index*per)/per:seconds/duration;
    const story=Array.isArray(storyOverride)?storyOverride:storyData();let activeStory=null,activeStoryIndex=-1,storyLocal=seconds;
    if(story.length){let cursor=0;for(let i=0;i<story.length;i++){const item=story[i];if(seconds<cursor+item.duration){activeStory=item;activeStoryIndex=i;storyLocal=seconds-cursor;break;}cursor+=item.duration;}if(!activeStory){activeStory=story[story.length-1];activeStoryIndex=story.length-1;storyLocal=activeStory.duration;}}
    const activeImages=story.length?(activeStory?(activeStory.imageIndices?.length?activeStory.imageIndices.map(i=>scenes[i]).filter(Boolean):(activeStory.imageIndex>=0?[scenes[activeStory.imageIndex]].filter(Boolean):[])):[]):(hasImages?[scenes[index]]:[]);
    ctx.fillStyle="#050912";ctx.fillRect(0,0,w,h);
    const drawImageCover=(img,x,y,bw,bh,progress=local)=>{const iw=img.naturalWidth,ih=img.naturalHeight,scale=Math.max(bw/iw,bh/ih)*(1+(motionInput?.value==="subtle"?.012:.035)*progress),dw=iw*scale,dh=ih*scale;ctx.save();ctx.beginPath();ctx.rect(x,y,bw,bh);ctx.clip();ctx.drawImage(img,x+(bw-dw)/2,y+(bh-dh)/2,dw,dh);ctx.restore();};
    const usableImages=activeImages.map(item=>item?.image).filter(img=>img?.complete&&img.naturalWidth>0&&img.naturalHeight>0);
    if(usableImages.length){
      const sceneLayout=story.length?(activeStory?.layout||"single"):(layoutInput?.value||"single");
      const photo=(img,x,y,bw,bh,angle=0)=>{ctx.save();ctx.translate(x+bw/2,y+bh/2);ctx.rotate(angle*Math.PI/180);ctx.shadowColor="rgba(0,0,0,.48)";ctx.shadowBlur=Math.max(12,w*.022);ctx.shadowOffsetY=Math.max(5,h*.009);ctx.fillStyle="#f7f4ed";ctx.fillRect(-bw/2-5,-bh/2-5,bw+10,bh+10);ctx.shadowColor="transparent";drawImageCover(img,-bw/2,-bh/2,bw,bh,local);ctx.strokeStyle="rgba(255,255,255,.86)";ctx.lineWidth=Math.max(1,w*.002);ctx.strokeRect(-bw/2,-bh/2,bw,bh);ctx.restore();};
      if(usableImages.length===1&&sceneLayout==="single")drawImageCover(usableImages[0],0,0,w,h,local);
      else if(sceneLayout==="grid"){const gap=w*.025,cw=(w-gap*3)/2,ch=(h*.58-gap*3)/2;usableImages.slice(0,4).forEach((img,k)=>photo(img,gap+(k%2)*(cw+gap),h*.2+gap+Math.floor(k/2)*(ch+gap),cw,ch));}
      else if(sceneLayout==="triptych"){const gap=w*.018,cw=(w-gap*4)/3,ch=h*.58;usableImages.slice(0,3).forEach((img,k)=>photo(img,gap+(cw+gap)*k,h*.2,cw,ch));}
      else if(sceneLayout==="diagonal"){const bw=w*.43,bh=h*.43,dx=[-.24,0,.24],ang=[-9,0,9];usableImages.slice(0,3).forEach((img,k)=>photo(img,w/2-bw/2+dx[k]*w,h*.28,bw,bh,ang[k]));}
      else if(sceneLayout==="stagger"){const bw=w*.56,bh=h*.34;usableImages.slice(0,4).forEach((img,k)=>photo(img,w*(k%2?.38:.06),h*(.13+k*.17),bw,bh,k%2?5:-5));}
      else if(sceneLayout==="polaroid"||sceneLayout==="free"){const bw=w*.46,bh=h*.42,xs=[.04,.48,.12,.43],ys=[.2,.25,.49,.52],angs=sceneLayout==="free"?[-12,8,-5,11]:[-7,6,-3,9];usableImages.slice(0,4).forEach((img,k)=>photo(img,w*xs[k],h*ys[k],bw,bh,angs[k]));}
      else drawImageCover(usableImages[0],0,0,w,h,local);
    }else{const gradient=ctx.createLinearGradient(0,0,w,h);gradient.addColorStop(0,"#18243b");gradient.addColorStop(.58,"#202f47");gradient.addColorStop(1,"#080d18");ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);}
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
    const shade=ctx.createLinearGradient(0,0,0,h);shade.addColorStop(0,"rgba(2,8,18,.12)");shade.addColorStop(.55,"rgba(2,8,18,.02)");shade.addColorStop(1,"rgba(2,8,18,.72)");ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    const sf=w/1080;ctx.textAlign=textDirection==="ltr"?"left":"center";ctx.direction=textDirection;ctx.shadowColor="rgba(0,0,0,.65)";ctx.shadowBlur=16*sf;
    if(titleInput.value.trim()){ctx.font="700 "+Math.round(54*sf)+"px sans-serif";ctx.fillStyle="#fff";ctx.fillText(titleInput.value.trim(),w/2,h*.79,w*.84);}
    if(subtitleInput.value.trim()){ctx.font="400 "+Math.round(27*sf)+"px sans-serif";ctx.fillStyle="#fff";ctx.fillText(subtitleInput.value.trim(),w/2,h*.84,w*.82);}
    const persistence=$("navaVideoTextPersistence")?.value||"keep";
    const visibleScenes=activeStory?(persistence==="keep"?story.slice(0,activeStoryIndex+1):[activeStory]):[];
    const layersToDraw=[];
    visibleScenes.forEach((scene,i)=>{(scene.layers||[]).forEach((layer,layerIndex)=>{const elapsed=i===visibleScenes.length-1?storyLocal:scene.duration,nextLayer=(scene.layers||[])[layerIndex+1],exitAt=nextLayer?Math.max(Number(layer.delay)||0,Number(nextLayer.delay)||0):scene.duration;layersToDraw.push({layer,elapsed,sceneDuration:scene.duration,isCurrent:i===visibleScenes.length-1,exitAt});});});
    if(!story.length&&textInput?.value.trim())layersToDraw.push({layer:{text:textInput.value.trim(),position:"bottom",align:"center",motion:wordMotionInput?.value||"rise",size:42},elapsed:seconds,sceneDuration:duration});
    const textScale=w/1080,margin=w*.09;
    layersToDraw.forEach(({layer,elapsed,sceneDuration,isCurrent=true,exitAt=sceneDuration})=>{
      const body=String(layer.text||"").trim();if(!body)return;
      const fontSize=Math.round((layer.size||42)*textScale),lineH=fontSize*1.32,maxWidth=w*.82;
      ctx.save();ctx.font=(layer.style==="italic"?"italic ":"")+"650 "+fontSize+"px "+activeFont;ctx.fillStyle=layer.color||"#ffffff";ctx.textAlign="left";ctx.direction=textDirection;ctx.shadowColor="rgba(0,0,0,.72)";ctx.shadowBlur=18*sf;
      const words=body.split(/\s+/).filter(Boolean),lines=[];let line="";
      words.forEach(word=>{const candidate=line?line+" "+word:word;if(line&&ctx.measureText(candidate).width>maxWidth){lines.push(line);line=word;}else line=candidate;});if(line)lines.push(line);
      const shown=lines.slice(0,6),blockHeight=shown.length*lineH,position=layer.position||"bottom",align=layer.align||"center";
      const baseY=(position==="top"?h*.15+fontSize:position==="center"?(h-blockHeight)/2+fontSize:h*.84-blockHeight+fontSize)+h*(Number(layer.offset)||0)/100;
      const anchorX=align==="right"?w-margin:align==="left"?margin:w/2;
      ctx.textAlign=align;ctx.textBaseline="alphabetic";
      const motion=layer.motion||"from-right",layerElapsed=elapsed-(Number(layer.delay)||0),p=Math.max(0,Math.min(1,layerElapsed/.9)),ease=1-Math.pow(1-p,3);
      if(layerElapsed<0)return;
      const enterAlpha=motion==="fade"?p:1;
      const enterDx=motion==="from-right"?(1-ease)*(w+maxWidth):motion==="from-left"?-(1-ease)*(w+maxWidth):0;
      const enterDy=motion==="from-top"?-(1-ease)*(h*.35+blockHeight):motion==="from-bottom"?(1-ease)*(h*.35+blockHeight):0;
      const exitMode=layer.exit||"stay",exitElapsed=elapsed-exitAt,exitProgress=exitMode==="stay"?0:Math.max(0,Math.min(1,exitElapsed/.7)),exitEase=1-Math.pow(1-exitProgress,3);
      const exitDx=exitMode==="right"?exitEase*(w+maxWidth):exitMode==="left"?-exitEase*(w+maxWidth):0;
      const exitDy=exitMode==="top"?-exitEase*(h*.45+blockHeight):exitMode==="bottom"?exitEase*(h*.45+blockHeight):0;
      const exitAlpha=exitMode==="fade"?1-exitProgress:1;
      const fadeOut=isCurrent?Math.max(0,Math.min(1,(sceneDuration-elapsed)/.28)):1;
      ctx.globalAlpha=Math.min(enterAlpha,exitAlpha,fadeOut);ctx.translate(enterDx+exitDx,enterDy+exitDy);
      if(layer.frame){const pad=fontSize*.42,frameTop=baseY-fontSize*.95-pad,frameBottom=baseY+(shown.length-1)*lineH+fontSize*.35+pad,frameLeft=margin*.55,frameRight=w-margin*.55;ctx.save();ctx.shadowBlur=0;ctx.strokeStyle=layer.color||"#ffffff";ctx.globalAlpha*=.72;ctx.lineWidth=Math.max(1.2,1.5*sf);ctx.strokeRect(frameLeft,frameTop,frameRight-frameLeft,frameBottom-frameTop);if(layer.frameTitle){ctx.font="600 "+Math.max(13,fontSize*.38)+"px "+activeFont;ctx.textAlign="left";ctx.textBaseline="middle";const labelW=ctx.measureText(layer.frameTitle).width+fontSize*.55;ctx.fillStyle="rgba(8,13,25,.72)";ctx.fillRect(frameLeft+fontSize*.28,frameTop-fontSize*.1,labelW,fontSize*.45);ctx.fillStyle=layer.color||"#ffffff";ctx.fillText(layer.frameTitle,frameLeft+fontSize*.55,frameTop+fontSize*.12);}ctx.restore();}if(layer.orientation==="vertical"){ctx.save();ctx.translate(anchorX,baseY);ctx.rotate(Math.PI/2);shown.forEach((text,i)=>ctx.fillText(text,-i*lineH,0,maxWidth));ctx.restore();}else{shown.forEach((text,i)=>ctx.fillText(text,anchorX,baseY+i*lineH,maxWidth));}
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
    const invalid=files.find(f=>!f.type.startsWith("image/")||f.size>20*1024*1024);if(invalid){say("هر فایل باید تصویر و حداکثر ۲۰ مگابایت باشد.");imageInput.value="";return;}
    scenes.forEach(s=>URL.revokeObjectURL(s.url));scenes=[];stopPreview();
    Promise.all(files.map(file=>new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.decoding="async";img.onload=async()=>{try{if(typeof img.decode==="function")await img.decode();}catch(_){}resolve({file,url,image:img});};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("خواندن یکی از تصاویر ناموفق بود."));};img.src=url;}))).then(items=>{scenes=items;resize();renderSceneList();refreshScenePhotoOptions();drawFrame(0);updateReady();}).catch(e=>say(e.message));
  });
  musicInput.addEventListener("change",()=>{const file=musicInput.files&&musicInput.files[0];if(!file)return;if(!file.type.startsWith("audio/")){say("فایل صوتی معتبر انتخاب کن.");musicInput.value="";return;}if(musicUrl)URL.revokeObjectURL(musicUrl);musicUrl=URL.createObjectURL(file);if(!musicElement){musicElement=new Audio();musicElement.preload="auto";musicElement.loop=false;}musicElement.src=musicUrl;say("موسیقی آماده است.");});
  [titleInput,subtitleInput,formatInput,motionInput,layoutInput,textInput,wordMotionInput,wordSpeedInput,durationInput].filter(Boolean).forEach(el=>el.addEventListener("input",()=>{resize();drawFrame(0);updateReady();}));
  previewBtn.addEventListener("click",preview);
  if(storyList){
    const refreshStory=()=>{storyCards().forEach((card,i)=>{card.querySelector(".nava-video-story-card-head strong").textContent="صحنه "+(i+1);card.querySelector("[data-remove-story]").disabled=storyCards().length===1;});resize();drawFrame(0);updateReady();};
    addStoryBtn?.addEventListener("click",()=>{const card=document.createElement("article");card.className="nava-video-story-card";card.setAttribute("data-story-scene","");card.innerHTML='<div class="nava-video-story-card-head"><strong></strong><button type="button" data-remove-story>حذف صحنه</button></div><div class="nava-video-text-layers">'+layerMarkup(1)+'</div><button class="nava-video-add-layer" type="button" data-add-layer>＋ افزودن لایه متن</button><div class="nava-video-scene-media"><label>عکس‌های این صحنه <small>(برای انتخاب چند عکس، چند مورد را انتخاب کن)</small><select data-story-image multiple size="4" aria-label="انتخاب چند عکس برای این صحنه"></select></label><label>چیدمان عکس‌ها<select data-story-layout><option value="single">تک‌عکس</option><option value="diagonal">سه عکس اریب با سایه</option><option value="triptych">سه قاب کنار هم</option><option value="grid">چهارخانه</option><option value="stagger">پلکانی</option><option value="polaroid">قاب‌های شناور</option><option value="free">ترکیب آزاد</option></select></label></div><div class="nava-video-story-fields"><label>مدت نمایش<select data-story-duration><option value="2">۲ ثانیه</option><option value="3">۳ ثانیه</option><option value="4" selected>۴ ثانیه</option><option value="5">۵ ثانیه</option><option value="6">۶ ثانیه</option><option value="8">۸ ثانیه</option></select></label></div>';storyList.append(card);refreshScenePhotoOptions();refreshStory();card.querySelector("[data-layer-text]").focus();});storyList.addEventListener("input",refreshStory);storyList.addEventListener("change",async e=>{refreshStory();if(e.target.matches("[data-story-image],[data-story-layout]")){const card=e.target.closest("[data-story-scene]");let elapsed=0;for(const prior of storyCards()){if(prior===card)break;const priorImage=prior.querySelector("[data-story-image]")?.selectedOptions?.length||0;const priorHasText=Array.from(prior.querySelectorAll("[data-layer-text]")).some(el=>el.value.trim());if(priorHasText||priorImage)elapsed+=Number(prior.querySelector("[data-story-duration]")?.value)||4;}requestAnimationFrame(()=>{const targetTime=Math.min(Math.max(0,totalDuration()-.001),elapsed+.015);previewOffset=targetTime;drawFrame(targetTime);});}});
    storyList.addEventListener("click",e=>{const add=e.target.closest("[data-add-layer]");if(add){const card=add.closest("[data-story-scene]"),holder=card.querySelector(".nava-video-text-layers");holder.insertAdjacentHTML("beforeend",layerMarkup(holder.querySelectorAll("[data-story-layer]").length+1));refreshStory();return;}const remove=e.target.closest("[data-remove-layer]");if(remove){const card=remove.closest("[data-story-scene]"),holder=card.querySelector(".nava-video-text-layers");if(holder.querySelectorAll("[data-story-layer]").length>1){remove.closest("[data-story-layer]").remove();holder.querySelectorAll("[data-story-layer]").forEach((el,i)=>el.querySelector(".nava-video-layer-head strong").textContent="لایه متن "+(i+1));refreshStory();}}});$("navaVideoTextPersistence")?.addEventListener("change",()=>drawFrame(0));
    storyList.addEventListener("click",e=>{const btn=e.target.closest("[data-remove-story]");if(btn&&storyCards().length>1){btn.closest("[data-story-scene]").remove();refreshStory();}});
  }
  const sharedOutput=root.querySelector(".nava-video-shared-output");
  root.querySelectorAll("[data-video-tab]").forEach(btn=>btn.addEventListener("click",()=>{root.querySelectorAll("[data-video-tab]").forEach(b=>{const active=b===btn;b.classList.toggle("is-active",active);b.setAttribute("aria-selected",String(active));});root.querySelectorAll(".nava-video-panel").forEach(p=>{const active=p.id===btn.getAttribute("aria-controls");p.hidden=!active;p.classList.toggle("is-active",active);});if(sharedOutput&&btn.dataset.videoTab==="text")root.querySelector("#navaVideoPanelText").append(sharedOutput);}));

  $("navaVideoAskNavi").addEventListener("click",()=>{const brief=$("navaVideoBrief").value.trim();const names=scenes.map((s,i)=>(i+1)+". "+s.file.name).join("\n");const prompt="برای این پروژه نقش کارگردان خلاق و تدوینگر ویدئو را بر عهده بگیر. موضوع و هدف: "+(brief||"بر اساس تصاویر انتخاب‌شده یک روایت مناسب پیشنهاد بده.")+"\nتعداد تصاویر: "+scenes.length+"\nفهرست فایل‌ها:\n"+(names||"هنوز تصویری انتخاب نشده")+"\nموسیقی: "+(musicElement?"بارگذاری شده":"هنوز انتخاب نشده")+"\nلطفاً سناریوی صحنه‌به‌صحنه، ترتیب پیشنهادی تصاویر، مدت هر صحنه، متن روی تصویر، ریتم هماهنگ با موسیقی، نوع انتقال و حرکت دوربین را پیشنهاد بده. توضیح بده کدام تصمیم‌ها نیازمند تأیید من هستند.";const result=$("navaVideoNaviResult");result.textContent="بریف برای NAVI ارسال شد. امکانات واقعی این استودیو: ساخت ویدئو از صحنه‌های مستقل؛ انتخاب عکس جداگانه برای هر صحنه (یا بدون عکس)، باقی‌ماندن متن صحنه‌های قبلی یا جایگزینی آن‌ها، ورود واقعی متن از بیرون کادر راست، بارگذاری حداکثر ۲۰ تصویر، انتخاب مدت و افکت هر صحنه، فونت‌های موجود، قالب عمودی/افقی، موسیقی پس‌زمینه، تنظیم بلندی و محوشدن موسیقی، پیش‌نمایش و خروجی WebM. تدوین ویدئوی ورودی هنوز آماده نیست. لطفاً فقط دستورهای قابل‌اجرا را در بریف مشخص کن.";if(typeof window.openNaviAssistant==="function"){window.openNaviAssistant({service:"ویدئو و صدا",message:prompt+"\n\nامکانات واقعی سایت: ساخت ویدئو از صحنه‌های متنی و عکس؛ بارگذاری حداکثر ۲۰ عکس؛ تنظیم مدت و حرکت نوشته؛ انتخاب فونت موجود؛ قالب عمودی یا افقی؛ موسیقی پس‌زمینه با کنترل بلندی و محوشدن؛ پیش‌نمایش و خروجی WebM. تدوین ویدئوی ورودی هنوز آماده نیست. لطفاً فقط قابلیت‌های موجود را پیشنهاد بده و بریف را با دستورهای دقیق و قابل‌اجرا بنویس.",context:{studio:"ویدئو و صدا",brief,images:names,music:musicElement?"بارگذاری شده":"بارگذاری نشده",capabilities:["text scenes","photo upload","music","font selection","text motion","preview","webm export"],unavailable:["source video editing"]}});}else{result.textContent="همراه NAVI در دسترس نیست؛ از دکمه شناور NAVI استفاده کن.";}});
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
  resize();say("چند عکس یا صحنه متنی اضافه کن تا ساخت ویدئو را شروع کنیم.");
})();