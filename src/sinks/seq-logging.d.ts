declare module "seq-logging" {
    export class Logger {
        constructor(options: {
            serverUrl: string
            apiKey?: string
            batchSizeLimit?: number
            eventBodyLimit?: number
        })

        emit(event: Record<string, unknown>): void
        flush(): Promise<void> | void
        close(): Promise<void> | void
    }
}
