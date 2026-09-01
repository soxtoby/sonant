export interface Logger {
    readonly currentTrace: TraceContext | undefined

    verbose<Template extends string>(messageTemplate: TemplateWithoutProperties<Template>): void
    verbose<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): void
    verbose<Template extends string>(error: Error, messageTemplate: TemplateWithoutProperties<Template>): void
    verbose<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(error: Error, messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): void

    debug<Template extends string>(messageTemplate: TemplateWithoutProperties<Template>): void
    debug<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): void
    debug<Template extends string>(error: Error, messageTemplate: TemplateWithoutProperties<Template>): void
    debug<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(error: Error, messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): void

    info<Template extends string>(messageTemplate: TemplateWithoutProperties<Template>): void
    info<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): void
    info<Template extends string>(error: Error, messageTemplate: TemplateWithoutProperties<Template>): void
    info<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(error: Error, messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): void

    warn<Template extends string>(messageTemplate: TemplateWithoutProperties<Template>): void
    warn<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): void
    warn<Template extends string>(error: Error, messageTemplate: TemplateWithoutProperties<Template>): void
    warn<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(error: Error, messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): void

    error<Template extends string>(messageTemplate: TemplateWithoutProperties<Template>): void
    error<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): void
    error<Template extends string>(error: Error, messageTemplate: TemplateWithoutProperties<Template>): void
    error<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(error: Error, messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): void

    fatal<Template extends string>(messageTemplate: TemplateWithoutProperties<Template>): void
    fatal<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): void
    fatal<Template extends string>(error: Error, messageTemplate: TemplateWithoutProperties<Template>): void
    fatal<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(error: Error, messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): void

    log<Template extends string>(level: Level, messageTemplate: TemplateWithoutProperties<Template>): void
    log<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(level: Level, messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): void
    log<Template extends string>(level: Level, error: Error, messageTemplate: TemplateWithoutProperties<Template>): void
    log<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(level: Level, error: Error, messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): void

    startActivity<Template extends string>(messageTemplate: TemplateWithoutProperties<Template>): Activity
    startActivity<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): Activity
    startActivity<Template extends string>(options: StartActivityOptions, messageTemplate: TemplateWithoutProperties<Template>): Activity
    startActivity<Template extends string, Properties extends TemplateProperties<NoInfer<Template>>>(options: StartActivityOptions, messageTemplate: Template, properties: ExactTemplateProperties<NoInfer<Template>, Properties>): Activity

    isEnabled(level: Level): boolean
    with(properties: Record<string, unknown>): Logger
    flush(): Promise<void>
    close(): Promise<void>
}

export interface Activity {
    readonly trace: TraceContext
    readonly logger: Logger
    set(name: string, value: unknown): void
    set(properties: Record<string, unknown>): void
    complete(): void
    complete(error: Error): void
    complete(level: Level): void
    complete(level: Level, error: Error): void
}

export interface LogEvent {
    timestamp: Date
    level: Level
    messageTemplate: string
    properties: Record<string, unknown>
    error: ErrorMetadata | undefined
    trace: TraceContext | undefined
    startTimestamp: Date | undefined
}

export interface LoggerConfig {
    minimumLevel: Level | LevelSwitch
    sinks: Sink[]
    enrich: LogEventEnricher | undefined
    maxDestructureDepth: number
    maxDestructureCollectionLength: number
    selfLog: SelfLog | undefined
}

export type LogEventEnricher = (event: LogEvent) => void

export interface StartActivityOptions {
    level?: Level
    parent?: TraceContext
}

export interface TraceContext {
    traceId: string
    spanId: string
    parentSpanId?: string
}

export type Level = 'verbose' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LevelSwitch {
    minimumLevel: Level
}

export interface Sink {
    emit(event: LogEvent): void | Promise<void>
    flush(): void | Promise<void>
    close?(): void | Promise<void>
}

export interface ErrorMetadata {
    name: string
    message: string
    stack?: string
}

export type SelfLog = (error: unknown, context: SelfLogContext) => void

export interface SelfLogContext {
    operation: string
    [key: string]: unknown
}

export type TemplateProperties<Template extends string> = string extends Template
    ? Record<string, unknown>
    : ([ExtractPlaceholderNames<Template>] extends [never]
        ? Record<string, never>
        : { [Name in ExtractPlaceholderNames<Template>]: unknown })

type TemplateWithoutProperties<Template extends string> = string extends Template
    ? Template
    : ([ExtractPlaceholderNames<Template>] extends [never] ? Template : never)

type ExactTemplateProperties<Template extends string, Properties extends TemplateProperties<Template>> =
    Properties & Record<Exclude<keyof Properties, ExtractPlaceholderNames<Template>>, never>

type ExtractPlaceholderNames<Template extends string> =
    string extends Template
    ? string
    : (Template extends `${string}{${infer Name}}${infer Rest}`
        ? (PlaceholderName<Name> extends never
            ? ExtractPlaceholderNames<Rest>
            : PlaceholderName<Name> | ExtractPlaceholderNames<Rest>)
        : never)

type PlaceholderName<Name extends string> = Name extends `${infer First}${infer Rest}`
    ? (First extends PlaceholderStart
        ? (ValidPlaceholderRest<Rest> extends true
            ? Name
            : never)
        : never)
    : never

type ValidPlaceholderRest<Value extends string> = Value extends ''
    ? true
    : (Value extends `${infer First}${infer Rest}`
        ? (First extends PlaceholderRest
            ? ValidPlaceholderRest<Rest>
            : false)
        : false)

type PlaceholderRest = PlaceholderStart | Digit | '.'
type PlaceholderStart = Alpha | '_'

type Alpha =
    | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
    | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z'
    | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm'
    | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z'

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
