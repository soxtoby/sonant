import { normalizeError, normalizeProperties } from "./destructure"
import { isLevelEnabled, resolveMinimumLevel } from "./levels"
import { asyncStorage } from "./tracing"
import type { Activity as ActivityType, Level, LogEvent, Logger, LoggerConfig, SelfLogContext, TraceContext } from "./types"

export interface ActivityOwner {
	config: LoggerConfig
	contextProperties: Record<string, unknown>
	withTrace(trace: TraceContext): Logger
	emit(event: LogEvent): void
	selfLog(error: unknown, context: SelfLogContext): void
}

export class Activity implements ActivityType {
	private completed = false

	readonly logger: Logger

	constructor(
		private owner: ActivityOwner,
		readonly trace: TraceContext,
		private parentTrace: TraceContext | undefined,
		private defaultLevel: Level,
		private messageTemplate: string,
		private properties: Record<string, unknown>,
		private startedAt: Date
	) {
		this.logger = owner.withTrace(trace)
	}

	set(nameOrProperties: string | Record<string, unknown>, value?: unknown): void {
		if (this.completed) {
			this.owner.selfLog(new Error('Activity is completed'), { operation: 'setActivityProperty', trace: this.trace })
		} else {
			let properties = typeof nameOrProperties == 'string'
				? { [nameOrProperties]: value }
				: nameOrProperties

			this.properties = { ...this.properties, ...normalizeProperties(properties, this.owner.config) }
		}
	}

	complete(): void
	complete(error: Error): void
	complete(level: Level): void
	complete(level: Level, error: Error): void
	complete(levelOrError?: Level | Error, maybeError?: Error): void {
		if (this.completed) {
			this.owner.selfLog(new Error('Activity is completed'), { operation: 'completeActivity', trace: this.trace })
		} else {
			this.completed = true
			let level = levelOrError instanceof Error || levelOrError == undefined ? this.defaultLevel : levelOrError
			let error = levelOrError instanceof Error ? levelOrError : maybeError

			this.restoreTrace()
			this.emit(level, error)
		}
	}

	[Symbol.dispose](): void {
		if (!this.completed)
			this.complete()
	}

	private restoreTrace() {
		let currentTrace = asyncStorage?.getStore()
		if (asyncStorage != undefined && currentTrace != undefined) {
			if (currentTrace.spanId == this.trace.spanId)
				asyncStorage.enterWith(this.parentTrace)
			else
				this.owner.selfLog(new Error('Activity completed out of order'), { operation: 'completeActivity', trace: this.trace })
		}
	}

	private emit(level: Level, error: Error | undefined) {
		if (isLevelEnabled(level, resolveMinimumLevel(this.owner.config.minimumLevel))) {
			this.owner.emit({
				timestamp: new Date(),
				level,
				messageTemplate: this.messageTemplate,
				properties: { ...this.owner.contextProperties, ...this.properties },
				error: error && normalizeError(error),
				trace: this.trace,
				startTimestamp: this.startedAt,
			})
		}
	}
}

export function createNullActivity(logger: Logger): ActivityType {
	return {
		trace: { traceId: '00000000000000000000000000000001', spanId: '0000000000000001' },
		logger,
		set() { },
		complete() { },
	}
}
