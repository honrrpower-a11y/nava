
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
// آماده‌سازی ساختار شعر برای ACE
// فقط برای موسیقی فارسی
// ==========================================

function prepareMusicLyrics(text, profile) {
  let result = String(text || "").trim();

  if (!result || profile !== "persian") {
    return result;
  }

  // حذف برچسب مقدمه یا بخش بی‌کلام از ابتدای شعر
  // تا مقدمه جدید دوباره تکرار نشود.
  result = result.replace(
    /^\s*(?:\[(?:intro|instrumental)\]\s*)+/i,
    ""
  );

  // اگر شعر هیچ ساختار مشخصی نداشته باشد،
  // شروع آن را به‌عنوان Verse 1 مشخص می‌کنیم.
  const hasSongSections =
    /\[(?:verse|chorus|pre-chorus|bridge|final chorus|outro|instrumental)\b[^\]]*\]/i.test(result);

  if (!hasSongSections) {
    result = `[Verse 1]\n${result}`;
  }

  // مقدمه سازی مستقل از شروع آواز
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
// پروفایل‌های مستقل موسیقی
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

  // ----------------------------------------
  // موسیقی ترکیه‌ای
  // ----------------------------------------

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
Use Turkish musical phrasing throughout the song.

Avoid Iranian, Arabic, Indian and Bollywood musical arrangements.
Avoid generic Western rock and jazz sounds.
Do not make electric guitar the dominant instrument.
The result must sound Turkish in its melody, rhythm and arrangement.
`;

    bpm = 105;
    timeSignature = "4";
  }

  // ----------------------------------------
  // موسیقی عربی
  // ----------------------------------------

  else if (
    /عرب|arabic|arab|خلیجی/i.test(style)
  ) {
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

  // ----------------------------------------
  // موسیقی راک
  // ----------------------------------------

  else if (
    /راک|rock|metal|متال/i.test(style)
  ) {
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

  // ----------------------------------------
  // موسیقی جاز
  // ----------------------------------------

  else if (
    /جاز|jazz|بلوز|blues/i.test(style)
  ) {
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

  // ----------------------------------------
  // موسیقی ایرانی
  // ----------------------------------------

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

  // ----------------------------------------
  // پاپ عمومی
  // ----------------------------------------

  else {
    profile = "pop";

    prompt = `
Create a contemporary pop song with a clear musical identity.

Use a memorable melody, balanced instrumentation and a coherent arrangement.
Follow the requested musical style: ${requestedStyle || "contemporary pop"}.

Avoid unnecessary jazz or rock elements unless explicitly requested.
`;

    bpm = null;
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
          version: "nava-test-7",
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
    // ۲. ساخت موسیقی با ACE
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
      // انتخاب پروفایل موسیقی
      // ------------------------------------

      const musicProfile = buildMusicProfile(input);

      // ------------------------------------
      // ساخت ساختار ویژه شعر برای ACE
      // ------------------------------------

      const musicLyrics = prepareMusicLyrics(
        lyrics,
        musicProfile.profile
      );

      // ------------------------------------
      // درخواست ساختاریافته به ACE
      // ------------------------------------

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
          model: ACE_MODEL,
          musicProfile: musicProfile.profile,
          requestedStyle: musicProfile.requestedStyle,
          targetDuration: 60
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
