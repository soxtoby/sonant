import type { TraceContext } from "./types"

export type AsyncStorage = {
	getStore(): TraceContext | undefined
	enterWith(trace: TraceContext | undefined): void
}

let asyncLocalStorageType = await loadAsyncLocalStorage()

export let asyncStorage = createAsyncStorage()

export function createTrace(parent: TraceContext | undefined): TraceContext {
	return {
		traceId: parent?.traceId ?? createId(16),
		spanId: createId(8),
		...(parent ? { parentSpanId: parent.spanId } : {}),
	}
}

export function isValidTraceContext(trace: TraceContext): boolean {
	return isValidId(trace.traceId, 32)
		&& isValidId(trace.spanId, 16)
		&& (trace.parentSpanId == undefined || isValidId(trace.parentSpanId, 16))
}

function createId(byteLength: number): string {
	let bytes = new Uint8Array(byteLength)
	do {
		crypto.getRandomValues(bytes)
	} while (bytes.every(byte => byte == 0))

	return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function isValidId(value: string, length: number): boolean {
	return value.length == length
		&& /^[0-9a-f]+$/.test(value)
		&& !/^0+$/.test(value)
}

function createAsyncStorage(): AsyncStorage | undefined {
	return asyncLocalStorageType == undefined ? undefined : new asyncLocalStorageType()
}

async function loadAsyncLocalStorage(): Promise<(new () => AsyncStorage) | undefined> {
	try {
		let asyncHooks = await import("node:async_hooks")
		return asyncHooks.AsyncLocalStorage as new () => AsyncStorage
	} catch {
		return (globalThis as typeof globalThis & {
			AsyncLocalStorage?: new () => AsyncStorage
		}).AsyncLocalStorage
	}
}
