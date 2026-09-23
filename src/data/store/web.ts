import localforage from 'localforage'
import type { DocKey, Store } from './types'

function instances(): { docs: LocalForage; blobs: LocalForage } {
	const base = { name: 'resume-tailor', driver: localforage.INDEXEDDB }
	return {
		docs: localforage.createInstance({ ...base, storeName: 'docs' }),
		blobs: localforage.createInstance({ ...base, storeName: 'blobs' }),
	}
}

let cached: { docs: LocalForage; blobs: LocalForage } | null = null

function db(): { docs: LocalForage; blobs: LocalForage } {
	if (!cached) cached = instances()
	return cached
}

/** Web backend: localForage over IndexedDB (pinned driver — no localStorage fallback). */
export function webStore(): Store {
	return {
		async getDoc(key: DocKey): Promise<unknown | null> {
			const value = await db().docs.getItem<unknown>(key)
			return value ?? null
		},
		async setDoc(key: DocKey, value: unknown): Promise<void> {
			await db().docs.setItem(key, value)
		},
		async getBlob(key: string): Promise<ArrayBuffer | null> {
			const value = await db().blobs.getItem<ArrayBuffer | Uint8Array>(key)
			if (!value) return null
			if (value instanceof ArrayBuffer) return value
			// localForage may hand back a view depending on the driver.
			const buf = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
			return buf as ArrayBuffer
		},
		async putBlob(key: string, data: ArrayBuffer): Promise<void> {
			await db().blobs.setItem(key, data)
		},
		async deleteBlob(key: string): Promise<void> {
			await db().blobs.removeItem(key)
		},
		async listBlobs(): Promise<string[]> {
			return db().blobs.keys()
		},
	}
}
