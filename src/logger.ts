import { Activity, createNullActivity, type ActivityOwner } from "./activity.js"
import { normalizeError, normalizeProperties } from "./destructure.js"
import { isLevelEnabled, resolveMinimumLevel } from "./levels.js"
import { bindProperties, parseMessageTemplate } from "./messageTemplate.js"
import { asyncStorage, createTrace, isValidTraceContext } from "./tracing.js"
import type { Activity as ActivityType, Level, LogEvent, LoggerConfig, Logger as LoggerType, StartActivityOptions, TraceContext } from "./types.js"

export function createLogger(options?: Partial<LoggerConfig>): LoggerType {
	return new Logger({
		minimumLevel: options?.minimumLevel ?? 'info',
		sinks: options?.sinks ?? [],
		enrich: options?.enrich,
		maxDestructureDepth: options?.maxDestructureDepth ?? 5,
		maxDestructureCollectionLength: options?.maxDestructureCollectionLength ?? 100,
		selfLog: options?.selfLog,
	}, {})
}

class Logger implements LoggerType, ActivityOwner {
	private closed = false

	constructor(
		readonly config: LoggerConfig,
		readonly contextProperties: Record<string, unknown>,
		private traceContext?: TraceContext
	) { }

	verbose(errorOrTemplate: Error | string, templateOrProperties?: string | Record<string, unknown>, properties?: Record<string, unknown>): void {
		this.log('verbose', errorOrTemplate, templateOrProperties, properties)
	}

	debug(errorOrTemplate: Error | string, templateOrProperties?: string | Record<string, unknown>, properties?: Record<string, unknown>): void {
		this.log('debug', errorOrTemplate, templateOrProperties, properties)
	}

	info(errorOrTemplate: Error | string, templateOrProperties?: string | Record<string, unknown>, properties?: Record<string, unknown>): void {
		this.log('info', errorOrTemplate, templateOrProperties, properties)
	}

	warn(errorOrTemplate: Error | string, templateOrProperties?: string | Record<string, unknown>, properties?: Record<string, unknown>): void {
		this.log('warn', errorOrTemplate, templateOrProperties, properties)
	}

	error(errorOrTemplate: Error | string, templateOrProperties?: string | Record<string, unknown>, properties?: Record<string, unknown>): void {
		this.log('error', errorOrTemplate, templateOrProperties, properties)
	}

	fatal(errorOrTemplate: Error | string, templateOrProperties?: string | Record<string, unknown>, properties?: Record<string, unknown>): void {
		this.log('fatal', errorOrTemplate, templateOrProperties, properties)
	}

	log(level: Level, errorOrTemplate: Error | string, templateOrProperties?: string | Record<string, unknown>, properties?: Record<string, unknown>): void {
		if (this.closed) {
			this.config.selfLog?.(new Error('Logger is closed'), { operation: 'emit', level })

		} else if (isLevelEnabled(level, resolveMinimumLevel(this.config.minimumLevel))) {
			let [error, messageTemplate, suppliedProperties] = errorOrTemplate instanceof Error
				? [errorOrTemplate, templateOrProperties as string, properties ?? {}]
				: [undefined, errorOrTemplate, templateOrProperties as Record<string, unknown> ?? {}]

			if (typeof messageTemplate == 'string') {
				let tokens = parseMessageTemplate(messageTemplate)
				let boundProperties = bindProperties(tokens, suppliedProperties)
				let normalizedProperties = normalizeProperties(boundProperties, this.config)
				let event: LogEvent = {
					timestamp: new Date(),
					level,
					messageTemplate,
					properties: { ...this.contextProperties, ...normalizedProperties },
					error: error && normalizeError(error),
					trace: this.currentTrace,
					startTimestamp: undefined,
				}

				this.emit(event)
			} else {
				this.config.selfLog?.(new Error('Message template must be a string'), { operation: 'emit', level })
			}
		}
	}

	startActivity(optionsOrTemplate: StartActivityOptions | string, templateOrProperties?: string | Record<string, unknown>, maybeProperties?: Record<string, unknown>): ActivityType {
		let [options, messageTemplate, suppliedProperties] = typeof optionsOrTemplate == 'object'
			? [optionsOrTemplate, templateOrProperties as string, maybeProperties ?? {}]
			: [{}, optionsOrTemplate as string, templateOrProperties as Record<string, unknown> ?? {}]

		if (typeof messageTemplate == 'string') {
			let parent = this.resolveParentTrace(options.parent)
			let trace = createTrace(parent)
			let tokens = parseMessageTemplate(messageTemplate)
			let boundProperties = bindProperties(tokens, suppliedProperties)
			let properties = normalizeProperties(boundProperties, this.config)
			let defaultLevel = options.level ?? 'info'
			let startedAt = new Date()
			let parentCurrentTrace = asyncStorage?.getStore()

			asyncStorage?.enterWith(trace)

			return new Activity(this, trace, parentCurrentTrace, defaultLevel, messageTemplate, properties, startedAt)
		} else {
			this.config.selfLog?.(new Error('Message template must be a string'), { operation: 'startActivity' })
			return new Activity(this, createTrace(undefined), asyncStorage?.getStore(), options.level ?? 'info', '', {}, new Date())
		}
	}

	get currentTrace() { return this.traceContext ?? asyncStorage?.getStore() }

	isEnabled(level: Level) {
		return isLevelEnabled(level, resolveMinimumLevel(this.config.minimumLevel))
	}

	with(properties: Record<string, unknown>): Logger {
		return new Logger(this.config, { ...this.contextProperties, ...normalizeProperties(properties, this.config) }, this.traceContext)
	}

	withTrace(trace: TraceContext): Logger {
		return new Logger(this.config, this.contextProperties, trace)
	}

	selfLog(error: unknown, context: { operation: string, [key: string]: unknown }) {
		this.config.selfLog?.(error, context)
	}

	emit(event: LogEvent) {
		try {
			this.config.enrich?.(event)
		} catch (error) {
			this.config.selfLog?.(error, { operation: 'enrich', level: event.level })
		}

		for (let sink of this.config.sinks) {
			try {
				let result = sink.emit(event)
				if (isPromiseLike(result))
					result.catch(sinkError => this.config.selfLog?.(sinkError, { operation: 'emit', level: event.level, sink }))
			} catch (sinkError) {
				this.config.selfLog?.(sinkError, { operation: 'emit', level: event.level, sink })
			}
		}
	}

	private resolveParentTrace(parent: TraceContext | undefined): TraceContext | undefined {
		let resolvedParent: TraceContext | undefined
		if (parent && !isValidTraceContext(parent)) {
			this.config.selfLog?.(new Error('Invalid parent trace context'), { operation: 'startActivity', parent })
			resolvedParent = undefined
		} else {
			resolvedParent = parent ?? this.currentTrace
		}
		return resolvedParent
	}

	async flush(): Promise<void> {
		if (!this.closed)
			await Promise.all(this.config.sinks.map(sink => sink.flush?.()))
	}

	async close(): Promise<void> {
		if (!this.closed) {
			await Promise.all(this.config.sinks.map(sink => sink.close?.()))
			this.closed = true
		}
	}
}

export let nullLogger: LoggerType = {
	currentTrace: undefined,
	log() { },
	verbose() { },
	debug() { },
	info() { },
	warn() { },
	error() { },
	fatal() { },
	startActivity() { return createNullActivity(nullLogger) },
	isEnabled: () => false,
	with: () => nullLogger,
	flush: async () => undefined,
	close: async () => undefined,
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return value != null
		&& typeof value == 'object'
		&& typeof (value as any).then == 'function'
}
