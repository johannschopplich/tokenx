import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { mockStdin, runCli, useTemporaryDirectories } from './utils.ts'

const SAMPLE = 'The quick brown fox jumps over the lazy dog, and then the dog jumps right back over the fox again.'

const createDirectory = useTemporaryDirectories()

describe('tokenx CLI', () => {
  describe('count', () => {
    it('counts a file given without a subcommand', async () => {
      const directory = createDirectory({ 'sample.txt': SAMPLE })

      const { stdout } = await runCli([path.join(directory, 'sample.txt')])

      expect(stdout).toMatch(/^\d+\n$/)
    })

    it('counts stdin when no input is given', async () => {
      const restoreStdin = mockStdin(SAMPLE)

      try {
        const { stdout } = await runCli([])

        expect(stdout).toMatch(/^\d+\n$/)
      }
      finally {
        restoreStdin()
      }
    })

    it('counts more tokens for a lower --chars-per-token', async () => {
      // Capitalized, long words fall through to the default ratio – lowercase
      // words of up to eight characters are priced at one token regardless.
      const directory = createDirectory({ 'sample.txt': 'Extraordinarily Complicated Documentation' })
      const samplePath = path.join(directory, 'sample.txt')

      const coarseResult = await runCli([samplePath, '--chars-per-token', '20'])
      const fineResult = await runCli([samplePath, '--chars-per-token', '2'])

      expect(readCount(fineResult.stdout)).toBeGreaterThan(readCount(coarseResult.stdout))
    })

    it('sums the per-input counts into a total for several files', async () => {
      const directory = createDirectory({ 'a.txt': SAMPLE, 'b.txt': SAMPLE.repeat(2) })

      const { stdout } = await runCli(['count', 'a.txt', 'b.txt'], { cwd: directory })

      const rows = stdout.trimEnd().split('\n').map(row => row.trim().split(/\s+/))
      const [, totalValue] = rows.at(-1)!
      const perInputCounts = rows.slice(0, -1).map(([, count]) => Number(count))

      expect(rows.map(([label]) => label)).toEqual(['a.txt', 'b.txt', 'total'])
      expect(Number(totalValue)).toBe(perInputCounts[0]! + perInputCounts[1]!)
    })

    it('reports each input and the total as JSON with --json', async () => {
      const directory = createDirectory({ 'a.txt': SAMPLE, 'b.txt': SAMPLE.repeat(2) })

      const { stdout } = await runCli(['count', 'a.txt', 'b.txt', '--json'], { cwd: directory })

      const report = JSON.parse(stdout) as { inputs: { label: string, tokenCount: number }[], total: number }

      expect(report.inputs.map(input => input.label)).toEqual(['a.txt', 'b.txt'])
      expect(report.total).toBe(report.inputs[0]!.tokenCount + report.inputs[1]!.tokenCount)
    })

    it('prints the count before failing the run over --limit', async () => {
      const directory = createDirectory({ 'sample.txt': SAMPLE })

      const { stdout, exitCode } = await runCli([path.join(directory, 'sample.txt'), '--limit', '0'])

      expect(readCount(stdout)).toBeGreaterThan(0)
      expect(exitCode).toBe(2)
    })
  })

  describe('slice', () => {
    it('prints a prefix of the input for a leading token range', async () => {
      const directory = createDirectory({ 'sample.txt': SAMPLE })

      const { stdout } = await runCli(['slice', path.join(directory, 'sample.txt'), '--end', '5'])
      const sliced = readSlice(stdout)

      expect(sliced.length).toBeGreaterThan(0)
      expect(sliced.length).toBeLessThan(SAMPLE.length)
      expect(SAMPLE.startsWith(sliced)).toBe(true)
    })

    it('prints a suffix of the input for a trailing token range', async () => {
      const directory = createDirectory({ 'sample.txt': SAMPLE })

      const { stdout } = await runCli(['slice', path.join(directory, 'sample.txt'), '--start', '-3'])
      const sliced = readSlice(stdout)

      expect(sliced.length).toBeGreaterThan(0)
      expect(sliced.length).toBeLessThan(SAMPLE.length)
      expect(SAMPLE.endsWith(sliced)).toBe(true)
    })
  })

  describe('split', () => {
    it('splits an input into chunks that rejoin into the original', async () => {
      const directory = createDirectory({ 'sample.txt': SAMPLE })

      const { stdout } = await runCli(['split', path.join(directory, 'sample.txt'), '--size', '5'])
      const chunks = JSON.parse(stdout) as string[]

      expect(chunks.length).toBeGreaterThan(1)
      expect(chunks.join('')).toBe(SAMPLE)
    })

    it('repeats content across chunk boundaries with --overlap', async () => {
      const directory = createDirectory({ 'sample.txt': SAMPLE })

      const { stdout } = await runCli(['split', path.join(directory, 'sample.txt'), '--size', '5', '--overlap', '2'])
      const chunks = JSON.parse(stdout) as string[]

      expect(chunks.length).toBeGreaterThan(1)
      expect(overlapLength(chunks[0]!, chunks[1]!)).toBeGreaterThan(0)
    })
  })

  describe('option validation', () => {
    it('rejects a misspelled option instead of reading it as a path', async () => {
      const directory = createDirectory({ 'sample.txt': SAMPLE })

      const { stderr, exitCode } = await runCli([path.join(directory, 'sample.txt'), '--limitt', '5'])

      expect(stderr).toContain('--limitt')
      expect(exitCode).toBe(1)
    })

    it('rejects an option belonging to another command', async () => {
      const directory = createDirectory({ 'sample.txt': SAMPLE })

      const { stderr, exitCode } = await runCli(['count', path.join(directory, 'sample.txt'), '--overlap', '50'])

      expect(stderr).toContain('--overlap')
      expect(exitCode).toBe(1)
    })

    it('rejects a --limit left without a value rather than ignoring it', async () => {
      const directory = createDirectory({ 'sample.txt': SAMPLE })

      const { stderr, exitCode } = await runCli([path.join(directory, 'sample.txt'), '--limit'])

      expect(stderr).toContain('--limit')
      expect(exitCode).toBe(1)
    })

    it('rejects a non-numeric --chars-per-token', async () => {
      const directory = createDirectory({ 'sample.txt': SAMPLE })

      const { stderr, exitCode } = await runCli([path.join(directory, 'sample.txt'), '--chars-per-token', 'many'])

      expect(stderr).toContain('--chars-per-token')
      expect(exitCode).toBe(1)
    })

    it('rejects a --size below one', async () => {
      const directory = createDirectory({ 'sample.txt': SAMPLE })

      const { stderr, exitCode } = await runCli(['split', path.join(directory, 'sample.txt'), '--size', '0'])

      expect(stderr).toContain('--size')
      expect(exitCode).toBe(1)
    })
  })

  describe('subcommand resolution', () => {
    it('finds the subcommand behind a preceding option value', async () => {
      const directory = createDirectory({ 'sample.txt': SAMPLE })
      const samplePath = path.join(directory, 'sample.txt')

      const { stdout, exitCode } = await runCli(['--chars-per-token', '4', 'slice', samplePath, '--end', '5'])

      expect(SAMPLE.startsWith(readSlice(stdout))).toBe(true)
      expect(exitCode).toBeUndefined()
    })
  })

  describe('input errors', () => {
    it('reports a missing input file', async () => {
      const directory = createDirectory()

      const { stderr, exitCode } = await runCli([path.join(directory, 'missing.txt')])

      expect(stderr).toContain('missing.txt')
      expect(exitCode).toBe(1)
    })

    it('rejects stdin alongside file paths', async () => {
      const directory = createDirectory({ 'sample.txt': SAMPLE })

      const { stderr, exitCode } = await runCli(['count', '-', path.join(directory, 'sample.txt')])

      expect(stderr).toContain('stdin')
      expect(exitCode).toBe(1)
    })
  })
})

function readCount(stdout: string): number {
  return Number(stdout.trim())
}

/** The CLI appends a newline that is not part of the slice. */
function readSlice(stdout: string): string {
  return stdout.slice(0, -1)
}

/** Longest run of characters that both ends `first` and starts `second`. */
function overlapLength(first: string, second: string): number {
  for (let length = Math.min(first.length, second.length); length > 0; length--) {
    if (first.endsWith(second.slice(0, length)))
      return length
  }

  return 0
}
