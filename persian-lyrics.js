
/*
 * Nava Persian Lyrics Engine
 * Version: 0.2.0
 * Persian pronunciation and singing preparation
 */

const NAVA_PRONUNCIATION = [
  {
    word: "چگونه",
    variants: ["چگونه"],
    spoken: "چگونه",
    singing: "چِگُونه",
    phonetic: "che-goo-ne"
  },
  {
    word: "دیوونه",
    variants: ["دیوونه"],
    spoken: "دیوونه",
    singing: "دیوونه",
    phonetic: "di-voo-ne"
  },
  {
    word: "بی‌نشونه",
    variants: ["بی‌نشونه", "بی نشونه"],
    spoken: "بی‌نشونه",
    singing: "بی‌نشونه",
    phonetic: "bi-ne-shoo-ne"
  },
  {
    word: "پریشون",
    variants: ["پریشون"],
    spoken: "پریشون",
    singing: "پریشون",
    phonetic: "pa-ri-shoon"
  },
  {
    word: "بی‌امونه",
    variants: ["بی‌امونه", "بی امونه"],
    spoken: "بی‌امونه",
    singing: "بی‌امونه",
    phonetic: "bi-a-moo-ne"
  },
  {
    word: "عاشقونه",
    variants: ["عاشقونه"],
    spoken: "عاشقونه",
    singing: "عاشقونه",
    phonetic: "a-she-ghoo-ne"
  },
  {
    word: "دل‌شکسته",
    variants: ["دل‌شکسته", "دل شکسته"],
    spoken: "دل‌شکسته",
    singing: "دل‌شکسته",
    phonetic: "del-she-kas-te"
  },
  {
    word: "خونه",
    variants: ["خونه"],
    spoken: "خونه",
    singing: "خونه",
    phonetic: "khoo-ne"
  },
  {
    word: "می‌خوام",
    variants: ["می‌خوام", "می خوام"],
    spoken: "می‌خوام",
    singing: "می‌خوام",
    phonetic: "mi-khaam"
  },
  {
    word: "خسته",
    variants: ["خسته"],
    spoken: "خسته",
    singing: "خسته",
    phonetic: "khas-te"
  }
];

function normalizePersian(text) {
  return String(text || "")
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u0640/g, "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function prepareSingingText(line) {
  return line
    .replace(/می\s+خواهم/g, "می‌خوام")
    .replace(/می‌خواهم/g, "می‌خوام")
    .replace(/دل\s+شکسته/g, "دل‌شکسته")
    .replace(/بی\s+نشونه/g, "بی‌نشونه")
    .replace(/بی\s+امونه/g, "بی‌امونه")
    .trim();
}

function getPronunciationHints(line) {
  const hints = [];

  for (const item of NAVA_PRONUNCIATION) {
    const found = item.variants.some(variant =>
      line.includes(variant)
    );

    if (found) {
      hints.push({
        word: item.word,
        spoken: item.spoken,
        singing: item.singing,
        phonetic: item.phonetic
      });
    }
  }

  return hints;
}

function preparePersianLyrics(input) {
  const originalText = String(input || "");
  const normalizedText = normalizePersian(originalText);

  const lines = normalizedText
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  return {
    engine: "Nava Persian Lyrics Engine",
    version: "0.2.0",
    language: "fa",
    dialect: "persian_colloquial",

    original_text: originalText,
    normalized_text: normalizedText,

    vocal: {
      voice: "male_solo",
      backing_vocals: false,
      style: "emotional"
    },

    lines: lines.map((line, index) => {
      const singingText = prepareSingingText(line);

      return {
        line_number: index + 1,
        original: line,
        singing_text: singingText,
        pronunciation_hints: getPronunciationHints(
          singingText
        )
      };
    })
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    preparePersianLyrics,
    normalizePersian,
    prepareSingingText,
    getPronunciationHints,
    NAVA_PRONUNCIATION
  };
}
