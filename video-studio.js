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
  const totalDuration=()=>Number(durationInput.value);
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
      const remove=document.createElement("button");remove.type="button";remove.textContent="×";remove.setAttribute("aria-label","حذف تصویر");remove.addEventListener("click",()=>{URL.revokeObjectURL(scene.url);scenes.splice(i,1);renderSceneList();updateReady();drawFrame(0);});
      row.append(thumb,name,up,down,remove);sceneList.append(row);
    });
  }
  function moveScene(i,delta){const j=i+delta;if(j<0||j>=scenes.length)return;[scenes[i],scenes[j]]=[scenes[j],scenes[i]];renderSceneList();drawFrame(0);}
  function drawFrame(seconds){
    const [w,h]=dimensions();if(canvas.width!==w||canvas.height!==h)resize();
    const duration=totalDuration(),hasImages=scenes.length>0,per=hasImages?duration/scenes.length:duration,index=hasImages?Math.min(scenes.length-1,Math.floor(Math.min(seconds,duration-.001)/per)):0,local=hasImages?(seconds-index*per)/per:seconds/duration;
    ctx.fillStyle="#050912";ctx.fillRect(0,0,w,h);
    const drawImageCover=(img,x,y,bw,bh,progress=local)=>{const iw=img.naturalWidth,ih=img.naturalHeight,scale=Math.max(bw/iw,bh/ih)*(1+(motionInput.value==="subtle"?.012:.035)*progress),dw=iw*scale,dh=ih*scale;ctx.save();ctx.beginPath();ctx.rect(x,y,bw,bh);ctx.clip();ctx.drawImage(img,x+(bw-dw)/2,y+(bh-dh)/2,dw,dh);ctx.restore();};
    if(hasImages){const layout=layoutInput?.value||"sequence";if(layout==="triptych"||layout==="grid"){
      const count=layout==="triptych"?3:4,cols=layout==="triptych"?3:2,rows=layout==="triptych"?1:2,gap=Math.max(8,Math.round(w*.012)),cellW=(w-gap*(cols+1))/cols,cellH=(h*.56-gap*(rows+1))/rows,top=h*.13;
      for(let k=0;k<count;k++){const img=scenes[k%scenes.length].image,x=gap+(k%cols)*(cellW+gap),y=top+gap+Math.floor(k/cols)*(cellH+gap);drawImageCover(img,x,y,cellW,cellH,local);}
    }else drawImageCover(scenes[index].image,0,0,w,h,local);
    }else{const gradient=ctx.createLinearGradient(0,0,w,h);gradient.addColorStop(0,"#18243b");gradient.addColorStop(.55,"#263b55");gradient.addColorStop(1,"#080d18");ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);ctx.globalAlpha=.18;for(let i=0;i<7;i++){ctx.beginPath();ctx.arc(w*(.12+i*.13),h*(.18+(i%3)*.23),w*(.06+(i%2)*.025),0,Math.PI*2);ctx.fillStyle="#a9c7e8";ctx.fill();}ctx.globalAlpha=1;}
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
    const shade=ctx.createLinearGradient(0,0,0,h);shade.addColorStop(0,"rgba(2,8,18,.12)");shade.addColorStop(.55,"rgba(2,8,18,.02)");shade.addColorStop(1,"rgba(2,8,18,.72)");ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    const sf=w/1080;ctx.textAlign="center";ctx.direction="rtl";ctx.shadowColor="rgba(0,0,0,.65)";ctx.shadowBlur=16*sf;
    if(titleInput.value.trim()){ctx.font="700 "+Math.round(54*sf)+"px sans-serif";ctx.fillStyle="#fff";ctx.fillText(titleInput.value.trim(),w/2,h*.79,w*.84);}
    if(subtitleInput.value.trim()){ctx.font="400 "+Math.round(27*sf)+"px sans-serif";ctx.fillStyle="#fff";ctx.fillText(subtitleInput.value.trim(),w/2,h*.84,w*.82);}
    const body=(textInput?.value||"").trim();if(body){
      const effect=wordMotionInput?.value||"rise",speed=Number(wordSpeedInput?.value||1),words=body.split(/\s+/).filter(Boolean);
      const fontSize=Math.round(34*sf),lineH=43*sf,maxWidth=w*.84,space=ctx.measureText(" ").width;
      ctx.font="500 "+fontSize+"px sans-serif";ctx.fillStyle="#fff";ctx.shadowBlur=10*sf;
      const lines=[];let line=[],lineWidth=0;
      for(const word of words){const ww=ctx.measureText(word).width,extra=line.length?space:0;if(line.length&&lineWidth+extra+ww>maxWidth){lines.push({words:line,width:lineWidth});line=[];lineWidth=0;}lineWidth+=(line.length?space:0)+ww;line.push(word);}
      if(line.length)lines.push({words:line,width:lineWidth});
      const shown=lines.slice(0,5),lineHeight=43*sf,startY=h*.55-(shown.length-1)*lineHeight/2;
      let wordIndex=0;const totalWords=shown.reduce((n,l)=>n+l.words.length,0),stagger=(0.34/speed),entryDuration=0.42/speed;
      shown.forEach((ln,li)=>{let x=w/2+ln.width/2;ln.words.forEach(word=>{
        const ww=ctx.measureText(word).width,idx=wordIndex++,delay=idx*stagger;
        let p=effect==="none"?1:Math.max(0,Math.min(1,(seconds-delay)/entryDuration));
        if(p>0){ctx.save();ctx.globalAlpha=effect==="fade"||effect==="type"?p:1;
          let dx=0,dy=0;if(effect==="rise")dy=(1-p)*22*sf;else if(effect==="slide")dx=(1-p)*Math.min(55*sf,ww*.55);
          if(effect==="type"&&p<1){ctx.beginPath();ctx.rect(x-ww, startY+li*lineHeight-fontSize, ww*p, fontSize*1.5);ctx.clip();}
          ctx.translate(dx,dy);ctx.fillText(word,x-ww/2,startY+li*lineHeight);ctx.restore();}
        x-=ww+space;
      });});
    }
    ctx.restore();
  }
  function stopPreview(){if(previewFrame)cancelAnimationFrame(previewFrame);previewFrame=0;previewing=false;}
  function animate(now){if(!previewing)return;if(!startedAt)startedAt=now;const t=((now-startedAt)/1000)%totalDuration();drawFrame(t);previewFrame=requestAnimationFrame(animate);}
  function preview(){if(!scenes.length&&!titleInput.value.trim()&&!subtitleInput.value.trim()&&!textInput?.value.trim()){say("ابتدا عکس یا متن ویدئو را وارد کن.");return;}stopPreview();startedAt=0;previewing=true;previewFrame=requestAnimationFrame(animate);say(scenes.length?"پیش‌نمایش ویدئوی تصویری فعال است.":"پیش‌نمایش ویدئوی متن‌محور فعال است.");}
  function updateReady(){const ready=scenes.length>0||!!(titleInput.value.trim()||subtitleInput.value.trim()||textInput?.value.trim());previewBtn.disabled=!ready;renderBtn.disabled=!ready||!window.MediaRecorder||!canvas.captureStream;say(scenes.length?scenes.length+" عکس آماده تدوین است.":ready?"ویدیوی متن‌محور آماده ساخت است.":"عکس یا متن ویدئو را وارد کن.");}
  imageInput.addEventListener("change",()=>{
    const files=Array.from(imageInput.files||[]);if(!files.length)return;
    if(files.length>20){say("حداکثر ۲۰ عکس می‌توانی انتخاب کنی.");imageInput.value="";return;}
    const invalid=files.find(f=>!f.type.startsWith("image/")||f.size>20*1024*1024);if(invalid){say("هر فایل باید تصویر و حداکثر ۲۰ مگابایت باشد.");imageInput.value="";return;}
    scenes.forEach(s=>URL.revokeObjectURL(s.url));scenes=[];stopPreview();
    Promise.all(files.map(file=>new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>resolve({file,url,image:img});img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("خواندن یکی از تصاویر ناموفق بود."));};img.src=url;}))).then(items=>{scenes=items;resize();renderSceneList();drawFrame(0);updateReady();}).catch(e=>say(e.message));
  });
  musicInput.addEventListener("change",()=>{const file=musicInput.files&&musicInput.files[0];if(!file)return;if(!file.type.startsWith("audio/")){say("فایل صوتی معتبر انتخاب کن.");musicInput.value="";return;}if(musicUrl)URL.revokeObjectURL(musicUrl);musicUrl=URL.createObjectURL(file);if(!musicElement){musicElement=new Audio();musicElement.preload="auto";musicElement.loop=false;}musicElement.src=musicUrl;say("موسیقی آماده است.");});
  [titleInput,subtitleInput,formatInput,motionInput,layoutInput,textInput,wordMotionInput,wordSpeedInput].filter(Boolean).forEach(el=>el.addEventListener("input",()=>{resize();drawFrame(0);updateReady();}));
  previewBtn.addEventListener("click",preview);
  root.querySelectorAll("[data-video-tab]").forEach(btn=>btn.addEventListener("click",()=>{root.querySelectorAll("[data-video-tab]").forEach(b=>{const active=b===btn;b.classList.toggle("is-active",active);b.setAttribute("aria-selected",String(active));});root.querySelectorAll(".nava-video-panel").forEach(p=>{const active=p.id===btn.getAttribute("aria-controls");p.hidden=!active;p.classList.toggle("is-active",active);});}));
  $("navaVideoAutoOrder").addEventListener("click",()=>{if(!scenes.length){$("navaVideoNaviResult").textContent="ابتدا عکس‌ها را در همین صفحه انتخاب کن.";return;}scenes.sort((a,b)=>a.file.name.localeCompare(b.file.name,"fa"));renderSceneList();drawFrame(0);$("navaVideoNaviResult").textContent="تصاویر بر اساس نام فایل مرتب شدند. برای ترتیب خلاقانه و معنایی، بریف را به NAVI بفرست." ;});
  $("navaVideoAskNavi").addEventListener("click",()=>{const brief=$("navaVideoBrief").value.trim();const names=scenes.map((s,i)=>(i+1)+". "+s.file.name).join("\n");const prompt="برای این پروژه نقش کارگردان خلاق و تدوینگر ویدئو را بر عهده بگیر. موضوع و هدف: "+(brief||"بر اساس تصاویر انتخاب‌شده یک روایت مناسب پیشنهاد بده.")+"\nتعداد تصاویر: "+scenes.length+"\nفهرست فایل‌ها:\n"+(names||"هنوز تصویری انتخاب نشده")+"\nموسیقی: "+(musicElement?"بارگذاری شده":"هنوز انتخاب نشده")+"\nلطفاً سناریوی صحنه‌به‌صحنه، ترتیب پیشنهادی تصاویر، مدت هر صحنه، متن روی تصویر، ریتم هماهنگ با موسیقی، نوع انتقال و حرکت دوربین را پیشنهاد بده. توضیح بده کدام تصمیم‌ها نیازمند تأیید من هستند.";const result=$("navaVideoNaviResult");result.textContent="بریف برای NAVI ارسال شد.";if(typeof window.openNaviAssistant==="function"){window.openNaviAssistant({service:"ویدئو و صدا",message:prompt,context:{studio:"ویدئو و صدا",brief,images:names,music:musicElement?"بارگذاری شده":"بارگذاری نشده"}});}else{result.textContent="همراه NAVI در دسترس نیست؛ از دکمه شناور NAVI استفاده کن.";}});
  let renderTimer=0,renderWatchdog=0;
  function finishRender(message){
    if(renderTimer){clearInterval(renderTimer);renderTimer=0;}
    if(renderWatchdog){clearTimeout(renderWatchdog);renderWatchdog=0;}
    if(recorder&&recorder.state!=="inactive"){try{recorder.stop();}catch(_){}}
    else if(recording){recording=false;renderBtn.disabled=false;previewBtn.disabled=false;say(message||"ضبط ویدئو متوقف شد.");}
  }
  renderBtn.addEventListener("click",async()=>{
    if((!scenes.length&&!titleInput.value.trim()&&!subtitleInput.value.trim()&&!textInput?.value.trim())||recording)return;
    if(!window.MediaRecorder||!canvas.captureStream){say("این مرورگر ضبط ویدئو را پشتیبانی نمی‌کند.");return;}
    try{
      stopPreview();resize();drawFrame(0);
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
        say("ویدئوی چندعکسی "+(musicElement?"همراه موسیقی ":"")+"آماده شد. برای مشاهده به تب خروجی برو.");
      };
      recorder.start(250);
      const start=performance.now(),duration=totalDuration(),fade=Number(fadeInput.value),baseVolume=Math.max(0,Number(musicVolume.value)/100);
      const tick=()=>{
        if(!recording)return;
        const t=Math.min((performance.now()-start)/1000,duration);
        drawFrame(t);
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
  resize();say("چند عکس را انتخاب کن تا تدوین را شروع کنیم.");
})();