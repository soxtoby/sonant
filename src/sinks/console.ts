import pc from "picocolors"
import { formatMessage } from "../formatMessage.js"
import type { Level, LogEvent, Sink } from "../types.js"

export interface ConsoleSinkOptions {
    color?: boolean | 'auto'
    console?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>
}

export class ConsoleSink implements Sink {
    constructor(private options: ConsoleSinkOptions = {}) { }

    emit(event: LogEvent): void {
        let useColor = shouldUseColor(this.options.color ?? 'auto')
        let levelLabel = formatLevel(event.level, useColor)
        let message = formatMessage(event.messageTemplate, event.properties, {
            quoteStrings: true,
            serializeObjects: true,
        })
        let line = `[${event.timestamp.toISOString()} ${levelLabel}] ${message}`
        let args = event.error == undefined ? [line, event.properties] : [line, event.properties, event.error]

        let target = this.options.console ?? console
        target[levelMap[event.level]](...args)
    }

    flush() { }
    close() { }
}

const levelMap: Record<Level, 'debug' | 'info' | 'warn' | 'error'> = {
    verbose: 'debug',
    debug: 'debug',
    info: 'info',
    warn: 'warn',
    error: 'error',
    fatal: 'error'
}

function formatLevel(level: Level, color: boolean): string {
    let label = level.toUpperCase()
    if (!color)
        return label

    switch (level) {
        case 'verbose':
            return pc.gray(label)
        case 'debug':
            return pc.cyan(label)
        case 'info':
            return pc.green(label)
        case 'warn':
            return pc.yellow(label)
        case 'error':
            return pc.red(label)
        case 'fatal':
            return pc.magenta(label)
    }
}

function shouldUseColor(color: boolean | 'auto'): boolean {
    if (color == "auto") {
        let maybeProcess = globalThis as typeof globalThis & { process?: { stdout?: { isTTY?: boolean } } }

        return maybeProcess.process?.stdout?.isTTY != undefined
            ? maybeProcess.process.stdout.isTTY
            : true
    } else {
        return color
    }
}
