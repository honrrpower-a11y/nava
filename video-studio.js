/* NAVA image-to-video: browser-native canvas + MediaRecorder, no paid API or upload service */
(() => {
  "use strict";
  const root = document.getElementById("navaVideoEngine");
  if (!root || root.dataset.ready === "1") return;
  root.dataset.ready = "1";
  const $ = id => root.querySelector("#" + id);
  const fileInput = $("navaVideoImage");
  const canvas = $("navaVideoCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const previewBtn = $("navaVideoPreview");
  const renderBtn = $("navaVideoRender");
  const status = $("navaVideoStatus");
  const progress = $("navaVideoProgress");
  const result = $("navaVideoResult");
  const titleInput = $("navaVideoTitle");
  const subtitleInput = $("navaVideoSubtitle");
  const durationInput = $("navaVideoDuration");
  const formatInput = $("navaVideoFormat");
  const motionInput = $("navaVideoMotion");
  let sourceImage = null, sourceUrl = "", animationFrame = 0, recorder = null, chunks = [], recording = false;
  let previewStartedAt = 0, previewDuration = 8, previewMode = false;

  function say(message) { status.textContent = message; }
  function dimensions() { return formatInput.value === "landscape" ? [1920,1080] : [1080,1920]; }
  function resizeCanvas() { const [w,h] = dimensions(); canvas.width=w; canvas.height=h; const wrap=root.querySelector(".nava-video-canvas-wrap"); if(wrap) wrap.style.aspectRatio=w+" / "+h; }
  function drawFrame(seconds) {
    if (!sourceImage) return;
    const [w,h] = dimensions();
    if (canvas.width !== w || canvas.height !== h) resizeCanvas();
    const iw=sourceImage.naturalWidth, ih=sourceImage.naturalHeight;
    const base=Math.max(w/iw,h/ih);
    const zoomMode=motionInput.value;
    const zoom=zoomMode==="subtle" ? 1+0.045*(seconds/previewDuration) : 1+0.12*(seconds/previewDuration);
    const scale=base*zoom, dw=iw*scale, dh=ih*scale;
    const travel=(seconds/previewDuration)-.5;
    const dx=(w-dw)/2 + travel*(dw-w)*.24;
    const dy=(h-dh)/2 - travel*(dh-h)*.12;
    ctx.fillStyle="#050912";ctx.fillRect(0,0,w,h);
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
    ctx.drawImage(sourceImage,dx,dy,dw,dh);
    const shade=ctx.createLinearGradient(0,0,0,h);
    shade.addColorStop(0,"rgba(2,8,18,.14)");shade.addColorStop(.48,"rgba(2,8,18,.02)");shade.addColorStop(1,"rgba(2,8,18,.76)");
    ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    const title=titleInput.value.trim(), subtitle=subtitleInput.value.trim();
    const scaleFactor=w/1080;
    ctx.textAlign="center";ctx.direction="rtl";
    if(title){ctx.font="700 "+Math.round(54*scaleFactor)+"px sans-serif";ctx.fillStyle="#fff";ctx.shadowColor="rgba(0,0,0,.6)";ctx.shadowBlur=18*scaleFactor;ctx.fillText(title,w/2,h*.78,w*.84);}
    if(subtitle){ctx.shadowBlur=10*scaleFactor;ctx.font="400 "+Math.round(27*scaleFactor)+"px sans-serif";ctx.fillStyle="rgba(255,255,255,.9)";ctx.fillText(subtitle,w/2,h*.83,w*.82);}
    ctx.restore();
  }
  function stopPreview(){if(animationFrame)cancelAnimationFrame(animationFrame);animationFrame=0;previewMode=false;}
  function animatePreview(now){if(!previewMode)return;if(!previewStartedAt)previewStartedAt=now;const elapsed=((now-previewStartedAt)/1000)%previewDuration;drawFrame(elapsed);animationFrame=requestAnimationFrame(animatePreview);}
  function startPreview(){if(!sourceImage){say("ابتدا یک تصویر انتخاب کن.");return;}stopPreview();previewDuration=Number(durationInput.value);previewStartedAt=0;previewMode=true;animationFrame=requestAnimationFrame(animatePreview);say("پیش‌نمایش حرکت دوربین فعال است.");}
  fileInput.addEventListener("change",()=>{
    const file=fileInput.files && fileInput.files[0];if(!file)return;
    if(!file.type.startsWith("image/")){say("فقط فایل تصویری انتخاب کن.");fileInput.value="";return;}
    if(file.size>20*1024*1024){say("حجم تصویر باید کمتر از ۲۰ مگابایت باشد.");fileInput.value="";return;}
    stopPreview();if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(file);
    const img=new Image();img.onload=()=>{sourceImage=img;resizeCanvas();drawFrame(0);previewBtn.disabled=false;renderBtn.disabled=!window.MediaRecorder||!canvas.captureStream;say("تصویر آماده است. پیش‌نمایش را ببین یا ویدئو را بساز.");};img.onerror=()=>say("خواندن تصویر ناموفق بود؛ فایل دیگری انتخاب کن.");img.src=sourceUrl;
  });
  [titleInput,subtitleInput,formatInput,motionInput].forEach(el=>el.addEventListener("input",()=>{if(sourceImage){stopPreview();resizeCanvas();drawFrame(0);}}));
  previewBtn.addEventListener("click",startPreview);
  renderBtn.addEventListener("click",async()=>{
    if(!sourceImage||recording)return;
    if(!window.MediaRecorder||!canvas.captureStream){say("مرورگر این دستگاه ضبط ویدئو از بوم را پشتیبانی نمی‌کند. لطفاً Chrome به‌روز را امتحان کن.");return;}
    stopPreview();previewDuration=Number(durationInput.value);resizeCanvas();drawFrame(0);
    const mime=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime){say("کدک ویدئویی سازگار در این مرورگر پیدا نشد.");return;}
    const stream=canvas.captureStream(30);chunks=[];recording=true;renderBtn.disabled=true;previewBtn.disabled=true;progress.style.width="0%";
    try{
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6500000});
      recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
      recorder.onerror=()=>{recording=false;renderBtn.disabled=false;previewBtn.disabled=false;say("هنگام ضبط ویدئو خطایی رخ داد.");stream.getTracks().forEach(t=>t.stop());};
      recorder.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());recording=false;renderBtn.disabled=false;previewBtn.disabled=false;
        const blob=new Blob(chunks,{type:mime});const url=URL.createObjectURL(blob);
        result.hidden=false;const video=$("navaVideoOutput");video.src=url;
        const link=$("navaVideoDownload");link.href=url;link.download="nava-image-motion.webm";
        link.hidden=false;progress.style.width="100%";
        say("ویدئو آماده شد. خروجی WebM با تصویر، حرکت دوربین و نوشته‌های انتخابی ساخته شد.");
      };
      recorder.start(250);
      const started=performance.now();
      const tick=now=>{
        if(!recording)return;
        const elapsed=(now-started)/1000;drawFrame(Math.min(elapsed,previewDuration));
        progress.style.width=Math.min(100,elapsed/previewDuration*100)+"%";
        if(elapsed>=previewDuration){recorder.stop();return;}
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);say("در حال ساخت ویدئو در همین مرورگر… صفحه را باز نگه دار.");
    }catch(error){recording=false;renderBtn.disabled=false;previewBtn.disabled=false;stream.getTracks().forEach(t=>t.stop());say("ساخت ویدئو انجام نشد: "+(error.message||"خطای ناشناخته"));}
  });
  resizeCanvas();say("یک تصویر بارگذاری کن تا پیش‌نمایش متحرک و خروجی ویدئو فعال شود.");
})();
