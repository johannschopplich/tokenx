import { describe, expect, it } from 'vitest'
import { version } from '../package.json' with { type: 'json' }
import { runCliProcess, useTemporaryDirectories } from './utils.ts'

const createDirectory = useTemporaryDirectories()

// In-process runs observe neither citty's builtin flags, which `runMain` owns,
// nor the exit code the shell sees, nor whether stdout survives the process ending.
describe('tokenx CLI as a child process', () => {
  it('prints its version', async () => {
    const { stdout, exitCode } = await runCliProcess(['--version'])

    expect(stdout).toBe(`${version}\n`)
    expect(exitCode).toBe(0)
  })

  it('exits successfully when the count is within --limit', async () => {
    const directory = createDirectory({ 'sample.txt': 'hello world' })

    const { stdout, exitCode } = await runCliProcess(['sample.txt', '--limit', '10000'], { cwd: directory })

    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/^\d+\n$/)
  })

  it('exits with a failure status for a missing input', async () => {
    const directory = createDirectory()

    const { stdout, stderr, exitCode } = await runCliProcess(['missing.txt'], { cwd: directory })

    expect(exitCode).toBe(1)
    expect(stdout).toBe('')
    expect(stderr).toContain('missing.txt')
  })

  it('prints every row before failing over --limit', async () => {
    // Long names so the table outgrows the 64 kB pipe buffer, which is where a
    // count that exits before stdout drains loses its tail.
    const names = Array.from({ length: 400 }, (_, index) => `${'padding-'.repeat(24)}${index}.txt`)
    const directory = createDirectory(Object.fromEntries(names.map(name => [name, 'hello world'])))

    const { stdout, exitCode } = await runCliProcess(['count', ...names, '--limit', '0'], { cwd: directory })
    const rows = stdout.trimEnd().split('\n')

    expect(exitCode).toBe(2)
    expect(stdout.length).toBeGreaterThan(64 * 1024)
    expect(rows).toHaveLength(names.length + 1)
    expect(rows.at(-1)).toMatch(/^total\s+\d+$/)
    expect(rows.at(-2)).toContain(names.at(-1))
  }, 30_000)
})
