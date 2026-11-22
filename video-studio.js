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
  let scenes=[],musicUrl="",musicElement=null,audioContext=null,audioSource=null,audioDestination=null,musicGain=null,previewFrame=0,recorder=null,chunks=[],recording=false,startedAt=0,previewing=false,outputUrl="";
  const storyList=$("navaVideoStoryList"),addStoryBtn=$("navaVideoAddScene");
  const fontInput=$("navaVideoFont"),manualMotionInput=$("navaVideoManualMotion");
  const briefInput=$("navaVideoBrief"),applyBriefBtn=$("navaVideoApplyBrief");
  const setupRadios=Array.from(root.querySelectorAll('input[name="navaVideoSetupMode"]'));
  const setupMode=()=>setupRadios.find(r=>r.checked)?.value||"brief";
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
    if(/وزیر|vazir/i.test(brief))font="'Vazirmatn',Tahoma,sans-serif";
    else if(/ایران.?سن.?س|iransans/i.test(brief))font="'IRANSans',Tahoma,sans-serif";
    else if(/تاهوما|tahoma/i.test(brief))font="Tahoma,sans-serif";
    else if(/آریال|arial/i.test(brief))font="Arial,sans-serif";
    if(motion)storyCards().forEach(card=>{const el=card.querySelector("[data-story-motion]");if(el)el.value=motion;});
    if(font&&fontInput){fontInput.value=font;activeFont=font;}
    const direction=/چپ به راست|از چپ به راست|چپ.?چین|left.?to.?right|ltr/i.test(brief)?"ltr":/راست به چپ|راست.?چین|right.?to.?left|rtl/i.test(brief)?"rtl":null;
    if(direction)textDirection=direction;
    $("navaVideoNaviResult").textContent=(motion||font||direction)?"دستورهای قابل‌تشخیص اعمال شدند؛ پیش‌نمایش را بررسی کن. اگر بخشی از شرح شامل ویژگی پشتیبانی‌نشده باشد، هنوز خودکار اجرا نمی‌شود.":"دستور مشخصی از موارد فعلی شناسایی نشد؛ می‌توانی تنظیمات را دستی انتخاب کنی.";
    resize();drawFrame(0);updateReady();
  }
  let activeFont=fontInput?.value||"sans-serif",textDirection="rtl";
  setupRadios.forEach(r=>r.addEventListener("change",()=>{const briefMode=setupMode()==="brief";$("navaVideoBriefSettings").hidden=!briefMode;$("navaVideoManualSettings").hidden=briefMode;if(!briefMode){activeFont=fontInput?.value||"sans-serif";textDirection="rtl";storyCards().forEach(card=>{const el=card.querySelector("[data-story-motion]");if(el&&manualMotionInput)el.value=manualMotionInput.value;});}resize();drawFrame(0);}));
  applyBriefBtn?.addEventListener("click",applyBrief);
  manualMotionInput?.addEventListener("change",()=>{if(setupMode()==="manual")storyCards().forEach(card=>{const el=card.querySelector("[data-story-motion]");if(el)el.value=manualMotionInput.value;});drawFrame(0);});
  fontInput?.addEventListener("change",()=>{activeFont=fontInput.value;drawFrame(0);});

  const storyCards=()=>storyList?Array.from(storyList.querySelectorAll("[data-story-scene]")):[];
  const refreshScenePhotoOptions=()=>storyCards().forEach(card=>{const select=card.querySelector("[data-story-image]");if(!select)return;const previous=select.value;select.innerHTML="";const none=document.createElement("option");none.value="-1";none.textContent="بدون عکس";select.append(none);scenes.forEach((scene,i)=>{const option=document.createElement("option");option.value=String(i);option.textContent="عکس "+(i+1)+" — "+scene.file.name;select.append(option);});select.value=[...select.options].some(o=>o.value===previous)?previous:"-1";});
  const storyData=()=>storyCards().map(card=>({text:card.querySelector("[data-story-text]").value.trim(),duration:Number(card.querySelector("[data-story-duration]").value)||4,motion:card.querySelector("[data-story-motion]").value,imageIndex:Number(card.querySelector("[data-story-image]")?.value??-1)})).filter(s=>s.text||s.imageIndex>=0);
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
    const activeImage=story.length?(activeStory&&activeStory.imageIndex>=0?scenes[activeStory.imageIndex]:null):(hasImages?scenes[index]:null);
    ctx.fillStyle="#050912";ctx.fillRect(0,0,w,h);
    const drawImageCover=(img,x,y,bw,bh,progress=local)=>{const iw=img.naturalWidth,ih=img.naturalHeight,scale=Math.max(bw/iw,bh/ih)*(1+(motionInput.value==="subtle"?.012:.035)*progress),dw=iw*scale,dh=ih*scale;ctx.save();ctx.beginPath();ctx.rect(x,y,bw,bh);ctx.clip();ctx.drawImage(img,x+(bw-dw)/2,y+(bh-dh)/2,dw,dh);ctx.restore();};
    if(activeImage){
      if(!story.length&&(layoutInput?.value==="triptych"||layoutInput?.value==="grid")){const layout=layoutInput.value,count=layout==="triptych"?3:4,cols=layout==="triptych"?3:2,rows=layout==="triptych"?1:2,gap=Math.max(8,Math.round(w*.012)),cellW=(w-gap*(cols+1))/cols,cellH=(h*.56-gap*(rows+1))/rows,top=h*.13;for(let k=0;k<count;k++){const img=scenes[k%scenes.length].image,x=gap+(k%cols)*(cellW+gap),y=top+gap+Math.floor(k/cols)*(cellH+gap);drawImageCover(img,x,y,cellW,cellH,local);}}
      else drawImageCover(activeImage.image,0,0,w,h,local);
    }else{const gradient=ctx.createLinearGradient(0,0,w,h);gradient.addColorStop(0,"#18243b");gradient.addColorStop(.58,"#202f47");gradient.addColorStop(1,"#080d18");ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);}
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
    const shade=ctx.createLinearGradient(0,0,0,h);shade.addColorStop(0,"rgba(2,8,18,.12)");shade.addColorStop(.55,"rgba(2,8,18,.02)");shade.addColorStop(1,"rgba(2,8,18,.72)");ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    const sf=w/1080;ctx.textAlign=textDirection==="ltr"?"left":"center";ctx.direction=textDirection;ctx.shadowColor="rgba(0,0,0,.65)";ctx.shadowBlur=16*sf;
    if(titleInput.value.trim()){ctx.font="700 "+Math.round(54*sf)+"px sans-serif";ctx.fillStyle="#fff";ctx.fillText(titleInput.value.trim(),w/2,h*.79,w*.84);}
    if(subtitleInput.value.trim()){ctx.font="400 "+Math.round(27*sf)+"px sans-serif";ctx.fillStyle="#fff";ctx.fillText(subtitleInput.value.trim(),w/2,h*.84,w*.82);}
    const persistence=$("navaVideoTextPersistence")?.value||"keep";const body=activeStory?(persistence==="keep"?story.slice(0,activeStoryIndex+1).map(item=>item.text).filter(Boolean).join("\n"):activeStory.text):(textInput?.value||"").trim();if(body){
      const effect=activeStory?activeStory.motion:(wordMotionInput?.value||"rise");
      const fontSize=Math.round(36*sf),lineH=47*sf,maxWidth=w*.84;
      ctx.font="600 "+fontSize+"px "+activeFont;ctx.fillStyle="#fff";ctx.shadowBlur=12*sf;
      const words=body.split(/\s+/).filter(Boolean),lines=[];let line=[],lineWidth=0;
      for(const word of words){const ww=ctx.measureText(word).width,space=line.length?ctx.measureText(" ").width:0;if(line.length&&lineWidth+space+ww>maxWidth){lines.push({words:line,width:lineWidth});line=[];lineWidth=0;}lineWidth+=(line.length?ctx.measureText(" ").width:0)+ww;line.push(word);}
      if(line.length)lines.push({words:line,width:lineWidth});
      const shown=lines.slice(0,6),lineHeight=Math.min(lineH,h*.075),startY=h*.56-(shown.length-1)*lineHeight/2;
      const elapsed=story.length?storyLocal:seconds;
      const sceneDuration=activeStory?activeStory.duration:duration;
      const easeOut=t=>1-Math.pow(1-t,3);
      const easeBack=t=>{const k=1.45;return 1+(k+1)*Math.pow(t-1,3)+k*Math.pow(t-1,2);};
      const fadeOut=Math.max(0,Math.min(1,(sceneDuration-elapsed)/.42));
      shown.forEach((ln,li)=>{
        const cinematic=effect==="cinematic";
        const delay=li*(cinematic?.20:.10),enter=effect==="slide-right"?1.15:(cinematic?1.05:.48);
        const raw=Math.max(0,Math.min(1,(elapsed-delay)/enter));
        const p=cinematic?Math.max(0,Math.min(1.08,easeBack(raw))):easeOut(raw);
        if(p<=0)return;
        const alpha=Math.min(1,Math.max(0,cinematic?raw*1.35:p),fadeOut);
        const y=startY+li*lineHeight;
        ctx.save();ctx.globalAlpha=effect==="none"?fadeOut:alpha;
        if(effect==="type"){
          const reveal=Math.max(0,Math.min(1,(elapsed-delay)/Math.max(.7,Math.min(1.5,sceneDuration*.52))));
          ctx.beginPath();ctx.rect(w/2+ln.width/2-ln.width*reveal,y-fontSize,ln.width*reveal,fontSize*1.65);ctx.clip();
        }else if(effect==="rise"){ctx.translate(0,(1-p)*Math.min(26*sf,lineHeight*.48));}
        else if(effect==="slide-right"){ctx.translate((1-p)*(w*.92+ln.width*.65),0);}else if(effect==="slide"){ctx.translate((1-p)*Math.min(42*sf,w*.07),0);}else if(effect==="slide-left"){ctx.translate(-(1-p)*Math.min(42*sf,w*.07),0);}
        else if(cinematic){
          const lift=(1-p)*Math.min(125*sf,lineHeight*1.9);
          ctx.translate(0,lift);
          ctx.rotate((1-p)*-.075);
          const scale=.76+.24*Math.min(1,p);
          ctx.translate(w/2,y);ctx.scale(scale,scale);ctx.translate(-w/2,-y);
          ctx.shadowBlur=(18+22*(1-p))*sf;
        }else if(effect==="fade"){ctx.globalAlpha=alpha;}
        const x=w/2+ln.width/2,space=ctx.measureText(" ").width;let cursor=x;
        for(const word of ln.words){const ww=ctx.measureText(word).width;ctx.fillText(word,cursor-ww/2,y);cursor-=ww+space;}
        ctx.restore();
      });
    }
    ctx.restore();
  }
  function stopPreview(){if(previewFrame)cancelAnimationFrame(previewFrame);previewFrame=0;previewing=false;}
  function animate(now){if(!previewing)return;if(!startedAt)startedAt=now;const t=((now-startedAt)/1000)%totalDuration();drawFrame(t);previewFrame=requestAnimationFrame(animate);}
  function preview(){if(!scenes.length&&!titleInput.value.trim()&&!subtitleInput.value.trim()&&!textInput?.value.trim()){say("ابتدا عکس یا متن ویدئو را وارد کن.");return;}stopPreview();startedAt=0;previewing=true;previewFrame=requestAnimationFrame(animate);say(scenes.length?"پیش‌نمایش ویدئوی تصویری فعال است.":"پیش‌نمایش ویدئوی متن‌محور فعال است.");}
  function updateReady(){const ready=scenes.length>0||storyData().length>0||!!(titleInput.value.trim()||subtitleInput.value.trim()||textInput?.value.trim());previewBtn.disabled=!ready;renderBtn.disabled=!ready||!window.MediaRecorder||!canvas.captureStream;say(scenes.length?scenes.length+" عکس آماده تدوین است.":ready?"ویدیوی متن‌محور آماده ساخت است.":"عکس یا متن ویدئو را وارد کن.");}
  imageInput.addEventListener("change",()=>{
    const files=Array.from(imageInput.files||[]);if(!files.length)return;
    if(files.length>20){say("حداکثر ۲۰ عکس می‌توانی انتخاب کنی.");imageInput.value="";return;}
    const invalid=files.find(f=>!f.type.startsWith("image/")||f.size>20*1024*1024);if(invalid){say("هر فایل باید تصویر و حداکثر ۲۰ مگابایت باشد.");imageInput.value="";return;}
    scenes.forEach(s=>URL.revokeObjectURL(s.url));scenes=[];stopPreview();
    Promise.all(files.map(file=>new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>resolve({file,url,image:img});img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("خواندن یکی از تصاویر ناموفق بود."));};img.src=url;}))).then(items=>{scenes=items;resize();renderSceneList();refreshScenePhotoOptions();drawFrame(0);updateReady();}).catch(e=>say(e.message));
  });
  musicInput.addEventListener("change",()=>{const file=musicInput.files&&musicInput.files[0];if(!file)return;if(!file.type.startsWith("audio/")){say("فایل صوتی معتبر انتخاب کن.");musicInput.value="";return;}if(musicUrl)URL.revokeObjectURL(musicUrl);musicUrl=URL.createObjectURL(file);if(!musicElement){musicElement=new Audio();musicElement.preload="auto";musicElement.loop=false;}musicElement.src=musicUrl;say("موسیقی آماده است.");});
  [titleInput,subtitleInput,formatInput,motionInput,layoutInput,textInput,wordMotionInput,wordSpeedInput,durationInput].filter(Boolean).forEach(el=>el.addEventListener("input",()=>{resize();drawFrame(0);updateReady();}));
  previewBtn.addEventListener("click",preview);
  if(storyList){
    const refreshStory=()=>{storyCards().forEach((card,i)=>{card.querySelector(".nava-video-story-card-head strong").textContent="صحنه "+(i+1);card.querySelector("[data-remove-story]").disabled=storyCards().length===1;});resize();drawFrame(0);updateReady();};
    addStoryBtn?.addEventListener("click",()=>{const card=document.createElement("article");card.className="nava-video-story-card";card.setAttribute("data-story-scene","");card.innerHTML='<div class="nava-video-story-card-head"><strong></strong><button type="button" data-remove-story>حذف</button></div><label>متن این صحنه<textarea data-story-text rows="3" maxlength="420" placeholder="جمله یا پیام این صحنه را بنویس..."></textarea></label><label>عکس این صحنه<select data-story-image><option value="-1">بدون عکس</option></select></label><div class="nava-video-story-fields"><label>مدت نمایش<select data-story-duration><option value="2">۲ ثانیه</option><option value="3">۳ ثانیه</option><option value="4" selected>۴ ثانیه</option><option value="5">۵ ثانیه</option><option value="6">۶ ثانیه</option><option value="8">۸ ثانیه</option></select></label><label>حرکت نوشته<select data-story-motion><option value="cinematic" selected>حرکت سینمایی چندلایه</option><option value="rise">ورود از پایین</option><option value="fade">محو و ظاهر شدن</option><option value="slide">ورود از راست</option><option value="type">نمایش مرحله‌ای</option><option value="none">بدون حرکت</option></select></label></div>';storyList.append(card);refreshScenePhotoOptions();refreshStory();card.querySelector("[data-story-text]").focus();});
    storyList.addEventListener("input",refreshStory);storyList.addEventListener("change",refreshStory);$("navaVideoTextPersistence")?.addEventListener("change",()=>drawFrame(0));
    storyList.addEventListener("click",e=>{const btn=e.target.closest("[data-remove-story]");if(btn&&storyCards().length>1){btn.closest("[data-story-scene]").remove();refreshStory();}});
  }
  const sharedOutput=root.querySelector(".nava-video-shared-output");
  root.querySelectorAll("[data-video-tab]").forEach(btn=>btn.addEventListener("click",()=>{root.querySelectorAll("[data-video-tab]").forEach(b=>{const active=b===btn;b.classList.toggle("is-active",active);b.setAttribute("aria-selected",String(active));});root.querySelectorAll(".nava-video-panel").forEach(p=>{const active=p.id===btn.getAttribute("aria-controls");p.hidden=!active;p.classList.toggle("is-active",active);});if(sharedOutput&&btn.dataset.videoTab==="text")root.querySelector("#navaVideoPanelText").append(sharedOutput);}));

  $("navaVideoAskNavi").addEventListener("click",()=>{const brief=$("navaVideoBrief").value.trim();const names=scenes.map((s,i)=>(i+1)+". "+s.file.name).join("\n");const prompt="برای این پروژه نقش کارگردان خلاق و تدوینگر ویدئو را بر عهده بگیر. موضوع و هدف: "+(brief||"بر اساس تصاویر انتخاب‌شده یک روایت مناسب پیشنهاد بده.")+"\nتعداد تصاویر: "+scenes.length+"\nفهرست فایل‌ها:\n"+(names||"هنوز تصویری انتخاب نشده")+"\nموسیقی: "+(musicElement?"بارگذاری شده":"هنوز انتخاب نشده")+"\nلطفاً سناریوی صحنه‌به‌صحنه، ترتیب پیشنهادی تصاویر، مدت هر صحنه، متن روی تصویر، ریتم هماهنگ با موسیقی، نوع انتقال و حرکت دوربین را پیشنهاد بده. توضیح بده کدام تصمیم‌ها نیازمند تأیید من هستند.";const result=$("navaVideoNaviResult");result.textContent="بریف برای NAVI ارسال شد. امکانات واقعی این استودیو: ساخت ویدئو از صحنه‌های متنی و عکس، بارگذاری حداکثر ۲۰ تصویر، انتخاب مدت و افکت هر صحنه، فونت‌های موجود، قالب عمودی/افقی، موسیقی پس‌زمینه، تنظیم بلندی و محوشدن موسیقی، پیش‌نمایش و خروجی WebM. تدوین ویدئوی ورودی هنوز آماده نیست. لطفاً فقط دستورهای قابل‌اجرا را در بریف مشخص کن.";if(typeof window.openNaviAssistant==="function"){window.openNaviAssistant({service:"ویدئو و صدا",message:prompt+"\n\nامکانات واقعی سایت: ساخت ویدئو از صحنه‌های متنی و عکس؛ بارگذاری حداکثر ۲۰ عکس؛ تنظیم مدت و حرکت نوشته؛ انتخاب فونت موجود؛ قالب عمودی یا افقی؛ موسیقی پس‌زمینه با کنترل بلندی و محوشدن؛ پیش‌نمایش و خروجی WebM. تدوین ویدئوی ورودی هنوز آماده نیست. لطفاً فقط قابلیت‌های موجود را پیشنهاد بده و بریف را با دستورهای دقیق و قابل‌اجرا بنویس.",context:{studio:"ویدئو و صدا",brief,images:names,music:musicElement?"بارگذاری شده":"بارگذاری نشده",capabilities:["text scenes","photo upload","music","font selection","text motion","preview","webm export"],unavailable:["source video editing"]}});}else{result.textContent="همراه NAVI در دسترس نیست؛ از دکمه شناور NAVI استفاده کن.";}});
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