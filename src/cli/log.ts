import * as ansis from 'ansis'

// Every level writes to stderr, so stdout carries results only

export function error(message: string): void {
  console.error(`${ansis.red('✖')} ${message}`)
}

export function warn(message: string): void {
  console.error(`${ansis.yellow('⚠')} ${message}`)
}

export function info(message: string): void {
  console.error(`${ansis.cyan('●')} ${message}`)
}

export function success(message: string): void {
  console.error(`${ansis.green('✔')} ${message}`)
}

/** Separates report blocks – on stderr, like every level above. */
export function blankLine(): void {
  console.error('')
}
