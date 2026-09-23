import type { PdfExportResult } from '../electron-api'

/**
 * Platform helpers. All persisted state (workspace doc, settings doc, JD PDF
 * blobs) lives in the unified store (`data/store`: IndexedDB on web, SQLite
 * in Electron) — this module keeps only Electron detection, the ready signal,
 * and the native PDF export / reveal helpers.
 */

export function isElectron(): boolean {
	return typeof window !== 'undefined' && !!window.electronAPI?.isElectron
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
