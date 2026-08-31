import { Activity, createNullActivity, type ActivityOwner } from "./activity"
import { normalizeError, normalizeProperties } from "./destructure"
import { isLevelEnabled, resolveMinimumLevel } from "./levels"
import { bindProperties, parseMessageTemplate } from "./messageTemplate"
import { asyncStorage, createTrace, isValidTraceContext } from "./tracing"
import type { Activity as ActivityType, Level, LogEvent, LoggerConfig, Logger as LoggerType, StartActivityOptions, TemplateValues, TraceContext } from "./types"

export function createLogger(options?: Partial<LoggerConfig>): LoggerType {
	return new Logger({
		minimumLevel: options?.minimumLevel ?? 'info',
		sinks: options?.sinks ?? [],
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

	verbose<Template extends string>(messageTemplate: Template, ...values: TemplateValues<Template>): void
	verbose<Template extends string>(error: Error, messageTemplate: Template, ...values: TemplateValues<Template>): void
	verbose(errorOrTemplate: Error | string, templateOrArg?: string | unknown, ...rest: unknown[]): void {
		this.log('verbose', errorOrTemplate as string, templateOrArg, ...rest)
	}

	debug<Template extends string>(messageTemplate: Template, ...values: TemplateValues<Template>): void
	debug<Template extends string>(error: Error, messageTemplate: Template, ...values: TemplateValues<Template>): void
	debug(errorOrTemplate: Error | string, templateOrArg?: string | unknown, ...rest: unknown[]): void {
		this.log('debug', errorOrTemplate as string, templateOrArg, ...rest)
	}

	info<Template extends string>(messageTemplate: Template, ...values: TemplateValues<Template>): void
	info<Template extends string>(error: Error, messageTemplate: Template, ...values: TemplateValues<Template>): void
	info(errorOrTemplate: Error | string, templateOrArg?: string | unknown, ...rest: unknown[]): void {
		this.log('info', errorOrTemplate as string, templateOrArg, ...rest)
	}

	warn<Template extends string>(messageTemplate: Template, ...values: TemplateValues<Template>): void
	warn<Template extends string>(error: Error, messageTemplate: Template, ...values: TemplateValues<Template>): void
	warn(errorOrTemplate: Error | string, templateOrArg?: string | unknown, ...rest: unknown[]): void {
		this.log('warn', errorOrTemplate as string, templateOrArg, ...rest)
	}

	error<Template extends string>(messageTemplate: Template, ...values: TemplateValues<Template>): void
	error<Template extends string>(error: Error, messageTemplate: Template, ...values: TemplateValues<Template>): void
	error(errorOrTemplate: Error | string, templateOrArg?: string | unknown, ...rest: unknown[]): void {
		this.log('error', errorOrTemplate as string, templateOrArg, ...rest)
	}

	fatal<Template extends string>(messageTemplate: Template, ...values: TemplateValues<Template>): void
	fatal<Template extends string>(error: Error, messageTemplate: Template, ...values: TemplateValues<Template>): void
	fatal(errorOrTemplate: Error | string, templateOrArg?: string | unknown, ...rest: unknown[]): void {
		this.log('fatal', errorOrTemplate as string, templateOrArg, ...rest)
	}

	log<Template extends string>(level: Level, messageTemplate: Template, ...values: TemplateValues<Template>): void
	log<Template extends string>(level: Level, error: Error, messageTemplate: Template, ...values: TemplateValues<Template>): void
	log(level: Level, errorOrTemplate: Error | string, templateOrArg?: string | unknown, ...rest: unknown[]): void {
		if (this.closed) {
			this.config.selfLog?.(new Error('Logger is closed'), { operation: 'emit', level })

		} else if (isLevelEnabled(level, resolveMinimumLevel(this.config.minimumLevel))) {
			let error = errorOrTemplate instanceof Error ? errorOrTemplate : undefined
			let messageTemplate = error ? templateOrArg : errorOrTemplate
			let values = error ? rest : [templateOrArg, ...rest]

			if (typeof messageTemplate == 'string') {
				let tokens = parseMessageTemplate(messageTemplate)
				let boundProperties = bindProperties(tokens, values)
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

	startActivity<Template extends string>(messageTemplate: Template, ...values: TemplateValues<Template>): ActivityType
	startActivity<Template extends string>(options: StartActivityOptions, messageTemplate: Template, ...values: TemplateValues<Template>): ActivityType
	startActivity<Template extends string>(optionsOrTemplate: StartActivityOptions | Template, templateOrArg?: Template | unknown, ...rest: unknown[]): ActivityType {
		let options = typeof optionsOrTemplate == 'string' ? {} : optionsOrTemplate
		let messageTemplate = typeof optionsOrTemplate == 'string' ? optionsOrTemplate : templateOrArg
		let values = typeof optionsOrTemplate == 'string' ? [templateOrArg, ...rest] : rest

		if (typeof messageTemplate == 'string') {
			let parent = this.resolveParentTrace(options.parent)
			let trace = createTrace(parent)
			let tokens = parseMessageTemplate(messageTemplate)
			let boundProperties = bindProperties(tokens, values)
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
		if (parent && !isValidTraceContext(parent))
			this.config.selfLog?.(new Error('Invalid parent trace context'), { operation: 'startActivity', parent })
		else
			return parent ?? this.currentTrace
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
