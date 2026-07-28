import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

const packageJsonPath = path.resolve(import.meta.dirname, '../package.json')

export function formatCount(count: number): string {
  return count.toLocaleString('en-US')
}

export async function readRepoSlug(): Promise<string> {
  const packageJson = JSON.parse(await fsp.readFile(packageJsonPath, 'utf-8'))
  const homepage = new URL(packageJson.homepage)

  return `${homepage.host}${homepage.pathname}`
}
