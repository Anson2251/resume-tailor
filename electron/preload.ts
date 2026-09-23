import { contextBridge, ipcRenderer } from 'electron'

// Minimal, auditable bridge: the renderer reaches the unified SQLite store
// (docs + blobs) and its own keychain entries through allowlisted channels.
// No Node access and no broad `invoke` are exposed.
const AGENT_KEY_CHANNELS = ['agent-key:set', 'agent-key:get', 'agent-key:delete']
const DB_CHANNELS = [
	'resume-tailor:db-doc-get',
	'resume-tailor:db-doc-set',
	'resume-tailor:db-blob-put',
	'resume-tailor:db-blob-get',
	'resume-tailor:db-blob-delete',
	'resume-tailor:db-blob-list',
	'resume-tailor:db-migrate-legacy',
]

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
	if (!AGENT_KEY_CHANNELS.includes(channel) && !DB_CHANNELS.includes(channel)) {
		throw new Error(`blocked channel: ${channel}`)
	}
	return ipcRenderer.invoke(channel, ...args)
}

contextBridge.exposeInMainWorld('electronAPI', {
	isElectron: true,
	platform: process.platform,
	invoke,
	db: {
		getDoc: (key: string) => invoke('resume-tailor:db-doc-get', key),
		setDoc: (key: string, value: unknown) => invoke('resume-tailor:db-doc-set', key, value),
		putBlob: (key: string, data: number[]) => invoke('resume-tailor:db-blob-put', key, data),
		getBlob: (key: string) => invoke('resume-tailor:db-blob-get', key),
		deleteBlob: (key: string) => invoke('resume-tailor:db-blob-delete', key),
		listBlobs: () => invoke('resume-tailor:db-blob-list'),
		migrateLegacy: () => invoke('resume-tailor:db-migrate-legacy'),
	},
	notifyReady: () => ipcRenderer.send('resume-tailor:renderer-ready'),
	// Fullscreen enter/leave (OS hides its controls there). Returns an
	// unsubscribe function.
	onFullscreenChanged: (callback: (fullscreen: boolean) => void): (() => void) => {
		const listener = (_event: unknown, fullscreen: unknown): void => callback(!!fullscreen)
		ipcRenderer.on('resume-tailor:fullscreen-changed', listener)
		return () => ipcRenderer.removeListener('resume-tailor:fullscreen-changed', listener)
	},
	// Renders the resume page to a PDF file (save dialog + printToPDF in main).
	exportPdf: (filename: string) => ipcRenderer.invoke('resume-tailor:export-pdf', filename),
	revealInFolder: (filePath: string) => ipcRenderer.send('resume-tailor:reveal-in-folder', filePath),
})
