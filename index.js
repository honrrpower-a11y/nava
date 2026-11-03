
const ALLOWED_ORIGIN = "https://honrrpower-a11y.github.io";

// ACE-Step
const ACE_API_URL = "https://api.acemusic.ai/v1/chat/completions";
const ACE_MODEL = "acemusic/acestep-v1.5-turbo";

// ==========================================
// ابزارهای عمومی
// ==========================================

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

function extractText(content) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map(part =>
        typeof part === "string" ? part : part?.text || ""
      )
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
// پاک‌سازی حروف لاتین ناخواسته در شعر فارسی
// ==========================================

function cleanPersianLatinMix(text, language = "fa") {
  let result = String(text || "");

  if (language !== "fa") {
    return result;
  }

  result = result.replace(
    /([\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF])([A-Za-z]{1,12})(?=$|[\s،؛,.!?؟:])/g,
    "$1"
  );

  result = result.replace(/[ \t]{2,}/g, " ");
  result = result.replace(/\s+([،؛.!؟,:])/g, "$1");

  return result.trim();
}

function prepareLyrics(text, language = "fa") {
  let result = String(text || "");

  result = normalizePersianSpacing(result);
  result = cleanPersianLatinMix(result, language);

  return result.trim();
}

// ==========================================
// استخراج دو نسخه شعر
// ==========================================

function parseLyricsOutput(rawText, language = "fa") {
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

  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed)
  ) {
    lyrics = extractText(
      parsed.lyrics ||
      parsed.originalLyrics ||
      parsed.original
    );

    singingLyrics = extractText(
      parsed.singingLyrics ||
      parsed.singing_lyrics ||
      parsed.pronunciationLyrics
    );
  }

  if (!lyrics) {
    lyrics = cleaned;
  }

  lyrics = prepareLyrics(lyrics, language);

  singingLyrics = singingLyrics
    ? prepareLyrics(singingLyrics, language)
    : lyrics;

  return {
    lyrics: lyrics.trim(),
    singingLyrics: singingLyrics.trim()
  };
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

الف) فقط از حروف و واژه‌های فارسی برای متن فارسی استفاده کن.

- هیچ حرف لاتینی را به انتهای کلمات فارسی نچسبان.
- از ترکیب تصادفی حروف فارسی و لاتین خودداری کن.
- اگر واژه‌ای را نمی‌دانی، آن را با واژه فارسی طبیعی جایگزین کن.
- کلمات انگلیسی فقط زمانی مجازند که عمداً و به‌صورت مستقل در ترانه استفاده شوند.

ب) دو نسخه کاملاً هماهنگ بساز:

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

ج) جدانویسی «ه» غیرملفوظ:

وقتی کلمه‌ای به «ه» غیرملفوظ ختم می‌شود و پسوند یا واژه‌ای مانند «ای»، «ام»، «ات»، «اش»، «ایم»، «اید» یا «اند» به آن می‌پیوندد، آن‌ها را جدا بنویس.

نمونه:
کافه ای
خانه ام
پنجره ات
خسته ام
قصه ام

این قاعده را در هر دو نسخه رعایت کن.

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
// استخراج خروجی صوتی ACE
// ==========================================

function extractAceAudio(data) {
  const message = data?.choices?.[0]?.message;

  const audioItems = Array.isArray(message?.audio)
    ? message.audio
    : [];

  for (const item of audioItems) {
    const audioUrl = item?.audio_url?.url;

    if (
      typeof audioUrl === "string" &&
      (
        audioUrl.startsWith("data:audio/") ||
        audioUrl.startsWith("https://")
      )
    ) {
      return audioUrl;
    }
  }

  const alternatives = [
    message?.audio_url?.url,
    message?.audio_url,
    data?.audio_url?.url,
    data?.audio_url
  ];

  for (const item of alternatives) {
    if (
      typeof item === "string" &&
      (
        item.startsWith("data:audio/") ||
        item.startsWith("https://")
      )
    ) {
      return item;
    }
  }

  return "";
}

// ==========================================
// Worker
// ==========================================

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    const corsOrigin =
      origin === ALLOWED_ORIGIN
        ? ALLOWED_ORIGIN
        : "*";

    // --------------------------------------
    // CORS
    // --------------------------------------

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

    // ======================================
    // بررسی سلامت و نسخه Worker
    // ======================================

    if (
      url.pathname === "/status" &&
      request.method === "GET"
    ) {
      return json(
        {
          success: true,
          message: "Nava Worker is running",
          version: "nava-test-1",
          timestamp: new Date().toISOString()
        },
        200,
        corsOrigin
      );
    }

    // ======================================
    // ۱. ساخت شعر با Gemini و OpenRouter
    // ======================================

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

      const prompt = buildLyricsPrompt(
        topic,
        style,
        language
      );

      let geminiError = "";

      // ------------------------------------
      // Gemini
      // ------------------------------------

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

            const result = parseLyricsOutput(
              rawLyrics,
              language
            );

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
          geminiError =
            e.message || "خطای ارتباط با Gemini";
        }
      } else {
        geminiError =
          "کلید GEMINI_API_KEY تنظیم نشده است.";
      }

      // ------------------------------------
      // OpenRouter فقط در صورت شکست Gemini
      // ------------------------------------

      if (!env.OPENROUTER_API_KEY) {
        return json(
          {
            error:
              "ساخت شعر با Gemini ناموفق بود و کلید OpenRouter نیز تنظیم نشده است.",
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
              "Authorization":
                `Bearer ${env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer":
                "https://honrrpower-a11y.github.io/nava/",
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

        const result = parseLyricsOutput(
          rawLyrics,
          language
        );

        if (!result.lyrics) {
          return json(
            {
              error:
                "OpenRouter هم متن معتبری تولید نکرد.",
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
            error:
              "ارتباط با سرویس ساخت شعر ناموفق بود.",
            geminiError,
            openRouterError: e.message
          },
          502,
          corsOrigin
        );
      }
    }

    // ======================================
    // ۲. ساخت موسیقی با ACE - حالت آزمایشی خام
    // ======================================

    if (
      url.pathname === "/generate-music" &&
      request.method === "POST"
    ) {
      const apiKey = env.ACEMUSIC_API_KEY;

      if (!apiKey) {
        return json(
          {
            success: false,
            error:
              "کلید ACEMUSIC_API_KEY در Secrets کلودفلر ثبت نشده است."
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

      // ------------------------------------
      // دریافت متن شعر
      // ------------------------------------

      const lyrics = prepareLyrics(
        safeText(
          input.singingLyrics || input.lyrics || "",
          8000
        ),
        ["fa", "tr", "en"].includes(input.language)
          ? input.language
          : "fa"
      );

      if (!lyrics) {
        return json(
          {
            success: false,
            error: "متن ترانه خالی است. ابتدا شعر را وارد کن."
          },
          400,
          corsOrigin
        );
      }

      if (lyrics.length > 5000) {
        return json(
          {
            success: false,
            error:
              "متن ترانه بیش از محدودیت ۵۰۰۰ کاراکتری است. لطفاً شعر را کوتاه‌تر کن."
          },
          400,
          corsOrigin
        );
      }

      // ------------------------------------
      // درخواست حداقلی به ACE
      // فقط متن شعر
      // ------------------------------------

      
const aceBody = {
  model: ACE_MODEL,
  messages: [
    {
      role: "user",
      content: `<prompt>
Iranian Persian pop music with authentic Persian melodic identity.
Persian-language vocals with clear, natural Iranian pronunciation.
Create a distinctly Iranian melody with traditional Persian melodic ornaments and phrasing.
Use prominent Iranian instruments: tar, Persian setar, santur, kamancheh, tombak and daf.
Blend traditional Iranian instruments with a polished modern Persian pop arrangement.
The melody and instrumental arrangement must sound Iranian, not Indian.
Avoid Bollywood, Indian, Hindustani and South Asian musical styles.
Avoid tabla and Indian-style sitar arrangements.
Keep the vocal melody expressive, memorable and naturally suited to Persian lyrics.
</prompt>
<lyrics>
${lyrics}
</lyrics>`
    }
  ],
  stream: false
};


      // ------------------------------------
      // ارسال درخواست به ACE
      // ------------------------------------

      let aceResponse;
      let aceStatus = 200;

      try {
        const controller = new AbortController();

        const timeout = setTimeout(
          () => controller.abort(),
          240000
        );

        let aceRes;

        try {
          aceRes = await fetch(
            ACE_API_URL,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "Accept": "application/json"
              },
              body: JSON.stringify(aceBody),
              signal: controller.signal
            }
          );
        } finally {
          clearTimeout(timeout);
        }

        aceStatus = aceRes.status;

        const rawResponse = await aceRes.text();

        try {
          aceResponse = JSON.parse(rawResponse);
        } catch {
          return json(
            {
              success: false,
              error: "پاسخ ACE قابل پردازش نیست.",
              status: aceRes.status,
              details: rawResponse.slice(0, 1200),
              provider: "ACE"
            },
            502,
            corsOrigin
          );
        }

        if (!aceRes.ok || aceResponse.error) {
          const apiError =
            aceResponse.error?.message ||
            aceResponse.error ||
            aceResponse.message ||
            `خطای ACE با کد ${aceRes.status}`;

          return json(
            {
              success: false,
              error: String(apiError).slice(0, 1200),
              status: aceRes.status,
              provider: "ACE",
              model: ACE_MODEL
            },
            502,
            corsOrigin
          );
        }

      } catch (e) {
        const timeoutError =
          e.name === "AbortError";

        return json(
          {
            success: false,
            error: timeoutError
              ? "زمان انتظار برای ساخت آهنگ توسط ACE تمام شد."
              : "ارتباط با سرویس ACE برقرار نشد.",
            details: e.message || "ACE connection error",
            provider: "ACE"
          },
          502,
          corsOrigin
        );
      }

      // ------------------------------------
      // استخراج فایل صوتی
      // ------------------------------------

      const audioUrl = extractAceAudio(aceResponse);

      if (!audioUrl) {
        const message =
          aceResponse.choices?.[0]?.message;

        const responseText = extractText(
          message?.content
        );

        return json(
          {
            success: false,
            error:
              "ACE پاسخ داده است اما فایل صوتی در پاسخ پیدا نشد.",
            details: responseText.slice(0, 1500),
            status: aceStatus,
            provider: "ACE",
            model: ACE_MODEL
          },
          502,
          corsOrigin
        );
      }

      // ------------------------------------
      // خروجی سازگار با سایت Nava
      // ------------------------------------

      return json(
        {
          success: true,
          audioUrl,
          title: "Nava AI Song",
          provider: "ACE-Step",
          model: ACE_MODEL
        },
        200,
        corsOrigin
      );
    }

    // ======================================
    // مسیر نامعتبر
    // ======================================

    return json(
      {
        error: "Not found"
      },
      404,
      corsOrigin
    );
  }
};
 
