import { jpnKanaToLatn, jpnToLatn } from "../lib/convert.ts";

const assertEquals = <T>(actual: T, expected: T): void => {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

const kanaCases = [
  ["", ""],
  ["がくせい", "cakusei"],
  ["きゃく", "kjaku"],
  ["しゃ", "sja"],
  ["じゃ", "zja"],
  ["ふ", "fu"],
  ["んぼ", "mbo"],
  ["ゐゑを", "vivevo"],
] as const;

const textCases = [
  ["日本語", "nitpóngó"],
  ["學生", "cvakseĩ"],
  ["観客", "kvankjak"],
  ["本", "pón"],
  ["法", "pop"],
  ["變換", "pènkvàn"],
  ["日本語を學ぶ生徒。", "nitpóngó vo manabu seĩto."],
  [
    "これは例文です。巧く變換できるかな？",
    "kore fa rèimbun desu. umaku pènkvàn dekiru ka na?",
  ],
  ["一萬人の觀客を前に歌った", "itmànnin no kvankjak vo mafe ni utafta"],
  ["三回 回って わんと言へ", "samkwai mafarte van to ife"],
  ["山陽道は遠い", "sanqjagdáu fa tofoi"],
  ["日本語を正しく讀むのは難しい", "nitpóngó vo tadasiku jomu no fa mudukasii"],
  ["「日本語」", "‹nitpóngó›"],
  ["、。！？", ",.!?"],
  ["日本語\n", "nitpóngó\n"],
  ["これはテストです", "kore fatesutodesu"],
] as const;

Deno.test("jpnKanaToLatn covers base kana, yoon, assimilation, and obsolete kana", () => {
  for (const [input, expected] of kanaCases) {
    assertEquals(jpnKanaToLatn(input), expected);
  }
});

Deno.test("jpnToLatn covers Sino-Japanese rules, historical spellings, punctuation, and whitespace", async () => {
  for (const [input, expected] of textCases) {
    assertEquals(await jpnToLatn(input), expected);
  }
});
