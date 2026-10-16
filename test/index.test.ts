import { describe, expect, it } from 'vitest'
import {
  estimateTokenCount,
  isWithinTokenLimit,
  sliceByTokens,
  splitByTokens,
} from '../src/index'

/**
 * Pins the slice snapshots below to a ratio of the test's own choosing: the
 * catch-all config prices every non-whitespace segment ahead of the built-in
 * rules, so recalibrating the shipped ratios moves the benchmark rather than
 * these tests.
 */
const FIXED_OPTIONS = { languageConfigs: [{ pattern: /\S/, averageCharsPerToken: 4 }] }

/** Every word costs one token, so slice boundaries land between words. */
const SINGLE_TOKEN_WORDS = 'The old cat sat on a warm red mat.'
/** The long words cost several tokens each, so slice boundaries land inside them. */
const MULTI_TOKEN_WORDS = 'Die pünktlich gewünschte Trüffelfüllung im übergestülpten Würzkümmel-Würfel ist kümmerlich und dürfte fürderhin zu Rüffeln in Hülle und Fülle führen.'

describe('estimateTokenCount', () => {
  it('returns zero for empty input', () => {
    expect(estimateTokenCount('')).toBe(0)
    expect(estimateTokenCount()).toBe(0)
  })

  describe('pricing rules', () => {
    it('prices kana runs below one token per character', () => {
      const kana = 'こんにちはみなさん'
      expect(estimateTokenCount(kana)).toBeLessThan(kana.length)
    })

    it('prices han characters below one token each', () => {
      const han = '人工智能技术发展迅速'
      expect(estimateTokenCount(han)).toBeLessThan(han.length)
    })

    it('prices hangul below one token each', () => {
      const hangul = '안녕하세요반갑습니다'
      expect(estimateTokenCount(hangul)).toBeLessThan(hangul.length)
    })

    it('prices digit runs in groups of three', () => {
      expect(estimateTokenCount('123')).toBe(1)
      expect(estimateTokenCount('1234567890')).toBe(4)
    })

    it('prices emoji above one token per character', () => {
      const emoji = '🏀🔥'
      expect(estimateTokenCount(emoji)).toBeGreaterThan(Array.from(emoji).length)
    })

    it('prices words with an attached pictographic symbol like plain words', () => {
      expect(estimateTokenCount('Gutenberg™')).toBe(estimateTokenCount('Gutenbergs'))
    })

    it('prices URLs well below one token per character', () => {
      const url = 'https://example.com/path/to/resource'
      expect(estimateTokenCount(url)).toBeLessThan(url.length / 2)
    })

    it('prices indentation and blank lines as one token', () => {
      expect(estimateTokenCount('Hello\n  world')).toBe(estimateTokenCount('Hello world') + 1)
      expect(estimateTokenCount('Hello\n\nworld')).toBe(estimateTokenCount('Hello world') + 1)
    })

    it('charges a line break that follows a word', () => {
      expect(estimateTokenCount('Hello\nworld')).toBe(estimateTokenCount('Hello world') + 1)
    })

    it('merges a line break into a preceding punctuation token', () => {
      expect(estimateTokenCount('Hello,\nworld')).toBe(estimateTokenCount('Hello, world'))
    })
  })

  describe('options', () => {
    it('returns more tokens for a lower defaultCharsPerToken', () => {
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

      expect(estimateTokenCount(input, customOptions)).toBe(4)
      expect(estimateTokenCount(input, customOptions)).not.toBe(estimateTokenCount(input))
    })

    it('keeps the built-in language configs alongside custom ones', () => {
      const input = 'Gregor erwachte aus unruhigen Träumen über seinem Bett.'
      const arabicOptions = {
        languageConfigs: [{ pattern: /\p{Script=Arabic}/u, averageCharsPerToken: 2 }],
      }

      expect(estimateTokenCount(input, arabicOptions)).toBe(estimateTokenCount(input))
    })

    it('ignores stateful regex flags in language configs', () => {
      const input = 'éléphant éléphant éléphant éléphant'
      const statefulOptions = {
        languageConfigs: [{ pattern: /[éè]/g, averageCharsPerToken: 3 }],
      }
      const statelessOptions = {
        languageConfigs: [{ pattern: /[éè]/, averageCharsPerToken: 3 }],
      }

      expect(estimateTokenCount(input, statefulOptions)).toBe(estimateTokenCount(input, statelessOptions))
    })

    it('applies custom language configs that only match ASCII', () => {
      const input = 'hello world hello world'
      const asciiOptions = {
        languageConfigs: [{ pattern: /[aeiou]/, averageCharsPerToken: 2 }],
      }

      expect(estimateTokenCount(input, asciiOptions)).toBeGreaterThan(estimateTokenCount(input))
    })
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
    expect(sliceByTokens(SINGLE_TOKEN_WORDS)).toBe(SINGLE_TOKEN_WORDS)
  })

  it('reconstructs the input from adjacent slices', () => {
    const firstTwoTokens = sliceByTokens(SINGLE_TOKEN_WORDS, 0, 2, FIXED_OPTIONS)
    const fromThirdToken = sliceByTokens(SINGLE_TOKEN_WORDS, 2, undefined, FIXED_OPTIONS)

    expect(firstTwoTokens).toMatchInlineSnapshot(`"The old"`)
    expect(fromThirdToken).toMatchInlineSnapshot(`" cat sat on a warm red mat."`)
    expect(firstTwoTokens + fromThirdToken).toBe(SINGLE_TOKEN_WORDS)
  })

  it('reconstructs the input from adjacent slices at every token boundary', () => {
    const totalTokens = estimateTokenCount(MULTI_TOKEN_WORDS, FIXED_OPTIONS)

    for (let boundary = 0; boundary <= totalTokens; boundary++) {
      const head = sliceByTokens(MULTI_TOKEN_WORDS, 0, boundary, FIXED_OPTIONS)
      const tail = sliceByTokens(MULTI_TOKEN_WORDS, boundary, undefined, FIXED_OPTIONS)
      expect(head + tail).toBe(MULTI_TOKEN_WORDS)
    }
  })

  it('never cuts an emoji in half', () => {
    const emoji = '😀😀😀'
    // More tokens than emoji, so every one-token slice cuts inside the segment.
    const emojiOptions = { languageConfigs: [{ pattern: /\p{Extended_Pictographic}/u, averageCharsPerToken: 0.75 }] }
    const totalTokens = estimateTokenCount(emoji, emojiOptions)

    for (let start = 0; start < totalTokens; start++)
      expect(sliceByTokens(emoji, start, start + 1, emojiOptions).isWellFormed()).toBe(true)
  })

  it('cuts inside a segment when the boundary falls mid-word', () => {
    expect(sliceByTokens(MULTI_TOKEN_WORDS, 0, 3, FIXED_OPTIONS)).toMatchInlineSnapshot(`"Die pünktl"`)
    expect(sliceByTokens(MULTI_TOKEN_WORDS, 5, 10, FIXED_OPTIONS)).toMatchInlineSnapshot(`"ünschte Trüffelfüll"`)
  })

  it('counts back from the end for negative indices', () => {
    expect(sliceByTokens(MULTI_TOKEN_WORDS, -3, undefined, FIXED_OPTIONS)).toMatchInlineSnapshot(`" führen."`)
    expect(sliceByTokens(MULTI_TOKEN_WORDS, -8, -3, FIXED_OPTIONS)).toMatchInlineSnapshot(`" Hülle und Fülle"`)

    const withoutLastTwo = sliceByTokens(MULTI_TOKEN_WORDS, 0, -2, FIXED_OPTIONS)
    expect(MULTI_TOKEN_WORDS.startsWith(withoutLastTwo)).toBe(true)
    expect(withoutLastTwo.length).toBeLessThan(MULTI_TOKEN_WORDS.length)
  })

  it('returns an empty string when the range is empty or inverted', () => {
    expect(sliceByTokens(MULTI_TOKEN_WORDS, 10, 5)).toBe('')
    expect(sliceByTokens(MULTI_TOKEN_WORDS, 5, 5)).toBe('')
  })

  it('clamps out-of-range indices like Array.prototype.slice', () => {
    const totalTokens = estimateTokenCount(MULTI_TOKEN_WORDS)

    expect(sliceByTokens(MULTI_TOKEN_WORDS, totalTokens + 10)).toBe('')
    expect(sliceByTokens(MULTI_TOKEN_WORDS, 0, totalTokens + 10)).toBe(MULTI_TOKEN_WORDS)
    expect(sliceByTokens(MULTI_TOKEN_WORDS, -1000)).toBe(MULTI_TOKEN_WORDS)
  })

  it('applies custom options to slice boundaries', () => {
    // Long ASCII words, so the default ratio governs rather than a language rule.
    const text = 'Estimation heuristics approximate tokenizers'
    const defaultSlice = sliceByTokens(text, 0, 3)
    const customSlice = sliceByTokens(text, 0, 3, { defaultCharsPerToken: 2 })

    // With more tokens per text, the same token range covers less of it.
    expect(customSlice.length).toBeLessThan(defaultSlice.length)
  })
})

describe('splitByTokens', () => {
  it('splits text into chunks that reconstruct the input', () => {
    const chunks = splitByTokens(SINGLE_TOKEN_WORDS, 5)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe(SINGLE_TOKEN_WORDS)
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

  it('exceeds the target when a single segment crosses it', () => {
    const longWord = 'supercalifragilisticexpialidocious'

    expect(estimateTokenCount(longWord)).toBeGreaterThan(2)
    expect(splitByTokens(longWord, 2)).toEqual([longWord])
  })

  it('splits Chinese text at its own punctuation', () => {
    const chinese = '采收的成熟咖啡果会经过剥离果肉的初步加工，再经过烘焙的工序，而成为能制作咖啡的咖啡豆。'

    expect(splitByTokens(chinese, 10)[0]).toBe('采收的成熟咖啡果会经过剥离果肉的初步加工')
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
