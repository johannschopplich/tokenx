import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'
import { CliError } from './errors.ts'

export interface InputDocument {
  /** Path relative to the working directory, or `stdin`. */
  label: string
  text: string
}

/** Reads each path, treating no paths – or a lone `-` – as stdin. */
export async function readInputs(paths: readonly string[]): Promise<InputDocument[]> {
  if (paths.length === 0 || (paths.length === 1 && paths[0] === '-'))
    return [{ label: 'stdin', text: await readStdin() }]

  if (paths.includes('-'))
    throw new CliError('Cannot read stdin alongside file paths')

  return Promise.all(paths.map(readFileInput))
}

async function readFileInput(inputPath: string): Promise<InputDocument> {
  const resolvedPath = path.resolve(inputPath)
  const label = path.relative(process.cwd(), resolvedPath) || path.basename(resolvedPath)

  try {
    return { label, text: await fsp.readFile(resolvedPath, 'utf-8') }
  }
  catch (error) {
    throw new CliError(`Cannot read \`${label}\`: ${Error.isError(error) ? error.message : String(error)}`)
  }
}

function readStdin(): Promise<string> {
  const { stdin } = process

  if (stdin.readableEnded)
    return Promise.resolve('')

  return new Promise((resolve, reject) => {
    let data = ''

    const onData = (chunk: string) => {
      data += chunk
    }

    function cleanup() {
      stdin.off('data', onData)
      stdin.off('error', onError)
      stdin.off('end', onEnd)
    }

    function onError(caught: Error) {
      cleanup()
      reject(caught)
    }

    function onEnd() {
      cleanup()
      resolve(data)
    }

    stdin.setEncoding('utf-8')
    stdin.on('data', onData)
    stdin.once('error', onError)
    stdin.once('end', onEnd)
    stdin.resume()
  })
}
