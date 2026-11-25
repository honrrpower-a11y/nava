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
  const status = $("navaEditorStatus");
  const totalLabel = $("navaEditorTotal");
  const audioLabel = $("navaEditorAudioLabel");
  const audio = $("navaEditorAudioPlayer");
  const playButton = $("navaEditorPlay");
  const stopButton = $("navaEditorStop");
  const clearButton = $("navaEditorClear");
  const audioVolume = $("navaEditorAudioVolume");
  let clips = [];
  let audioFile = null;
  let audioUrl = "";
  let selectedId = null;
  let playing = false;
  let playToken = 0;
  let currentIndex = -1;
  let clipSequence = 0;

  const fmt = value => {
    const n = Math.max(0, Number(value) || 0);
    const m = Math.floor(n / 60);
    return String(m).padStart(2, "0") + ":" + (n % 60).toFixed(1).padStart(4, "0");
  };
  const totalDuration = () => clips.reduce((sum, clip) => sum + Math.max(0, clip.out - clip.in), 0);
  const setStatus = message => { status.textContent = message; };
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
  const selectClip = clip => {
    if (!clip) return;
    stopPlayback();
    selectedId = clip.id;
    preview.onloadedmetadata = () => {
      try { preview.currentTime = clip.in; } catch (_) {}
    };
    preview.src = clip.url;
    preview.load();
    renderTimeline();
    setStatus("کلیپ انتخاب‌شده: " + clip.file.name + " — بازهٔ قابل‌پخش را از فیلدهای شروع و پایان تنظیم کن.");
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
    selectedId = clip.id;
    renderTimeline();
    preview.pause();
    try {
      const metadataReady = new Promise((resolve, reject) => {
        preview.onloadedmetadata = resolve;
        preview.onerror = () => reject(new Error("پخش یکی از کلیپ‌ها ممکن نیست: " + clip.file.name));
      });
      preview.src = clip.url;
      preview.load();
      await metadataReady;
      if (token !== playToken) return;
      preview.currentTime = clip.in;
      await new Promise(resolve => {
        if (Math.abs(preview.currentTime - clip.in) < 0.08) return resolve();
        const done = () => { preview.removeEventListener("seeked", done); resolve(); };
        preview.addEventListener("seeked", done, { once: true });
        setTimeout(done, 1200);
      });
      if (token !== playToken) return;
      await preview.play();
    } catch (error) {
      stopPlayback();
      setStatus(error.message || "پخش این کلیپ در مرورگر ممکن نیست.");
    }
  };
  const advanceIfNeeded = () => {
    if (!playing || currentIndex < 0) return;
    const clip = clips[currentIndex];
    if (!clip || preview.currentTime >= clip.out - 0.06 || preview.ended) {
      const next = currentIndex + 1;
      playFrom(next, playToken);
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
    audioFile = file;
    audioUrl = URL.createObjectURL(file);
    audio.src = audioUrl;
    audio.volume = Number(audioVolume.value) / 100;
    audioLabel.textContent = file.name;
    updateSummary();
    setStatus("موسیقی به پروژه اضافه شد. صدای اصلی کلیپ‌ها در این مرحله بدون تغییر باقی می‌ماند.");
  });
  audioVolume.addEventListener("input", () => { audio.volume = Number(audioVolume.value) / 100; });
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
    const startField = card.querySelector('[data-trim="in"]');
    const endField = card.querySelector('[data-trim="out"]');
    startField.max = Math.max(0.1, clip.out - 0.1).toFixed(1);
    endField.min = Math.min(clip.duration, clip.in + 0.1).toFixed(1);
    startField.value = clip.in.toFixed(1);
    endField.value = clip.out.toFixed(1);
    card.querySelector('[data-trim-value="in"]').textContent = fmt(clip.in);
    card.querySelector('[data-trim-value="out"]').textContent = fmt(clip.out);
    card.querySelector("[data-trim-duration]").textContent = fmt(clip.out - clip.in);
    card.querySelector(".nava-editor-clip-duration").textContent = fmt(clip.out - clip.in);
    totalLabel.textContent = clips.length + " کلیپ · " + fmt(totalDuration());
    if (selectedId === clip.id && !playing) {
      const target = field.dataset.trim === "in" ? clip.in : Math.min(clip.out, preview.currentTime);
      if (Math.abs(preview.currentTime - target) > 0.15) preview.currentTime = target;
    }
    setStatus("برش زنده: " + fmt(clip.out - clip.in) + " از " + clip.file.name);
  });
  playButton.addEventListener("click", () => {
    if (!clips.length) return;
    stopPlayback();
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
  window.addEventListener("beforeunload", () => {
    stopPlayback();
    clips.forEach(clip => URL.revokeObjectURL(clip.url));
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  });
  renderTimeline();
})();