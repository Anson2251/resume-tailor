/**
 * Unified storage API. One interface, two backends:
 * - web: localForage over IndexedDB (`web.ts`)
 * - Electron: SQLite in app-data via main-process IPC (`electron.ts`)
 *
 * Two sections: small JSON docs (`workspace`, `settings`) and binary blobs
 * (JD PDFs, keyed by pdfRefId). API keys deliberately live outside this
 * store (OS keychain / session memory — see `agent/keyring.ts`).
 */

export type DocKey = 'workspace' | 'settings'

export interface Store {
	/** Read a JSON doc, or null when absent. */
	getDoc(key: DocKey): Promise<unknown | null>
	/** Write a JSON doc (must be JSON-serializable). */
	setDoc(key: DocKey, value: unknown): Promise<void>
	/** Read raw blob bytes, or null when absent. */
	getBlob(key: string): Promise<ArrayBuffer | null>
	/** Write raw blob bytes. */
	putBlob(key: string, data: ArrayBuffer): Promise<void>
	/** Delete one blob; missing keys are a no-op. */
	deleteBlob(key: string): Promise<void>
	/** List all stored blob keys. */
	listBlobs(): Promise<string[]>
}
