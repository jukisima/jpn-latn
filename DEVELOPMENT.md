# Development Notes

## Goal

`jpn-latn` converts `jpn` text into a project-specific `Latn` notation defined
by [SPEC.md](/Users/sumi/git/jpn-latn/SPEC.md).

## Current Entry Points

- CLI: [index.ts](/Users/sumi/git/jpn-latn/index.ts)
- Main converter: [lib/convert.ts](/Users/sumi/git/jpn-latn/lib/convert.ts)
- Tests: [test/convert.test.ts](/Users/sumi/git/jpn-latn/test/convert.test.ts)

Primary exported functions:

- `jpnKanaToLatn(text)`
- `jpnToLatn(text)`

## Runtime Setup

This project is Deno-first.

- config: [deno.json](/Users/sumi/git/jpn-latn/deno.json)
- package manager role: handled through Deno `imports`
- installed npm packages are resolved through Deno with `nodeModulesDir: "auto"`

Useful commands:

```sh
deno task check
deno task test
deno task run -- "山陽道は遠い"
```

## External Libraries And Why They Exist

- `kuromoji`: tokenization and kana readings for whole-sentence conversion
- `wanakana`: kana to Latin conversion base layer
- `kanji.js`: dictionary on/kun readings per character
- `tshet-uinh`: Middle Chinese data used for Sino-Japanese distinctions
- `kyujitai`: normalize old/new character forms during analysis

## High-Level Conversion Pipeline

`jpnToLatn()` currently works like this:

1. Normalize text for analysis with `kyujitai.decode()`
2. Tokenize with `kuromoji`
3. Convert each token
4. Insert spaces between tokens when needed
5. Apply a final `n -> m` assimilation before `kw`

There are two main paths:

- `Kana`/native path: direct conversion through `jpnKanaToLatn()`
- `Hani` path: split readings by character, detect on/kun usage, then apply
  Middle Chinese rules

## Rules Already Implemented

### Middle Chinese / Sino-Japanese rules

Implemented from the current spec:

- nasal initials:
  - `疑`-driven voiced velars map to `g`
  - `日` with `z...` maps to `nz...`
  - `泥/孃/娘` with `d...` maps to `nd...`
  - `明` with `b...` maps to `mb...`
- entering tone codas:
  - `き/く -> k`
  - `ち/つ -> t`
  - `ふ -> p`
  - `う -> p`
- velar nasal behavior:
  - `...i -> ...ĩ`
  - `...u -> ...ũ`
  - `陽` handling currently becomes `...ag`
- tone marks:
  - rising tone uses acute
  - departing tone uses grave
  - mark is currently placed on the first vowel in the syllable
- rounded glide handling:
  - regular `合`/`江` cases are rewritten with `v`
  - `灰` is special-cased to `kwai`-style output

### Historical native-word behavior

The implementation currently contains targeted support for examples like:

- `前 -> mafe`
- `回って -> mafarte`
- `言へ -> ife`
- `遠い -> tofoi`
- `巧く -> umaku`

This logic is heuristic, not a complete classical Japanese inflection engine.

## Spacing And Compound Behavior

Current output intentionally does not hyphenate Sino-Japanese compounds anymore.

Examples:

- `日本語 -> nitpóngó`
- `學生 -> cvakseĩ`
- `一萬人 -> itmànnin`

Spaces are still inserted between tokens when `kuromoji` segmentation says they
are separate enough.

## Current Known Good Outputs

These are covered in tests and are useful sanity checks:

```txt
日本語 -> nitpóngó
学生 -> cvakseĩ
日本語を學ぶ生徒。 -> nitpóngó vo manabu seĩto.
これは例文です。巧く變換できるかな？ -> kore fa rèimbun desu. umaku pènkvàn dekiru ka na?
一萬人の觀客を前に歌った -> itmànnin no kvankjak vo mafe ni utafta
三回 回って わんと言へ -> samkwai mafarte van to ife
山陽道は遠い -> sanqjagdáu fa tofoi
```

## Testing Notes

Main tests live in
[test/convert.test.ts](/Users/sumi/git/jpn-latn/test/convert.test.ts).

Run:

```sh
deno test --allow-read
```

`--allow-read` is required because `kuromoji` reads dictionary files from its
package directory.

## Known Fragility

- `kuromoji` tokenization strongly affects output quality. If tokenization
  changes, spacing and reading splitting may change too.

- Historical kana support is currently example-driven and heuristic. It is not a
  full grammar or historical orthography system.

- The on/kun split is based on dictionary matching plus scoring. Rare characters
  or ambiguous compounds may choose the wrong reading.

- Middle Chinese entry selection currently uses the first matching `tshet-uinh`
  entry in some paths. If a character has multiple valid historical readings,
  output can depend on that order.

- `q` insertion is intentionally simple: it looks at Latin-script boundaries
  after transformation, not at a richer phonological model.

## Practical Advice For Future Changes

- If a new spec example fails, first inspect `kuromoji` tokenization before
  changing phonology logic.
- If one `Hani` inside a compound is wrong, inspect the JSDoc on the reading
  split and on-yomi conversion helpers in [lib/convert.ts](/Users/sumi/git/jpn-latn/lib/convert.ts).
- If a native word is wrong, inspect the JSDoc on the kun-yomi repair and
  historical inflection helpers in [lib/convert.ts](/Users/sumi/git/jpn-latn/lib/convert.ts).
- If spacing is wrong, inspect `shouldInsertLatnSpace()`.
- If the project stops running in Deno, check that `deno.json` still contains
  the npm `imports` and `nodeModulesDir`.

## Suggested Next Cleanup

- document the exact `q` insertion rule with more examples
- separate phonology rules from tokenization logic into smaller modules if the
  converter grows
- add targeted tests for each individual sound rule instead of only
  sentence-level regression tests
