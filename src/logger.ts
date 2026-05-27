/* eslint-disable @typescript-eslint/no-explicit-any */
import { styleText } from 'node:util'
import * as path from 'node:path'
import { removeCwdFromUrl } from './utils.ts'
import { logOnce } from './log-once.ts'

type ForegroundColors =
  | 'black'
  | 'blackBright'
  | 'blue'
  | 'blueBright'
  | 'cyan'
  | 'cyanBright'
  | 'gray'
  | 'green'
  | 'greenBright'
  | 'grey'
  | 'magenta'
  | 'magentaBright'
  | 'red'
  | 'redBright'
  | 'white'
  | 'whiteBright'
  | 'yellow'
  | 'yellowBright'

type Modifiers =
  | 'blink'
  | 'bold'
  | 'dim'
  | 'doubleunderline'
  | 'framed'
  | 'hidden'
  | 'inverse'
  | 'italic'
  | 'none'
  | 'overlined'
  | 'reset'
  | 'strikethrough'
  | 'underline'

const fgColors: ForegroundColors[] = [
  'blue',
  'blueBright',
  'cyan',
  'cyanBright',
  'gray',
  'green',
  'greenBright',
  'grey',
  'magenta',
  'magentaBright',
  'red',
  'redBright',
  'yellow',
  'yellowBright',
]

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const levelStyles: Record<LogLevel, [ForegroundColors, ...Modifiers[]]> = {
  debug: ['cyan', 'dim'],
  info: ['green'],
  warn: ['yellow', 'bold'],
  error: ['red', 'bold'],
}

function getColorForPrefix(prefix: string): ForegroundColors {
  let index = 0
  while (prefix) {
    const slice = prefix.charCodeAt(0)
    index = (index + slice) % fgColors.length
    prefix = prefix.slice(1)
  }
  return fgColors[index]
}

function stringify(obj: any): string {
  if (typeof obj === 'function') {
    return `[Function: ${obj.name || 'anonymous'}]`
  }
  return String(obj)
}

function getLineNumber(goBack = 4): string {
  const err = new Error()
  const stack = err.stack?.split('\n') ?? []
  const callerLine = stack[goBack] ?? ''
  const match = callerLine.match(/:(\d+):\d+\)?$/)
  return match ? match[1] : 'unknown'
}

let lastPrefixWidth = 0
export class PrefixedLogger {
  readonly #prefix: string
  readonly color: ForegroundColors

  constructor(prefix: string, color?: ForegroundColors) {
    if (prefix.startsWith('file://') || path.isAbsolute(prefix)) {
      prefix = removeCwdFromUrl(prefix)
    }
    this.#prefix = prefix
    this.color = color ?? getColorForPrefix(prefix)
  }

  #format(level: LogLevel, msg: string): string {
    const styles = levelStyles[level]
    const tag = styleText(styles, `[${level.toUpperCase()}]`)
    const withLineNumber = `${this.#prefix}:${getLineNumber()}`.padStart(lastPrefixWidth)
    lastPrefixWidth = Math.max(lastPrefixWidth, withLineNumber.length)
    const pfx = styleText(this.color, `[${withLineNumber}]`)
    return `${pfx} ${tag} ${msg}`
  }

  line(...args: unknown[]): this {
    console.debug(''.padStart(lastPrefixWidth + 9), args.map(stringify).join(' '))
    return this
  }

  once(...args: unknown[]): this {
    const messageKey = this.#format('debug', args.map(stringify).join(' '))
    logOnce(messageKey)
    return this
  }

  debug(...args: unknown[]): this {
    console.debug(this.#format('debug', args.map(stringify).join(' ')))
    return this
  }

  info(...args: unknown[]): this {
    console.info(this.#format('info', args.map(stringify).join(' ')))
    return this
  }

  warn(...args: unknown[]): this {
    console.warn(this.#format('warn', args.map(stringify).join(' ')))
    return this
  }

  error(...args: unknown[]): this {
    console.error(this.#format('error', args.map(stringify).join(' ')))
    return this
  }
}