import { Logger as SeqLogger } from "seq-logging"
import type { Level, LogEvent, Sink } from "../types.js"

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
            properties: seqProperties(event),
            ...(event.error == undefined ? {} : { exception: event.error }),
        })
    }

    flush() { return this.seq.flush() }

    close() { return this.seq.close() }
}

function seqProperties(event: LogEvent): Record<string, unknown> {
    if (event.startTimestamp == undefined)
        return event.properties

    return {
        ...event.properties,
        ...(event.trace?.parentSpanId == undefined ? {} : { ParentSpanId: event.trace.parentSpanId }),
        SpanStartTimestamp: event.startTimestamp,
    }
}

const levelMap: Record<Level, string> = {
    verbose: 'Verbose',
    debug: 'Debug',
    info: 'Information',
    warn: 'Warning',
    error: 'Error',
    fatal: 'Fatal'
}
