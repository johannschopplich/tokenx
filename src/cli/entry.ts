import process from 'node:process'
import { runCli } from './index.ts'

await runCli(process.argv.slice(2))
