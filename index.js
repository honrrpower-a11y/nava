const ALLOWED_ORIGIN = "https://honrrpower-a11y.github.io";

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store"
    }
  });
}

function getLanguage(explicitLang) {
  const val = String(explicitLang || "fa").trim().toLowerCase();
  if (val.includes("tr") || val.includes("ترکی")) return "tr";
  if (val.includes("en") || val.includes("انگلیسی")) return "en";
  return "fa";
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsOrigin = origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ service: "Nava Unified API", status: "online" }, 200, corsOrigin);
    }

    if (origin && origin !== ALLOWED_ORIGIN) {
      return json({ error: "Origin not allowed" }, 403, corsOrigin);
    }

    // 1. مسیر ساخت ترانه با جمنای (روان، مدرن و بدون اعراب اضافی)
    if (url.pathname === "/lyrics" && request.method === "POST") {
      let input;
      try { input = await request.json(); } catch { return json({ error: "اطلاعات معتبر نیست." }, 400, corsOrigin); }

      const topic = String(input.topic || "").trim();
      const mood = String(input.mood || "احساسی").trim();
      const language = String(input.language || "fa").trim();

      if (!topic) return json({ error: "موضوع ترانه را وارد کن." }, 400, corsOrigin);
      if (!env.GEMINI_API_KEY) return json({ error: "کلید جمنای یافت نشد." }, 500, corsOrigin);

      let langName = 'فارسی';
      if (language === 'tr') langName = 'Türkçe (ترکی استانبولی)';
      if (language === 'en') langName = 'English (انگلیسی)';

      const systemPrompt = `تو یک ترانه‌سرای حرفه‌ای و مسلط به زبان (${langName}) هستی. 
بر اساس «موضوع» و «حال‌وهوا»، یک ترانه‌ی کاملاً روان، ریتمیک، مدرن و طبیعی (بدون کلمات عجیب، کتابی یا ساختگی) بنویس.

قوانین:
1. از هیچ‌گونه اعراب‌گذاری (فتحه، کسره، ضمه، تشدید) استفاده نکن.
2. ساختار ترانه شامل [Verse 1] و [Chorus] باشد.
3. هیچ‌گونه مقدمه، توضیح یا متن اضافه‌ای ننویس و فقط خود ترانه را خروجی بده.`;

      const userPrompt = `موضوع ترانه: ${topic}\nحال‌وهوا: ${mood}\nزبان مورد نظر: ${langName}`;

      try {
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
          })
        });

        const geminiData = await geminiRes.json();
        if (!geminiRes.ok) return json({ error: geminiData.error?.message || "خطا در تولید شعر" }, 500, corsOrigin);

        const lyricsText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!lyricsText) return json({ error: "پاسخی از هوش مصنوعی دریافت نشد." }, 502, corsOrigin);

        return json({ success: true, lyrics: lyricsText, finglish: lyricsText }, 200, corsOrigin);
      } catch (e) {
        return json({ error: "ارتباط با سرویس شعر ناموفق بود.", details: e.message }, 500, corsOrigin);
      }
    }

    // 2. مسیر اصلی ساخت موزیک با Ace Music
    if (url.pathname !== "/generate" || request.method !== "POST") {
      return json({ error: "Not found" }, 404, corsOrigin);
    }

    if (!env.ACEMUSIC_API_KEY) return json({ error: "کلید ACE Music پیدا نشد." }, 500, corsOrigin);

    let input;
    try { input = await request.json(); } catch { return json({ error: "اطلاعات معتبر نیست." }, 400, corsOrigin); }

    const rawLyrics = String(input.finglish || input.lyrics || input.topic || "").trim();
    let style = String(input.style || "").trim();
    const voice = String(input.voice || "male_pop").trim();
    let mood = String(input.mood || "").trim();
    const vocalLang = getLanguage(input.language);

    if (!rawLyrics) return json({ error: "متن آهنگ خالی است." }, 400, corsOrigin);

    const structuredLyrics = /\[(verse|chorus|bridge|intro|outro)/i.test(rawLyrics) ? rawLyrics : `[Verse 1]\n${rawLyrics}`;

    if (style) {
      style = style
        .replace(/Turkish baglama/gi, "Authentic Turkish Baglama saz, traditional Anatolian acoustic strings")
        .replace(/باغلاما/gi, "Turkish Baglama saz, traditional Anatolian folk acoustic strings")
        .replace(/پاپ/gi, "modern energetic Persian pop arrangement, vibrant rhythm, uplifting dance bassline")
        .replace(/سنتی/gi, "traditional Persian classical masterpiece, Santur, Setar, Tar, Tonbak")
        .replace(/راک/gi, "arena rock music, heavy electric guitars, powerful driving drums")
        .replace(/آذربایجانی/gi, "Authentic Azerbaijani Baku folk music, Qarmon accordion, Naghara and Ghaval percussion");
    } else {
      style = "modern energetic Persian pop arrangement";
    }

    let moodPrompt = mood ? `Musical Mood: ${mood}.` : "";
    let voiceDesc = "A complete song with clear energetic male lead vocals. 100% MALE singer.";
    if (voice === "male_deep") voiceDesc = "Deep baritone MALE lead vocalist, warm and low voice.";
    else if (voice === "female_pop") voiceDesc = "Soft melodic female soprano lead vocalist. 100% FEMALE singer.";

    const body = {
      model: "acemusic/acestep-v1.5-turbo",
      messages: [{ role: "user", content: `<prompt>\n${voiceDesc}\nGenre: ${style}\n${moodPrompt}\n</prompt>\n<lyrics>\n${structuredLyrics}\n</lyrics>` }],
      stream: false,
      thinking: true,
      use_format: true,
      audio_config: { 
        format: "mp3", 
        duration: 60, 
        vocal_language: vocalLang, 
        instrumental: false 
      }
    };

    try {
      const res = await fetch("https://api.acemusic.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.ACEMUSIC_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) return json({ error: data.error?.message || "خطا در ساخت موزیک" }, 500, corsOrigin);

      const audioUrl = data.choices?.[0]?.message?.audio?.[0]?.audio_url?.url;
      if (!audioUrl) return json({ error: "فایل صوتی دریافت نشد." }, 502, corsOrigin);

      return json({ success: true, audioUrl }, 200, corsOrigin);
    } catch (e) {
      return json({ error: "ارتباط با سرور موزیک ناموفق بود.", details: e.message }, 500, corsOrigin);
    }
  }
};
