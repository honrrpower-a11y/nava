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
  if (typeof content === "string") return content.trim();

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

function normalizePersianSpacing(text) {
  return String(text || "").replace(
    /([\u0621-\u064A]{2,})ه(ای|ام|ات|اش|ایم|اید|اند)(?=[\s،؛.!؟,:]|$)/g,
    "$1ه $2"
  );
}

// ==========================================
// استخراج دو نسخه شعر
// ==========================================

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
        parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
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

  if (!lyrics) lyrics = cleaned;

  lyrics = normalizePersianSpacing(lyrics);

  singingLyrics = singingLyrics
    ? normalizePersianSpacing(singingLyrics)
    : lyrics;

  return {
    lyrics: lyrics.trim(),
    singingLyrics: singingLyrics.trim()
  };
}

// ==========================================
// کنترل صدای خواننده
// ==========================================

const VALID_VOICES = [
  "male_pop",
  "male_deep",
  "male_raspy",
  "female_pop",
  "female_powerful",
  "duet",
  "instrumental"
];

function normalizeVoice(value) {
  return VALID_VOICES.includes(value) ? value : "male_pop";
}

function getVoiceDescription(voice) {
  const voices = {
    male_pop:
      "Solo male pop lead vocal, one consistent male singer throughout the entire song. Bright, clear and youthful male voice. No duet or female lead vocals.",

    male_deep:
      "Solo male baritone lead vocal, one consistent deep, warm and mature male singer throughout the entire song. No duet or female lead vocals.",

    male_raspy:
      "Solo male lead vocal, one consistent expressive male singer throughout the entire song, with a natural subtle husky texture. No duet or female lead vocals.",

    female_pop:
      "Solo female pop lead vocal, one consistent clear and expressive female singer throughout the entire song. No duet or male lead vocals.",

    female_powerful:
      "Solo powerful female lead vocal, one consistent expressive female singer throughout the entire song. No duet or male lead vocals.",

    duet:
      "Male and female duet with two distinct, consistent singers. Let them alternate naturally and sing together where musically appropriate.",

    instrumental:
      "Instrumental music only, without singing or spoken vocals."
  };

  return voices[voice] || voices.male_pop;
}

// ==========================================
// حال‌وهوای موسیقی
// ==========================================

function getMoodDescription(mood) {
  const moods = {
    emotional:
      "Deep emotional atmosphere, expressive melody and natural dynamic development.",

    happy:
      "Joyful upbeat atmosphere, bright melody and lively rhythm.",

    sad:
      "Melancholic atmosphere, tender expressive melody and restrained dynamics.",

    romantic:
      "Warm intimate romantic atmosphere, lyrical melody and gentle expression.",

    epic:
      "Grand cinematic atmosphere, dramatic development and powerful musical impact.",

    calm:
      "Peaceful soothing atmosphere, gentle dynamics and relaxed pacing.",

    energetic:
      "High-energy atmosphere, driving rhythm, strong groove and lively momentum."
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
// ساخت سبک نهایی موسیقی برای UdioAPI
// ==========================================

function buildUdioStyle(settings) {
  const parts = [
    settings.style,
    getMoodDescription(settings.musicMood),
    settings.extraMood,
    getVoiceDescription(settings.voice),
    settings.instrumentPrompt,
    settings.pronunciationNotes
      ? `Pronunciation instructions: ${settings.pronunciationNotes}`
      : "",
    "Professional studio-quality production, clear vocals, balanced mix, memorable melody, natural song structure, tasteful instrumental introduction and proper musical ending."
  ].filter(Boolean);

  return parts.join(" ").slice(0, 1000);
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
    // ۱. ساخت شعر
    // این بخش بدون تغییر از نسخه قبلی حفظ شده
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

      // Gemini

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

      // OpenRouter فقط در صورت شکست Gemini

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
            error: "ارتباط با سرویس ساخت شعر ناموفق بود.",
            geminiError,
            openRouterError: e.message
          },
          502,
          corsOrigin
        );
      }
    }

    // ==========================================
    // ۲. ساخت موسیقی با UdioAPI
    // ACE در این نسخه اجرا نمی‌شود
    // ==========================================

    if (
      url.pathname === "/generate-music" &&
      request.method === "POST"
    ) {
      const apiKey = env.UDIO_API_KEY;

      if (!apiKey) {
        return json(
          {
            success: false,
            error: "کلید UDIO_API_KEY در تنظیمات Worker ثبت نشده است."
          },
          500,
          corsOrigin
        );
      }

      let input;

      try {
        input = await request.json();
      } catch {
        return json(
          {
            success: false,
            error: "فرمت اطلاعات ارسالی نامعتبر است."
          },
          400,
          corsOrigin
        );
      }

      const originalLyrics = normalizePersianSpacing(
        safeText(input.lyrics || "", 8000)
      );

      const suppliedSingingLyrics = normalizePersianSpacing(
        safeText(input.singingLyrics || "", 8000)
      );

      const singingLyrics =
        suppliedSingingLyrics || originalLyrics;

      const voice = normalizeVoice(
        safeText(input.voice || "male_pop", 40)
      );

      const style = safeText(
        input.style || "Modern pop",
        300
      );

      const musicMood = safeText(
        input.musicMood || "emotional",
        30
      );

      const extraMood = safeText(
        input.mood || "",
        500
      );

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
          {
            success: false,
            error: "متن ترانه خالی است. ابتدا شعر را وارد کن."
          },
          400,
          corsOrigin
        );
      }

      if (!instrumental && singingLyrics.length > 5000) {
        return json(
          {
            success: false,
            error: "متن ترانه بیش از محدودیت ۵۰۰۰ کاراکتری UdioAPI است. لطفاً شعر را کوتاه‌تر کن."
          },
          400,
          corsOrigin
        );
      }

      // ------------------------------------------
      // پردازش سازها
      // ------------------------------------------

      const instrumentList = instruments
        .split(/[,،;؛\n]+/)
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 8);

      const leadInstrument = instrumentList[0] || "";
      const supportingInstruments = instrumentList.slice(1);

      let instrumentPrompt = "";

      if (leadInstrument) {
        instrumentPrompt = `
FEATURED INSTRUMENT:
${leadInstrument}.

Build a recognizable musical hook around this instrument.
Let its characteristic sound lead the melody.
Feature it clearly in the instrumental opening and in short melodic passages between vocal lines.
Bring it forward in at least one noticeable instrumental section.
Keep its sound recognizable and present in the overall arrangement.
`;
      } else {
        instrumentPrompt = `
Choose a coherent professional instrumental arrangement that naturally fits the selected genre and mood.
`;
      }

      if (supportingInstruments.length) {
        instrumentPrompt += `
SUPPORTING INSTRUMENTS:
${supportingInstruments.join(", ")}.

Arrange these as supporting parts around the featured instrument.
Use them naturally for rhythm, harmony and musical depth.
Keep the arrangement balanced and leave space for the featured instrument.
`;
      }

      // ------------------------------------------
      // ساخت توضیحات موسیقی
      // ------------------------------------------

      const promptParts = [
        "Create a polished, melodic and professionally arranged song with a natural musical flow.",

        `GENRE AND STYLE: ${style}.`,

        `MOOD: ${getMoodDescription(musicMood)}`,

        getVoiceDescription(voice),

        instrumentPrompt,

        extraMood
          ? `Additional musical direction: ${extraMood}.`
          : "",

        `VOCAL LANGUAGE: ${getLanguageName(language)}.`,

        instrumental
          ? "Create instrumental music only. Do not include any human voice."
          : `
Sing the supplied lyrics exactly as written.
Preserve the original words, line order and pronunciation.
Do not rewrite, paraphrase, translate or omit any lyric line.
`,

        pronunciationNotes
          ? `PRONUNCIATION NOTES: ${pronunciationNotes}.`
          : "",

        instrumental
          ? ""
          : `
Begin with a short instrumental introduction using the selected instruments only.
No vocals, humming, ad-libs, shouts, vocal samples or spoken sounds before the first lyric line.
Start the singer exactly with the first supplied lyric line.
`,

        `
ARRANGEMENT:
Create a memorable melody and a natural song structure.
Use the featured instrument for recognizable melodic phrases.
Add tasteful instrumental responses between vocal phrases.
Let the arrangement develop naturally without overcrowding the mix.
Finish with a proper musical ending.
`
      ].filter(Boolean);

      const musicPrompt = promptParts.join("\n\n");

      // ------------------------------------------
      // ساخت Style مناسب UdioAPI
      // ------------------------------------------

      const udioStyle = buildUdioStyle({
        style,
        musicMood,
        extraMood,
        voice,
        instrumentPrompt,
        pronunciationNotes
      });

      // در Custom Mode متن شعر مستقیماً در prompt قرار می‌گیرد.
      // برای موسیقی بی‌کلام، توضیحات موسیقی ارسال می‌شود.

      const udioPrompt = instrumental
        ? musicPrompt.slice(0, 5000)
        : singingLyrics;

      // ------------------------------------------
      // ساخت درخواست UdioAPI
      // ------------------------------------------

      const udioBody = {
        model: "chirp-v5-5",
        prompt: udioPrompt,
        style: udioStyle,
        title: "Nava AI Song",
        duration: MUSIC_DURATION_SECONDS,
        make_instrumental: instrumental,
        style_weight: 0.65,
        weirdness_constraint: 0.55,
        audio_weight: 0.65
      };

      // تعیین جنسیت خواننده
      // برای duet جنسیت را محدود نمی‌کنیم.

      if (!instrumental && voice !== "duet") {
        udioBody.gender =
          voice === "female_pop" || voice === "female_powerful"
            ? "female"
            : "male";
      }

      // ------------------------------------------
      // مرحله اول: ارسال درخواست ساخت آهنگ
      // ------------------------------------------

      let createData;

      try {
        const createRes = await fetch(
          "https://udioapi.pro/api/v2/generate",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(udioBody)
          }
        );

        const rawCreate = await createRes.text();

        try {
          createData = JSON.parse(rawCreate);
        } catch {
          return json(
            {
              success: false,
              error: "پاسخ UdioAPI قابل پردازش نیست.",
              details: rawCreate.slice(0, 1000),
              status: createRes.status
            },
            502,
            corsOrigin
          );
        }

        if (!createRes.ok) {
          return json(
            {
              success: false,
              error:
                createData.message ||
                `خطای UdioAPI با کد ${createRes.status}`,
              details: createData
            },
            502,
            corsOrigin
          );
        }

      } catch (e) {
        return json(
          {
            success: false,
            error: "ارتباط با UdioAPI برای شروع ساخت آهنگ برقرار نشد.",
            details: e.message
          },
          502,
          corsOrigin
        );
      }

      const workId =
        createData.workId ||
        createData.data?.task_id ||
        createData.data?.workId;

      if (!workId) {
        return json(
          {
            success: false,
            error: "UdioAPI درخواست را دریافت کرد اما شناسه ساخت آهنگ برنگرداند.",
            details: createData
          },
          502,
          corsOrigin
        );
      }

      // ------------------------------------------
      // مرحله دوم: بررسی وضعیت ساخت آهنگ
      // هر ۷ ثانیه Feed بررسی می‌شود.
      // اولین فایل صوتی آماده‌شده دریافت می‌شود.
      // ------------------------------------------

      const maxAttempts = 30;
      let lastFeedError = "";

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 7000));

        try {
          const feedRes = await fetch(
            `https://udioapi.pro/api/v2/feed?workId=${encodeURIComponent(workId)}`,
            {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${apiKey}`
              }
            }
          );

          const rawFeed = await feedRes.text();

          let feedData;

          try {
            feedData = JSON.parse(rawFeed);
          } catch {
            lastFeedError = "پاسخ وضعیت UdioAPI قابل پردازش نبود.";
            continue;
          }

          if (!feedRes.ok) {
            lastFeedError =
              feedData.message ||
              `خطای بررسی وضعیت با کد ${feedRes.status}`;
            continue;
          }

          const task = feedData.data || {};

          const clips = Array.isArray(task.response_data)
            ? task.response_data
            : [];

          // --------------------------------------
          // اگر فایل صوتی آماده شده باشد
          // --------------------------------------

          const readyClip = clips.find(clip => {
            return (
              clip.status === "first" &&
              typeof clip.audio_url === "string" &&
              clip.audio_url.startsWith("https://") &&
              !clip.fail_message
            );
          });

          if (readyClip) {
            return json(
              {
                success: true,
                audioUrl: readyClip.audio_url,
                title: readyClip.title || "Nava AI Song",
                duration: readyClip.duration || MUSIC_DURATION_SECONDS,
                requestedDuration: MUSIC_DURATION_SECONDS,
                provider: "UdioAPI",
                workId
              },
              200,
              corsOrigin
            );
          }

          // --------------------------------------
          // تشخیص شکست ساخت آهنگ
          // --------------------------------------

          const failedClip = clips.find(
            clip => clip.fail_message || clip.error_message
          );

          if (task.type === "FAILED" || failedClip) {
            return json(
              {
                success: false,
                error:
                  failedClip?.fail_message ||
                  failedClip?.error_message ||
                  "ساخت آهنگ توسط UdioAPI ناموفق بود. ممکن است اعتبار درخواست برگشت داده شده باشد.",
                workId
              },
              502,
              corsOrigin
            );
          }

        } catch (e) {
          lastFeedError = e.message || "خطای موقت در بررسی وضعیت آهنگ";
        }
      }

      // ------------------------------------------
      // پایان زمان انتظار
      // ------------------------------------------

      return json(
        {
          success: false,
          pending: true,
          workId,
          error: "درخواست ساخت ثبت شده است اما آماده‌شدن فایل صوتی بیشتر از زمان انتظار طول کشید. برای جلوگیری از هزینه دوباره، فعلاً درخواست ساخت جدید ارسال نکن.",
          details: lastFeedError || undefined
        },
        202,
        corsOrigin
      );
    }

    // ==========================================
    // مسیر نامعتبر
    // ==========================================

    return json(
      { error: "Not found" },
      404,
      corsOrigin
    );
  }
};
 
