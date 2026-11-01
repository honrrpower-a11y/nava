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
    male_pop: `
STRICT VOCAL CAST: ONE MALE SINGER ONLY.
Use a clearly recognizable adult male pop lead voice.
No female singer, no female backing vocals, no female duet,
no gender switching and no alternating female vocal lines.
Keep the same male vocal identity throughout the entire song.
Bright, clear, youthful male pop tone.
`,

    male_deep: `
STRICT VOCAL CAST: ONE MALE SINGER ONLY.
Use a clearly recognizable male baritone voice.
Warm, mature, rich low-mid register.
No female singer, no female backing vocals, no duet,
no gender switching and no alternating female vocal lines.
Keep the same male vocal identity throughout the entire song.
`,

    male_raspy: `
STRICT VOCAL CAST: ONE MALE SINGER ONLY.
Use a clearly recognizable expressive male voice
with a natural subtle husky texture.
No female singer, no female backing vocals, no duet,
no gender switching and no alternating female vocal lines.
Keep the same male vocal identity throughout the entire song.
`,

    female_pop: `
STRICT VOCAL CAST: ONE FEMALE SINGER ONLY.
Use a clearly recognizable adult female pop lead voice.
No male singer, no male backing vocals, no male duet,
no gender switching and no alternating male vocal lines.
Keep the same female vocal identity throughout the entire song.
Clear, expressive and natural female pop tone.
`,

    female_powerful: `
STRICT VOCAL CAST: ONE FEMALE SINGER ONLY.
Use a clearly recognizable powerful female lead voice.
Strong female projection and expressive sustained notes.
No male singer, no male backing vocals, no male duet,
no gender switching and no alternating male vocal lines.
Keep the same female vocal identity throughout the entire song.
`,

    duet: `
STRICT VOCAL CAST: ONE MALE SINGER AND ONE FEMALE SINGER.
Use two clearly distinguishable vocal identities.
Male and female singers must alternate in appropriate sections.
Both voices may sing together in the chorus.
Do not change the identity of either singer.
`,

    instrumental: `
STRICT VOCAL CAST: NO HUMAN VOICE.
Instrumental music only.
Absolutely no singing, no spoken words, no humming,
no vocal samples and no choir.
`
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

موضوع: ${topic}
سبک: ${style}
زبان: ${language}

اصول ترانه:
- موضوع مرکزی مشخص و داستان منسجم داشته باشد.
- زبان طبیعی، روان و زنده باشد.
- از عبارت‌های مصنوعی و کلیشه‌ای دوری کن.
- قافیه طبیعی باشد و به معنا آسیب نزند.
- طول سطرها برای اجرای موسیقایی مناسب باشد.
- ترجیع‌بند ماندگار و قابل زمزمه باشد.

ساختار:

[Verse 1]
[Pre-Chorus]
[Chorus]
[Verse 2]
[Bridge]
[Final Chorus]

قوانین فارسی:

دو نسخه هماهنگ بساز:

lyrics:
متن اصلی و خوانا، بدون اعراب‌گذاری اضافی.

singingLyrics:
دقیقاً همان کلمات و سطرها، فقط با اعراب‌گذاری محدود
برای کلمات دشوار یا چندخوانشی.

هیچ کلمه یا سطری را تغییر نده، حذف نکن یا اضافه نکن.

جدانویسی ه غیرملفوظ را رعایت کن:
کافه ای، خانه ام، پنجره ات، خسته ام.

برای ترکی و انگلیسی، دو نسخه از نظر متن یکسان باشند.

فقط JSON معتبر برگردان:

{
  "lyrics": "متن کامل شعر اصلی",
  "singingLyrics": "نسخه مناسب خوانندگی"
}
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
    // ۱. ساخت شعر
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
    // ۲. ساخت موسیقی با ACE
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
          { error: "متن ترانه خالی است. ابتدا شعر را وارد کن." },
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

      if (leadInstrument && !instrumental) {
        instrumentPrompt = `
INSTRUMENT ARRANGEMENT - HIGH PRIORITY:

The main featured instrument is: ${leadInstrument}.

This exact instrument must be clearly recognizable by its real timbre.
It must not be replaced by another instrument.

Give it a prominent melodic role:
- Play a recognizable melody in the introduction.
- Bring it forward between vocal phrases.
- Give it a noticeable instrumental passage.
- Keep it audible under the vocals without being buried in the mix.

`;
      } else if (leadInstrument && instrumental) {
        instrumentPrompt = `
INSTRUMENTAL ARRANGEMENT - HIGH PRIORITY:

The main instrument is: ${leadInstrument}.

Make this instrument the dominant musical voice.
Use its real recognizable timbre.
Build the main melody around it.
Feature it prominently in the introduction and throughout the piece.

`;
      }

      if (supportingInstruments.length) {
        instrumentPrompt += `
Supporting instruments:
${supportingInstruments.join(", ")}.

Use each supporting instrument audibly and distinctly.
They must complement the main instrument, not replace it.
Keep the arrangement balanced and avoid burying the featured instrument.
`;
      }

      if (!instrumentList.length) {
        instrumentPrompt = `
Choose a coherent professional arrangement that fits the selected genre.
Use instruments naturally suited to the style.
`;
      }

      // ------------------------------------------
      // پرامپت موسیقی
      // ------------------------------------------

      const promptParts = [
        "Create a professionally arranged, coherent musical recording.",

        `GENRE AND STYLE: ${style}.`,

        `MOOD: ${getMoodDescription(musicMood)}`,

        getVoiceDescription(voice),

        instrumentPrompt,

        extraMood
          ? `Additional musical direction: ${extraMood}.`
          : "",

        `VOCAL LANGUAGE: ${getLanguageName(language)}.`,

        suppliedSingingLyrics
          ? `
Sing the supplied lyrics exactly as written.
Preserve the words, line order, spelling, spacing and supplied vowel diacritics.
Do not rewrite, paraphrase, translate or omit any lyric line.
`
          : `
Sing the supplied lyrics exactly.
For Persian, pronounce ambiguous words according to their context.
Do not invent, replace or omit lyric words.
`,

        pronunciationNotes
          ? `PRONUNCIATION NOTES: ${pronunciationNotes}. Follow these carefully.`
          : "",

        instrumental
          ? "Instrumental only. No vocals of any kind."
          : "Keep the selected lead singer consistent throughout the complete song. The voice must be clear and intelligible.",

        `
ARRANGEMENT:
Create a recognizable musical introduction.
Maintain a clear melodic identity.
Use short instrumental responses between vocal phrases.
Give the main instrument audible moments.
Develop the arrangement naturally and finish with a musical ending.
`
      ].filter(Boolean);

      const musicPrompt = promptParts.join("\n\n");

      // ------------------------------------------
      // ارسال متن به شکل Tagged Mode
      // ------------------------------------------

      const messageContent = instrumental
        ? `<prompt>\n${musicPrompt}\n</prompt>`
        : `<prompt>\n${musicPrompt}\n</prompt>\n<lyrics>\n${singingLyrics}\n</lyrics>`;

      const body = {
        model: "acemusic/acestep-v1.5-turbo",

        messages: [
          {
            role: "user",
            content: messageContent
          }
        ],

        stream: false,

        // جلوگیری از بازنویسی خودکار پرامپت و شعر
        use_format: false,
        use_cot_caption: false,
        use_cot_language: false,

        audio_config: {
          format: "mp3",
          duration: MUSIC_DURATION_SECONDS,
          vocal_language: language,
          instrumental: instrumental
        }
      };

      // ------------------------------------------
      // درخواست به ACE
      // ------------------------------------------

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

        // استخراج فایل صوتی

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
