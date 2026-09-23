import type { DocKey, Store } from './types'

type DbBridge = {
	getDoc: (key: DocKey) => Promise<unknown | null>
	setDoc: (key: DocKey, value: unknown) => Promise<void>
	putBlob: (key: string, data: number[]) => Promise<void>
	getBlob: (key: string) => Promise<number[] | null>
	deleteBlob: (key: string) => Promise<void>
	listBlobs: () => Promise<string[]>
}

function bridge(): DbBridge {
	const api = window.electronAPI as unknown as { db?: DbBridge } | undefined
	if (!api?.db) throw new Error('Electron store bridge unavailable.')
	return api.db
}

/** Electron backend: SQLite in app-data, reached through the preload bridge. */
export function electronStore(): Store {
	return {
		async getDoc(key: DocKey): Promise<unknown | null> {
			return (await bridge().getDoc(key)) ?? null
		},
		async setDoc(key: DocKey, value: unknown): Promise<void> {
			await bridge().setDoc(key, value)
		},
		async getBlob(key: string): Promise<ArrayBuffer | null> {
			const bytes = await bridge().getBlob(key)
			return bytes ? (new Uint8Array(bytes).buffer as ArrayBuffer) : null
		},
		async putBlob(key: string, data: ArrayBuffer): Promise<void> {
			await bridge().putBlob(key, Array.from(new Uint8Array(data)))
		},
		async deleteBlob(key: string): Promise<void> {
			await bridge().deleteBlob(key)
		},
		async listBlobs(): Promise<string[]> {
			return bridge().listBlobs()
		},
	}
}
