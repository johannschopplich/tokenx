import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import { runCommand } from 'citty'
import { afterEach, vi } from 'vitest'
import { mainCommand, normalizeArgs } from '../src/cli/index.ts'

// #region Per-repo bindings

const TEMP_PREFIX = 'tokenx-cli-test-'

const CLI_ENTRY = path.join(import.meta.dirname, '../src/cli/entry.ts')

/** Drives the command tree the way the entry point does, minus citty's `runMain`. */
function invokeCli(argv: readonly string[]): Promise<unknown> {
  return runCommand(mainCommand, { rawArgs: normalizeArgs(argv) })
}

// #endregion

// Byte-identical across the sibling CLI repos – edit it in all of them or none.
// #region Shared harness

export interface FileMap {
  [relativePath: string]: string
}

export interface CliResult {
  stdout: string
  stderr: string
  /** `undefined` when the run neither exited nor set a code. */
  exitCode: number | undefined
}

export interface RunOptions {
  /** Working directory to run from – only needed when output labels are relative paths. */
  cwd?: string
}

/** Stands in for `process.exit` so a run can be observed instead of ending the worker. */
class ProcessExitError extends Error {
  readonly exitCode: number

  constructor(exitCode: number) {
    super(`process.exit(${exitCode})`)
    this.exitCode = exitCode
  }
}

/**
 * Returns a factory for throwaway directories – call it at the top level of a test
 * file so the cleanup registers against that file's suite. Synchronous, so it can
 * be called from test bodies that have nothing else to await.
 */
export function useTemporaryDirectories(): (files?: FileMap) => string {
  const directories: string[] = []

  afterEach(() => {
    while (directories.length > 0)
      rmSync(directories.pop()!, { recursive: true, force: true })
  })

  return (files: FileMap = {}) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX))
    directories.push(directory)

    for (const [relativePath, contents] of Object.entries(files)) {
      const filePath = path.join(directory, relativePath)
      mkdirSync(path.dirname(filePath), { recursive: true })
      writeFileSync(filePath, contents, 'utf-8')
    }

    return directory
  }
}

/**
 * Runs the command tree in-process, capturing both streams. `runCommand` skips
 * citty's `runMain`, which owns `--help`, `--version` and its own `process.exit` –
 * those belong to `runCliProcess`, where they are real.
 */
export async function runCli(argv: readonly string[], options: RunOptions = {}): Promise<CliResult> {
  const stdout: string[] = []
  const stderr: string[] = []
  const previousExitCode = process.exitCode
  const previousCwd = process.cwd()
  process.exitCode = undefined

  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout.push(String(chunk))
    return true
  })
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr.push(String(chunk))
    return true
  })
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
    stdout.push(`${parts.map(String).join(' ')}\n`)
  })
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => {
    stderr.push(`${parts.map(String).join(' ')}\n`)
  })
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new ProcessExitError(typeof code === 'number' ? code : 0)
  })

  let exitCode: number | undefined

  try {
    if (options.cwd !== undefined)
      process.chdir(options.cwd)

    await invokeCli(argv)
    exitCode = process.exitCode
  }
  catch (caught) {
    if (!(caught instanceof ProcessExitError))
      throw caught

    exitCode = caught.exitCode
  }
  finally {
    process.chdir(previousCwd)
    process.exitCode = previousExitCode
    exitSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    consoleLogSpy.mockRestore()
    stderrSpy.mockRestore()
    stdoutSpy.mockRestore()
  }

  return { stdout: stdout.join(''), stderr: stderr.join(''), exitCode }
}

/**
 * Runs the CLI as a child process, where the exit code the shell sees and whether
 * stdout survives the process ending are both observable.
 */
export function runCliProcess(argv: readonly string[], options: RunOptions = {}): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [CLI_ENTRY, ...argv],
      { cwd: options.cwd, maxBuffer: 64 * 1024 * 1024 },
      (caught, stdout, stderr) => {
        // A numeric `code` is the child's exit status; anything else failed to spawn.
        if (caught && typeof caught.code !== 'number')
          reject(caught)
        else
          resolve({ stdout, stderr, exitCode: caught ? caught.code as number : 0 })
      },
    )
  })
}

/** Returns a callback that puts the real `process.stdin` back. */
export function mockStdin(input: string): () => void {
  // Real stdin hands over bytes, and a strict UTF-8 check depends on getting them.
  const stream = Readable.from([new TextEncoder().encode(input)])
  const originalStdin = process.stdin

  Object.defineProperty(process, 'stdin', { value: stream, writable: true })

  return () => {
    Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true })
  }
}

// #endregion
