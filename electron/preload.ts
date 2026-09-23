import { contextBridge, ipcRenderer } from 'electron'

// Minimal, auditable bridge: the renderer can only load/save its own JSON
// document and signal that first paint is done. No Node access is exposed.
const AGENT_CHANNELS = ['agent-key:set', 'agent-key:get', 'agent-key:delete', 'agent-jd:save', 'agent-jd:load']
contextBridge.exposeInMainWorld('electronAPI', {
	isElectron: true,
	platform: process.platform,
	invoke: (channel: string, ...args: unknown[]) => {
		if (!AGENT_CHANNELS.includes(channel)) throw new Error(`blocked channel: ${channel}`)
		return ipcRenderer.invoke(channel, ...args)
	},
	store: {
		load: () => ipcRenderer.invoke('resume-tailor:store-load'),
		save: (payload: { workspace: unknown; theme: unknown }) => ipcRenderer.invoke('resume-tailor:store-save', payload),
		getPath: () => ipcRenderer.invoke('resume-tailor:store-path'),
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
