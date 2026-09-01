import { describe, expect, test } from "bun:test"
import { createLevelSwitch, createLogger, formatMessage, nullLogger, type LogEvent, type Sink } from "../src"
import { ConsoleSink } from "../src/sinks/console"

describe("logger", () => {
    test("filters by fixed minimum level", () => {
        let sink = captureSink()
        let logger = createLogger({ minimumLevel: "warn", sinks: [sink] })

        logger.info("Ignored {Value}", { Value: 1 })
        logger.warn("Accepted {Value}", { Value: 2 })

        expect(sink.events).toHaveLength(1)
        expect(sink.events[0]?.level).toBe("warn")
        expect(sink.events[0]?.properties).toEqual({ Value: 2 })
    })

    test("reads mutable level switch", () => {
        let sink = captureSink()
        let levelSwitch = createLevelSwitch("error")
        let logger = createLogger({ minimumLevel: levelSwitch, sinks: [sink] })

        logger.warn("Ignored")
        levelSwitch.minimumLevel = "warn"
        logger.warn("Accepted")

        expect(sink.events).toHaveLength(1)
    })

    test("child loggers normalize context once and allow message properties to override", () => {
        let sink = captureSink()
        let context = { requestId: "a" }
        let logger = createLogger({ sinks: [sink] }).with({ Request: context, UserId: "context" })

        context.requestId = "b"
        logger.info("User {UserId}", { UserId: "message" })

        expect(sink.events[0]?.properties).toEqual({
            Request: { requestId: "a" },
            UserId: "message",
        })
    })

    test("enriches every emitted event", () => {
        let sink = captureSink()
        let requestId = "a"
        let logger = createLogger({
            sinks: [sink],
            enrich(event) {
                event.properties.RequestId = requestId
            },
        })

        logger.info("First")
        requestId = "b"
        logger.startActivity("Second").complete()

        expect(sink.events.map(event => event.properties.RequestId)).toEqual(["a", "b"])
    })

    test("enricher receives the complete event before sinks", () => {
        let sink = captureSink()
        let logger = createLogger({
            sinks: [sink],
            enrich(event) {
                event.properties.SeenLevel = event.level
                event.properties.UserId = "enriched"
            },
        }).with({ UserId: "context" })

        logger.info("User {UserId}", { UserId: "message" })

        expect(sink.events[0]?.properties).toEqual({
            UserId: "enriched",
            SeenLevel: "info",
        })
    })

    test("self-logs enrichment failures without dropping the event", () => {
        let sink = captureSink()
        let selfLogs: { error: unknown, operation: unknown }[] = []
        let logger = createLogger({
            sinks: [sink],
            enrich() {
                throw new Error("unavailable")
            },
            selfLog(error, context) {
                selfLogs.push({ error, operation: context.operation })
            },
        })

        logger.info("Accepted")

        expect(sink.events).toHaveLength(1)
        expect(selfLogs).toMatchObject([{ error: { message: "unavailable" }, operation: "enrich" }])
    })

    test("supports leading error metadata at every level", () => {
        let sink = captureSink()
        let logger = createLogger({ sinks: [sink] })
        let error = new Error("failed")

        logger.info(error, "Failed {Operation}", { Operation: "sync" })

        expect(sink.events[0]?.error).toMatchObject({ name: "Error", message: "failed" })
        expect(sink.events[0]?.properties).toEqual({ Operation: "sync" })
    })

    test("drops events after close and self-logs", async () => {
        let sink = captureSink()
        let selfLogs: string[] = []
        let logger = createLogger({
            sinks: [sink],
            selfLog(error) {
                selfLogs.push(String(error))
            },
        })

        await logger.close()
        await logger.flush()
        logger.error("Too late")

        expect(sink.events).toHaveLength(0)
        expect(selfLogs).toEqual(["Error: Logger is closed"])
    })

    test("nullLogger is a complete no-op logger", async () => {
        nullLogger.info("Ignored {Value}", { Value: 1 })
        expect(nullLogger.with({ A: 1 })).toBe(nullLogger)
        await expect(nullLogger.flush()).resolves.toBeUndefined()
        await expect(nullLogger.close()).resolves.toBeUndefined()
    })
})

describe("activity tracing", () => {
    test("completes activities into ordinary log events with trace and start time", () => {
        let sink = captureSink()
        let logger = createLogger({ sinks: [sink] })

        let activity = logger.startActivity("Handle {Route}", { Route: "/orders" })
        activity.set("StatusCode", 200)
        activity.complete()

        expect(sink.events).toHaveLength(1)
        expect(sink.events[0]?.level).toBe("info")
        expect(sink.events[0]?.messageTemplate).toBe("Handle {Route}")
        expect(sink.events[0]?.properties).toEqual({ Route: "/orders", StatusCode: 200 })
        expect(sink.events[0]?.trace?.traceId).toMatch(/^[0-9a-f]{32}$/)
        expect(sink.events[0]?.trace?.spanId).toMatch(/^[0-9a-f]{16}$/)
        expect(sink.events[0]?.startTimestamp).toBeInstanceOf(Date)
        expect(sink.events[0]!.startTimestamp!.getTime()).toBeLessThanOrEqual(sink.events[0]!.timestamp.getTime())
    })

    test("filters activities at completion with the final level", () => {
        let sink = captureSink()
        let logger = createLogger({ minimumLevel: "warn", sinks: [sink] })

        logger.startActivity({ level: "debug" }, "Ignored").complete()
        logger.startActivity({ level: "debug" }, "Accepted").complete("error", new Error("failed"))

        expect(sink.events).toHaveLength(1)
        expect(sink.events[0]?.level).toBe("error")
        expect(sink.events[0]?.error).toMatchObject({ message: "failed" })
    })

    test("uses explicit parent trace and activity logger trace", () => {
        let sink = captureSink()
        let logger = createLogger({ sinks: [sink] })
        let parent = {
            traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
            spanId: "00f067aa0ba902b7",
        }

        let activity = logger.startActivity({ parent }, "Child")
        activity.logger.info("Inner")
        activity.complete()

        expect(activity.trace.traceId).toBe(parent.traceId)
        expect(activity.trace.parentSpanId).toBe(parent.spanId)
        expect(sink.events[0]?.messageTemplate).toBe("Inner")
        expect(sink.events[0]?.trace).toEqual(activity.trace)
        expect(sink.events[0]?.properties).toEqual({})
        expect(sink.events[1]?.trace).toEqual(activity.trace)
    })

    test("uses current trace for ordinary log events when async storage is available", () => {
        let sink = captureSink()
        let logger = createLogger({ sinks: [sink] })

        let activity = logger.startActivity("Outer")
        logger.info("Inner")
        activity.complete()

        expect(logger.currentTrace).toBeUndefined()
        expect(sink.events[0]?.messageTemplate).toBe("Inner")
        expect(sink.events[0]?.trace).toEqual(activity.trace)
    })

    test("invalid parent context self-logs and starts a root trace", () => {
        let sink = captureSink()
        let selfLogs: string[] = []
        let logger = createLogger({
            sinks: [sink],
            selfLog(error) {
                selfLogs.push(String(error))
            },
        })

        let activity = logger.startActivity({ parent: { traceId: "lol", spanId: "nope" } }, "Root")
        activity.complete()

        expect(selfLogs).toEqual(["Error: Invalid parent trace context"])
        expect(activity.trace.parentSpanId).toBeUndefined()
    })

    test("double completion self-logs and emits once", () => {
        let sink = captureSink()
        let selfLogs: string[] = []
        let logger = createLogger({
            sinks: [sink],
            selfLog(error) {
                selfLogs.push(String(error))
            },
        })

        let activity = logger.startActivity("Once")
        activity.complete()
        activity.complete()

        expect(sink.events).toHaveLength(1)
        expect(selfLogs).toEqual(["Error: Activity is completed"])
    })
})

describe("message templates", () => {
    test("binds repeated placeholders to the same named property", () => {
        let sink = captureSink()
        let logger = createLogger({ sinks: [sink] })

        logger.info("{UserId} {UserId} {UserId_2}", { UserId: 1, UserId_2: 2 })

        expect(sink.events[0]?.properties).toEqual({ UserId: 1, UserId_2: 2 })
        expect(formatMessage(sink.events[0]!.messageTemplate, sink.events[0]!.properties)).toBe("1 1 2")
    })

    test("uses undefined for missing properties in dynamic templates", () => {
        let sink = captureSink()
        let logger = createLogger({ sinks: [sink] })
        let template: string = "A {A} B {B}"

        logger.info(template, { A: 1 })

        expect(sink.events[0]?.properties).toEqual({ A: 1, B: undefined })
    })

    test("ignores extra properties for dynamic templates", () => {
        let sink = captureSink()
        let logger = createLogger({ sinks: [sink] })
        let template: string = "A {A}"

        logger.info(template, { A: 1, Extra: "extra" })

        expect(sink.events[0]?.properties).toEqual({ A: 1 })
    })

    test("treats invalid placeholders and unmatched braces as literal text", () => {
        let sink = captureSink()
        let logger = createLogger({ sinks: [sink] })
        let template: string = "Bad {User Id} {123} {Ok"

        logger.info(template, { Extra: "extra" })

        expect(sink.events[0]?.properties).toEqual({})
    })
})

describe("destructuring", () => {
    test("normalizes maps, sets, errors, and circular references", () => {
        let sink = captureSink()
        let logger = createLogger({ sinks: [sink] })
        let value: Record<string, unknown> = { name: "root" }
        value.self = value

        logger.info("Value {Value} Map {Map} Set {Set} Error {Error}", {
            Value: value,
            Map: new Map([[{ id: 1 }, "one"]]),
            Set: new Set([1, 2]),
            Error: new Error("bad"),
        })

        expect(sink.events[0]?.properties.Value).toEqual({ name: "root", self: "[Circular]" })
        expect(sink.events[0]?.properties.Map).toEqual([{ key: { id: 1 }, value: "one" }])
        expect(sink.events[0]?.properties.Set).toEqual([1, 2])
        expect(sink.events[0]?.properties.Error).toMatchObject({ name: "Error", message: "bad" })
    })

    test("uses toJSON and reports destructuring failures", () => {
        let sink = captureSink()
        let selfLogs: unknown[] = []
        let logger = createLogger({
            sinks: [sink],
            selfLog(error) {
                selfLogs.push(error)
            },
        })
        let bad = {
            toJSON() {
                throw new Error("nope")
            },
        }

        logger.info("Good {Good} Bad {Bad}", { Good: { toJSON: () => ({ yes: true }) }, Bad: bad })

        expect(sink.events[0]?.properties.Good).toEqual({ yes: true })
        expect(sink.events[0]?.properties.Bad).toBe("[DestructuringError: Error: nope]")
        expect(selfLogs).toHaveLength(1)
    })
})

describe("formatMessage and console sink", () => {
    test("formats strings and objects with options", () => {
        expect(formatMessage("User {Name} {Data}", { Name: "Ada", Data: { id: 1 } }, {
            quoteStrings: true,
            serializeObjects: true,
        })).toBe('User "Ada" {"id":1}')
    })

    test("console sink writes rendered line, properties, and error metadata", () => {
        let calls: unknown[][] = []
        let sink = new ConsoleSink({
            color: false,
            console: {
                debug: (...args: unknown[]) => calls.push(args),
                info: (...args: unknown[]) => calls.push(args),
                warn: (...args: unknown[]) => calls.push(args),
                error: (...args: unknown[]) => calls.push(args),
            },
        })
        let logger = createLogger({ sinks: [sink] })

        logger.error(new Error("bad"), "User {Name}", { Name: "Ada" })

        expect(calls).toHaveLength(1)
        expect(calls[0]?.[0]).toContain('User "Ada"')
        expect(calls[0]?.[1]).toEqual({ Name: "Ada" })
        expect(calls[0]?.[2]).toMatchObject({ message: "bad" })
    })
})

function captureSink(): Sink & { events: LogEvent[] } {
    let events: LogEvent[] = []
    return {
        ...nullLogger,
        events,
        emit(event) { events.push(event) }
    }
}
