import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  approximateTokenSize,
  estimateTokenCount,
  isWithinTokenLimit,
  sliceByTokens,
  splitByTokens,
} from '../src/index'

const fixturesDir = join(import.meta.dirname, 'fixtures')

const ENGLISH_TEXT = 'Hello, world! This is a short sentence.'
const GERMAN_TEXT = 'Die pünktlich gewünschte Trüffelfüllung im übergestülpten Würzkümmel-Würfel ist kümmerlich und dürfte fürderhin zu Rüffeln in Hülle und Fülle führen'

describe('estimateTokenCount', () => {
  it('estimates tokens for short English text', () => {
    expect(estimateTokenCount(ENGLISH_TEXT)).toMatchInlineSnapshot('11')
  })

  it('estimates tokens for German text with umlauts', () => {
    expect(estimateTokenCount(GERMAN_TEXT)).toMatchInlineSnapshot(`56`)
  })

  it('estimates the token count of the English excerpt', async () => {
    const input = await readFile(join(fixturesDir, 'texts/great-gatsby-en.txt'), 'utf-8')
    expect(estimateTokenCount(input)).toMatchInlineSnapshot(`4867`)
  })

  it('estimates the token count of the German excerpt', async () => {
    const input = await readFile(join(fixturesDir, 'texts/die-verwandlung-de.txt'), 'utf-8')
    expect(estimateTokenCount(input)).toMatchInlineSnapshot(`4830`)
  })

  it('estimates the token count of the Chinese excerpt', async () => {
    const input = await readFile(join(fixturesDir, 'texts/dao-de-jing-zh.txt'), 'utf-8')
    expect(estimateTokenCount(input)).toMatchInlineSnapshot(`7078`)
  })

  it('estimates the token count of the Japanese excerpt', async () => {
    const input = await readFile(join(fixturesDir, 'texts/rashomon-ja.txt'), 'utf-8')
    expect(estimateTokenCount(input)).toMatchInlineSnapshot(`5115`)
  })

  it('returns 0 for empty input', () => {
    expect(estimateTokenCount('')).toBe(0)
    expect(estimateTokenCount()).toBe(0)
  })

  it('does not overcount mixed content like URLs', () => {
    // Regression test for #4: mixed content (URLs, code) should use
    // chars-per-token heuristic, not count each character as a token
    const url = 'https://example.com/path/to/resource'
    expect(estimateTokenCount(url)).toBeLessThan(url.length / 2)
  })

  it('treats line-wrap newlines like spaces', () => {
    expect(estimateTokenCount('Hello\nworld')).toBe(estimateTokenCount('Hello world'))
  })

  it('prices indentation and blank lines as a token', () => {
    expect(estimateTokenCount('Hello\n  world')).toBe(estimateTokenCount('Hello world') + 1)
    expect(estimateTokenCount('Hello\n\nworld')).toBe(estimateTokenCount('Hello world') + 1)
  })

  it('yields more tokens for a lower defaultCharsPerToken', () => {
    const input = 'Hello world'
    const defaultCount = estimateTokenCount(input)
    const customCount = estimateTokenCount(input, { defaultCharsPerToken: 4 })

    expect(customCount).toBeGreaterThan(defaultCount)
  })

  it('lets custom language configs override built-in CJK handling', () => {
    const input = '你好世界你好世界'
    const customOptions = {
      languageConfigs: [{ pattern: /[\u4E00-\u9FFF]/, averageCharsPerToken: 2 }],
    }

    expect(estimateTokenCount(input)).toBe(8)
    expect(estimateTokenCount(input, customOptions)).toBe(4)
  })

  it('prices kana runs below their character count, unlike kanji', () => {
    expect(estimateTokenCount('こんにちは')).toBe(4)
    expect(estimateTokenCount('你好世界')).toBe(4)
  })

  it('prices emoji runs above their character count', () => {
    expect(estimateTokenCount('🏀🔥')).toBe(3)
  })

  it('does not reprice words with attached pictographic symbols', () => {
    // ™ is Extended_Pictographic – the emoji rule must not reprice the whole word
    expect(estimateTokenCount('Gutenberg™')).toBe(2)
  })

  it('is not affected by stateful regex flags in language configs', () => {
    const input = 'éléphant éléphant éléphant éléphant'
    const statefulOptions = {
      languageConfigs: [{ pattern: /[éè]/g, averageCharsPerToken: 3 }],
    }
    const statelessOptions = {
      languageConfigs: [{ pattern: /[éè]/, averageCharsPerToken: 3 }],
    }

    expect(estimateTokenCount(input, statefulOptions)).toBe(estimateTokenCount(input, statelessOptions))
  })
})

describe('approximateTokenSize', () => {
  it('returns the same estimate as estimateTokenCount', () => {
    expect(approximateTokenSize(GERMAN_TEXT)).toBe(estimateTokenCount(GERMAN_TEXT))
  })
})

describe('isWithinTokenLimit', () => {
  it('returns true when the input is within the token limit', () => {
    expect(isWithinTokenLimit('Short input.', 10)).toBe(true)
  })

  it('returns false when the input exceeds the token limit', () => {
    const input
      = 'This is a much longer input that should exceed the token limit set for this test case.'
    expect(isWithinTokenLimit(input, 10)).toBe(false)
  })

  it('treats the limit as inclusive', () => {
    const input = 'Boundary check input'
    const exactLimit = estimateTokenCount(input)

    expect(isWithinTokenLimit(input, exactLimit)).toBe(true)
    expect(isWithinTokenLimit(input, exactLimit - 1)).toBe(false)
  })

  it('flips the verdict under stricter custom options', () => {
    const input = 'Hello world'
    const tokenLimit = 3
    const customOptions = { defaultCharsPerToken: 2 }

    expect(isWithinTokenLimit(input, tokenLimit)).toBe(true)
    expect(isWithinTokenLimit(input, tokenLimit, customOptions)).toBe(false)
  })
})

describe('sliceByTokens', () => {
  it('returns an empty string for empty input', () => {
    expect(sliceByTokens('')).toBe('')
    expect(sliceByTokens('', 0, 5)).toBe('')
  })

  it('returns the entire text when no bounds are given', () => {
    expect(sliceByTokens(ENGLISH_TEXT)).toBe(ENGLISH_TEXT)
  })

  it('slices English text with positive indices', () => {
    const firstTwoTokens = sliceByTokens(ENGLISH_TEXT, 0, 2)
    const fromThirdToken = sliceByTokens(ENGLISH_TEXT, 2)

    expect(firstTwoTokens).toMatchInlineSnapshot('"Hello,"')
    expect(fromThirdToken).toMatchInlineSnapshot('" world! This is a short sentence."')

    // Adjacent slices at a segment boundary reconstruct the input exactly
    expect(firstTwoTokens + fromThirdToken).toBe(ENGLISH_TEXT)
  })

  it('slices German text with positive indices', () => {
    const firstThree = sliceByTokens(GERMAN_TEXT, 0, 3)
    expect(firstThree).toMatchInlineSnapshot(`"Die pünkt"`)

    const middle = sliceByTokens(GERMAN_TEXT, 5, 10)
    expect(middle).toMatchInlineSnapshot(`" gewünschte Trü"`)
  })

  it('slices German text with negative indices', () => {
    const lastThree = sliceByTokens(GERMAN_TEXT, -3)
    expect(lastThree).toMatchInlineSnapshot(`" führen"`)

    const withoutLastTwo = sliceByTokens(GERMAN_TEXT, 0, -2)
    expect(GERMAN_TEXT.startsWith(withoutLastTwo)).toBe(true)
    expect(withoutLastTwo.length).toBeLessThan(GERMAN_TEXT.length)

    const middleNegative = sliceByTokens(GERMAN_TEXT, -8, -3)
    expect(middleNegative).toMatchInlineSnapshot(`" Hülle und Fülle"`)
  })

  it('returns an empty string when the range is empty or inverted', () => {
    expect(sliceByTokens(GERMAN_TEXT, 10, 5)).toBe('')
    expect(sliceByTokens(GERMAN_TEXT, 5, 5)).toBe('')
  })

  it('clamps out-of-range indices like Array.prototype.slice', () => {
    const totalTokens = estimateTokenCount(GERMAN_TEXT)

    expect(sliceByTokens(GERMAN_TEXT, totalTokens + 10)).toBe('')
    expect(sliceByTokens(GERMAN_TEXT, 0, totalTokens + 10)).toBe(GERMAN_TEXT)
    expect(sliceByTokens(GERMAN_TEXT, -1000)).toBe(GERMAN_TEXT)
  })

  it('applies custom options to slice boundaries', () => {
    const defaultSlice = sliceByTokens(ENGLISH_TEXT, 0, 3)
    const customSlice = sliceByTokens(ENGLISH_TEXT, 0, 3, { defaultCharsPerToken: 2 })

    // With more tokens per text, the same token range covers less of it
    expect(customSlice.length).toBeLessThan(defaultSlice.length)
  })
})

describe('splitByTokens', () => {
  it('splits text into chunks that reconstruct the input', () => {
    const chunks = splitByTokens(ENGLISH_TEXT, 5)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe(ENGLISH_TEXT)
  })

  it('repeats trailing tokens of a chunk at the start of the next when overlap is set', () => {
    const chunks = splitByTokens('aaaa bbbb cccc dddd eeee', 2, { overlap: 1 })
    expect(chunks).toEqual(['aaaa bbbb', 'bbbb cccc', 'cccc dddd', 'dddd eeee'])
  })

  it('returns an empty array for empty input', () => {
    expect(splitByTokens('', 5)).toEqual([])
  })

  it('returns an empty array for a non-positive target chunk size', () => {
    expect(splitByTokens('text', 0)).toEqual([])
    expect(splitByTokens('text', -5)).toEqual([])
  })

  it('returns a single chunk when the text is smaller than the target', () => {
    const shortText = 'Hi there'
    expect(splitByTokens(shortText, 100)).toEqual([shortText])
  })

  it('can exceed the target when a single segment crosses it', () => {
    const longWord = 'supercalifragilisticexpialidocious'

    expect(estimateTokenCount(longWord)).toBeGreaterThan(2)
    expect(splitByTokens(longWord, 2)).toEqual([longWord])
  })

  it('does not emit a trailing chunk containing only overlap content', () => {
    const chunks = splitByTokens('aaaa bbbb cccc dddd', 2, { overlap: 1 })
    expect(chunks).toEqual(['aaaa bbbb', 'bbbb cccc', 'cccc dddd'])
  })

  it('clamps overlap below the target chunk size', () => {
    const text = 'aaaa bbbb cccc dddd eeee'
    const oversizedOverlapChunks = splitByTokens(text, 2, { overlap: 5 })
    const clampedOverlapChunks = splitByTokens(text, 2, { overlap: 1 })

    expect(oversizedOverlapChunks).toEqual(clampedOverlapChunks)
  })
})
