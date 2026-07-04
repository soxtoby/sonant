export interface LogEvent {
    timestamp: Date
    level: Level
    messageTemplate: string
    properties: Record<string, unknown>
    error: ErrorMetadata | undefined
}

export type Level = 'verbose' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface ErrorMetadata {
    name: string
    message: string
    stack?: string
}

export interface LoggerConfig {
    minimumLevel: Level | LevelSwitch
    sinks: Sink[]
    maxDestructureDepth: number
    maxDestructureCollectionLength: number
    selfLog: SelfLog | undefined
}

export interface LevelSwitch {
    minimumLevel: Level
}

export interface Sink {
    emit(event: LogEvent): void | Promise<void>
    flush(): void | Promise<void>
    close?(): void | Promise<void>
}

export type SelfLog = (error: unknown, context: SelfLogContext) => void

export interface SelfLogContext {
    operation: string
    [key: string]: unknown
}

export interface Logger {
    verbose<Template extends string>(messageTemplate: Template, ...values: TemplateValues<Template>): void
    verbose<Template extends string>(error: Error, messageTemplate: Template, ...values: TemplateValues<Template>): void

    debug<Template extends string>(messageTemplate: Template, ...values: TemplateValues<Template>): void
    debug<Template extends string>(error: Error, messageTemplate: Template, ...values: TemplateValues<Template>): void

    info<Template extends string>(messageTemplate: Template, ...values: TemplateValues<Template>): void
    info<Template extends string>(error: Error, messageTemplate: Template, ...values: TemplateValues<Template>): void

    warn<Template extends string>(messageTemplate: Template, ...values: TemplateValues<Template>): void
    warn<Template extends string>(error: Error, messageTemplate: Template, ...values: TemplateValues<Template>): void

    error<Template extends string>(messageTemplate: Template, ...values: TemplateValues<Template>): void
    error<Template extends string>(error: Error, messageTemplate: Template, ...values: TemplateValues<Template>): void

    fatal<Template extends string>(messageTemplate: Template, ...values: TemplateValues<Template>): void
    fatal<Template extends string>(error: Error, messageTemplate: Template, ...values: TemplateValues<Template>): void

    log<Template extends string>(level: Level, messageTemplate: Template, ...values: TemplateValues<Template>): void
    log<Template extends string>(level: Level, error: Error, messageTemplate: Template, ...values: TemplateValues<Template>): void

    isEnabled(level: Level): boolean
    with(properties: Record<string, unknown>): Logger
    flush(): Promise<void>
    close(): Promise<void>
}

export type TemplateValues<Template extends string> = ExtractPlaceholders<Template>

type ExtractPlaceholders<Template extends string, Found extends unknown[] = []> =
    string extends Template
    ? unknown[]
    : (Template extends `${string}{${infer Name}}${infer Rest}`
        ? (PlaceholderName<Name> extends never
            ? ExtractPlaceholders<Rest, Found>
            : ExtractPlaceholders<Rest, [...Found, unknown]>)
        : Found)

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