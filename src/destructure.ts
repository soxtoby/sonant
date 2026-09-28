import type { ErrorMetadata, SelfLog } from "./types.js"

export interface DestructureOptions {
    maxDestructureDepth: number
    maxDestructureCollectionLength: number
    selfLog: SelfLog | undefined
}

export function normalizeProperties(properties: Record<string, unknown>, options: DestructureOptions) {
    return Object.fromEntries(
        Object.entries(properties)
            .map(([key, value]) => [key, normalizeValue(value, options, 0, new WeakSet<object>())] as const))
}

function normalizeValue(value: unknown, options: DestructureOptions, depth: number, seen: WeakSet<object>): unknown {
    if (value == null)
        return value

    if (typeof value != 'object')
        return value

    if (value instanceof Date || value instanceof RegExp)
        return value

    if (value instanceof Error)
        return normalizeError(value)

    if (depth >= options.maxDestructureDepth)
        return '[Truncated]'

    if (seen.has(value))
        return '[Circular]'

    seen.add(value)
    try {
        if (hasOwnToJson(value))
            return normalizeValue(value.toJSON(), options, depth, seen)

        if (Array.isArray(value))
            return value
                .slice(0, options.maxDestructureCollectionLength)
                .map(item => normalizeValue(item, options, depth + 1, seen))

        if (value instanceof Map)
            return Array.from(value.entries())
                .slice(0, options.maxDestructureCollectionLength)
                .map(([key, entryValue]) => ({
                    key: normalizeValue(key, options, depth + 1, seen),
                    value: normalizeValue(entryValue, options, depth + 1, seen)
                }))

        if (value instanceof Set)
            return normalizeValue(Array.from(value.values()), options, depth, seen)

        return Object.fromEntries(
            Object.entries(value)
                .slice(0, options.maxDestructureCollectionLength)
                .map(([key, entryValue]) => [key, normalizeValue(entryValue, options, depth + 1, seen)] as const))
    } catch (error) {
        options.selfLog?.(error, { operation: 'destructure' })
        return `[DestructuringError: ${String(error)}]`
    } finally {
        seen.delete(value)
    }
}

export function normalizeError(error: Error, seen = new Set<Error>()): ErrorMetadata {
    seen.add(error)
    return {
        name: error.name,
        message: error.message,
        ...(error.stack ? { stack: error.stack } : {}),
        ...(error.cause instanceof Error && !seen.has(error.cause) ? { cause: normalizeError(error.cause, seen) } : {}),
    }
}

function hasOwnToJson(value: object): value is object & { toJSON(): unknown } {
    return Object.hasOwn(value, 'toJSON')
        && typeof (value as { toJSON?: unknown }).toJSON == 'function'
}
