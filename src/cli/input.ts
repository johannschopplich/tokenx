import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'
import { CliError, readStdin } from 'utilful/cli'

export interface InputDocument {
  /** Path relative to the working directory, or `stdin`. */
  label: string
  text: string
}

const GLOB_PATTERN_RE = /[*?[{]/

/** Reads each path, treating no paths – or a lone `-` – as stdin. */
export async function readInputs(paths: readonly string[]): Promise<InputDocument[]> {
  if (paths.length === 0 || (paths.length === 1 && paths[0] === '-'))
    return [{ label: 'stdin', text: await readStdin() }]

  if (paths.includes('-'))
    throw new CliError('Cannot read stdin alongside file paths')

  const filePaths = (await Promise.all(paths.map(expandPattern))).flat()
  return Promise.all(filePaths.map(readFileInput))
}

/** Expands a pattern the shell passed through verbatim, as Windows shells do with `*.md`. */
async function expandPattern(inputPath: string): Promise<string[]> {
  // A file literally named `notes[1].md` stays a path.
  if (!GLOB_PATTERN_RE.test(inputPath) || fs.existsSync(inputPath))
    return [inputPath]

  const entries = await Array.fromAsync(fsp.glob(inputPath, { withFileTypes: true }))
  const filePaths = entries
    .filter(entry => !entry.isDirectory())
    .map(entry => path.join(entry.parentPath, entry.name))

  if (filePaths.length === 0)
    throw new CliError(`No files match \`${inputPath}\``)

  return filePaths.sort()
}

async function readFileInput(inputPath: string): Promise<InputDocument> {
  const resolvedPath = path.resolve(inputPath)
  const label = path.relative(process.cwd(), resolvedPath) || path.basename(resolvedPath)

  try {
    return { label, text: await fsp.readFile(resolvedPath, 'utf-8') }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EISDIR')
      // Quoted, so a shell passes the `*` on rather than expanding it.
      throw new CliError(`\`${inputPath}\` is a directory – pass a pattern like "${path.join(inputPath, '*')}"`)

    throw new CliError(`Cannot read \`${label}\`: ${Error.isError(error) ? error.message : String(error)}`)
  }
}
