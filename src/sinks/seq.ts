import type { ErrorMetadata, Level, LogEvent, Sink } from "../types.js"

export interface SeqSinkOptions {
    serverUrl: string
    apiKey?: string
    /** Maximum size of a single request body, in bytes. */
    batchSizeLimit?: number
    /** Maximum size of a single serialized event, in bytes. Larger events are dropped. */
    eventBodyLimit?: number
    /** Maximum time events wait in the queue before being sent, in milliseconds. */
    maxBatchingTime?: number
    /** Called when events can't be delivered outside of an explicit `flush` or `close`. */
    onError?: (error: unknown) => void
}

export class SeqSink implements Sink {
    private endpoint: string
    private apiKey: string | undefined
    private batchSizeLimit: number
    private eventBodyLimit: number
    private maxBatchingTime: number
    private onError: (error: unknown) => void

    private queue: string[] = []
    private timer: ReturnType<typeof setTimeout> | undefined
    private shipping: Promise<void> = Promise.resolve()
    private closed = false

    constructor(options: SeqSinkOptions) {
        this.endpoint = options.serverUrl.replace(/\/?$/, '/') + 'ingest/clef'
        this.apiKey = options.apiKey
        this.batchSizeLimit = options.batchSizeLimit ?? 1024 * 1024
        this.eventBodyLimit = options.eventBodyLimit ?? 256 * 1024
        this.maxBatchingTime = options.maxBatchingTime ?? 2000
        this.onError = options.onError ?? (error => console.error('[sonant/seq]', error))
    }

    emit(event: LogEvent): void {
        if (this.closed)
            return

        let line = formatClef(event)
        if (byteLength(line) > this.eventBodyLimit) {
            this.onError(new Error(`Dropping event larger than ${this.eventBodyLimit} bytes: ${line.slice(0, 1024)}`))
        } else {
            this.queue.push(line)
            this.timer ??= setTimeout(() => this.ship().catch(this.onError), this.maxBatchingTime)
        }
    }

    flush() { return this.ship() }

    async close() {
        if (!this.closed) {
            this.closed = true
            await this.ship()
        }
    }

    private ship(): Promise<void> {
        clearTimeout(this.timer)
        this.timer = undefined

        let shipment = this.shipping.then(() => this.sendQueued())
        this.shipping = shipment.catch(() => { })
        return shipment
    }

    private async sendQueued() {
        while (this.queue.length)
            await this.post(this.dequeueBatch())
    }

    private dequeueBatch(): string {
        let count = 0
        let bytes = 0
        for (let line of this.queue) {
            let lineBytes = byteLength(line) + 1
            if (count > 0 && bytes + lineBytes > this.batchSizeLimit)
                break
            bytes += lineBytes
            count++
        }
        return this.queue.splice(0, count).join('\n')
    }

    private async post(body: string) {
        let attempt = 0
        let failure = await this.tryPost(body)
        while (failure != undefined) {
            if (!failure.retryable || attempt >= maxRetries)
                throw failure.error

            await delay(retryDelay * (attempt + 1))
            attempt++
            failure = await this.tryPost(body)
        }
    }

    private async tryPost(body: string) {
        let headers: Record<string, string> = { 'Content-Type': 'application/vnd.serilog.clef' }
        if (this.apiKey)
            headers['X-Seq-ApiKey'] = this.apiKey

        let response: Response | undefined
        let failure: { error: unknown; retryable: boolean } | undefined
        try {
            response = await fetch(this.endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(requestTimeout) })
        } catch (error) {
            failure = { error, retryable: true }
        }

        if (response != undefined && !response.ok) {
            failure = {
                error: new Error(`Seq ingestion failed with HTTP ${response.status}: ${await response.text()}`),
                retryable: isTransient(response.status),
            }
        }

        return failure
    }
}

let maxRetries = 3
let retryDelay = 1000
let requestTimeout = 30000

/** Formats an event as compact log event format (CLEF), matching Serilog.Sinks.Seq's `SeqCompactJsonFormatter`. */
function formatClef(event: LogEvent): string {
    let clef: Record<string, unknown> = {
        '@t': event.timestamp.toISOString(),
        '@mt': event.messageTemplate,
        '@l': levelMap[event.level],
    }

    if (event.error != undefined)
        clef['@x'] = formatException(event.error)

    if (event.trace != undefined) {
        clef['@tr'] = event.trace.traceId
        clef['@sp'] = event.trace.spanId

        if (event.startTimestamp != undefined) {
            clef['@st'] = event.startTimestamp.toISOString()
            if (event.trace.parentSpanId != undefined)
                clef['@ps'] = event.trace.parentSpanId
        }
    }

    Object.entries(event.properties).forEach(([name, value]) => {
        clef[name.startsWith('@') ? '@' + name : name] = value
    })

    return JSON.stringify(clef, (_key, value) => typeof value == 'bigint' ? value.toString() : value)
}

function formatException({ name, message, stack }: ErrorMetadata): string {
    let header = message ? `${name}: ${message}` : name
    return stack == undefined ? header
        : stack.startsWith(header) ? stack
            : `${header}\n${stack}`
}

let levelMap: Record<Level, string> = {
    verbose: 'Verbose',
    debug: 'Debug',
    info: 'Information',
    warn: 'Warning',
    error: 'Error',
    fatal: 'Fatal'
}

let encoder = new TextEncoder()

function byteLength(value: string) {
    return encoder.encode(value).length
}

function isTransient(status: number) {
    return status == 408
        || status == 429
        || status >= 500
}

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}
