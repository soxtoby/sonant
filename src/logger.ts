import { normalizeError, normalizeProperties } from "./destructure"
import { isLevelEnabled, resolveMinimumLevel } from "./levels"
import { bindProperties, parseMessageTemplate } from "./messageTemplate"
import type { Logger as LoggerType, Level, LogEvent, LoggerConfig, TemplateValues } from "./types"

export function createLogger(options?: Partial<LoggerConfig>): LoggerType {
	return new Logger({
		minimumLevel: options?.minimumLevel ?? 'info',
		sinks: options?.sinks ?? [],
		maxDestructureDepth: options?.maxDestructureDepth ?? 5,
		maxDestructureCollectionLength: options?.maxDestructureCollectionLength ?? 100,
		selfLog: options?.selfLog,
	}, {})
}

class Logger implements LoggerType {
	private closed = false

	constructor(
		private config: LoggerConfig,
		private contextProperties: Record<string, unknown>
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
					error: error && normalizeError(error)
				}

				for (let sink of this.config.sinks) {
					try {
						let result = sink.emit(event)
						if (isPromiseLike(result))
							result.catch(sinkError => this.config.selfLog?.(sinkError, { operation: 'emit', level, sink }))
					} catch (sinkError) {
						this.config.selfLog?.(sinkError, { operation: 'emit', level, sink })
					}
				}
			} else {
				this.config.selfLog?.(new Error('Message template must be a string'), { operation: 'emit', level })
			}
		}
	}

	isEnabled(level: Level) {
		return isLevelEnabled(level, resolveMinimumLevel(this.config.minimumLevel))
	}

	with(properties: Record<string, unknown>): Logger {
		return new Logger(this.config, { ...this.contextProperties, ...normalizeProperties(properties, this.config) })
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
	log() { },
	verbose() { },
	debug() { },
	info() { },
	warn() { },
	error() { },
	fatal() { },
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
