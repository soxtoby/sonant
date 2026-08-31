import { beforeEach, expect, mock, test } from "bun:test"
import type { LogEvent } from "../src"

let emitted: Record<string, unknown>[] = []

mock.module("seq-logging", () => ({
    Logger: class {
        emit(event: Record<string, unknown>) { emitted.push(event) }
        flush() { }
        close() { }
    },
}))

let { SeqSink } = await import("../src/sinks/seq")

beforeEach(() => {
    emitted = []
})

test("Seq sink passes trace identifiers to seq-logging", () => {
    let sink = new SeqSink({ serverUrl: "http://localhost:5341" })
    let event: LogEvent = {
        timestamp: new Date("2026-08-31T00:00:00Z"),
        level: "info",
        messageTemplate: "Handled request",
        properties: {},
        error: undefined,
        trace: {
            traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
            spanId: "00f067aa0ba902b7",
        },
        elapsedMs: undefined,
    }

    sink.emit(event)

    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toMatchObject({
        traceId: event.trace?.traceId,
        spanId: event.trace?.spanId,
    })
})
