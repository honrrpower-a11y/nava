/* NAVA local video editor — browser-only, no upload or paid API. */
(() => {
  "use strict";
  const root = document.getElementById("navaVideoEditor");
  if (!root || root.dataset.ready === "1") return;
  root.dataset.ready = "1";
  const $ = id => root.querySelector("#" + id);
  const input = $("navaEditorFiles");
  const audioInput = $("navaEditorAudio");
  const list = $("navaEditorTimeline");
  const preview = $("navaEditorPreview");
  const status = document.getElementById("navaEditorStatus");
  const totalLabel = $("navaEditorTotal");
  const audioLabel = $("navaEditorAudioLabel");
  const audio = $("navaEditorAudioPlayer");
  const playButton = $("navaEditorPlay");
  const stopButton = $("navaEditorStop");
  const clearButton = $("navaEditorClear");
  const exportButton = $("navaEditorExport");
  const exportProgress = $("navaEditorExportProgress");
  const exportOutput = $("navaEditorExportOutput");
  const exportDownload = $("navaEditorExportDownload");
  const audioVolume = $("navaEditorAudioVolume");
  let clips = [];
  let audioFile = null;
  let audioUrl = "";
  let selectedId = null;
  let playing = false;
  let playToken = 0;
  let currentIndex = -1;
  let advancing = false;
  let clipSequence = 0;
  let exportUrl = "";
  let exportAudioContext = null;
  let exportRecordDestination = null;
  let exportPreviewGain = null;
  let exportMusicGain = null;
  let exportMusicSource = null;

  const fmt = value => {
    const n = Math.max(0, Number(value) || 0);
    const m = Math.floor(n / 60);
    return String(m).padStart(2, "0") + ":" + (n % 60).toFixed(1).padStart(4, "0");
  };
  const totalDuration = () => clips.reduce((sum, clip) => sum + Math.max(0, clip.out - clip.in), 0);
  const waitForVideoData = (video, timeout = 12000) => new Promise((resolve, reject) => {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) return resolve();
    let timer;
    const cleanup = () => { clearTimeout(timer); video.removeEventListener("loadeddata", ready); video.removeEventListener("canplay", ready); video.removeEventListener("error", failed); };
    const ready = () => { if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) { cleanup(); resolve(); } };
    const failed = () => { cleanup(); reject(new Error(video.error?.message || "فریم ویدئو رمزگشایی نشد؛ ممکن است کدک فایل پشتیبانی نشود.")); };
    video.addEventListener("loadeddata", ready); video.addEventListener("canplay", ready); video.addEventListener("error", failed, { once: true });
    timer = setTimeout(() => { cleanup(); reject(new Error("بارگذاری فریم ویدئو بیش از حد طول کشید. فایل MP4 با کدک H.264 را امتحان کن.")); }, timeout);
    ready();
  });
  const seekVideo = (video, time) => new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - time) < 0.05 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return resolve();
    let timer;
    const cleanup = () => { clearTimeout(timer); video.removeEventListener("seeked", done); video.removeEventListener("error", failed); };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("رفتن به زمان انتخاب‌شده در ویدئو ناموفق بود.")); };
    video.addEventListener("seeked", done, { once: true }); video.addEventListener("error", failed, { once: true });
    timer = setTimeout(() => { cleanup(); reject(new Error("آماده‌سازی فریم انتخاب‌شده زمان‌بر شد.")); }, 10000);
    try { video.currentTime = time; } catch (error) { cleanup(); reject(error); }
  });
  const waitForPresentedFrame = video => new Promise(resolve => {
    if (typeof video.requestVideoFrameCallback === "function") {
      let settled = false; const timer = setTimeout(() => { if (!settled) { settled = true; resolve(); } }, 1200);
      video.requestVideoFrameCallback(() => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } });
    } else requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  const setStatus = message => { if (status) status.textContent = message; };
  const getClip = id => clips.find(clip => clip.id === id);
  const stopPlayback = () => {
    playing = false;
    playToken++;
    currentIndex = -1;
    preview.pause();
    audio.pause();
    playButton.textContent = "▶ پخش تدوین";
    root.classList.remove("is-playing");
  };
  const updateSummary = () => {
    totalLabel.textContent = clips.length + " کلیپ · " + fmt(totalDuration());
    playButton.disabled = clips.length === 0;
    exportButton.disabled = clips.length === 0;
    stopButton.disabled = !playing;
    clearButton.disabled = clips.length === 0 && !audioFile;
  };
  const renderTimeline = () => {
    if (!clips.length) {
      list.innerHTML = '<div class="nava-editor-empty">هنوز ویدئویی اضافه نشده است. از دکمهٔ بالا یک یا چند ویدئو انتخاب کن.</div>';
      updateSummary();
      return;
    }
    list.innerHTML = clips.map((clip, index) => {
      const active = clip.id === selectedId ? " is-selected" : "";
      return '<article class="nava-editor-clip' + active + '" data-clip-id="' + clip.id + '">' +
        '<button class="nava-editor-clip-select" type="button" data-action="select" aria-label="انتخاب کلیپ ' + (index + 1) + '">' +
        '<span class="nava-editor-clip-index">' + (index + 1) + '</span><span class="nava-editor-clip-name"></span><span class="nava-editor-clip-duration">' + fmt(clip.out - clip.in) + '</span></button>' +
        '<div class="nava-editor-trim">' +
        '<div class="nava-editor-trim-head"><span>برش ابتدا و انتهای کلیپ</span><span>مدت انتخاب‌شده: <b data-trim-duration>' + fmt(clip.out - clip.in) + '</b></span></div>' +
        '<label><span>شروع <output data-trim-value="in">' + fmt(clip.in) + '</output></span><input type="range" min="0" max="' + clip.duration.toFixed(1) + '" step="0.1" data-trim="in" value="' + clip.in.toFixed(1) + '" aria-label="نوار تنظیم شروع کلیپ"></label>' +
        '<label><span>پایان <output data-trim-value="out">' + fmt(clip.out) + '</output></span><input type="range" min="0.1" max="' + clip.duration.toFixed(1) + '" step="0.1" data-trim="out" value="' + clip.out.toFixed(1) + '" aria-label="نوار تنظیم پایان کلیپ"></label>' +
        '<span class="nava-editor-source-duration">طول ویدئوی اصلی: ' + fmt(clip.duration) + '</span></div>' +
        '<div class="nava-editor-clip-actions"><button type="button" data-action="up" aria-label="انتقال به بالا" ' + (index === 0 ? "disabled" : "") + '>↑</button>' +
        '<button type="button" data-action="down" aria-label="انتقال به پایین" ' + (index === clips.length - 1 ? "disabled" : "") + '>↓</button>' +
        '<button type="button" data-action="remove" aria-label="حذف کلیپ">حذف</button></div></article>';
    }).join("");
    clips.forEach(clip => {
      const card = list.querySelector('[data-clip-id="' + clip.id + '"]');
      const name = card?.querySelector(".nava-editor-clip-name");
      if (name) name.textContent = clip.file.name;
    });
    updateSummary();
  };
  let previewLoadToken = 0;
  const selectClip = async clip => {
    if (!clip) return;
    stopPlayback();
    const loadToken = ++previewLoadToken;
    selectedId = clip.id;
    preview.pause();
    preview.removeAttribute("src");
    preview.load();
    preview.preload = "auto";
    renderTimeline();
    setStatus("در حال آماده‌سازی پیش‌نمایش: " + clip.file.name);
    try {
      const metadataReady = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("خواندن مشخصات ویدئو بیش از حد طول کشید.")), 12000);
        preview.addEventListener("loadedmetadata", () => { clearTimeout(timer); resolve(); }, { once: true });
        preview.addEventListener("error", () => { clearTimeout(timer); reject(new Error("این فرمت یا کدک ویدئو در مرورگر قابل‌پخش نیست.")); }, { once: true });
      });
      preview.src = clip.url;
      preview.load();
      await metadataReady;
      await waitForVideoData(preview);
      if (loadToken !== previewLoadToken || selectedId !== clip.id) return;
      await seekVideo(preview, clip.in);
      await waitForVideoData(preview);
      await waitForPresentedFrame(preview);
      if (loadToken !== previewLoadToken || selectedId !== clip.id) return;
      setStatus("پیش‌نمایش آماده است: " + clip.file.name);
    } catch (error) {
      if (loadToken === previewLoadToken) setStatus(error.message || "پیش‌نمایش این ویدئو آماده نشد.");
    }
  };
  const addVideo = async file => {
    if (!file || !(file.type.startsWith("video/") || /\.(mp4|m4v|mov|webm|ogv|3gp)$/i.test(file.name))) {
      setStatus("این فایل به‌عنوان ویدئو شناخته نشد: " + (file?.name || ""));
      return;
    }
    if (clips.length >= 8) {
      setStatus("در این نسخه حداکثر ۸ کلیپ برای حفظ روانی گوشی پشتیبانی می‌شود.");
      return;
    }
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.muted = true;
    probe.playsInline = true;
    try {
      const metadataReady = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("خواندن مشخصات ویدئو بیش از حد طول کشید.")), 15000);
        probe.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
        probe.onerror = () => { clearTimeout(timer); reject(new Error("مرورگر نتوانست این ویدئو را بخواند.")); };
      });
      probe.src = url;
      await metadataReady;
      const duration = Number.isFinite(probe.duration) ? probe.duration : 0;
      if (!duration || duration <= 0) throw new Error("مدت ویدئو قابل تشخیص نیست.");
      const clip = { id: "clip-" + (++clipSequence), file, url, duration, width: probe.videoWidth || 0, height: probe.videoHeight || 0, in: 0, out: duration };
      clips.push(clip);
      selectedId = clip.id;
      selectClip(clip);
      setStatus("ویدئو اضافه شد: " + file.name);
    } catch (error) {
      URL.revokeObjectURL(url);
      setStatus(error.message || "افزودن ویدئو ناموفق بود.");
    } finally {
      probe.removeAttribute("src");
      probe.load();
    }
  };
  const playFrom = async (index, token) => {
    if (token !== playToken || index >= clips.length) {
      if (token === playToken) {
        stopPlayback();
        setStatus("پخش تدوین به پایان رسید.");
      }
      return;
    }
    currentIndex = index;
    const clip = clips[index];
    advancing = true;
    selectedId = clip.id;
    renderTimeline();
    preview.pause();
    try {
      const metadataReady = new Promise((resolve, reject) => {
        preview.onloadedmetadata = resolve;
        preview.onerror = () => reject(new Error("پخش یکی از کلیپ‌ها ممکن نیست: " + clip.file.name));
      });
      preview.src = clip.url;
      preview.preload = "auto";
      preview.load();
      await metadataReady;
      await waitForVideoData(preview);
      if (token !== playToken) return;
      await seekVideo(preview, clip.in);
      await waitForVideoData(preview);
      await waitForPresentedFrame(preview);
      if (token !== playToken) return;
      await preview.play();
      advancing = false;
    } catch (error) {
      stopPlayback();
      setStatus(error.message || "پخش این کلیپ در مرورگر ممکن نیست.");
    }
  };
  const advanceIfNeeded = () => {
    if (!playing || currentIndex < 0 || advancing) return;
    const clip = clips[currentIndex];
    if (!clip || preview.currentTime >= clip.out - 0.06 || preview.ended) {
      advancing = true;
      const next = currentIndex + 1;
      playFrom(next, playToken).finally(() => { advancing = false; });
    }
  };

  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    input.value = "";
    for (const file of files) await addVideo(file);
  });
  audioInput.addEventListener("change", () => {
    const file = audioInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(file.name)) {
      setStatus("فرمت فایل صوتی قابل شناسایی نیست.");
      audioInput.value = "";
      return;
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    audioFile = file;
    audioUrl = URL.createObjectURL(file);
    audio.src = audioUrl;
    audio.volume = exportMusicGain ? 1 : Number(audioVolume.value) / 100;
    if (exportMusicGain) exportMusicGain.gain.value = Number(audioVolume.value) / 100;
    audioLabel.textContent = file.name;
    updateSummary();
    setStatus("موسیقی به پروژه اضافه شد و هنگام خروجی با صدای اصلی کلیپ‌ها ترکیب می‌شود.");
  });
  audioVolume.addEventListener("input", () => {
    if (exportMusicGain) {
      audio.volume = 1;
      if (exportAudioContext?.state === "running") exportMusicGain.gain.value = Number(audioVolume.value) / 100;
    } else {
      audio.volume = Number(audioVolume.value) / 100;
    }
  });
  list.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const card = button.closest("[data-clip-id]");
    const index = clips.findIndex(clip => clip.id === card?.dataset.clipId);
    if (index < 0) return;
    const action = button.dataset.action;
    if (action === "select") { selectClip(clips[index]); return; }
    if (action === "remove") {
      stopPlayback();
      const [removed] = clips.splice(index, 1);
      URL.revokeObjectURL(removed.url);
      if (selectedId === removed.id) selectedId = clips[Math.min(index, clips.length - 1)]?.id || null;
      if (selectedId) selectClip(getClip(selectedId));
      else { preview.removeAttribute("src"); preview.load(); renderTimeline(); setStatus("کلیپ حذف شد."); }
      return;
    }
    if (action === "up" || action === "down") {
      const target = action === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= clips.length) return;
      stopPlayback();
      [clips[index], clips[target]] = [clips[target], clips[index]];
      selectedId = clips[target].id;
      renderTimeline();
      setStatus("ترتیب کلیپ‌ها تغییر کرد.");
    }
  });
  list.addEventListener("input", event => {
    const field = event.target.closest("input[data-trim]");
    if (!field) return;
    const card = field.closest("[data-clip-id]");
    const clip = getClip(card?.dataset.clipId);
    if (!clip) return;
    const value = Math.max(0, Math.min(clip.duration, Number(field.value) || 0));
    if (field.dataset.trim === "in") clip.in = Math.min(value, clip.out - 0.1);
    else clip.out = Math.max(value, clip.in + 0.1);
    // Keep each range on the same fixed 0..source-duration scale.
    // Dynamic opposite-slider bounds can make mobile browsers drag both thumbs.
    field.value = (field.dataset.trim === "in" ? clip.in : clip.out).toFixed(1);
    card.querySelector('[data-trim-value="in"]').textContent = fmt(clip.in);
    card.querySelector('[data-trim-value="out"]').textContent = fmt(clip.out);
    card.querySelector("[data-trim-duration]").textContent = fmt(clip.out - clip.in);
    card.querySelector(".nava-editor-clip-duration").textContent = fmt(clip.out - clip.in);
    totalLabel.textContent = clips.length + " کلیپ · " + fmt(totalDuration());
    if (selectedId === clip.id) {
      if (playing) stopPlayback();
      const outsideTrim = preview.currentTime < clip.in || preview.currentTime >= clip.out;
      if (outsideTrim) {
        const target = field.dataset.trim === "in" ? clip.in : Math.max(clip.in, clip.out - 0.1);
        try { preview.currentTime = target; } catch (_) {}
      }
    }
    setStatus("برش زنده: " + fmt(clip.out - clip.in) + " از " + clip.file.name);
  });
  playButton.addEventListener("click", () => {
    if (!clips.length) return;
    stopPlayback();
    advancing = false;
    playing = true;
    const token = playToken;
    playButton.textContent = "در حال پخش…";
    root.classList.add("is-playing");
    if (audioFile) {
      audio.currentTime = 0;
      audio.volume = Number(audioVolume.value) / 100;
      audio.play().catch(() => setStatus("پخش موسیقی توسط مرورگر مسدود شد؛ برای ادامه، دوباره پخش را بزن."));
    }
    setStatus("در حال پخش تدوین…");
    playFrom(0, token);
  });
  stopButton.addEventListener("click", () => { stopPlayback(); setStatus("پخش متوقف شد."); });
  preview.addEventListener("timeupdate", advanceIfNeeded);
  preview.addEventListener("ended", advanceIfNeeded);
  clearButton.addEventListener("click", () => {
    stopPlayback();
    clips.forEach(clip => URL.revokeObjectURL(clip.url));
    clips = [];
    selectedId = null;
    preview.pause();
    preview.removeAttribute("src");
    preview.load();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = "";
    audioFile = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    audioInput.value = "";
    audioLabel.textContent = "موسیقی اضافه نشده است.";
    renderTimeline();
    setStatus("پروژهٔ تدوین پاک شد.");
  });
  const waitForMediaEvent = (element, eventName, errorName = "error") => new Promise((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener(eventName, done);
      element.removeEventListener(errorName, fail);
    };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("مرورگر نتوانست رسانه را برای خروجی آماده کند.")); };
    element.addEventListener(eventName, done, { once: true });
    element.addEventListener(errorName, fail, { once: true });
  });

  // Isolated experimental export path. The image-based video studio is not modified.
  const exportViaMediaRecorder = async () => {
    if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== "function") return false;
    const mime = ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4;codecs="avc1,mp4a.40.2"',"video/mp4"].find(type => {
      try { return MediaRecorder.isTypeSupported(type); } catch (_) { return false; }
    });
    // If native MP4 recording is unavailable, retain the existing H.264/AAC pipeline.
    if (!mime) return false;
    const duration = totalDuration();
    if (!duration || duration > 900) throw new Error("مدت پروژه باید بیشتر از صفر و حداکثر ۱۵ دقیقه باشد.");
    stopPlayback();
    exportButton.disabled = true; playButton.disabled = true;
    exportProgress.hidden = false; exportProgress.value = 0; exportProgress.max = 100;
    exportOutput.hidden = true; exportDownload.hidden = true;
    setStatus("آزمایش ضبط مستقیم Canvas برای خروجی MP4…");
    let stream = null, recorder = null, musicStarted = false, recorderError = null;
    const chunks = [];
    try {
      const first = clips[0], sw = Math.max(1, first.width || 16), sh = Math.max(1, first.height || 9);
      const ram = Number(navigator.deviceMemory) || 0, cores = Number(navigator.hardwareConcurrency) || 0;
      const economy = (ram && ram <= 4) || (cores && cores <= 4), high = ram >= 8 && cores >= 8;
      const maxEdge = economy ? 480 : high ? 1080 : 720, fps = economy ? 20 : high ? 30 : 24;
      const scale = Math.min(1, maxEdge / Math.max(sw, sh));
      const width = Math.max(2, Math.round(sw * scale / 2) * 2), height = Math.max(2, Math.round(sh * scale / 2) * 2);
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
      if (!ctx) throw new Error("امکان ساخت تصویر خروجی وجود ندارد.");
      const draw = () => {
        const vw = preview.videoWidth || sw, vh = preview.videoHeight || sh;
        const s = Math.min(width / vw, height / vh), dw = vw * s, dh = vh * s;
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, width, height);
        if (preview.readyState >= 2 && preview.videoWidth) ctx.drawImage(preview, (width-dw)/2, (height-dh)/2, dw, dh);
      };
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("ترکیب صدای کلیپ‌ها و موسیقی در این مرورگر پشتیبانی نمی‌شود.");
      if (!exportAudioContext || exportAudioContext.state === "closed") {
        exportAudioContext = new AC(); exportRecordDestination = exportAudioContext.createMediaStreamDestination();
        exportPreviewGain = exportMusicGain = exportMusicSource = null;
      }
      await exportAudioContext.resume();
      if (!exportPreviewGain) {
        const src = exportAudioContext.createMediaElementSource(preview);
        exportPreviewGain = exportAudioContext.createGain(); exportPreviewGain.gain.value = 1;
        src.connect(exportPreviewGain); exportPreviewGain.connect(exportRecordDestination); exportPreviewGain.connect(exportAudioContext.destination);
      }
      if (!exportMusicSource) {
        exportMusicSource = exportAudioContext.createMediaElementSource(audio);
        exportMusicGain = exportAudioContext.createGain();
        exportMusicSource.connect(exportMusicGain); exportMusicGain.connect(exportRecordDestination);
      }
      exportPreviewGain.gain.value = 1;
      exportMusicGain.gain.value = audioFile ? Math.max(0, Math.min(1, Number(audioVolume.value)/100)) : 0;
      const videoStream = canvas.captureStream(fps), audioTrack = exportRecordDestination.stream.getAudioTracks()[0];
      if (!videoStream.getVideoTracks().length || !audioTrack || audioTrack.readyState !== "live") throw new Error("مسیر تصویر یا صدای خروجی فعال نشد.");
      stream = new MediaStream([...videoStream.getVideoTracks(), audioTrack]);
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: economy ? 1000000 : high ? 5000000 : 2500000, audioBitsPerSecond: 128000 });
      recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
      recorder.onerror = e => { recorderError = e.error || new Error("ضبط MP4 با خطا متوقف شد."); };
      const stopped = new Promise((resolve,reject) => {
        recorder.onstop = () => recorderError ? reject(recorderError) : resolve();
      });
      draw(); recorder.start(1000);
      if (audioFile) { audio.loop = true; audio.currentTime = 0; audio.volume = 1; await audio.play(); musicStarted = true; }
      let doneDuration = 0;
      for (let i=0; i<clips.length; i++) {
        const clip = clips[i]; setStatus("ضبط MP4 آزمایشی: کلیپ " + (i+1) + " از " + clips.length);
        preview.pause();
        const ready = waitForMediaEvent(preview,"loadedmetadata");
        preview.src = clip.url; preview.preload = "auto"; preview.load();
        await ready; await waitForVideoData(preview); await seekVideo(preview,clip.in); await waitForVideoData(preview); await waitForPresentedFrame(preview);
        draw(); await preview.play();
        await new Promise((resolve,reject) => {
          let raf=0, watchdog=0, last=preview.currentTime, lastAt=Date.now(), settled=false;
          const clean=()=>{ if(raf)cancelAnimationFrame(raf); if(watchdog)clearInterval(watchdog); };
          const finish=err=>{ if(settled)return; settled=true; clean(); err?reject(err):resolve(); };
          const tick=()=>{
            if(settled)return;
            try {
              if(recorderError)throw recorderError;
              draw();
              const elapsed=Math.max(0,Math.min(clip.out-clip.in,preview.currentTime-clip.in));
              exportProgress.value=Math.round(((doneDuration+elapsed)/duration)*100);
              if(preview.currentTime>last+0.015){last=preview.currentTime;lastAt=Date.now();}
              if(preview.currentTime>=clip.out-0.04||preview.ended){draw();finish();return;}
              raf=requestAnimationFrame(tick);
            } catch(err){finish(err);}
          };
          raf=requestAnimationFrame(tick);
          watchdog=setInterval(()=>{if(!settled&&Date.now()-lastAt>8000&&preview.currentTime<clip.out-0.04)finish(new Error("حرکت ویدئو هنگام ضبط متوقف شد؛ فایل ناقص ارائه نشد."));},1000);
        });
        preview.pause(); doneDuration+=clip.out-clip.in;
      }
      if(musicStarted)audio.pause(); preview.pause(); draw();
      if(recorder.state!=="inactive")recorder.stop();
      await stopped;
      const blob=new Blob(chunks,{type:"video/mp4"});
      if(!blob.size)throw new Error("فایل MP4 خالی ساخته شد.");
      const checkUrl=URL.createObjectURL(blob);
      try {
        const probe=document.createElement("video"); probe.preload="metadata";
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error("بررسی مدت MP4 بیش از حد طول کشید.")),15000);
          probe.onloadedmetadata=()=>{clearTimeout(timer);resolve();};
          probe.onerror=()=>{clearTimeout(timer);reject(new Error("فایل MP4 ضبط‌شده قابل‌خواندن نیست."));};
          probe.src=checkUrl;
        });
        if(!Number.isFinite(probe.duration)||probe.duration<duration*0.9)throw new Error("مدت MP4 ناقص است؛ فایل ارائه نشد.");
        probe.removeAttribute("src");probe.load();
        const MB=window.Mediabunny;
        if(!MB?.Input||!MB?.BlobSource||!MB?.ALL_FORMATS)throw new Error("امکان بررسی صدای MP4 نهایی فراهم نشد.");
        const inputCheck=new MB.Input({source:new MB.BlobSource(blob),formats:MB.ALL_FORMATS});
        try{if(!await inputCheck.getPrimaryAudioTrack())throw new Error("صدای MP4 در فایل نهایی ثبت نشده است.");}
        finally{try{inputCheck.dispose();}catch(_){}}
      } finally {URL.revokeObjectURL(checkUrl);}
      if(exportUrl)URL.revokeObjectURL(exportUrl);
      exportUrl=URL.createObjectURL(blob); exportOutput.src=exportUrl; exportOutput.hidden=false; exportOutput.load();
      exportDownload.href=exportUrl; exportDownload.download="nava-edited-video.mp4";
      exportDownload.textContent="دریافت ویدیوی نهایی (MP4 · "+width+"×"+height+")"; exportDownload.hidden=false;
      exportProgress.value=100;
      setStatus("خروجی آزمایشی آماده شد · MP4 · "+width+"×"+height+" · "+duration.toFixed(1)+" ثانیه. ضبط مستقیم Canvas فعال بود.");
    } catch(err) {
      if(recorder&&recorder.state!=="inactive")try{recorder.stop();}catch(_){}
      setStatus(err.message||"ساخت MP4 آزمایشی ناموفق بود.");
    } finally {
      if(musicStarted)audio.pause(); preview.pause();
      if(stream)stream.getTracks().forEach(track=>track.stop());
      exportButton.disabled=false; updateSummary();
    }
    return true;
  };

  // Offline export: decode source frames from the files and encode them by timestamp.
  // This avoids real-time canvas capture, which can drop frames on mobile devices.
  const exportFinalVideo = async () => {
    if (!clips.length || exportButton.disabled) return;
    const MB = window.Mediabunny;
    const required = ["Input","BlobSource","ALL_FORMATS","VideoSampleSink","VideoSampleSource",
      "AudioBufferSink","AudioBufferSource","Output","Mp4OutputFormat","BufferTarget","Quality"];
    if (!MB || required.some(key => !MB[key])) {
      setStatus("موتور پردازش آفلاین در این مرورگر کامل بارگذاری نشده است. صفحه را تازه‌سازی کن و با Chrome به‌روز دوباره امتحان کن.");
      return;
    }
    const projectDuration = totalDuration();
    if (!projectDuration || projectDuration > 900) {
      setStatus("مدت پروژه باید بیشتر از صفر و حداکثر ۱۵ دقیقه باشد.");
      return;
    }

    stopPlayback();
    exportButton.disabled = true;
    playButton.disabled = true;
    exportProgress.hidden = false;
    exportProgress.value = 0;
    exportProgress.max = 100;
    exportOutput.hidden = true;
    exportDownload.hidden = true;
    setStatus("در حال آماده‌سازی موتور پردازش فریم‌به‌فریم…");

    let output = null;
    let videoSource = null;
    let audioSource = null;
    let decodeContext = null;
    const openedInputs = [];
    const audioTracks = [];
    try {
      const first = clips[0];
      const sourceWidth = Math.max(1, Number(first.width) || 16);
      const sourceHeight = Math.max(1, Number(first.height) || 9);
      const ram = Number(navigator.deviceMemory) || 0;
      const cores = Number(navigator.hardwareConcurrency) || 0;
      const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || "");
      let tier = "standard";
      if ((ram > 0 && ram <= 4) || (cores > 0 && cores <= 4) ||
          (isMobile && !ram && !cores)) tier = "economy";
      else if (ram >= 8 && cores >= 8) tier = "high";
      try {
        const battery = await navigator.getBattery?.();
        if (battery && battery.level <= 0.2 && !battery.charging) tier = "economy";
      } catch (_) {}

      const maxEdge = tier === "economy" ? 480 : tier === "high" ? 1080 : 720;
      const fps = tier === "economy" ? 20 : tier === "high" ? 30 : 24;
      const bitrate = tier === "economy" ? 850000 : tier === "high" ? 4500000 : 2200000;
      const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(2, Math.round(sourceWidth * scale / 2) * 2);
      const height = Math.max(2, Math.round(sourceHeight * scale / 2) * 2);
      const quality = new MB.Quality({ bitrate });
      const videoCodec = await MB.getFirstEncodableVideoCodec(["avc"], {
        width, height, frameRate: fps, quality
      });
      if (videoCodec !== "avc") throw new Error("این گوشی رمزگذار H.264 لازم برای خروجی MP4 را ارائه نمی‌کند.");

      let audioReady = await MB.canEncodeAudio("aac");
      if (!audioReady && window.MediabunnyAacEncoder?.registerAacEncoder) {
        window.MediabunnyAacEncoder.registerAacEncoder();
        audioReady = await MB.canEncodeAudio("aac");
      }
      if (!audioReady) throw new Error("رمزگذار صدای AAC در این مرورگر فعال نیست؛ خروجی سازگار با تلگرام ساخته نشد.");

      const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!OfflineContext) throw new Error("پردازش آفلاین صدا در این مرورگر پشتیبانی نمی‌شود.");

      // Open each source once. Mediabunny decodes the original media directly,
      // independently of HTMLVideoElement playback speed.
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        setStatus("بررسی فایل " + (i + 1) + " از " + clips.length + "…");
        const inputFile = new MB.Input({ source: new MB.BlobSource(clip.file), formats: MB.ALL_FORMATS });
        openedInputs.push(inputFile);
        const videoTrack = await inputFile.getPrimaryVideoTrack();
        if (!videoTrack) throw new Error("ترک تصویر در فایل «" + clip.file.name + "» پیدا نشد.");
        const videoSink = new MB.VideoSampleSink(videoTrack, { hardwareAcceleration: "prefer-hardware" });
        const audioTrack = await inputFile.getPrimaryAudioTrack();
        audioTracks.push({
          videoTrack,
          videoSink,
          audioTrack,
          audioSink: audioTrack ? new MB.AudioBufferSink(audioTrack) : null,
          firstVideoTimestamp: await videoTrack.getFirstTimestamp(),
          firstAudioTimestamp: audioTrack ? await audioTrack.getFirstTimestamp() : 0
        });
      }

      let musicBuffer = null;
      if (audioFile) {
        if (!AudioContextClass) throw new Error("مرورگر امکان خواندن فایل موسیقی را ندارد.");
        decodeContext = new AudioContextClass();
        const musicBytes = await audioFile.arrayBuffer();
        musicBuffer = await decodeContext.decodeAudioData(musicBytes);
        if (!musicBuffer || !musicBuffer.duration) throw new Error("فایل موسیقی قابل رمزگشایی نیست.");
      }

      videoSource = new MB.VideoSampleSource({
        codec: "avc",
        quality,
        hardwareAcceleration: "prefer-hardware",
        transform: { width, height, fit: "contain", frameRate: fps }
      });
      audioSource = new MB.AudioBufferSource({
        codec: "aac",
        quality: new MB.Quality({ bitrate: 128000 })
      });
      output = new MB.Output({
        format: new MB.Mp4OutputFormat({ fastStart: "in-memory" }),
        target: new MB.BufferTarget()
      });
      output.addVideoTrack(videoSource, { frameRate: fps });
      output.addAudioTrack(audioSource);
      await output.start();

      let videoProgress = 0;
      let audioProgress = 0;
      const updateExportProgress = () => {
        exportProgress.value = Math.min(99, Math.round(8 + videoProgress * 0.62 + audioProgress * 0.30));
      };

      // Render audio in short chunks to cap peak memory on phones. Each chunk
      // mixes the trimmed source audio with the looping music bed.
      const audioTask = (async () => {
        const sampleRate = 44100;
        const chunkSeconds = tier === "economy" ? 2 : 4;
        const chunkCount = Math.ceil(projectDuration / chunkSeconds);
        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
          const chunkStart = chunkIndex * chunkSeconds;
          const chunkDuration = Math.min(chunkSeconds, projectDuration - chunkStart);
          const frameCount = Math.max(1, Math.ceil(chunkDuration * sampleRate));
          const offline = new OfflineContext(2, frameCount, sampleRate);
          const originalGain = offline.createGain();
          originalGain.gain.value = 1;
          originalGain.connect(offline.destination);
          let musicGain = null;
          if (musicBuffer) {
            musicGain = offline.createGain();
            musicGain.gain.value = Math.max(0, Math.min(1, Number(audioVolume.value) / 100));
            musicGain.connect(offline.destination);
            const musicNode = offline.createBufferSource();
            musicNode.buffer = musicBuffer;
            musicNode.loop = true;
            musicNode.connect(musicGain);
            const musicOffset = chunkStart % musicBuffer.duration;
            musicNode.start(0, musicOffset, chunkDuration);
          }

          let clipOffset = 0;
          for (let clipIndex = 0; clipIndex < clips.length; clipIndex++) {
            const clip = clips[clipIndex];
            const clipLength = clip.out - clip.in;
            const clipEnd = clipOffset + clipLength;
            const overlapStart = Math.max(chunkStart, clipOffset);
            const overlapEnd = Math.min(chunkStart + chunkDuration, clipEnd);
            const meta = audioTracks[clipIndex];
            if (overlapEnd > overlapStart && meta.audioSink) {
              const mediaStart = meta.firstAudioTimestamp + clip.in + (overlapStart - clipOffset);
              const mediaEnd = meta.firstAudioTimestamp + clip.in + (overlapEnd - clipOffset);
              for await (const wrapped of meta.audioSink.buffers(mediaStart, mediaEnd)) {
                const buffer = wrapped.buffer;
                const bufferStart = wrapped.timestamp;
                const bufferEnd = bufferStart + (wrapped.duration || buffer.duration);
                const usedStart = Math.max(mediaStart, bufferStart);
                const usedEnd = Math.min(mediaEnd, bufferEnd);
                if (usedEnd <= usedStart) continue;
                const node = offline.createBufferSource();
                node.buffer = buffer;
                node.connect(originalGain);
                const when = overlapStart - chunkStart + (usedStart - mediaStart);
                node.start(when, Math.max(0, usedStart - bufferStart), usedEnd - usedStart);
              }
            }
            clipOffset = clipEnd;
          }
          const mixedBuffer = await offline.startRendering();
          await audioSource.add(mixedBuffer);
          audioProgress = (chunkIndex + 1) / chunkCount;
          updateExportProgress();
          setStatus("ترکیب صدای کلیپ‌ها و موسیقی: " + Math.round(audioProgress * 100) + "%");
        }
        audioSource.close();
      })();

      // Decode every source frame in presentation order and give it an exact
      // composition timestamp. Encoder backpressure is awaited frame by frame.
      const videoTask = (async () => {
        let compositionOffset = 0;
        let totalFrames = 0;
        const frameCounts = [];
        for (let i = 0; i < clips.length; i++) {
          const clip = clips[i];
          const meta = audioTracks[i];
          const clipLength = clip.out - clip.in;
          const rangeStart = meta.firstVideoTimestamp + clip.in;
          const rangeEnd = meta.firstVideoTimestamp + clip.out;
          setStatus("پردازش آفلاین تصویر: کلیپ " + (i + 1) + " از " + clips.length + "…");
          let frameCount = 0;
          const addFrame = async (sample, isFirst) => {
            if (!sample) return;
            try {
              const sourceTime = sample.timestamp;
              const localTime = isFirst ? 0 : Math.max(0, sourceTime - rangeStart);
              if (!isFirst && (sourceTime < rangeStart - 0.001 || sourceTime >= rangeEnd)) return;
              sample.setTimestamp(compositionOffset + localTime);
              const remaining = Math.max(0.001, clipLength - localTime);
              sample.setDuration(Math.min(Math.max(0.001, sample.duration || 1 / fps), remaining));
              await videoSource.add(sample);
              frameCount++;
              totalFrames++;
            } finally {
              sample.close();
            }
          };

          // Include the frame visible at the exact trim-in point, even when
          // that point falls between two encoded source frames.
          const firstSample = await meta.videoSink.getSample(rangeStart);
          if (!firstSample) throw new Error("فریم آغازین کلیپ «" + clip.file.name + "» قابل رمزگشایی نیست.");
          await addFrame(firstSample, true);

          for await (const sample of meta.videoSink.samples(rangeStart, rangeEnd)) {
            if (sample.timestamp <= rangeStart + 0.0005) {
              sample.close();
              continue;
            }
            await addFrame(sample, false);
          }
          if (!frameCount) throw new Error("هیچ فریمی از کلیپ «" + clip.file.name + "» پردازش نشد.");
          frameCounts.push(frameCount);
          compositionOffset += clipLength;
          videoProgress = compositionOffset / projectDuration;
          updateExportProgress();
        }
        videoSource.close();
        return { totalFrames, frameCounts };
      })();

      const [videoResult] = await Promise.all([videoTask, audioTask]);
      if (!videoResult.totalFrames) throw new Error("هیچ فریمی برای خروجی رمزگذاری نشد.");
      setStatus("در حال نهایی‌سازی فایل MP4…");
      await output.finalize();

      const buffer = output.target.buffer;
      if (!buffer || !buffer.byteLength) throw new Error("فایل MP4 خالی ساخته شد.");
      const blob = new Blob([buffer], { type: "video/mp4" });
      const validationUrl = URL.createObjectURL(blob);
      try {
        const probe = document.createElement("video");
        probe.preload = "metadata";
        const durationReady = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("بررسی مدت MP4 بیش از حد طول کشید؛ فایل ارائه نشد.")), 20000);
          probe.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
          probe.onerror = () => { clearTimeout(timer); reject(new Error("فایل MP4 ساخته‌شده قابل‌خواندن نیست؛ دانلود متوقف شد.")); };
        });
        probe.src = validationUrl;
        await durationReady;
        const actualDuration = Number(probe.duration);
        probe.removeAttribute("src");
        probe.load();
        if (!Number.isFinite(actualDuration) || actualDuration < projectDuration * 0.9) {
          throw new Error("مدت MP4 ناقص است (" + (Number.isFinite(actualDuration) ? actualDuration.toFixed(1) : "نامشخص") + " از " + projectDuration.toFixed(1) + " ثانیه). فایل ناقص ارائه نشد.");
        }
        if (MB.Input && MB.BlobSource && MB.ALL_FORMATS) {
          const checkInput = new MB.Input({ source: new MB.BlobSource(blob), formats: MB.ALL_FORMATS });
          try {
            const encodedAudioTrack = await checkInput.getPrimaryAudioTrack();
            if (!encodedAudioTrack) throw new Error("صدای MP4 در فایل نهایی ثبت نشده است؛ فایل دانلود نشد.");
          } finally { try { checkInput.dispose(); } catch (_) {} }
        }
      } finally {
        URL.revokeObjectURL(validationUrl);
      }

      if (exportUrl) URL.revokeObjectURL(exportUrl);
      exportUrl = URL.createObjectURL(blob);
      exportOutput.src = exportUrl;
      exportOutput.hidden = false;
      exportOutput.load();
      exportDownload.href = exportUrl;
      exportDownload.download = "nava-edited-video.mp4";
      exportDownload.textContent = "دریافت ویدیوی نهایی (MP4 · " + width + "×" + height + ")";
      exportDownload.hidden = false;
      exportProgress.value = 100;
      setStatus("خروجی MP4 آفلاین آماده شد · H.264 + AAC · " + width + "×" + height + " · " + videoResult.totalFrames + " فریم. بدون ضبط زنده Canvas.");
    } catch (error) {
      try { if (output && output.state !== "finalized" && output.state !== "canceled") await output.cancel(); } catch (_) {}
      setStatus(error.message || "ساخت MP4 آفلاین ناموفق بود.");
    } finally {
      openedInputs.forEach(item => { try { item.dispose(); } catch (_) {} });
      if (decodeContext && decodeContext.state !== "closed") {
        try { await decodeContext.close(); } catch (_) {}
      }
      exportButton.disabled = false;
      updateSummary();
    }
  };

  exportButton.addEventListener("click", exportFinalVideo);

  window.addEventListener("beforeunload", () => {
    stopPlayback();
    clips.forEach(clip => URL.revokeObjectURL(clip.url));
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  });
  renderTimeline();
})();