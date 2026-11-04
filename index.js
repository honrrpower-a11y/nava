const ALLOWED_ORIGIN = "https://honrrpower-a11y.github.io";

// ACE-Step
const ACE_API_URL = "https://api.acemusic.ai/v1/chat/completions";
const ACE_MODELS_URL = "https://api.acemusic.ai/v1/models";
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
      "Access-Control-Allow-Headers": "Content-Type, X-Nava-Test-Token",
      "Cache-Control": "no-store"
    }
  });
}

function extractText(content) {
  if (typeof content === "string") return content.trim();

  if (Array.isArray(content)) {
    return content.map(part =>
      typeof part === "string" ? part : part?.text || ""
    ).join("").trim();
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
    /([\u0621-\u06A9]{2,})ه(ای|ام|ات|اش|ایم|اید|اند)(?=[\s،؛.!؟,:]|$)/g,
    "$1ه $2"
  );
}

function cleanPersianLatinMix(text, language = "fa") {
  let result = String(text || "");

  if (language !== "fa") return result;

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
// تبدیل فایل صوتی به Base64
// ==========================================

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

// ==========================================
// آماده‌سازی شعر برای ACE
// ==========================================

function prepareMusicLyrics(text, profile) {
  let result = String(text || "").trim();

  if (!result || profile !== "persian") return result;

  result = result.replace(
    /^\s*(?:\[(?:intro|instrumental)\]\s*)+/i,
    ""
  );

  const hasSongSections =
    /\[(?:verse|chorus|pre-chorus|bridge|final chorus|outro|instrumental)\b[^\]]*\]/i.test(result);

  if (!hasSongSections) {
    result = `[Verse 1]\n${result}`;
  }

  return `[Intro]\n[Instrumental]\n\n${result}`.trim();
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

  if (!lyrics) lyrics = cleaned;

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
// پرامپت ساخت شعر
// ==========================================

function buildLyricsPrompt(topic, style, language) {
  return `
تو یک ترانه‌سرای حرفه‌ای، خلاق و مسلط به ترانه‌سرایی موسیقایی هستی.

برای موضوع زیر یک ترانه کامل، منسجم، احساسی و قابل اجرا بساز.

موضوع: ${topic}
سبک و حال‌وهوا: ${style}
زبان: ${language}

اصول ترانه‌سرایی:

۱. ترانه باید موضوع مرکزی مشخص و مسیر احساسی منسجم داشته باشد.
۲. هر بند تصویر یا احساس تازه‌ای اضافه کند.
۳. از کلیشه‌ها و تکرار بی‌هدف دوری کن.
۴. زبان طبیعی، روان و زنده باشد.
۵. جمله‌ها هنگام خواندن با صدای بلند طبیعی باشند.
۶. قافیه‌ها طبیعی باشند و به زور وارد شعر نشوند.
۷. طول سطرها برای اجرای موسیقایی مناسب باشد.
۸. ترجیع‌بند باید ساده، قدرتمند و به‌یادماندنی باشد.

ساختار:

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

قوانین ویژه زبان فارسی:

اگر زبان فارسی است:

- فقط از حروف و واژه‌های فارسی برای متن فارسی استفاده کن.
- حروف لاتین را به انتهای کلمات فارسی نچسبان.
- از ترکیب تصادفی حروف فارسی و لاتین خودداری کن.
- فارسی طبیعی و خوش‌آهنگ باشد.
- کلمات انگلیسی فقط در صورت استفاده عمدی و مستقل مجازند.

دو نسخه هماهنگ بساز:

نسخه lyrics:
متن خوانا و طبیعی، بدون اعراب‌گذاری اضافی.

نسخه singingLyrics:
دقیقاً همان شعر و همان کلمات نسخه اول.
فقط کلمات دشوار یا چندخوانشی را با اعراب لازم مشخص کن.
هیچ کلمه یا سطری را تغییر نده، حذف نکن یا اضافه نکن.

جدانویسی ه غیرملفوظ:

کافه ای
خانه ام
پنجره ات
خسته ام
قصه ام

اگر زبان ترکی یا انگلیسی است، هر دو نسخه از نظر متن یکسان باشند.

قوانین خروجی:

فقط JSON معتبر برگردان.
هیچ توضیحی بیرون از JSON ننویس.
از Markdown و کدبلاک استفاده نکن.

ساختار دقیق:

{
  "lyrics": "متن کامل شعر اصلی",
  "singingLyrics": "همان شعر با اعراب‌گذاری انتخابی"
}

تمام خطوط شعر و برچسب‌های بخش‌ها را در هر دو نسخه حفظ کن.
`;
}

// ==========================================
// پروفایل‌های موسیقی
// ==========================================

function buildMusicProfile(input) {
  const language = ["fa", "tr", "en"].includes(input.language)
    ? input.language
    : "fa";

  const requestedStyle = safeText(
    input.musicStyle ||
    input.music_style ||
    input.genre ||
    input.style ||
    "",
    120
  );

  const style = requestedStyle.toLowerCase();

  const mood = safeText(
    input.musicMood ||
    input.music_mood ||
    input.mood ||
    "",
    120
  );

  let profile = "persian";
  let prompt = "";
  let bpm = null;
  let timeSignature = null;

  if (
    /ترک|ترکی|turkish|türk|turkiye|türkiye/i.test(style) ||
    (!requestedStyle && language === "tr")
  ) {
    profile = "turkish";

    prompt = `
Authentic Turkish music with a clearly recognizable Turkish musical identity.

Use Turkish melodic phrasing and Turkish makam-inspired melodic structures.
Create a distinctly Turkish melody, not a generic Western pop melody.

Use appropriate Turkish instruments such as:
baglama, saz, kanun, ney, Turkish clarinet and darbuka.

The arrangement must have Turkish rhythmic character and Turkish melodic ornaments.

Avoid Iranian, Arabic, Indian and Bollywood musical arrangements.
Avoid generic Western rock and jazz sounds.
Do not make electric guitar the dominant instrument.
The result must sound Turkish in its melody, rhythm and arrangement.
`;

    bpm = 105;
    timeSignature = "4";
  }

  else if (/عرب|arabic|arab|خلیجی/i.test(style)) {
    profile = "arabic";

    prompt = `
Authentic Arabic music with a recognizable Arabic melodic identity.

Use Arabic maqam-inspired melodic phrasing and ornamentation.
Use oud, qanun, ney, riq and darbuka where appropriate.
Create Arabic rhythmic patterns and expressive Arabic melodies.

Avoid generic Western rock, jazz and Indian musical styles.
The result must sound Arabic in its melody and rhythm.
`;

    bpm = 100;
    timeSignature = "4";
  }

  else if (/راک|rock|metal|متال/i.test(style)) {
    profile = "rock";

    prompt = `
Authentic rock music.

Use electric guitar, bass guitar and live rock drums.
Create strong guitar riffs, energetic rhythmic sections and a memorable rock melody.
Use a clear rock arrangement and dynamic song structure.

Avoid jazz swing and Indian or Bollywood musical elements.
`;

    bpm = 120;
    timeSignature = "4";
  }

  else if (/جاز|jazz|بلوز|blues/i.test(style)) {
    profile = "jazz";

    prompt = `
Authentic jazz music with jazz harmony and rhythmic phrasing.

Use piano, upright bass, acoustic drums and saxophone where appropriate.
Create expressive melodic improvisation and a coherent jazz arrangement.
Use jazz chord progressions and natural swing where appropriate.

Avoid rock guitar riffs and traditional regional pop arrangements.
`;

    bpm = 95;
    timeSignature = "4";
  }

  else if (
    /ایران|فارسی|persian|iranian|سنتی|تلفیقی/i.test(style) ||
    language === "fa"
  ) {
    profile = "persian";

    prompt = `
Create a contemporary Iranian Persian romantic pop song.

CORE MUSICAL IDENTITY:

- Contemporary Iranian Persian pop, not generic international pop.
- A recognizable Iranian melodic identity in the lead vocal melody.
- Natural native Iranian Persian pronunciation and phrasing.
- Warm, intimate, emotional and memorable.
- Modern, polished production with an authentic Iranian character.
- Keep the same overall Persian pop identity across songs, but do not reuse
  the same melody, intro, groove or arrangement.

PERSIAN VOCAL PERFORMANCE:

The lead singer must sound like a native Persian-language pop singer.
Use natural Iranian Persian pronunciation, diction, accent and vocal phrasing.
Follow the natural rhythm and stress of Persian words.
Emphasize meaningful syllables and emotional words.
Avoid English-like or foreign-language syllable stress.

Use connected, expressive Persian phrases.
Let the melody rise and fall naturally with the meaning of the lyrics.
Allow comfortable breathing spaces between phrases.
Do not rush the lyrics.

Use restrained and tasteful Iranian pop ornaments at suitable phrase endings.
Avoid excessive melisma, exaggerated vibrato, robotic delivery,
flat recitation and artificial vocal runs.

Keep one clear lead vocal identity.
Do not add a female backing singer or choir unless explicitly requested.
Do not add improvised vocal responses.

NO WORDLESS VOCALS:

Do not sing, hum, chant or vocalize sounds that are not written in the lyrics.

No "hoo-hoo", "woo-woo", "oh-oh", "ah-ah", "ooh", "yeah",
humming, vocal warm-ups, scat singing or improvised syllables.

No wordless vocals before, between or after lyric sections.
No vocal samples or background voices in the instrumental introduction.

Every vocal phrase must contain actual words from the supplied lyrics.
The singer must not invent extra words or syllables.

INSTRUMENTAL INTRO:

Start with a short, completely instrumental introduction.

Use Iranian instruments only during the introduction.
The introduction must contain no singer, no background voice,
no humming, no chanting and no wordless vocal sounds.

After the instrumental introduction, enter directly with the first written lyric line.
Do not add a separate vocal intro or improvised syllables.

The intro should be short and musically connected to the song.
Do not let it consume too much of the song.

SONG-SPECIFIC MELODY AND ARRANGEMENT:

Create a fresh melody and arrangement for this particular song.

Use the meaning, emotion and imagery of the supplied lyrics
to shape the melody, rhythm, instrumental choices and dynamics.

Do not reuse a generic melody or the same arrangement template for every song.

Give each song its own recognizable musical character:
- A distinct opening instrumental phrase.
- A distinct vocal melody and phrase ending.
- A groove that fits the emotional character.
- A clear musical build toward the chorus.
- A memorable but natural chorus melody.
- A suitable instrumental transition or short solo.

Keep the overall identity contemporary Iranian Persian pop,
while allowing the melody and arrangement to change from song to song.

IRANIAN INSTRUMENTS:

Use Iranian instruments as meaningful musical voices,
not merely as background decoration.

Available instruments:

1. Santur:
A clearly audible melodic instrument.
Use recognizable Persian melodic phrases, especially in the intro
or in selected instrumental transitions.

2. Tar:
Use expressive Persian melodic responses and short instrumental phrases.
Keep its sound distinguishable.

3. Kamancheh:
Use emotional sustained melodies and responses between vocal phrases.

4. Ney:
Use selectively for atmospheric Persian melodic passages.
Do not let it disappear behind the accompaniment.

5. Tombak and Daf:
Use gentle, controlled Iranian percussion.
Keep the rhythm supportive and natural.
Avoid loud, rapid or continuous percussion.

INSTRUMENTAL BALANCE:

Do not force every Iranian instrument to play continuously.

Choose two or three featured Iranian instruments for the main arrangement
according to the mood and character of this song.
Let the remaining instruments appear selectively in transitions
or as subtle supporting layers.

Give each featured instrument enough space to be clearly heard.
Avoid overcrowding the mix.

Santur and tar should have an identifiable role where musically appropriate.
Kamancheh and ney should complement the melody without competing with the singer.
Tombak and daf should support the groove without overpowering the arrangement.

Do not let synthesizers, electric guitar or generic drum loops dominate.
The vocal melody must remain the emotional center of the song.

TEMPO AND GROOVE:

Use a moderate, comfortable mid-tempo Persian pop groove.

Keep the rhythm steady and natural.
Do not rush the lyrics.
Do not make the performance excessively slow, sleepy or dragging.
Do not make it fast, aggressive or dance-oriented unless the requested mood clearly calls for it.

Keep the current moderate Persian pop character,
but shape the rhythmic feel and arrangement to suit each song.

MUSICAL DYNAMICS:

Create a clear difference between the verses and chorus.

Keep the verses intimate and expressive.
Let the pre-chorus build naturally when present.
Give the chorus more emotional and melodic impact.
Use a controlled musical lift rather than simply making everything louder.

Allow the bridge and final chorus to develop naturally.
Avoid repeating the same instrumental pattern throughout the entire song.

STRICT STYLE EXCLUSIONS:

Avoid generic Western pop vocal phrasing.
Avoid English-like pronunciation and syllable stress.
Avoid foreign-sounding melodic delivery.
Avoid Turkish pop vocal ornaments and Turkish folk phrasing.
Avoid Arabic vocal phrasing.
Avoid Indian and Bollywood-style singing.
Avoid traditional classical Persian vocal performance.

Do not turn the song into a traditional classical performance.
Do not use excessive vocal ornaments.
Do not make the singer sound like a foreign pop singer singing Persian lyrics.

FINAL MUSICAL DIRECTION:

The result should sound like a professionally produced contemporary Iranian romantic pop song.

Keep a recognizable Persian pop identity in the singer, melody and arrangement.
Make the melody, intro, groove and instrumental arrangement specific to this song.

The introduction is instrumental only.
The singer enters with the first actual lyric line.
No wordless vocalizations anywhere in the song.
`;

    bpm = 88;
    timeSignature = "4";
  }

  else {
    profile = "pop";

    prompt = `
Create a contemporary pop song with a clear musical identity.

Use a memorable melody, balanced instrumentation and a coherent arrangement.
Follow the requested musical style: ${requestedStyle || "contemporary pop"}.

Avoid unnecessary jazz or rock elements unless explicitly requested.
`;

    timeSignature = "4";
  }

  if (mood) {
    prompt += `
Requested mood and atmosphere: ${mood}.
Use this mood to shape the melody, groove, dynamics and instrumental arrangement.
`;
  }

  return {
    profile,
    requestedStyle,
    vocalLanguage: language,
    prompt,
    bpm,
    timeSignature
  };
}

// ==========================================
// استخراج فایل صوتی ACE
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
// درخواست مشترک به ACE
// ==========================================

async function requestAce(apiKey, aceBody) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    240000
  );

  try {
    const response = await fetch(ACE_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(aceBody),
      signal: controller.signal
    });

    const rawResponse = await response.text();

    let data;

    try {
      data = JSON.parse(rawResponse);
    } catch {
      throw new Error(
        `پاسخ ACE قابل پردازش نیست. کد HTTP: ${response.status}. ` +
        rawResponse.slice(0, 500)
      );
    }

    if (!response.ok || data.error) {
      const apiError =
        data.error?.message ||
        data.error ||
        data.message ||
        `خطای ACE با کد ${response.status}`;

      throw new Error(String(apiError).slice(0, 1200));
    }

    return {
      data,
      status: response.status
    };

  } finally {
    clearTimeout(timeout);
  }
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

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Nava-Test-Token",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    const url = new URL(request.url);

    // ======================================
    // وضعیت Worker
    // ======================================

    if (
      url.pathname === "/status" &&
      request.method === "GET"
    ) {
      return json({
        success: true,
        message: "Nava Worker is running",
        version: "nava-test-12-text2music",
        timestamp: new Date().toISOString()
      }, 200, corsOrigin);
    }

    // ======================================
    // تشخیص اتصال و فهرست مدل‌های ACE
    // ======================================

    if (
      url.pathname === "/ace-models" &&
      request.method === "GET"
    ) {
      const apiKey = env.ACEMUSIC_API_KEY;

      if (!apiKey) {
        return json({
          success: false,
          error: "کلید ACEMUSIC_API_KEY در Secrets کلودفلر ثبت نشده است."
        }, 500, corsOrigin);
      }

      const controller = new AbortController();

      const timeout = setTimeout(
        () => controller.abort(),
        30000
      );

      try {
        const response = await fetch(ACE_MODELS_URL, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Accept": "application/json"
          },
          signal: controller.signal
        });

        const rawResponse = await response.text();

        let data;

        try {
          data = JSON.parse(rawResponse);
        } catch {
          return json({
            success: false,
            error: "پاسخ فهرست مدل‌های ACE قابل پردازش نیست.",
            httpStatus: response.status,
            responsePreview: rawResponse.slice(0, 1500)
          }, 502, corsOrigin);
        }

        if (!response.ok || data.error) {
          return json({
            success: false,
            error: "ACE درخواست فهرست مدل‌ها را نپذیرفت.",
            httpStatus: response.status,
            details:
              data.error?.message ||
              data.error ||
              data.message ||
              rawResponse.slice(0, 1000)
          }, 502, corsOrigin);
        }

        const modelList = Array.isArray(data.data)
          ? data.data.map(model => ({
              id: model.id || null,
              object: model.object || null
            }))
          : null;

        return json({
          success: true,
          message: "ارتباط احراز هویت‌شده با ACE برقرار شد.",
          httpStatus: response.status,
          models: modelList,
          response: modelList ? undefined : data,
          checkedAt: new Date().toISOString()
        }, 200, corsOrigin);

      } catch (e) {
        return json({
          success: false,
          error: e.name === "AbortError"
            ? "زمان انتظار برای پاسخ ACE تمام شد."
            : "ارتباط با ACE ناموفق بود.",
          details: e.message || "ACE connection error"
        }, 502, corsOrigin);

      } finally {
        clearTimeout(timeout);
      }
    }

    // ======================================
    // آزمایش مستقل Text-to-Music
    // بدون فایل مرجع و بدون خواننده
    // محافظت‌شده با NAVA_TEST_TOKEN
    // ======================================

    if (
      url.pathname === "/ace-test-text2music" &&
      request.method === "POST"
    ) {
      if (!env.NAVA_TEST_TOKEN) {
        return json({
          success: false,
          error: "Secret با نام NAVA_TEST_TOKEN در Cloudflare تنظیم نشده است."
        }, 500, corsOrigin);
      }

      const suppliedToken =
        request.headers.get("X-Nava-Test-Token") || "";

      if (
        suppliedToken.length < 16 ||
        suppliedToken !== env.NAVA_TEST_TOKEN
      ) {
        return json({
          success: false,
          error: "رمز آزمایش نامعتبر است."
        }, 401, corsOrigin);
      }

      // محدودیت دامنه حذف شده است.
      // امنیت این مسیر همچنان با NAVA_TEST_TOKEN تأمین می‌شود.

      const apiKey = env.ACEMUSIC_API_KEY;

      if (!apiKey) {
        return json({
          success: false,
          error: "کلید ACEMUSIC_API_KEY در Secrets کلودفلر ثبت نشده است."
        }, 500, corsOrigin);
      }

      let input = {};

      try {
        input = await request.json();
      } catch {
        return json({
          success: false,
          error: "اطلاعات آزمایش معتبر نیست."
        }, 400, corsOrigin);
      }

      const prompt = `
Create a 30-second instrumental Iranian cinematic composition.

This is an independent text-to-music generation task.
There is NO uploaded reference audio.
Compose a new original musical piece from this written direction.

MUSICAL IDENTITY:

Create a recognizable Iranian Persian instrumental identity.
The melody must feel intentional, memorable and emotionally expressive.
Avoid generic background music and random instrumental noodling.

MELODY:

Compose one clear main melodic theme.
The theme must be easy to recognize and remember.
Develop the same theme naturally instead of introducing unrelated melodies.
Use expressive Persian melodic phrasing inspired by Iranian musical traditions.

INSTRUMENTS:

Feature santur as a clearly audible lead melodic instrument.
Use kamancheh for expressive sustained melodic responses.
Use tombak for a natural, restrained rhythmic foundation.
A subtle warm bass layer may support the arrangement.

Keep the santur melody in the foreground.
The kamancheh must be distinctly audible and must not disappear behind the mix.
Each instrument should have a clear musical role.

RHYTHM:

Use a moderate, natural 4/4 pulse around 90 BPM.
The rhythm must feel musical and human, not mechanical.
Avoid aggressive drums, dance beats and generic electronic loops.

ARRANGEMENT AND DEVELOPMENT:

0-7 seconds:
Begin with a short, recognizable santur melodic phrase.
Keep the opening clear and uncluttered.

7-18 seconds:
Introduce kamancheh with a complementary melodic response.
Establish a gentle rhythmic pulse with tombak.

18-26 seconds:
Develop the main melody with richer but balanced instrumentation.
Create a natural musical lift without simply increasing loudness.

26-30 seconds:
Bring the main melodic idea to a satisfying, intentional ending.
Do not abruptly cut off the music.

PRODUCTION:

Instrumental only.
No vocals, no singing, no humming, no choir, no spoken words.
No wordless vocalizations.
No sound effects.

Use clear instrument separation, balanced dynamics and a polished mix.
Do not let synthesizers replace the acoustic Iranian instruments.

The result should sound like a coherent short musical composition,
not a collection of disconnected sounds.
`;

      const aceBody = {
        model: ACE_MODEL,

        messages: [
          {
            role: "user",
            content: `<prompt>${prompt}</prompt>`
          }
        ],

        task_type: "text2music",
        stream: false,
        thinking: true,
        use_format: false,
        use_cot_caption: false,
        use_cot_language: false,

        audio_config: {
          duration: 30,
          instrumental: true,
          format: "mp3",
          bpm: 90,
          time_signature: "4"
        }
      };

      try {
        const aceResult = await requestAce(
          apiKey,
          aceBody
        );

        const audioUrl = extractAceAudio(aceResult.data);

        if (!audioUrl) {
          const message =
            aceResult.data.choices?.[0]?.message;

          return json({
            success: false,
            error: "ACE پاسخ داده است اما فایل صوتی پیدا نشد.",
            details: extractText(message?.content).slice(0, 1500),
            status: aceResult.status,
            provider: "ACE",
            model: ACE_MODEL,
            experiment: "independent-text2music"
          }, 502, corsOrigin);
        }

        return json({
          success: true,
          audioUrl,
          title: "Nava - Independent Text-to-Music Test",
          provider: "ACE-Step",
          model: ACE_MODEL,
          taskType: "text2music",
          instrumental: true,
          targetDuration: 30,
          experiment: "independent-text2music",
          musicalDirection: "Iranian instrumental - santur, kamancheh, tombak",
          aceFinishReason:
            aceResult.data.choices?.[0]?.finish_reason || null,
          aceUsage: aceResult.data.usage || null
        }, 200, corsOrigin);

      } catch (e) {
        return json({
          success: false,
          error: e.name === "AbortError"
            ? "زمان انتظار برای ساخت موسیقی توسط ACE تمام شد."
            : "ساخت موسیقی آزمایشی ناموفق بود.",
          details: e.message || "ACE connection error",
          provider: "ACE",
          model: ACE_MODEL,
          experiment: "independent-text2music"
        }, 502, corsOrigin);
      }
    }

    // ======================================
    // ۱. تولید شعر
    // ======================================

    if (
      url.pathname === "/generate-lyrics" &&
      request.method === "POST"
    ) {
      let input;

      try {
        input = await request.json();
      } catch {
        return json({
          error: "اطلاعات ارسالی نامعتبر است."
        }, 400, corsOrigin);
      }

      const topic = safeText(input.topic || "", 500);
      const style = safeText(input.style || "پاپ", 100);

      const language = ["fa", "tr", "en"].includes(input.language)
        ? input.language
        : "fa";

      if (!topic) {
        return json({
          error: "موضوع شعر نمی‌تواند خالی باشد."
        }, 400, corsOrigin);
      }

      const prompt = buildLyricsPrompt(
        topic,
        style,
        language
      );

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

            const result = parseLyricsOutput(
              rawLyrics,
              language
            );

            if (result.lyrics) {
              return json({
                success: true,
                lyrics: result.lyrics,
                singingLyrics: result.singingLyrics,
                provider: "Gemini"
              }, 200, corsOrigin);
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

      // OpenRouter fallback
      if (!env.OPENROUTER_API_KEY) {
        return json({
          error:
            "ساخت شعر با Gemini ناموفق بود و کلید OpenRouter نیز تنظیم نشده است.",
          geminiError
        }, 502, corsOrigin);
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
          return json({
            error: "پاسخ OpenRouter قابل پردازش نیست.",
            geminiError,
            routerStatus: routerRes.status
          }, 502, corsOrigin);
        }

        if (!routerRes.ok || routerData.error) {
          return json({
            error: "ساخت شعر با هر دو سرویس ناموفق بود.",
            geminiError,
            openRouterError:
              routerData.error?.message ||
              `خطای OpenRouter با کد ${routerRes.status}`
          }, 502, corsOrigin);
        }

        const rawLyrics = extractText(
          routerData.choices?.[0]?.message?.content
        );

        const result = parseLyricsOutput(
          rawLyrics,
          language
        );

        if (!result.lyrics) {
          return json({
            error: "OpenRouter هم متن معتبری تولید نکرد.",
            geminiError
          }, 502, corsOrigin);
        }

        return json({
          success: true,
          lyrics: result.lyrics,
          singingLyrics: result.singingLyrics,
          provider: "OpenRouter - Qwen3 8B"
        }, 200, corsOrigin);

      } catch (e) {
        return json({
          error: "ارتباط با سرویس ساخت شعر ناموفق بود.",
          geminiError,
          openRouterError: e.message
        }, 502, corsOrigin);
      }
    }

    // ======================================
    // ۲. آزمایشگاه موسیقی بی‌کلام
    // Cover با فایل مرجع
    // ======================================

    if (
      url.pathname === "/generate-instrumental" &&
      request.method === "POST"
    ) {
      const apiKey = env.ACEMUSIC_API_KEY;

      if (!apiKey) {
        return json({
          success: false,
          error: "کلید ACEMUSIC_API_KEY در Secrets کلودفلر ثبت نشده است."
        }, 500, corsOrigin);
      }

      let formData;

      try {
        formData = await request.formData();
      } catch {
        return json({
          success: false,
          error: "اطلاعات ارسالی معتبر نیست. فایل MP3 را انتخاب کن."
        }, 400, corsOrigin);
      }

      const referenceFile = formData.get("referenceAudio");

      const userNotes = safeText(
        formData.get("notes") || "",
        500
      );

      if (
        !referenceFile ||
        typeof referenceFile.arrayBuffer !== "function"
      ) {
        return json({
          success: false,
          error: "لطفاً فایل صوتی مرجع را انتخاب کن."
        }, 400, corsOrigin);
      }

      if (referenceFile.size === 0) {
        return json({
          success: false,
          error: "فایل انتخاب‌شده خالی است."
        }, 400, corsOrigin);
      }

      if (referenceFile.size > 10 * 1024 * 1024) {
        return json({
          success: false,
          error: "حجم فایل نباید بیشتر از ۱۰ مگابایت باشد."
        }, 400, corsOrigin);
      }

      const fileName = String(
        referenceFile.name || ""
      ).toLowerCase();

      if (
        !fileName.endsWith(".mp3") &&
        referenceFile.type !== "audio/mpeg"
      ) {
        return json({
          success: false,
          error: "فعلاً فقط فایل MP3 پشتیبانی می‌شود."
        }, 400, corsOrigin);
      }

      let referenceAudioBase64;

      try {
        const audioBuffer = await referenceFile.arrayBuffer();
        referenceAudioBase64 = arrayBufferToBase64(audioBuffer);
      } catch {
        return json({
          success: false,
          error: "خواندن فایل صوتی مرجع ناموفق بود."
        }, 400, corsOrigin);
      }

      const prompt = `
Create a 30-second instrumental cover based on the uploaded reference audio.

The uploaded audio is the primary source.
Use the actual musical content of the uploaded audio.

MAIN OBJECTIVE:

Create a new instrumental rendition that stays strongly connected
to the reference composition.

Preserve the recognizable main melody, melodic contour,
rhythmic structure, tempo, musical phrasing and overall progression
as closely as the model allows.

Do not treat the reference as merely a mood or genre suggestion.
Do not invent an unrelated melody.
Do not replace the main melodic identity with a generic composition.

MELODY:

Preserve the recognizable main melodic theme of the reference.
Keep the important melodic phrases and their musical order.
Maintain the characteristic rises, falls, pauses and phrase endings.

The melody should remain recognizable as belonging to the reference,
even when played with different instruments.

RHYTHM:

Preserve the reference rhythmic feel and groove.
Keep a similar tempo and rhythmic energy.
Do not impose an unrelated beat or a different rhythmic style.

ARRANGEMENT:

Create an instrumental rendition.
Use a suitable instrumental arrangement that supports the original melody.

Keep the lead melodic line clearly audible.
Supporting instruments should complement the main melody,
not compete with or replace it.

INSTRUMENTAL ONLY:

No singing.
No human voice.
No humming.
No choir.
No spoken words.
No wordless vocalizations.

DURATION AND STRUCTURE:

Create approximately 30 seconds of music.
Keep the main melodic identity present throughout.
Develop the arrangement naturally.
Finish with a musically satisfying ending.

PRODUCTION:

Use clear instrument separation.
Keep the mix balanced and polished.
Avoid unnecessary sound effects and unrelated musical transitions.

${userNotes ? `Additional direction: ${userNotes}` : ""}
`;

      const aceBody = {
        model: ACE_MODEL,

        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `<prompt>${prompt}</prompt>`
              },
              {
                type: "input_audio",
                input_audio: {
                  data: referenceAudioBase64,
                  format: "mp3"
                }
              }
            ]
          }
        ],

        task_type: "cover",
        audio_cover_strength: 0.8,

        stream: false,
        thinking: true,
        use_format: false,
        use_cot_caption: false,
        use_cot_language: false,

        audio_config: {
          duration: 30,
          instrumental: true,
          format: "mp3"
        }
      };

      try {
        const aceResult = await requestAce(
          apiKey,
          aceBody
        );

        const audioUrl = extractAceAudio(aceResult.data);

        if (!audioUrl) {
          const message =
            aceResult.data.choices?.[0]?.message;

          return json({
            success: false,
            error: "ACE پاسخ داده است اما فایل صوتی پیدا نشد.",
            details: extractText(message?.content).slice(0, 1500),
            status: aceResult.status,
            provider: "ACE",
            model: ACE_MODEL
          }, 502, corsOrigin);
        }

        return json({
          success: true,
          audioUrl,
          title: "Nava Instrumental Lab - Reference Cover Test",
          provider: "ACE-Step",
          model: ACE_MODEL,
          instrumental: true,
          targetDuration: 30,
          experiment: "reference-audio-cover",
          coverStrength: 0.8
        }, 200, corsOrigin);

      } catch (e) {
        return json({
          success: false,
          error: e.name === "AbortError"
            ? "زمان انتظار برای ساخت موسیقی توسط ACE تمام شد."
            : "ساخت موسیقی بی‌کلام ناموفق بود.",
          details: e.message || "ACE connection error",
          provider: "ACE",
          model: ACE_MODEL
        }, 502, corsOrigin);
      }
    }

    // ======================================
    // ۳. ساخت آهنگ باکلام
    // ======================================

    if (
      url.pathname === "/generate-music" &&
      request.method === "POST"
    ) {
      const apiKey = env.ACEMUSIC_API_KEY;

      if (!apiKey) {
        return json({
          success: false,
          error: "کلید ACEMUSIC_API_KEY در Secrets کلودفلر ثبت نشده است."
        }, 500, corsOrigin);
      }

      let input;

      try {
        input = await request.json();
      } catch {
        return json({
          success: false,
          error: "فرمت اطلاعات ارسالی نامعتبر است."
        }, 400, corsOrigin);
      }

      const language = ["fa", "tr", "en"].includes(input.language)
        ? input.language
        : "fa";

      const lyrics = prepareLyrics(
        safeText(
          input.singingLyrics || input.lyrics || "",
          8000
        ),
        language
      );

      if (!lyrics) {
        return json({
          success: false,
          error: "متن ترانه خالی است. ابتدا شعر را وارد کن."
        }, 400, corsOrigin);
      }

      if (lyrics.length > 5000) {
        return json({
          success: false,
          error:
            "متن ترانه بیش از محدودیت ۵۰۰۰ کاراکتری است. لطفاً شعر را کوتاه‌تر کن."
        }, 400, corsOrigin);
      }

      const musicProfile = buildMusicProfile(input);

      const musicLyrics = prepareMusicLyrics(
        lyrics,
        musicProfile.profile
      );

      const audioConfig = {
        duration: 60,
        vocal_language: language,
        format: "mp3"
      };

      if (musicProfile.bpm) {
        audioConfig.bpm = musicProfile.bpm;
      }

      if (musicProfile.timeSignature) {
        audioConfig.time_signature =
          musicProfile.timeSignature;
      }

      const aceBody = {
        model: ACE_MODEL,

        messages: [
          {
            role: "user",
            content: `<prompt>
${musicProfile.prompt}
</prompt>
<lyrics>
${musicLyrics}
</lyrics>`
          }
        ],

        stream: false,
        thinking: true,
        use_format: false,
        use_cot_caption: false,
        use_cot_language: false,

        audio_config: audioConfig
      };

      try {
        const aceResult = await requestAce(
          apiKey,
          aceBody
        );

        const audioUrl = extractAceAudio(aceResult.data);

        if (!audioUrl) {
          const message =
            aceResult.data.choices?.[0]?.message;

          return json({
            success: false,
            error: "ACE پاسخ داده است اما فایل صوتی در پاسخ پیدا نشد.",
            details: extractText(message?.content).slice(0, 1500),
            status: aceResult.status,
            provider: "ACE",
            model: ACE_MODEL
          }, 502, corsOrigin);
        }

        return json({
          success: true,
          audioUrl,
          title: "Nava AI Song",
          provider: "ACE-Step",
          model: ACE_MODEL,
          musicProfile: musicProfile.profile,
          requestedStyle: musicProfile.requestedStyle,
          targetDuration: 60
        }, 200, corsOrigin);

      } catch (e) {
        return json({
          success: false,
          error: e.name === "AbortError"
            ? "زمان انتظار برای ساخت آهنگ توسط ACE تمام شد."
            : "ارتباط با سرویس ACE برقرار نشد.",
          details: e.message || "ACE connection error",
          provider: "ACE",
          model: ACE_MODEL
        }, 502, corsOrigin);
      }
    }

    // ======================================
    // مسیر نامعتبر
    // ======================================

    return json({
      error: "Not found"
    }, 404, corsOrigin);
  }
};
