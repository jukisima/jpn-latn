import Kanji from "kanji.js";
import kuromoji from "kuromoji";
import Kyujitai from "kyujitai";
import TshetUinh from "tshet-uinh";
import wanakana from "wanakana";

const TOKENIZER_DIC_PATH =
  new URL(import.meta.resolve("kuromoji/dict")).pathname;

const CUSTOM_ROMAJI_MAPPING = {
  し: "si",
  じ: "zi",
  しゃ: "sja",
  しゅ: "sju",
  しょ: "sjo",
  じゃ: "zja",
  じゅ: "zju",
  じょ: "zjo",
  ち: "ti",
  ぢ: "di",
  ちゃ: "tja",
  ちゅ: "tju",
  ちょ: "tjo",
  つ: "tu",
  づ: "du",
  ふ: "fu",
  が: "ca",
  ぎ: "ci",
  ぐ: "cu",
  げ: "ce",
  ご: "co",
  わ: "va",
  ゐ: "vi",
  ゑ: "ve",
  を: "vo",
  ゔ: "vu",
  や: "ja",
  ゆ: "ju",
  よ: "jo",
} as const;

const NO_SPACE_BEFORE = new Set([
  "。",
  "、",
  ",",
  ".",
  "!",
  "?",
  ")",
  "]",
  "}",
  "›",
  "»",
]);
const NO_SPACE_AFTER = new Set(["(", "[", "{", "‹", "«"]);

const SYMBOL_MAP = new Map<string, string>([
  ["。", "."],
  ["、", ","],
  ["，", ","],
  ["．", "."],
  ["！", "!"],
  ["？", "?"],
  ["（", "("],
  ["）", ")"],
  ["［", "["],
  ["］", "]"],
  ["｛", "{"],
  ["｝", "}"],
  ["「", "‹"],
  ["」", "›"],
  ["『", "«"],
  ["』", "»"],
  ["・", "-"],
  ["　", " "],
]);

const O_DAN_TO_A_DAN = new Map<string, string>([
  ["お", "あ"],
  ["こ", "か"],
  ["ご", "が"],
  ["そ", "さ"],
  ["ぞ", "ざ"],
  ["と", "た"],
  ["ど", "だ"],
  ["の", "な"],
  ["ほ", "は"],
  ["ぼ", "ば"],
  ["ぽ", "ぱ"],
  ["も", "ま"],
  ["よ", "や"],
  ["ろ", "ら"],
]);

type ReadingKind = "on" | "kun" | "fallback";

interface KyujitaiInstance {
  decode(text: string): string;
  encode(text: string): string;
}

interface KyujitaiConstructor {
  new (callback?: (error?: Error | null) => void): KyujitaiInstance;
}

interface KuromojiToken {
  word_position: number;
  surface_form: string;
  pos: string;
  pos_detail_1: string;
  reading?: string;
  pronunciation?: string;
  basic_form?: string;
  conjugated_type?: string;
}

interface KuromojiTokenizer {
  tokenize(text: string): KuromojiToken[];
}

interface KuromojiModule {
  builder(options: { dicPath: string }): {
    build(
      callback: (error: Error | null, tokenizer: KuromojiTokenizer) => void,
    ): void;
  };
}

interface DictionaryReading {
  kind: "on" | "kun";
  reading: string;
  score?: number;
}

interface KanaPiece {
  kind: "kana";
  surface: string;
  chunk: string;
}

interface HanPiece {
  kind: "han";
  surface: string;
  chunk: string;
  readingKind: ReadingKind;
  dictionaryReading?: string;
}

type SplitPiece = KanaPiece | HanPiece;

interface SplitResult {
  score: number;
  pieces: SplitPiece[];
}

type ConvertedPiece = (KanaPiece | HanPiece) & {
  latn: string;
  entry?: TshetUinhEntry | null;
};

type QueryResult = ReturnType<typeof TshetUinh.資料.query字頭>[number];
type TshetUinhPosition = NonNullable<QueryResult["音韻地位"]>;
type TshetUinhEntry = Omit<QueryResult, "音韻地位"> & {
  音韻地位: TshetUinhPosition;
};

interface ConvertedToken {
  text: string;
  consumed: number;
  isOnCompound: boolean;
}

const KyujitaiClass = Kyujitai as unknown as KyujitaiConstructor;
const KanjiApi = Kanji as unknown as typeof import("kanji.js").default;

let tokenizerPromise: Promise<KuromojiTokenizer> | undefined;
let kyujitaiPromise: Promise<KyujitaiInstance> | undefined;
let kyujitaiInstance: KyujitaiInstance | undefined;

/**
 * Builds and memoizes the kuromoji tokenizer because loading the dictionary is expensive.
 */
const getTokenizer = (): Promise<KuromojiTokenizer> => {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath: TOKENIZER_DIC_PATH }).build(
        (error: Error | null, tokenizer: KuromojiTokenizer) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(tokenizer);
        },
      );
    });
  }

  return tokenizerPromise;
};

/**
 * Initializes and memoizes the kyujitai converter used to normalize old/new glyph variants.
 */
const getKyujitai = (): Promise<KyujitaiInstance> => {
  if (!kyujitaiPromise) {
    kyujitaiPromise = new Promise((resolve, reject) => {
      let instance!: KyujitaiInstance;
      instance = new KyujitaiClass((error) => {
        if (error) {
          reject(error);
          return;
        }

        kyujitaiInstance = instance;
        resolve(instance);
      });
    });
  }

  return kyujitaiPromise;
};

const normalizeForAnalysis = (text: string): string =>
  kyujitaiInstance ? kyujitaiInstance.decode(text) : text;

const toHira = (text: string): string =>
  wanakana.toHiragana(text, { passRomaji: true, useObsoleteKana: true });

const isKanaOnly = (text: string): boolean => wanakana.isKana(text);

const containsHan = (text: string): boolean => /[\p{Script=Han}々〆ヶ]/u.test(text);

const isHanChar = (char: string): boolean => /[\p{Script=Han}々〆ヶ]/u.test(char);

const normalizeLatnSpelling = (text: string): string => {
  return text
    .replace(/([kgnhbpmrscztd])ya/gu, "$1ja")
    .replace(/([kgnhbpmrscztd])yu/gu, "$1ju")
    .replace(/([kgnhbpmrscztd])yo/gu, "$1jo")
    .replace(/g(?=j?[aiueo])/gu, "c")
    .replace(/yi/gu, "i")
    .replace(/wu/gu, "u")
    .replace(/h(?=[aiueo])/gu, "f");
};

/**
 * Converts `jpn` written only in `Kana` into the project's base `Latn` spelling before any
 * Middle Chinese-specific adjustments are applied.
 */
export const jpnKanaToLatn = (text: string): string => {
  const hira = toHira(text);
  const romaji = wanakana.toRomaji(hira, {
    customRomajiMapping: CUSTOM_ROMAJI_MAPPING,
    useObsoleteKana: true,
  });

  return normalizeLatnSpelling(romaji)
    .replace(/n(?=[pbm])/gu, "m")
    .replace(/'/gu, "")
    .normalize("NFC");
};

const isAdjacentToken = (
  previous: KuromojiToken,
  current: KuromojiToken,
): boolean => {
  return (
    previous.word_position + Array.from(previous.surface_form).length ===
      current.word_position
  );
};

const normalizeKanjiDictionaryReading = (reading: string): string => {
  return toHira(reading)
    .replace(/[-.]/g, "")
    .replace(/（.*?）/gu, "")
    .replace(/[^ぁ-ゖゝゞーっんゃゅょゎ]/gu, "");
};

const toDictionaryReadings = (
  kind: DictionaryReading["kind"],
  values: readonly string[] = [],
): DictionaryReading[] =>
  values.flatMap((value) => {
    const reading = normalizeKanjiDictionaryReading(value);
    return reading ? [{ kind, reading }] : [];
  });

const getDictionaryReadings = (char: string): DictionaryReading[] => {
  const normalizedChar = normalizeForAnalysis(char);
  const details = KanjiApi.getDetails(normalizedChar);
  return details
    ? [
      ...toDictionaryReadings("on", details.onyomi),
      ...toDictionaryReadings("kun", details.kunyomi),
    ]
    : [];
};

const getTshetUinhEntries = (char: string): TshetUinhEntry[] => {
  const baseVariants = [char, normalizeForAnalysis(char)];
  const kyujitai = kyujitaiInstance;
  const variants = Array.from(
    new Set(
      kyujitai
        ? baseVariants.flatMap((variant) => [
          variant,
          kyujitai.encode(variant),
          kyujitai.decode(variant),
        ])
        : baseVariants,
    ),
  );

  return variants.flatMap((variant) =>
    TshetUinh.資料.query字頭(variant).flatMap((entry) =>
      entry.音韻地位 ? [entry as TshetUinhEntry] : []
    )
  );
};

const scoreReadingMatch = (dictionaryReading: string, chunk: string): number => {
  if (!dictionaryReading || !chunk) {
    return Number.POSITIVE_INFINITY;
  }

  if (dictionaryReading === chunk) {
    return 0;
  }

  if (dictionaryReading.startsWith(chunk)) {
    return 1 + (dictionaryReading.length - chunk.length);
  }

  if (chunk.startsWith(dictionaryReading)) {
    return 3 + (chunk.length - dictionaryReading.length);
  }

  return Number.POSITIVE_INFINITY;
};

const chooseBestReadingCandidate = (
  char: string,
  chunk: string,
): DictionaryReading | null =>
  getDictionaryReadings(char).reduce<DictionaryReading | null>((best, candidate) => {
    const score = scoreReadingMatch(candidate.reading, chunk);
    if (!Number.isFinite(score)) {
      return best;
    }

    if (
      !best ||
      score < (best.score ?? Number.POSITIVE_INFINITY) ||
      (score === best.score && candidate.kind === "on" && best.kind !== "on")
    ) {
      return { ...candidate, score };
    }

    return best;
  }, null);

/**
 * Splits a token-level reading across each surface character so kanji compounds
 * can be transformed one character at a time.
 */
const splitReadingForSurface = (
  surface: string,
  reading: string,
): SplitResult | null => {
  const chars = Array.from(surface);
  const hiraReading = toHira(reading);
  const memo = new Map<string, SplitResult | null>();

  const solve = (charIndex: number, readingIndex: number): SplitResult | null => {
    const key = `${charIndex}:${readingIndex}`;
    if (memo.has(key)) {
      return memo.get(key) ?? null;
    }

    if (charIndex === chars.length) {
      const result = readingIndex === hiraReading.length
        ? { score: 0, pieces: [] }
        : null;
      memo.set(key, result);
      return result;
    }

    const char = chars[charIndex];
    let best: SplitResult | null = null;

    if (!isHanChar(char)) {
      const expected = toHira(char);
      if (expected && hiraReading.startsWith(expected, readingIndex)) {
        const tail = solve(charIndex + 1, readingIndex + expected.length);
        if (tail) {
          best = {
            score: tail.score,
            pieces: [
              { kind: "kana", surface: char, chunk: expected },
              ...tail.pieces,
            ],
          };
        }
      } else {
        const tail = solve(charIndex + 1, readingIndex);
        if (tail) {
          best = {
            score: tail.score + 4,
            pieces: [
              { kind: "kana", surface: char, chunk: expected },
              ...tail.pieces,
            ],
          };
        }
      }

      memo.set(key, best);
      return best;
    }

    const remainingChars = chars.length - charIndex;
    const maxLength = Math.min(hiraReading.length - readingIndex, 6);
    for (let length = 1; length <= maxLength; length += 1) {
      const chunk = hiraReading.slice(readingIndex, readingIndex + length);
      const candidate = chooseBestReadingCandidate(char, chunk);
      if (!candidate) {
        continue;
      }

      const tail = solve(charIndex + 1, readingIndex + length);
      if (!tail) {
        continue;
      }

      const result: SplitResult = {
        score: (candidate.score ?? 0) + tail.score,
        pieces: [
          {
            kind: "han",
            surface: char,
            chunk,
            readingKind: candidate.kind,
            dictionaryReading: candidate.reading,
          },
          ...tail.pieces,
        ],
      };

      if (!best || result.score < best.score) {
        best = result;
      }
    }

    if (!best && readingIndex < hiraReading.length) {
      const maxFallbackLength = Math.max(
        1,
        hiraReading.length - readingIndex - (remainingChars - 1),
      );

      for (let length = 1; length <= maxFallbackLength; length += 1) {
        const chunk = hiraReading.slice(readingIndex, readingIndex + length);
        const tail = solve(charIndex + 1, readingIndex + length);
        if (!tail) {
          continue;
        }

        const result: SplitResult = {
          score: 10 + tail.score,
          pieces: [
            {
              kind: "han",
              surface: char,
              chunk,
              readingKind: "fallback",
            },
            ...tail.pieces,
          ],
        };

        if (!best || result.score < best.score) {
          best = result;
        }
      }
    }

    memo.set(key, best);
    return best;
  };

  return solve(0, 0);
};

const getInflectionConsonant = (token: KuromojiToken): string => {
  const reading = token.reading ?? token.surface_form;
  if (!/[っッ]$/u.test(reading)) {
    return "";
  }

  const match = /([カ-ヺ])行/u.exec(token.conjugated_type ?? "");
  if (!match) {
    return "";
  }

  if (match[1] === "ワ") {
    return "f";
  }

  const romaji = wanakana.toRomaji(match[1]);
  const onset = romaji.match(/^[a-z]+/u);
  return onset ? onset[0].replace(/[aeiou]+$/u, "") : "";
};

/**
 * Applies the limited historical-kana heuristics currently needed for kun-yomi
 * and native-word outputs in the spec examples.
 */
const toHistoricalKanaKun = (reading: string): string => {
  const hira = toHira(reading);
  const chars = Array.from(hira);

  for (let index = 1; index < chars.length; index += 1) {
    if (chars[index] !== "わ") {
      continue;
    }

    if (/[aeiouĩũ]$/u.test(jpnKanaToLatn(chars[index - 1]))) {
      chars[index] = "は";
    }
  }

  if (chars.at(-1) === "え") {
    chars[chars.length - 1] = "へ";
  }

  return chars.join("")
    .replace(/ず(?=か)/gu, "づ")
    .replace(/おい$/u, "ほい");
};

/**
 * Reconstructs historical kana spellings that are needed before applying
 * Sino-Japanese sound rules derived from Middle Chinese.
 */
const toHistoricalKanaOn = (
  reading: string,
  position: TshetUinhPosition,
): string => {
  let hira = toHira(reading);

  if (position.韻 === "陽") {
    hira = hira.replace(/よう$/u, "やう");
  }

  if (position.韻 === "豪") {
    hira = hira.replace(/(.)う$/u, (match, kana: string) => {
      const shifted = O_DAN_TO_A_DAN.get(kana);
      return shifted ? `${shifted}う` : match;
    });
  }

  return hira;
};

const endsWithConsonant = (latn: string): boolean => {
  const normalized = latn.normalize("NFD").replace(/\p{M}/gu, "");
  return /[bcdfghjklmnpqrstvwxyz]$/u.test(normalized);
};

const startsWithVowelOrSemivowel = (latn: string): boolean => {
  const normalized = latn.normalize("NFD").replace(/\p{M}/gu, "");
  return /^[aeioujv]/u.test(normalized);
};

/**
 * Inserts `q` at ambiguous syllable boundaries after Latin conversion.
 */
const addDisambiguatingQ = (left: string, right: string): string => {
  if (!left || !right) {
    return right;
  }

  if (endsWithConsonant(left) && startsWithVowelOrSemivowel(right)) {
    return `q${right}`;
  }

  return right;
};

const insertRoundedGlide = (
  latn: string,
  position: TshetUinhPosition,
): string => {
  if (!latn) {
    return latn;
  }

  if (position.呼 !== "合" && position.韻 !== "江") {
    return latn;
  }

  if (position.韻 === "灰") {
    return latn.replace(/^([bcdfghjklmnpqrstvz]?)(a)i/u, "$1w$2i");
  }

  return latn.replace(/^([bcdfghjklmnpqrstvz]?)(a|e|o)/u, "$1v$2");
};

const rewriteNasalInitial = (
  latn: string,
  position: TshetUinhPosition,
): string => {
  if (!latn) {
    return latn;
  }

  if (position.母 === "疑" && latn.startsWith("c")) {
    return latn.replace(/^c/u, "g");
  }

  if (position.母 === "日" && latn.startsWith("z")) {
    return latn.replace(/^z/u, "nz");
  }

  if (["泥", "孃", "娘"].includes(position.母) && latn.startsWith("d")) {
    return latn.replace(/^d/u, "nd");
  }

  if (position.母 === "明" && latn.startsWith("b")) {
    return latn.replace(/^b/u, "mb");
  }

  return latn;
};

const rewritePInitial = (
  latn: string,
  position: TshetUinhPosition,
): string => {
  if (!latn) {
    return latn;
  }

  if (["幫", "滂", "並"].includes(position.母) && latn.startsWith("f")) {
    return latn.replace(/^f/u, "p");
  }

  return latn;
};

const applyEnteringCoda = (
  latn: string,
  hiraChunk: string,
  position: TshetUinhPosition,
): string => {
  if (position.聲 !== "入") {
    return latn;
  }

  const hira = toHira(hiraChunk);
  if (/[きく]$/u.test(hira)) {
    return latn.replace(/ki$|ku$/u, "k");
  }

  if (/[ちつ]$/u.test(hira)) {
    return latn.replace(/ti$|tu$/u, "t");
  }

  if (hira.endsWith("ふ")) {
    return latn.replace(/fu$/u, "p");
  }

  if (hira.endsWith("う")) {
    return latn.replace(/u$/u, "p");
  }

  return latn;
};

const applyVelarNasal = (
  latn: string,
  hiraChunk: string,
  position: TshetUinhPosition,
): string => {
  if (!position.屬於("通江宕梗曾攝") || position.聲 === "入") {
    return latn;
  }

  if (position.韻 === "陽") {
    return latn.replace(/au$/u, "ag");
  }

  const hira = toHira(hiraChunk);
  if (hira.endsWith("い")) {
    return latn.replace(/i$/u, "ĩ");
  }

  if (hira.endsWith("う")) {
    return latn.replace(/u$/u, "ũ");
  }

  return latn;
};

const applyToneMark = (latn: string, position: TshetUinhPosition): string => {
  const tone = position.聲 === "上"
    ? "\u0301"
    : position.聲 === "去"
    ? "\u0300"
    : "";
  if (!tone) {
    return latn;
  }

  const index = latn.search(/[aeiouĩũ]/u);
  if (index === -1) {
    return latn;
  }

  return `${latn.slice(0, index + 1)}${tone}${latn.slice(index + 1)}`.normalize(
    "NFC",
  );
};

/**
 * Converts one on-yomi chunk from `jpn` into `Latn` using the project's
 * Middle Chinese-based rules.
 */
const onChunkToLatn = (
  reading: string,
  position: TshetUinhPosition,
): string => {
  const historicalKana = toHistoricalKanaOn(reading, position);
  let latn = jpnKanaToLatn(historicalKana);
  latn = rewriteNasalInitial(latn, position);
  latn = rewritePInitial(latn, position);
  latn = insertRoundedGlide(latn, position);
  latn = applyEnteringCoda(latn, historicalKana, position);
  latn = applyVelarNasal(latn, historicalKana, position);
  latn = applyToneMark(latn, position);
  return latn;
};

const pickTshetUinhEntry = (char: string): TshetUinhEntry | null =>
  getTshetUinhEntries(char)[0] ?? null;

const applyHistoricalInflection = (
  latn: string,
  token: KuromojiToken,
): string => {
  if ((token.conjugated_type ?? "").includes("アウオ段")) {
    return latn.replace(/ooi$/u, "ofoi");
  }

  return latn;
};

const toSingleHanSurfaceKunyomi = (token: KuromojiToken): string | null => {
  const [head, ...tail] = Array.from(token.surface_form);
  if (!head || !isHanChar(head) || tail.length === 0 || tail.some(isHanChar)) {
    return null;
  }

  const suffix = toHira(tail.join(""));
  const candidates = getDictionaryReadings(head)
    .filter((reading) => reading.kind === "kun")
    .map((reading) => reading.reading)
    .flatMap((reading) => {
      const inflected = reading.endsWith("しい") && suffix.startsWith("し")
        ? `${reading.slice(0, -2)}${suffix}`
        : reading.endsWith("い")
        ? `${reading.slice(0, -1)}${suffix}`
        : reading.endsWith("う") && suffix === "へ"
        ? `${reading.slice(0, -1)}へ`
        : reading;
      return inflected.endsWith(suffix) ? [inflected] : [];
    })
    .sort((left, right) => right.length - left.length);

  return candidates[0] ?? null;
};

/**
 * Converts a token that contains `Hani`, preferring per-character on/kun
 * analysis when kuromoji provides a usable reading.
 */
const splitPieceToLatn = (piece: SplitPiece): ConvertedPiece => {
  if (piece.kind !== "han") {
    return { ...piece, latn: jpnKanaToLatn(piece.chunk) };
  }

  const entry = pickTshetUinhEntry(piece.surface);
  if (piece.readingKind === "on" && entry) {
    return {
      ...piece,
      entry,
      latn: onChunkToLatn(
        piece.dictionaryReading ?? piece.chunk,
        entry.音韻地位,
      ),
    };
  }

  return {
    ...piece,
    entry,
    latn: piece.readingKind === "kun"
      ? jpnKanaToLatn(toHistoricalKanaKun(piece.chunk))
      : jpnKanaToLatn(piece.chunk),
  };
};

const hanTokenToLatn = (token: KuromojiToken): ConvertedToken | null => {
  if (!token.reading) {
    return null;
  }

  const split = splitReadingForSurface(token.surface_form, token.reading);
  if (!split || split.score > 8) {
    return null;
  }

  const pieces = split.pieces.map(splitPieceToLatn);
  const { text, isOnCompound } = pieces.reduce<{
    text: string;
    isOnCompound: boolean;
  }>(
    (state, piece) => ({
      text: state.text + addDisambiguatingQ(state.text, piece.latn),
      isOnCompound: state.isOnCompound &&
        piece.kind === "han" &&
        piece.readingKind === "on",
    }),
    { text: "", isOnCompound: true },
  );

  return {
    text: applyHistoricalInflection(
      text + getInflectionConsonant(token),
      token,
    ),
    consumed: 1,
    isOnCompound: isOnCompound &&
      split.pieces.every((piece) => piece.kind === "han"),
  };
};

const symbolToLatn = (token: KuromojiToken): string => {
  if (token.pos_detail_1 === "空白") {
    return token.surface_form;
  }

  return SYMBOL_MAP.get(token.surface_form) ?? token.surface_form;
};

/**
 * Repairs kuromoji tokenization for cases where a `Hani` stem and trailing `Kana`
 * are split even though they should be handled as a single kun-yomi form.
 */
const mergedKunyomiToLatn = (
  tokens: KuromojiToken[],
  index: number,
): ConvertedToken | null => {
  const token = tokens[index];
  const nextToken = tokens[index + 1];

  if (
    !nextToken ||
    !containsHan(token.surface_form) ||
    Array.from(token.surface_form).length !== 1 ||
    !isKanaOnly(nextToken.surface_form) ||
    !isAdjacentToken(token, nextToken)
  ) {
    return null;
  }

  const suffix = toHira(nextToken.surface_form);
  const kunyomi = getDictionaryReadings(token.surface_form)
    .filter((reading) => reading.kind === "kun")
    .map((reading) => reading.reading);

  for (const reading of kunyomi) {
    if (suffix === "く" && reading.endsWith("い")) {
      return {
        text: jpnKanaToLatn(toHistoricalKanaKun(`${reading.slice(0, -1)}く`)),
        consumed: 2,
        isOnCompound: false,
      };
    }

    if (suffix === "へ" && reading.endsWith("う")) {
      return {
        text: jpnKanaToLatn(`${reading.slice(0, -1)}へ`),
        consumed: 2,
        isOnCompound: false,
      };
    }
  }

  return null;
};

const tokenToLatn = (
  tokens: KuromojiToken[],
  index: number,
): ConvertedToken => {
  const mergedKunyomi = mergedKunyomiToLatn(tokens, index);
  if (mergedKunyomi) {
    return mergedKunyomi;
  }

  const token = tokens[index];
  if (token.pos === "記号") {
    return { text: symbolToLatn(token), consumed: 1, isOnCompound: false };
  }

  if (containsHan(token.surface_form)) {
    const singleHanKunyomi = toSingleHanSurfaceKunyomi(token);
    if (singleHanKunyomi) {
      return {
        text: jpnKanaToLatn(toHistoricalKanaKun(singleHanKunyomi)),
        consumed: 1,
        isOnCompound: false,
      };
    }

    const hanConversion = hanTokenToLatn(token);
    if (hanConversion) {
      return hanConversion;
    }

    const reading = token.reading ?? token.surface_form;
    return {
      text: jpnKanaToLatn(reading) + getInflectionConsonant(token),
      consumed: 1,
      isOnCompound: false,
    };
  }

  return {
    text: jpnKanaToLatn(token.surface_form || token.reading || ""),
    consumed: 1,
    isOnCompound: false,
  };
};

const shouldInsertLatnSpace = (
  previous: KuromojiToken | null,
  current: KuromojiToken,
): boolean => {
  if (!previous) {
    return false;
  }

  if (previous.pos === "記号" || current.pos === "記号") {
    return false;
  }

  if (
    current.pos === "助動詞" &&
    ["動詞", "助動詞", "形容詞"].includes(previous.pos)
  ) {
    return false;
  }

  if (current.pos === "助詞" && current.pos_detail_1 === "接続助詞") {
    return false;
  }

  if (
    isKanaOnly(previous.surface_form) &&
    isKanaOnly(current.surface_form) &&
    current.pos !== "助詞"
  ) {
    return false;
  }

  return true;
};

/**
 * Converts arbitrary `jpn` text into the `Latn` notation defined by
 * the current spec.
 */
export const jpnToLatn = async (text: string): Promise<string> => {
  if (!text) {
    return "";
  }

  const [tokenizer] = await Promise.all([getTokenizer(), getKyujitai()]);
  const normalizedText = normalizeForAnalysis(text);
  const tokens = tokenizer.tokenize(normalizedText);
  let output = "";
  let previousToken: KuromojiToken | null = null;
  let previousWasOnCompound = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const converted = tokenToLatn(tokens, index);
    const lastConsumedToken = tokens[index + converted.consumed - 1];

    if (token.pos === "記号" && token.pos_detail_1 === "空白") {
      output += converted.text;
      previousToken = null;
      previousWasOnCompound = false;
      continue;
    }

    if (
      previousToken &&
      previousWasOnCompound &&
      converted.isOnCompound &&
      isAdjacentToken(previousToken, token)
    ) {
      output += addDisambiguatingQ(output, converted.text);
    } else {
      if (
        shouldInsertLatnSpace(previousToken, token) &&
        !NO_SPACE_BEFORE.has(converted.text) &&
        !NO_SPACE_AFTER.has(output.slice(-1))
      ) {
        output += " ";
      }

      output += converted.text;
    }

    if (token.pos !== "記号") {
      previousToken = lastConsumedToken;
      previousWasOnCompound = converted.isOnCompound;
    }

    index += converted.consumed - 1;
  }

  return output.replace(/n(?=kw)/gu, "m");
};
