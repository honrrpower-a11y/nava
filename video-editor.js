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
      const clip = { id: "clip-" + (++clipSequence), file, url, duration, in: 0, out: duration };
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

  const exportFinalVideo = async () => {
    if (!clips.length || exportButton.disabled) return;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      setStatus("مرورگر این گوشی ابزار لازم برای ساخت فایل ویدئویی را پشتیبانی نمی‌کند. لطفاً از Chrome یا مرورگر به‌روز استفاده کن.");
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
    setStatus("در حال آماده‌سازی موتور خروجی…");

    let recorder = null;
    let audioContext = null;
    let canvasStream = null;
    let combinedStream = null;
    let musicStarted = false;
    try {
      const canvas = document.createElement("canvas");
      // Mobile-safe render profile: reduce decoder, canvas and encoder pressure.
      canvas.width = 720;
      canvas.height = 405;
      const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
      if (!ctx) throw new Error("امکان ساخت بوم ویدئو در این مرورگر وجود ندارد.");
      canvasStream = canvas.captureStream(15);

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("این مرورگر ابزار لازم برای میکس صدای خروجی را ندارد.");
      if (!exportAudioContext) {
        exportAudioContext = new AudioContextClass();
        exportRecordDestination = exportAudioContext.createMediaStreamDestination();
      }
      audioContext = exportAudioContext;
      await audioContext.resume();

      // Prefer the browser's native media capture for the source video's audio.
      // This avoids routing every decoded audio sample through WebAudio on mobile.
      let previewCaptureStream = null;
      let sourceAudioTracks = [];
      const capturePreviewAudio = preview.captureStream || preview.mozCaptureStream;
      if (typeof capturePreviewAudio === "function") {
        try {
          previewCaptureStream = capturePreviewAudio.call(preview);
          sourceAudioTracks = previewCaptureStream.getAudioTracks().filter(track => track.readyState === "live");
        } catch (_) {
          previewCaptureStream = null;
          sourceAudioTracks = [];
        }
      }

      // WebAudio is used only for optional music mixing, not for the original clip audio.
      if (audioFile) {
        if (!exportMusicSource) {
          exportMusicSource = audioContext.createMediaElementSource(audio);
          exportMusicGain = audioContext.createGain();
          exportMusicSource.connect(exportMusicGain);
          exportMusicGain.connect(exportRecordDestination);
        }
        exportMusicGain.gain.value = Math.max(0, Math.min(1, Number(audioVolume.value) / 100));
      }

      // Fallback for browsers that do not expose an audio track from captureStream().
      if (!sourceAudioTracks.length) {
        if (!exportPreviewGain) {
          const previewSource = audioContext.createMediaElementSource(preview);
          exportPreviewGain = audioContext.createGain();
          exportPreviewGain.gain.value = 1;
          previewSource.connect(exportPreviewGain);
          exportPreviewGain.connect(exportRecordDestination);
          exportPreviewGain.connect(audioContext.destination);
        }
      }

      combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...(sourceAudioTracks.length ? sourceAudioTracks : exportRecordDestination.stream.getAudioTracks())
      ]);

      const mimeCandidates = [
        "video/mp4;codecs=avc1.42E01E",
        "video/mp4",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm"
      ];
      const mimeType = mimeCandidates.find(type => MediaRecorder.isTypeSupported(type)) || "";
      recorder = new MediaRecorder(combinedStream, mimeType ? { mimeType, videoBitsPerSecond: 1000000, audioBitsPerSecond: 128000 } : { videoBitsPerSecond: 1000000, audioBitsPerSecond: 128000 });
      const chunks = [];
      recorder.ondataavailable = event => { if (event.data && event.data.size) chunks.push(event.data); };
      const recordingStopped = new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = () => reject(new Error("ضبط ویدیوی نهایی ناموفق بود."));
      });
      recorder.start(1000);

      const drawFrame = () => {
        const vw = preview.videoWidth || 16;
        const vh = preview.videoHeight || 9;
        const scale = Math.min(canvas.width / vw, canvas.height / vh);
        const width = vw * scale;
        const height = vh * scale;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(preview, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      };

      if (audioFile) {
        audio.loop = true;
        audio.currentTime = 0;
        // The music element feeds a dedicated WebAudio recording track.
        audio.volume = 1;
        await audio.play();
        musicStarted = true;
      }

      let completedDuration = 0;
      for (let index = 0; index < clips.length; index++) {
        const clip = clips[index];
        setStatus("در حال ساخت خروجی: کلیپ " + (index + 1) + " از " + clips.length);
        preview.pause();
        preview.src = clip.url;
        const metadataReady = waitForMediaEvent(preview, "loadedmetadata");
        preview.preload = "auto";
        preview.load();
        await metadataReady;
        await waitForVideoData(preview);
        await seekVideo(preview, clip.in);
        await waitForVideoData(preview);
        await waitForPresentedFrame(preview);
        await preview.play();

        await new Promise((resolve, reject) => {
          let raf = 0;
          let frameCallback = 0;
          let watchdog = 0;
          let lastMediaTime = preview.currentTime;
          let lastProgressAt = Date.now();
          let settled = false;
          const cleanup = () => {
            if (raf) cancelAnimationFrame(raf);
            if (watchdog) clearInterval(watchdog);
            if (frameCallback && typeof preview.cancelVideoFrameCallback === "function") {
              try { preview.cancelVideoFrameCallback(frameCallback); } catch (_) {}
            }
          };
          const finish = error => {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) reject(error); else resolve();
          };
          const updateProgress = () => {
            const clipProgress = Math.max(0, Math.min(clip.out - clip.in, preview.currentTime - clip.in));
            exportProgress.value = Math.round(((completedDuration + clipProgress) / projectDuration) * 100);
            if (preview.currentTime > lastMediaTime + 0.015) {
              lastMediaTime = preview.currentTime;
              lastProgressAt = Date.now();
            }
            if (preview.currentTime >= clip.out - 0.035 || preview.ended) finish();
          };
          const draw = () => {
            try {
              if (preview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && preview.videoWidth > 0) drawFrame();
              updateProgress();
            } catch (error) { finish(error); }
          };
          if (typeof preview.requestVideoFrameCallback === "function") {
            let lastDrawAt = 0;
            const onFrame = now => {
              if (settled) return;
              // Limit canvas work to the 15 fps output cadence, even if source is 30/60 fps.
              if (!lastDrawAt || now - lastDrawAt >= 66) {
                draw();
                lastDrawAt = now;
              } else {
                updateProgress();
              }
              if (!settled) frameCallback = preview.requestVideoFrameCallback(onFrame);
            };
            frameCallback = preview.requestVideoFrameCallback(onFrame);
          } else {
            let lastDrawAt = 0;
            const tick = now => {
              if (settled) return;
              if (now - lastDrawAt >= 66) { draw(); lastDrawAt = now; }
              else updateProgress();
              if (!settled) raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
          }
          watchdog = setInterval(() => {
            if (settled) return;
            updateProgress();
            if (Date.now() - lastProgressAt > 7000 && preview.currentTime < clip.out - 0.035) {
              finish(new Error("حرکت تصویر هنگام خروجی متوقف شد. برای جلوگیری از فایل خراب، ساخت خروجی متوقف شد؛ ویدئوی کوتاه‌تر یا MP4 با کدک H.264 را امتحان کن."));
            }
          }, 1000);
        });
        preview.pause();
        completedDuration += clip.out - clip.in;
      }

      drawFrame();
      if (musicStarted) audio.pause();
      if (recorder.state !== "inactive") recorder.stop();
      await recordingStopped;
      const blobType = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunks, { type: blobType });
      if (!blob.size) throw new Error("فایل خروجی خالی ساخته شد؛ دوباره تلاش کن.");
      if (exportUrl) URL.revokeObjectURL(exportUrl);
      exportUrl = URL.createObjectURL(blob);
      exportOutput.src = exportUrl;
      exportOutput.hidden = false;
      exportOutput.load();
      const extension = blobType.includes("mp4") ? "mp4" : "webm";
      exportDownload.href = exportUrl;
      exportDownload.download = "nava-edited-video." + extension;
      exportDownload.textContent = "دریافت ویدیوی نهایی (" + extension.toUpperCase() + ")";
      exportDownload.hidden = false;
      exportProgress.value = 100;
      setStatus("ویدیوی نهایی آماده شد. می‌توانی پیش‌نمایش کنی یا فایل را دریافت کنی.");
    } catch (error) {
      if (recorder && recorder.state !== "inactive") {
        try { recorder.stop(); } catch (_) {}
      }
      setStatus(error.message || "ساخت ویدیوی نهایی ناموفق بود.");
    } finally {
      if (musicStarted) audio.pause();
      preview.pause();
      if (canvasStream) canvasStream.getTracks().forEach(track => track.stop());
      if (combinedStream) combinedStream.getTracks().forEach(track => track.stop());
      if (typeof previewCaptureStream !== "undefined" && previewCaptureStream) {
        previewCaptureStream.getTracks().forEach(track => track.stop());
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