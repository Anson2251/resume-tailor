import { LEGACY_STORAGE_KEY, STORAGE_KEY } from './workspace'
import type { PdfExportResult, StoreFile } from '../electron-api'
import type { Workspace } from './types'

/**
 * Persistence layer: in the Electron app the workspace + theme live in a
 * JSON file in the OS app-data directory (via the main-process IPC store);
 * in the browser they live in localStorage. Same interface either way.
 */

export function isElectron(): boolean {
	return typeof window !== 'undefined' && !!window.electronAPI?.store
}

function readLocal(key: string): string | null {
	try {
		return localStorage.getItem(key)
	} catch {
		return null
	}
}

function writeLocal(key: string, value: string): void {
	try {
		localStorage.setItem(key, value)
	} catch {
		/* storage unavailable — ignore */
	}
}

export interface PersistedState {
	/** Raw parsed JSON (or null) so the caller can run it through `migrate()`. */
	workspaceRaw: unknown
	theme: string | null
}

/** Load persisted state. */
export async function loadPersistedState(): Promise<PersistedState> {
	if (isElectron()) {
		try {
			const file: StoreFile | null = await window.electronAPI!.store.load()
			const workspaceRaw: unknown = file?.workspace ?? null
			const theme: string | null = typeof file?.theme === 'string' ? file.theme : null
			if (!workspaceRaw) {
				// First run in Electron: adopt an existing browser save so
				// users don't lose data when switching to the desktop app.
				const raw = readLocal(STORAGE_KEY) ?? readLocal(LEGACY_STORAGE_KEY)
				if (raw) {
					try {
						return { workspaceRaw: JSON.parse(raw), theme: theme ?? readLocal('resume-tailor-theme') }
					} catch {
						/* not valid JSON — fall through to defaults */
					}
				}
				return { workspaceRaw: null, theme: theme ?? readLocal('resume-tailor-theme') }
			}
			return { workspaceRaw, theme }
		} catch {
			return { workspaceRaw: null, theme: readLocal('resume-tailor-theme') }
		}
	}
	const raw = readLocal(STORAGE_KEY) ?? readLocal(LEGACY_STORAGE_KEY)
	let workspaceRaw: unknown = null
	try {
		workspaceRaw = raw ? JSON.parse(raw) : null
	} catch {
		workspaceRaw = null
	}
	return { workspaceRaw, theme: readLocal('resume-tailor-theme') }
}

/** Save state to the file store (Electron) or localStorage (web). */
export async function savePersistedState(state: { workspace: Workspace; theme: string | null }): Promise<void> {
	const { workspace, theme } = state
	if (isElectron()) {
		try {
			await window.electronAPI!.store.save({ workspace, theme })
		} catch {
			/* store write failed — ignore, next save will retry */
		}
		return
	}
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
	} catch {
		/* storage unavailable — ignore */
	}
	if (typeof theme === 'string') writeLocal('resume-tailor-theme', theme)
}

/** Theme is persisted as part of the save above in Electron; on web this is a no-op helper. */
export function saveThemeLocal(theme: string): void {
	if (!isElectron()) writeLocal('resume-tailor-theme', theme)
}

export function notifyRendererReady(): void {
	try {
		window.electronAPI?.notifyReady?.()
	} catch {
		/* not in Electron — ignore */
	}
}

/**
 * Native PDF export (Electron only): renders the resume page via
 * webContents.printToPDF after a save dialog. Resolves to the export result,
 * or null outside Electron.
 */
export async function exportPdfFile(filename: string): Promise<PdfExportResult | null> {
	if (!isElectron() || typeof window.electronAPI?.exportPdf !== 'function') return null
	try {
		return await window.electronAPI.exportPdf(filename)
	} catch {
		return { ok: false, error: 'export failed' }
	}
}

/** Reveal a saved file in the OS file manager (Electron only). */
export function revealInFolder(filePath: string): void {
	try {
		window.electronAPI?.revealInFolder?.(filePath)
	} catch {
		/* not in Electron — ignore */
	}
}
