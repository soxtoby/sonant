import { Logger as SeqLogger } from "seq-logging"
import type { Level, LogEvent, Sink } from "../types"

export interface SeqSinkOptions {
    serverUrl: string
    apiKey?: string
    batchSizeLimit?: number
    eventBodyLimit?: number
}

export class SeqSink implements Sink {
    private seq: SeqLogger

    constructor(options: SeqSinkOptions) {
        this.seq = new SeqLogger(options)
    }

    emit(event: LogEvent): void {
        this.seq.emit({
            timestamp: event.timestamp,
            level: levelMap[event.level],
            traceId: event.trace?.traceId,
            spanId: event.trace?.spanId,
            messageTemplate: event.messageTemplate,
            properties: event.properties,
            ...(event.error == undefined ? {} : { exception: event.error }),
        })
    }

    flush() { return this.seq.flush() }

    close() { return this.seq.close() }
}

const levelMap: Record<Level, string> = {
    verbose: 'Verbose',
    debug: 'Debug',
    info: 'Information',
    warn: 'Warning',
    error: 'Error',
    fatal: 'Fatal'
}
