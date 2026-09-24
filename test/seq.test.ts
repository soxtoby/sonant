import { afterEach, beforeEach, expect, test } from "bun:test"
import type { LogEvent } from "../src/index.js"
import { SeqSink } from "../src/sinks/seq.js"

interface Request {
    url: string
    headers: Record<string, string>
    events: Record<string, unknown>[]
}

let requests: Request[] = []
let respond: () => Response
let originalFetch = globalThis.fetch

beforeEach(() => {
    requests = []
    respond = () => new Response('{}', { status: 201 })
    globalThis.fetch = (async (url: string, init: RequestInit) => {
        requests.push({
            url,
            headers: init.headers as Record<string, string>,
            events: (init.body as string).split('\n').map(line => JSON.parse(line)),
        })
        return respond()
    }) as typeof fetch
})

afterEach(() => {
    globalThis.fetch = originalFetch
})

test("Seq sink posts CLEF to the ingestion endpoint", async () => {
    let sink = new SeqSink({ serverUrl: "http://localhost:5341", apiKey: "secret" })

    sink.emit(logEvent({ level: "warn", messageTemplate: "Handled {Route}", properties: { Route: "/orders", "@Weird": 1 } }))
    await sink.flush()

    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe("http://localhost:5341/ingest/clef")
    expect(requests[0]?.headers).toMatchObject({
        "Content-Type": "application/vnd.serilog.clef",
        "X-Seq-ApiKey": "secret",
    })
    expect(requests[0]?.events).toEqual([{
        "@t": "2026-08-31T00:00:00.000Z",
        "@mt": "Handled {Route}",
        "@l": "Warning",
        "Route": "/orders",
        "@@Weird": 1,
    }])
})

test("Seq sink passes trace identifiers", async () => {
    let sink = new SeqSink({ serverUrl: "http://localhost:5341/" })

    sink.emit(logEvent({
        trace: {
            traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
            spanId: "00f067aa0ba902b7",
            parentSpanId: "b7ad6b7169203331",
        },
    }))
    await sink.flush()

    expect(requests[0]?.url).toBe("http://localhost:5341/ingest/clef")
    expect(requests[0]?.events[0]).toMatchObject({
        "@tr": "4bf92f3577b34da6a3ce929d0e0e4736",
        "@sp": "00f067aa0ba902b7",
    })
    expect(requests[0]?.events[0]).not.toContainKey("@st")
    expect(requests[0]?.events[0]).not.toContainKey("@ps")
})

test("Seq sink maps activity timing and parent context to span fields", async () => {
    let sink = new SeqSink({ serverUrl: "http://localhost:5341" })

    sink.emit(logEvent({
        messageTemplate: "Handled {Route}",
        properties: { Route: "/orders" },
        trace: {
            traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
            spanId: "00f067aa0ba902b7",
            parentSpanId: "b7ad6b7169203331",
        },
        startTimestamp: new Date("2026-08-30T23:59:59.750Z"),
    }))
    await sink.flush()

    expect(requests[0]?.events[0]).toEqual({
        "@t": "2026-08-31T00:00:00.000Z",
        "@mt": "Handled {Route}",
        "@l": "Information",
        "@tr": "4bf92f3577b34da6a3ce929d0e0e4736",
        "@sp": "00f067aa0ba902b7",
        "@st": "2026-08-30T23:59:59.750Z",
        "@ps": "b7ad6b7169203331",
        "Route": "/orders",
    })
})

test("Seq sink formats errors as text", async () => {
    let sink = new SeqSink({ serverUrl: "http://localhost:5341" })

    sink.emit(logEvent({ error: { name: "TypeError", message: "boom", stack: "TypeError: boom\n    at foo (a.js:1:1)" } }))
    sink.emit(logEvent({ error: { name: "Error", message: "boom", stack: "foo@a.js:1:1" } }))
    sink.emit(logEvent({ error: { name: "Error", message: "boom" } }))
    await sink.flush()

    expect(requests[0]?.events.map(e => e["@x"])).toEqual([
        "TypeError: boom\n    at foo (a.js:1:1)",
        "Error: boom\nfoo@a.js:1:1",
        "Error: boom",
    ])
})

test("Seq sink splits batches by size", async () => {
    let sink = new SeqSink({ serverUrl: "http://localhost:5341", batchSizeLimit: 200 })

    Array.from({ length: 5 }, (_, i) => logEvent({ messageTemplate: `Event ${i}` }))
        .forEach(event => sink.emit(event))
    await sink.flush()

    expect(requests.length).toBeGreaterThan(1)
    expect(requests.flatMap(r => r.events).map(e => e["@mt"])).toEqual(["Event 0", "Event 1", "Event 2", "Event 3", "Event 4"])
})

test("Seq sink drops events over the event body limit", async () => {
    let errors: unknown[] = []
    let sink = new SeqSink({ serverUrl: "http://localhost:5341", eventBodyLimit: 200, onError: error => errors.push(error) })

    sink.emit(logEvent({ properties: { Big: "x".repeat(500) } }))
    sink.emit(logEvent())
    await sink.flush()

    expect(errors).toHaveLength(1)
    expect(requests.flatMap(r => r.events)).toHaveLength(1)
})

test("Seq sink flush rejects when Seq rejects events", async () => {
    respond = () => new Response('Bad', { status: 400 })
    let sink = new SeqSink({ serverUrl: "http://localhost:5341" })

    sink.emit(logEvent())

    await expect(sink.flush()).rejects.toThrow("HTTP 400")
})

test("Seq sink sends queued events after batching time", async () => {
    let sink = new SeqSink({ serverUrl: "http://localhost:5341", maxBatchingTime: 10 })

    sink.emit(logEvent())
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(requests).toHaveLength(1)
})

test("Seq sink ignores events after close", async () => {
    let sink = new SeqSink({ serverUrl: "http://localhost:5341" })

    sink.emit(logEvent())
    await sink.close()
    sink.emit(logEvent())
    await sink.flush()

    expect(requests.flatMap(r => r.events)).toHaveLength(1)
})

function logEvent(overrides: Partial<LogEvent> = {}): LogEvent {
    return {
        timestamp: new Date("2026-08-31T00:00:00Z"),
        level: "info",
        messageTemplate: "Handled request",
        properties: {},
        error: undefined,
        trace: undefined,
        startTimestamp: undefined,
        ...overrides,
    }
}
