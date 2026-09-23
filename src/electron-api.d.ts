export interface LegacyImport {
	workspace: unknown | null
	theme: string | null
}

export interface ElectronDb {
	getDoc: (key: string) => Promise<unknown | null>
	setDoc: (key: string, value: unknown) => Promise<unknown>
	putBlob: (key: string, data: number[]) => Promise<unknown>
	getBlob: (key: string) => Promise<unknown | null>
	deleteBlob: (key: string) => Promise<unknown>
	listBlobs: () => Promise<unknown>
	migrateLegacy: () => Promise<LegacyImport>
}

export interface ElectronAPI {
	isElectron: boolean
	platform: string
	/** Allowlisted channels only (agent-key:* and resume-tailor:db-*). */
	invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
	/** Unified store: settings/workspace docs plus JD PDF blobs (SQLite). */
	db: ElectronDb
	notifyReady: () => void
	exportPdf: (filename: string) => Promise<PdfExportResult | null>
	revealInFolder: (filePath: string) => void
	onFullscreenChanged: (callback: (fullscreen: boolean) => void) => () => void
}

/** Result of the native PDF export (Electron). */
export interface PdfExportResult {
	ok: boolean
	canceled?: boolean
	path?: string
	error?: string
}

declare global {
	interface Window {
		electronAPI?: ElectronAPI
	}
}

export {}
