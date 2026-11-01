
const ALLOWED_ORIGIN = "https://honrrpower-a11y.github.io";
const MUSIC_DURATION_SECONDS = 60;

// ==========================================
// ابزارهای عمومی
// ==========================================

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store"
    }
  });
}

function extractText(content) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map(part => typeof part === "string" ? part : part?.text || "")
      .join("")
      .trim();
  }

  return "";
}

function cleanLyrics(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function safeText(value, maxLength = 1000) {
  return String(value ?? "")
    .replace(/<\/?(?:prompt|lyrics)\b[^>]*>/gi, "")
    .replace(/[<>]/g, "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

// جدانویسی پسوندهای متصل به ه غیرملفوظ
// مثال: کافهای ← کافه ای
// خانهام ← خانه ام
// پنجرهات ← پنجره ات
function normalizePersianSpacing(text) {
  return String(text || "").replace(
    /([\u0621-\u064A]{2,})ه(ای|ام|ات|اش|ایم|اید|اند)(?=[\s،؛.!؟,:]|$)/g,
    "$1ه $2"
  );
}

// استخراج دو نسخه شعر از خروجی مدل
function parseLyricsOutput(rawText) {
  const cleaned = cleanLyrics(rawText);

  let parsed = null;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(
          cleaned.slice(firstBrace, lastBrace + 1)
        );
      } catch {
        parsed = null;
      }
    }
  }

  let lyrics = "";
  let singingLyrics = "";

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    lyrics = extractText(
      parsed.lyrics || parsed.originalLyrics || parsed.original
    );

    singingLyrics = extractText(
      parsed.singingLyrics ||
      parsed.singing_lyrics ||
      parsed.pronunciationLyrics
    );
  }

  // اگر مدل به جای JSON متن ساده برگرداند،
  // شعر از بین نمی‌رود و همان متن استفاده می‌شود.
  if (!lyrics) {
    lyrics = cleaned;
  }

  lyrics = normalizePersianSpacing(lyrics);

  if (!singingLyrics) {
    singingLyrics = lyrics;
  } else {
    singingLyrics = normalizePersianSpacing(singingLyrics);
  }

  return {
    lyrics: lyrics.trim(),
    singingLyrics: singingLyrics.trim()
  };
}

// ==========================================
// صدای خواننده
// این تنظیمات عمداً حفظ شده‌اند.
// ==========================================

function getVoiceDescription(voice) {
  const voices = {
    male_pop:
      "A youthful male pop lead vocal with a clear, bright tone, confident melodic delivery and natural pronunciation.",

    male_deep:
      "A warm mellow male baritone lead vocal, rich low-mid register, smooth intimate delivery, controlled dynamics. Avoid an excessively deep or muddy voice.",

    male_raspy:
      "An expressive male lead vocal with a naturally textured husky tone and subtle controlled rasp. Emotional but clear and intelligible.",

    female_pop:
      "A clear, bright and gentle female pop lead vocal, smooth tone, expressive phrasing and natural pronunciation.",

    female_powerful:
      "A powerful expressive female lead vocal with strong projection, confident sustained notes and controlled emotional intensity.",

    duet:
      "A male and female vocal duet with clearly distinguishable voices, alternating lead lines and tasteful harmonies in the chorus.",

    instrumental:
      "Instrumental music only. Absolutely no singing, no spoken voice, no humming and no vocal samples."
  };

  return voices[voice] || voices.male_pop;
}

// ==========================================
// حال‌وهوای موسیقی
// ==========================================

function getMoodDescription(mood) {
  const moods = {
    emotional:
      "Deeply emotional and expressive atmosphere, memorable melodic phrasing and dynamic development.",

    happy:
      "Joyful, upbeat and optimistic atmosphere, lively rhythm and bright melodic energy.",

    sad:
      "Melancholic and wistful atmosphere, tender expressive melody and restrained dynamics.",

    romantic:
      "Warm intimate romantic atmosphere, lyrical melody and gentle emotional expression.",

    epic:
      "Grand cinematic and majestic atmosphere, dramatic build-up and powerful musical impact.",

    calm:
      "Peaceful, soothing and spacious atmosphere, gentle dynamics and relaxed pacing.",

    energetic:
      "High-energy powerful atmosphere, driving rhythm, strong groove and lively momentum."
  };

  return moods[mood] || "";
}

// ==========================================
// زبان خوانندگی
// ==========================================

function getLanguageName(language) {
  const languages = {
    fa: "Persian (Farsi)",
    tr: "Turkish (Istanbul Turkish)",
    en: "English"
  };

  return languages[language] || "Persian (Farsi)";
}

// ==========================================
// ساخت پرامپت شعر
// ==========================================

function buildLyricsPrompt(topic, style, language) {
  return `
تو یک ترانه‌سرای حرفه‌ای، خلاق و مسلط به ترانه‌سرایی موسیقایی هستی.

برای موضوع زیر یک ترانه کامل، منسجم، احساسی و قابل اجرا بساز.

مشخصات:
موضوع: ${topic}
سبک و حال‌وهوای ترانه: ${style}
زبان: ${language}

اصول ترانه‌سرایی:

۱. داستان و مفهوم:
- ترانه باید یک موضوع مرکزی مشخص داشته باشد.
- از ابتدا تا انتها مسیر احساسی منسجم داشته باشد.
- هر بند تصویر یا احساس تازه‌ای اضافه کند.
- از تکرار بی‌هدف مفهوم خودداری کن.

۲. زبان:
- از زبان طبیعی، روان و زنده استفاده کن.
- جمله‌ها هنگام خواندن با صدای بلند طبیعی باشند.
- از عبارت‌های مصنوعی و ترکیب‌های بی‌معنی دوری کن.
- هیچ کلمه‌ای را فقط برای تکمیل قافیه وارد نکن.

۳. قافیه و وزن:
- قافیه‌ها طبیعی و گوش‌نواز باشند.
- طول سطرها برای اجرای موسیقایی مناسب باشد.
- روانی و معنای درست از قافیه اجباری مهم‌تر است.

۴. تصویرسازی:
- از تصاویر ملموس و جزئیات واقعی استفاده کن.
- از کلیشه‌های تکراری و عبارت‌های مصرف‌شده دوری کن.
- احساس را با تصویر و موقعیت منتقل کن.

۵. ترجیع‌بند:
- بخش به‌یادماندنی و احساسی ترانه باشد.
- جمله محوری مشخص و قابل زمزمه داشته باشد.
- ساده، قدرتمند و ماندگار باشد.

۶. ساختار:

[Verse 1]
معرفی موضوع و موقعیت.

[Pre-Chorus]
افزایش تدریجی احساس.

[Chorus]
پیام اصلی و بخش ماندگار.

[Verse 2]
ادامه داستان با تصاویر تازه.

[Bridge]
تغییر احساسی یا نگاه متفاوت.

[Final Chorus]
بازگشت به ترجیع‌بند با همان متن اصلی.

۷. کنترل کیفیت:
- تمام جمله‌ها باید معنی روشن داشته باشند.
- فارسی باید طبیعی و خوش‌آهنگ باشد.
- قافیه‌ها نباید تصنعی باشند.
- سطرها باید قابلیت خوانده شدن روی موسیقی داشته باشند.
- از تکرار بی‌هدف خودداری کن.

قوانین ویژه زبان فارسی:

اگر زبان ترانه فارسی است:

الف) دو نسخه کاملاً هماهنگ بساز:

نسخه اول با نام lyrics:
- متن معمولی و خوانا برای نمایش به کاربر.
- بدون اعراب‌گذاری اضافی.
- ساختار و واژه‌های طبیعی فارسی.

نسخه دوم با نام singingLyrics:
- دقیقاً همان شعر و همان کلمات نسخه اول.
- فقط کلمات دشوار، چندخوانشی یا دارای تلفظ احتمالی اشتباه را با اعراب لازم مشخص کن.
- تمام شعر را اعراب‌گذاری نکن.
- اعراب‌گذاری باید با توجه به معنای جمله باشد.
- کلمات ساده و واضح را بدون اعراب نگه دار.
- هیچ کلمه‌ای را تغییر نده و هیچ سطری را حذف یا اضافه نکن.

ب) جدانویسی «ه» غیرملفوظ:
وقتی کلمه‌ای به «ه» غیرملفوظ ختم می‌شود و پسوند یا واژه‌ای مانند «ای»، «ام»، «ات»، «اش»، «ایم»، «اید» یا «اند» به آن می‌پیوندد، آن‌ها را جدا بنویس.

نمونه:
کافهای ← کافه ای
خانهام ← خانه ام
پنجرهات ← پنجره ات
خستهام ← خسته ام
قصهام ← قصه ام

این قاعده را در هر دو نسخه رعایت کن.
این جدانویسی نباید باعث تغییر معنای کلمات شود.

اگر زبان ترکی یا انگلیسی است:
- هر دو نسخه باید از نظر متن یکسان باشند.
- اعراب فارسی به آن‌ها اضافه نکن.

قوانین خروجی بسیار مهم:
- فقط یک JSON معتبر برگردان.
- هیچ مقدمه یا توضیحی بیرون از JSON ننویس.
- از Markdown و کدبلاک استفاده نکن.
- ساختار دقیقاً این باشد:

{
  "lyrics": "متن کامل شعر اصلی",
  "singingLyrics": "همان شعر با اعراب‌گذاری انتخابی برای خوانندگی"
}

تمام خطوط شعر و برچسب‌های بخش‌ها را در هر دو نسخه حفظ کن.
`;
}

// ==========================================
// Worker
// ==========================================

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    const corsOrigin =
      origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "*";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    const url = new URL(request.url);

    // ==========================================
    // ۱. ساخت شعر با Gemini و پشتیبان OpenRouter
    // ==========================================

    if (
      url.pathname === "/generate-lyrics" &&
      request.method === "POST"
    ) {
      let input;

      try {
        input = await request.json();
      } catch {
        return json(
          { error: "اطلاعات ارسالی نامعتبر است." },
          400,
          corsOrigin
        );
      }

      const topic = safeText(input.topic || "", 500);
      const style = safeText(input.style || "پاپ", 100);
      const language = ["fa", "tr", "en"].includes(input.language)
        ? input.language
        : "fa";

      if (!topic) {
        return json(
          { error: "موضوع شعر نمی‌تواند خالی باشد." },
          400,
          corsOrigin
        );
      }

      const prompt = buildLyricsPrompt(topic, style, language);

      let geminiError = "";

      // ------------------------------------------
      // مرحله اول: Gemini
      // در حالت موفق فقط یک درخواست ارسال می‌شود.
      // ------------------------------------------

      if (env.GEMINI_API_KEY) {
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${env.GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [{ text: prompt }]
                  }
                ],
                generationConfig: {
                  temperature: 0.85,
                  maxOutputTokens: 3000,
                  responseMimeType: "application/json"
                }
              })
            }
          );

          const data = await geminiRes.json();

          if (geminiRes.ok) {
            const rawLyrics = extractText(
              data.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("")
            );

            const result = parseLyricsOutput(rawLyrics);

            if (result.lyrics) {
              return json(
                {
                  success: true,
                  lyrics: result.lyrics,
                  singingLyrics: result.singingLyrics,
                  provider: "Gemini"
                },
                200,
                corsOrigin
              );
            }

            geminiError = "جمنای متن معتبری تولید نکرد.";
          } else {
            geminiError =
              data.error?.message ||
              `خطای Gemini با کد ${geminiRes.status}`;
          }

        } catch (e) {
          geminiError = e.message || "خطای ارتباط با Gemini";
        }

      } else {
        geminiError = "کلید GEMINI_API_KEY تنظیم نشده است.";
      }

      // ------------------------------------------
      // مرحله دوم: OpenRouter
      // فقط در صورت شکست Gemini
      // ------------------------------------------

      if (!env.OPENROUTER_API_KEY) {
        return json(
          {
            error: "ساخت شعر با Gemini ناموفق بود و کلید OpenRouter نیز تنظیم نشده است.",
            geminiError
          },
          502,
          corsOrigin
        );
      }

      try {
        const routerRes = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://honrrpower-a11y.github.io/nava/",
              "X-OpenRouter-Title": "Nava AI"
            },
            body: JSON.stringify({
              model: "qwen/qwen3-8b:free",
              messages: [
                {
                  role: "user",
                  content: prompt
                }
              ],
              temperature: 0.85,
              max_tokens: 3000,
              stream: false
            })
          }
        );

        const rawText = await routerRes.text();

        let routerData;

        try {
          routerData = JSON.parse(rawText);
        } catch {
          return json(
            {
              error: "پاسخ OpenRouter قابل پردازش نیست.",
              geminiError,
              routerStatus: routerRes.status
            },
            502,
            corsOrigin
          );
        }

        if (!routerRes.ok || routerData.error) {
          return json(
            {
              error: "ساخت شعر با هر دو سرویس ناموفق بود.",
              geminiError,
              openRouterError:
                routerData.error?.message ||
                `خطای OpenRouter با کد ${routerRes.status}`
            },
            502,
            corsOrigin
          );
        }

        const rawLyrics = extractText(
          routerData.choices?.[0]?.message?.content
        );

        const result = parseLyricsOutput(rawLyrics);

        if (!result.lyrics) {
          return json(
            {
              error: "OpenRouter هم متن معتبری تولید نکرد.",
              geminiError
            },
            502,
            corsOrigin
          );
        }

        return json(
          {
            success: true,
            lyrics: result.lyrics,
            singingLyrics: result.singingLyrics,
            provider: "OpenRouter - Qwen3 8B"
          },
          200,
          corsOrigin
        );

      } catch (e) {
        return json(
          {
            error: "ارتباط با هر دو سرویس ساخت شعر ناموفق بود.",
            geminiError,
            openRouterError: e.message
          },
          502,
          corsOrigin
        );
      }
    }

    // ==========================================
    // ۲. ساخت آهنگ با ACE Music
    // ==========================================

    if (
      url.pathname === "/generate-music" &&
      request.method === "POST"
    ) {
      const apiKey = env.ACEMUSIC_API_KEY;

      if (!apiKey) {
        return json(
          { error: "کلید ACEMUSIC_API_KEY تنظیم نشده است." },
          500,
          corsOrigin
        );
      }

      let input;

      try {
        input = await request.json();
      } catch {
        return json(
          { error: "فرمت اطلاعات ارسالی نامعتبر است." },
          400,
          corsOrigin
        );
      }

      // دریافت متن اصلی و نسخه خوانندگی
      const originalLyrics = normalizePersianSpacing(
        safeText(input.lyrics || "", 8000)
      );

      const suppliedSingingLyrics = normalizePersianSpacing(
        safeText(input.singingLyrics || "", 8000)
      );

      const singingLyrics =
        suppliedSingingLyrics || originalLyrics;

      const voice = safeText(input.voice || "male_pop", 40);
      const style = safeText(input.style || "Modern pop", 300);
      const musicMood = safeText(input.musicMood || "emotional", 30);
      const extraMood = safeText(input.mood || "", 500);

      const instruments = safeText(
        input.instruments || "",
        300
      );

      const pronunciationNotes = safeText(
        input.pronunciationNotes || "",
        1200
      );

      const language = ["fa", "tr", "en"].includes(input.language)
        ? input.language
        : "fa";

      const instrumental = voice === "instrumental";

      if (!instrumental && !singingLyrics) {
        return json(
          { error: "متن ترانه خالی است. ابتدا شعر را وارد کن." },
          400,
          corsOrigin
        );
      }

      // ------------------------------------------
      // تفکیک ساز اصلی و سازهای همراه
      // اولین ساز واردشده = ساز اصلی
      // ------------------------------------------

      const instrumentList = instruments
        .split(/[,،;؛\n]+/)
        .map(item => item.trim())
        .filter(Boolean);

      const leadInstrument = instrumentList[0] || "";
      const supportingInstruments = instrumentList.slice(1);

      // ------------------------------------------
      // ساخت توضیحات موسیقی
      // صدای خواننده و حس قبلی حفظ شده‌اند.
      // ------------------------------------------

      const promptParts = [
        "Create a complete, coherent, professionally arranged song.",

        `Music style and genre: ${style}.`,

        getMoodDescription(musicMood),

        getVoiceDescription(voice),

        leadInstrument
          ? `PRIMARY FEATURED INSTRUMENT: ${leadInstrument}. This is the main requested instrument. Make its identity unmistakable and clearly audible. It must play a recognizable melodic hook, not merely a faint background layer. Feature it in the introduction and in instrumental passages between vocal sections. Do not replace it with another instrument.`
          : "",

        supportingInstruments.length
          ? `SUPPORTING INSTRUMENTS: ${supportingInstruments.join(", ")}. Use these as clearly identifiable supporting instruments in the arrangement. Give each one an audible musical role while keeping ${leadInstrument} as the main featured instrument.`
          : "",

        instruments
          ? "Instrument arrangement priority: use the exact requested instruments. Do not silently substitute unrelated instruments. Keep the main instrument prominent in the mix and preserve a natural, musical balance."
          : "Choose instruments and arrangement that naturally fit the selected music genre.",

        extraMood
          ? `Additional musical direction: ${extraMood}.`
          : "",

        `The vocal language must be ${getLanguageName(language)}.`,

        suppliedSingingLyrics
          ? "Sing the supplied pronunciation-ready lyrics exactly as written. Respect all supplied Persian vowel diacritics and word spacing. Do not remove diacritics or merge separated words."
          : "For Persian lyrics, infer the correct pronunciation of ambiguous words from their sentence context. Pay special attention to Persian words ending in silent he (ه) when followed by suffixes. Read the words naturally and correctly. Do not invent or change lyric words.",

        pronunciationNotes
          ? `Additional pronunciation instructions: ${pronunciationNotes}. Follow these instructions carefully. Preserve the supplied lyrics.`
          : "",

        instrumental
          ? "Instrumental-only music. No singing, no spoken words, no humming and no vocal samples."
          : "The lead vocal must remain clearly audible, emotionally expressive and balanced with the instruments. Preserve the natural vocal character and make every lyric line intelligible.",

        "Create a well-developed musical arrangement with a memorable introduction, a clear main melodic section, musical transitions between vocal sections, dynamic development and a satisfying ending.",

        "The featured lead instrument must have audible melodic moments between vocal lines. Do not let the vocal cover the main instrument.",

        "Avoid an abrupt ending."
      ].filter(Boolean);

      const musicPrompt = promptParts.join(" ");

      // جدا نگه داشتن توضیحات موسیقی و متن ترانه
      const messageContent = instrumental
        ? `<prompt>\n${musicPrompt}\n</prompt>`
        : `<prompt>\n${musicPrompt}\n</prompt>\n<lyrics>\n${singingLyrics}\n</lyrics>`;

      // مدت درخواستی: ۶۰ ثانیه
      const body = {
        model: "acemusic/acestep-v1.5-turbo",

        messages: [
          {
            role: "user",
            content: messageContent
          }
        ],

        stream: false,

        audio_config: {
          format: "mp3",
          duration: MUSIC_DURATION_SECONDS,
          vocal_language: language,
          instrumental: instrumental
        }
      };

      try {
        const res = await fetch(
          "https://api.acemusic.ai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          }
        );

        const rawText = await res.text();

        let data;

        try {
          data = JSON.parse(rawText);
        } catch {
          return json(
            {
              error: "پاسخ سرور Ace Music غیرقابل پردازش است.",
              details: rawText.slice(0, 1500),
              status: res.status
            },
            502,
            corsOrigin
          );
        }

        if (!res.ok) {
          const errorDetails =
            data.error?.message ||
            data.error?.detail ||
            data.message ||
            JSON.stringify(data);

          return json(
            {
              error: `خطای Ace Music (${res.status})`,
              details: errorDetails,
              status: res.status
            },
            502,
            corsOrigin
          );
        }

        // استخراج لینک فایل صوتی
        const message = data.choices?.[0]?.message;
        const audioItem = message?.audio?.[0];

        const audioUrl =
          audioItem?.audio_url?.url ||
          audioItem?.url ||
          data.audioUrl ||
          data.audio_url;

        if (typeof audioUrl !== "string" || !audioUrl) {
          return json(
            {
              error: "پاسخ دریافت شد اما لینک فایل صوتی در آن نبود.",
              details: "ساختار پاسخ صوتی با قالب مورد انتظار مطابقت ندارد.",
              raw: data
            },
            502,
            corsOrigin
          );
        }

        return json(
          {
            success: true,
            audioUrl: audioUrl,
            requestedDuration: MUSIC_DURATION_SECONDS
          },
          200,
          corsOrigin
        );

      } catch (e) {
        return json(
          {
            error: "خطای پردازش در ارتباط با سرور موزیک",
            details: e.message
          },
          500,
          corsOrigin
        );
      }
    }

    return json(
      { error: "Not found" },
      404,
      corsOrigin
    );
  }
};
