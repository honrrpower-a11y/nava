/* NAVA multi-image + music video studio; all source media remains local to the browser. */
(() => {
  "use strict";
  const root=document.getElementById("navaVideoEngine"); if(!root||root.dataset.ready==="1")return; root.dataset.ready="1";
  const $=id=>root.querySelector("#"+id);
  const imageInput=$("navaVideoImage"),musicInput=$("navaVideoMusic"),canvas=$("navaVideoCanvas"),ctx=canvas.getContext("2d",{alpha:false});
  const previewBtn=$("navaVideoPreview"),renderBtn=$("navaVideoRender"),status=$("navaVideoStatus"),progress=$("navaVideoProgress"),result=$("navaVideoResult");
  const titleInput=$("navaVideoTitle"),subtitleInput=$("navaVideoSubtitle"),durationInput=$("navaVideoDuration"),formatInput=$("navaVideoFormat"),motionInput=$("navaVideoMotion");
  const sceneList=$("navaVideoSceneList"),musicVolume=$("navaVideoMusicVolume"),fadeInput=$("navaVideoFade");
  let scenes=[],musicUrl="",musicElement=null,audioContext=null,audioSource=null,audioDestination=null,musicGain=null,previewFrame=0,recorder=null,chunks=[],recording=false,startedAt=0,previewing=false,outputUrl="";
  const totalDuration=()=>Number(durationInput.value);
  const say=m=>{status.textContent=m;};
  function dimensions(){return formatInput.value==="landscape"?[1920,1080]:[1080,1920];}
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
    if(!scenes.length)return;const [w,h]=dimensions();if(canvas.width!==w||canvas.height!==h)resize();
    const duration=totalDuration(),per=duration/scenes.length,index=Math.min(scenes.length-1,Math.floor(seconds/per)),local=(seconds-index*per)/per;
    const img=scenes[index].image,iw=img.naturalWidth,ih=img.naturalHeight,base=Math.max(w/iw,h/ih);
    const zoom=(motionInput.value==="subtle"?.025:.075)*local,scale=base*(1+zoom),dw=iw*scale,dh=ih*scale;
    const dx=(w-dw)/2+(local-.5)*(dw-w)*.16,dy=(h-dh)/2-(local-.5)*(dh-h)*.10;
    ctx.fillStyle="#050912";ctx.fillRect(0,0,w,h);ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();ctx.drawImage(img,dx,dy,dw,dh);
    const shade=ctx.createLinearGradient(0,0,0,h);shade.addColorStop(0,"rgba(2,8,18,.12)");shade.addColorStop(.55,"rgba(2,8,18,.02)");shade.addColorStop(1,"rgba(2,8,18,.72)");ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    const sf=w/1080;ctx.textAlign="center";ctx.direction="rtl";ctx.shadowColor="rgba(0,0,0,.65)";ctx.shadowBlur=16*sf;
    if(titleInput.value.trim()){ctx.font="700 "+Math.round(54*sf)+"px sans-serif";ctx.fillStyle="#fff";ctx.fillText(titleInput.value.trim(),w/2,h*.79,w*.84);}
    if(subtitleInput.value.trim()){ctx.font="400 "+Math.round(27*sf)+"px sans-serif";ctx.fillStyle="#fff";ctx.fillText(subtitleInput.value.trim(),w/2,h*.84,w*.82);}
    ctx.restore();
  }
  function stopPreview(){if(previewFrame)cancelAnimationFrame(previewFrame);previewFrame=0;previewing=false;}
  function animate(now){if(!previewing)return;if(!startedAt)startedAt=now;const t=((now-startedAt)/1000)%totalDuration();drawFrame(t);previewFrame=requestAnimationFrame(animate);}
  function preview(){if(!scenes.length){say("ابتدا عکس‌ها را انتخاب کن.");return;}stopPreview();startedAt=0;previewing=true;previewFrame=requestAnimationFrame(animate);say("پیش‌نمایش چندصحنه‌ای فعال است.");}
  function updateReady(){const ready=scenes.length>0;previewBtn.disabled=!ready;renderBtn.disabled=!ready||!window.MediaRecorder||!canvas.captureStream;say(ready?scenes.length+" عکس آماده تدوین است.":"ابتدا عکس‌ها را در تب رسانه‌ها انتخاب کن.");}
  imageInput.addEventListener("change",()=>{
    const files=Array.from(imageInput.files||[]);if(!files.length)return;
    if(files.length>20){say("حداکثر ۲۰ عکس می‌توانی انتخاب کنی.");imageInput.value="";return;}
    const invalid=files.find(f=>!f.type.startsWith("image/")||f.size>20*1024*1024);if(invalid){say("هر فایل باید تصویر و حداکثر ۲۰ مگابایت باشد.");imageInput.value="";return;}
    scenes.forEach(s=>URL.revokeObjectURL(s.url));scenes=[];stopPreview();
    Promise.all(files.map(file=>new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>resolve({file,url,image:img});img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("خواندن یکی از تصاویر ناموفق بود."));};img.src=url;}))).then(items=>{scenes=items;resize();renderSceneList();drawFrame(0);updateReady();}).catch(e=>say(e.message));
  });
  musicInput.addEventListener("change",()=>{const file=musicInput.files&&musicInput.files[0];if(!file)return;if(!file.type.startsWith("audio/")){say("فایل صوتی معتبر انتخاب کن.");musicInput.value="";return;}if(musicUrl)URL.revokeObjectURL(musicUrl);musicUrl=URL.createObjectURL(file);if(!musicElement){musicElement=new Audio();musicElement.preload="auto";musicElement.loop=false;}musicElement.src=musicUrl;say("موسیقی آماده است.");});
  [titleInput,subtitleInput,formatInput,motionInput].forEach(el=>el.addEventListener("input",()=>{resize();drawFrame(0);}));
  previewBtn.addEventListener("click",preview);
  root.querySelectorAll("[data-video-tab]").forEach(btn=>btn.addEventListener("click",()=>{root.querySelectorAll("[data-video-tab]").forEach(b=>{const active=b===btn;b.classList.toggle("is-active",active);b.setAttribute("aria-selected",String(active));});root.querySelectorAll(".nava-video-panel").forEach(p=>{const active=p.id===btn.getAttribute("aria-controls");p.hidden=!active;p.classList.toggle("is-active",active);});}));
  $("navaVideoAutoOrder").addEventListener("click",()=>{if(!scenes.length){$("navaVideoNaviResult").textContent="ابتدا عکس‌ها را در تب رسانه‌ها انتخاب کن.";return;}scenes.sort((a,b)=>a.file.name.localeCompare(b.file.name,"fa"));renderSceneList();drawFrame(0);$("navaVideoNaviResult").textContent="تصاویر بر اساس نام فایل مرتب شدند. برای ترتیب خلاقانه و معنایی، بریف را به NAVI بفرست." ;});
  $("navaVideoAskNavi").addEventListener("click",()=>{const brief=$("navaVideoBrief").value.trim();const names=scenes.map((s,i)=>(i+1)+". "+s.file.name).join("\n");const prompt="برای این پروژه نقش کارگردان خلاق و تدوینگر ویدئو را بر عهده بگیر. موضوع و هدف: "+(brief||"بر اساس تصاویر انتخاب‌شده یک روایت مناسب پیشنهاد بده.")+"\nتعداد تصاویر: "+scenes.length+"\nفهرست فایل‌ها:\n"+(names||"هنوز تصویری انتخاب نشده")+"\nموسیقی: "+(musicElement?"بارگذاری شده":"هنوز انتخاب نشده")+"\nلطفاً سناریوی صحنه‌به‌صحنه، ترتیب پیشنهادی تصاویر، مدت هر صحنه، متن روی تصویر، ریتم هماهنگ با موسیقی، نوع انتقال و حرکت دوربین را پیشنهاد بده. توضیح بده کدام تصمیم‌ها نیازمند تأیید من هستند.";
    const briefField=document.getElementById("studioBrief-av");if(briefField)briefField.value=prompt;const task=document.getElementById("studioTask-av");if(task)task.value="ایده‌پردازی و برنامه‌ریزی";const result=$("navaVideoNaviResult");result.textContent="بریف در فرم اصلی استودیو آماده شد. برای فرستادن آن به NAVI، دکمه «ادامه با NAVI» را در بالای همین استودیو بزن.";const briefForm=root.closest("#avPage")?.querySelector(".studio-brief-card");if(briefForm){briefForm.scrollIntoView({behavior:"smooth",block:"center"});briefForm.querySelector("#studioBrief-av")?.focus({preventScroll:true});}else{result.textContent="بریف آماده است، اما فرم اصلی NAVI پیدا نشد.";}});
  renderBtn.addEventListener("click",async()=>{
    if(!scenes.length||recording)return;if(!window.MediaRecorder||!canvas.captureStream){say("این مرورگر ضبط ویدئو را پشتیبانی نمی‌کند.");return;}
    stopPreview();resize();drawFrame(0);const mime=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(t=>MediaRecorder.isTypeSupported(t));if(!mime){say("کدک سازگار پیدا نشد.");return;}
    const stream=canvas.captureStream(30);
    try{
      if(musicElement){if(!audioContext){audioContext=new (window.AudioContext||window.webkitAudioContext)();audioSource=audioContext.createMediaElementSource(musicElement);audioDestination=audioContext.createMediaStreamDestination();musicGain=audioContext.createGain();audioSource.connect(musicGain);musicGain.connect(audioDestination);}await audioContext.resume();musicGain.gain.value=Math.max(0,Number(musicVolume.value)/100);audioDestination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));musicElement.currentTime=0;await musicElement.play();}
      chunks=[];recording=true;renderBtn.disabled=true;previewBtn.disabled=true;progress.style.width="0%";recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000});
      recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
      recorder.onerror=()=>say("هنگام ضبط ویدئو خطایی رخ داد.");
      recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(musicElement)musicElement.pause();recording=false;renderBtn.disabled=false;previewBtn.disabled=false;const blob=new Blob(chunks,{type:mime});if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=URL.createObjectURL(blob);const video=$("navaVideoOutput");video.src=outputUrl;const link=$("navaVideoDownload");link.href=outputUrl;link.download="nava-multiphoto-video.webm";link.hidden=false;result.hidden=false;progress.style.width="100%";say("ویدئوی چندعکسی "+(musicElement?"همراه موسیقی ":"")+"آماده شد. برای مشاهده به تب خروجی برو.");};
      recorder.start(250);const start=performance.now(),duration=totalDuration(),fade=Number(fadeInput.value),baseVolume=Math.max(0,Number(musicVolume.value)/100);
      const tick=now=>{if(!recording)return;const t=(now-start)/1000;drawFrame(Math.min(t,duration));if(musicElement&&musicGain){const remaining=duration-t;const factor=fade>0?Math.max(0,Math.min(1,t/fade,remaining/fade)):1;musicGain.gain.setTargetAtTime(baseVolume*factor,audioContext.currentTime,0.04);}progress.style.width=Math.min(100,t/duration*100)+"%";if(t>=duration){recorder.stop();return;}requestAnimationFrame(tick);};
      requestAnimationFrame(tick);say("در حال تدوین و ضبط ویدئو در مرورگر؛ صفحه را باز نگه دار.");
    }catch(e){recording=false;stream.getTracks().forEach(t=>t.stop());renderBtn.disabled=false;previewBtn.disabled=false;say("ساخت ویدئو ناموفق بود: "+(e.message||"خطای ناشناخته"));}
  });
  resize();say("چند عکس را انتخاب کن تا تدوین را شروع کنیم.");
})();