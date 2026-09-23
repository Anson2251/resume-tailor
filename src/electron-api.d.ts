import type { Workspace } from './data/types'

/** Persisted document shape inside the app-data JSON file / localStorage. */
export interface StoreFile {
	theme: string | null
	workspace: Workspace | MasterResume | Record<string, unknown> | null
}

/** Result of the native PDF export (Electron). */
export interface PdfExportResult {
	ok: boolean
	canceled?: boolean
	path?: string
	error?: string
}

export interface ElectronAPI {
	isElectron: boolean
	platform: string
	store: {
		load: () => Promise<StoreFile | null>
		save: (payload: { workspace: Workspace; theme: string | null }) => Promise<boolean>
		getPath: () => Promise<string>
	}
	notifyReady: () => void
	exportPdf: (filename: string) => Promise<PdfExportResult | null>
	revealInFolder: (filePath: string) => void
	onFullscreenChanged: (callback: (fullscreen: boolean) => void) => () => void
}

declare global {
	interface Window {
		electronAPI?: ElectronAPI
	}
}

export {}
