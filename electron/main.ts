import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'

const DEV_URL = process.env.ELECTRON_DEV_URL || 'http://localhost:5173'
const STORE_FILENAME = 'resume-tailor.json'

interface StoredState {
	theme: string | null
	workspace: unknown
}

interface PdfExportResult {
	ok: boolean
	canceled?: boolean
	path?: string
	error?: string
}

// ---------------------------------------------------------------------------
// JSON file store in the OS app-data directory
// (~/Library/Application Support/Resume Tailor, %APPDATA%\..., ~/.config/...)
// File shape: { version: 1, updatedAt: ISO string, theme, workspace }
// ---------------------------------------------------------------------------
function storeFilePath(): string {
	return path.join(app.getPath('userData'), STORE_FILENAME)
}

async function readStoreFile(): Promise<StoredState | null> {
	try {
		const raw = await fs.readFile(storeFilePath(), 'utf-8')
		const parsed: unknown = JSON.parse(raw)
		if (!parsed || typeof parsed !== 'object') return null
		const doc = parsed as { theme?: unknown; workspace?: unknown }
		return {
			theme: typeof doc.theme === 'string' ? doc.theme : null,
			workspace: doc.workspace && typeof doc.workspace === 'object' ? doc.workspace : null,
		}
	} catch (err) {
		if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null
		console.error('[store] read failed:', err)
		return null
	}
}

async function writeStoreFile(payload: { theme?: unknown; workspace?: unknown }): Promise<boolean> {
	try {
		await fs.mkdir(path.dirname(storeFilePath()), { recursive: true })
		const doc = {
			version: 1,
			updatedAt: new Date().toISOString(),
			theme: typeof payload?.theme === 'string' ? payload.theme : null,
			workspace: payload?.workspace && typeof payload.workspace === 'object' ? payload.workspace : null,
		}
		await fs.writeFile(storeFilePath(), JSON.stringify(doc), 'utf-8')
		return true
	} catch (err) {
		console.error('[store] write failed:', err)
		return false
	}
}

function registerStoreIpc(): void {
	ipcMain.handle('resume-tailor:store-load', () => readStoreFile())
	ipcMain.handle('resume-tailor:store-save', (_event, payload) => {
		// Theme rides along with every save — reuse it for the caption buttons.
		const theme = (payload as { theme?: unknown } | null)?.theme
		if (theme === 'light' || theme === 'dark') syncTitleBarOverlay(theme)
		return writeStoreFile(payload)
	})
	ipcMain.handle('resume-tailor:store-path', () => storeFilePath())
}

// ---------------------------------------------------------------------------
// PDF export via webContents.printToPDF (no print dialog).
// The renderer's print CSS (@page A4, zero margins, .no-print hidden) already
// describes the exact output, so the options below just mirror it.
// ---------------------------------------------------------------------------
let lastPdfDir: string | null = null

async function exportPdf(event: IpcMainInvokeEvent, filename: unknown): Promise<PdfExportResult> {
	const win = BrowserWindow.fromWebContents(event.sender) || mainWindow
	if (!win || win.isDestroyed()) return { ok: false, error: 'no-window' }
	// Never trust the renderer with a path: keep only a file name.
	const safeName =
		typeof filename === 'string' && filename.trim()
			? path
					.basename(filename.trim())
					.replace(/[^\w\-. ]+/g, '')
					.slice(0, 120) || 'resume.pdf'
			: 'resume.pdf'
	const withExt = safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`
	try {
		const { canceled, filePath } = await dialog.showSaveDialog(win, {
			title: 'Export resume as PDF',
			defaultPath: path.join(lastPdfDir || app.getPath('documents'), withExt),
			filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
		})
		if (canceled || !filePath) return { ok: true, canceled: true }
		lastPdfDir = path.dirname(filePath)
		// Matches the "Save as PDF, margins None" flow of the web app:
		// CSS @page (A4, margin 0) wins, backgrounds (accent colors) kept.
		const data = await win.webContents.printToPDF({
			preferCSSPageSize: true,
			pageSize: 'A4',
			margins: { top: 0, bottom: 0, left: 0, right: 0 },
			printBackground: true,
		})
		await fs.writeFile(filePath, data)
		return { ok: true, path: filePath }
	} catch (err) {
		console.error('[pdf] export failed:', err)
		return { ok: false, error: err instanceof Error ? err.message : String(err) }
	}
}

function registerPdfIpc(): void {
	ipcMain.handle('resume-tailor:export-pdf', (event, filename: unknown) => exportPdf(event, filename))
	ipcMain.on('resume-tailor:reveal-in-folder', (_event, filePath: unknown) => {
		if (typeof filePath === 'string' && filePath) shell.showItemInFolder(filePath)
	})
}

// ---------------------------------------------------------------------------
// Agent keys (OS keychain via safeStorage) + JD PDFs (app-data files).
// Neither ever enters the workspace JSON: keys live encrypted in
// agent-keys.json, PDF bytes in jd-pdfs/<jobId>.pdf.
// ---------------------------------------------------------------------------
const KEYS_FILENAME = 'agent-keys.json'

function keysFilePath(): string {
	return path.join(app.getPath('userData'), KEYS_FILENAME)
}

function jdDir(): string {
	return path.join(app.getPath('userData'), 'jd-pdfs')
}

function safeJobId(jobId: unknown): string | null {
	return typeof jobId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(jobId) ? jobId : null
}

async function readKeyFile(): Promise<Record<string, string>> {
	try {
		const raw = await fs.readFile(keysFilePath(), 'utf-8')
		const parsed: unknown = JSON.parse(raw)
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
	} catch {
		return {}
	}
}

function registerAgentIpc(): void {
	ipcMain.handle('agent-key:set', async (_event, provider: unknown, key: unknown) => {
		if (typeof provider !== 'string' || typeof key !== 'string' || !provider || !key) return false
		if (!safeStorage.isEncryptionAvailable()) return false
		const store = await readKeyFile()
		store[provider] = safeStorage.encryptString(key).toString('base64')
		await fs.mkdir(path.dirname(keysFilePath()), { recursive: true })
		await fs.writeFile(keysFilePath(), JSON.stringify(store), 'utf-8')
		return true
	})
	ipcMain.handle('agent-key:get', async (_event, provider: unknown) => {
		if (typeof provider !== 'string' || !provider) return null
		const store = await readKeyFile()
		const cipher = store[provider]
		if (!cipher) return null
		try {
			return safeStorage.decryptString(Buffer.from(cipher, 'base64'))
		} catch (err) {
			console.error('[agent-key] decrypt failed:', err)
			return null
		}
	})
	ipcMain.handle('agent-key:delete', async (_event, provider: unknown) => {
		if (typeof provider !== 'string' || !provider) return false
		const store = await readKeyFile()
		delete store[provider]
		await fs.writeFile(keysFilePath(), JSON.stringify(store), 'utf-8')
		return true
	})
	ipcMain.handle('agent-jd:save', async (_event, payload: unknown) => {
		const doc = payload as { jobId?: unknown; data?: unknown } | null
		const jobId = safeJobId(doc?.jobId)
		if (!jobId || !Array.isArray(doc?.data)) return null
		await fs.mkdir(jdDir(), { recursive: true })
		await fs.writeFile(path.join(jdDir(), `${jobId}.pdf`), Buffer.from(doc.data as number[]))
		return `${jobId}.pdf`
	})
	ipcMain.handle('agent-jd:load', async (_event, pdfRefId: unknown) => {
		if (typeof pdfRefId !== 'string' || !pdfRefId.endsWith('.pdf')) return null
		const jobId = safeJobId(pdfRefId.slice(0, -4))
		if (!jobId) return null
		try {
			const buf = await fs.readFile(path.join(jdDir(), `${jobId}.pdf`))
			return Array.from(buf)
		} catch {
			return null
		}
	})
}

// ---------------------------------------------------------------------------
// Windows: splash first (avoids a blank screen while the renderer boots),
// main window shown only once content is ready.
// ---------------------------------------------------------------------------
let splashWindow: BrowserWindow | null = null
let mainWindow: BrowserWindow | null = null
let mainReadyToShow = false
let rendererReady = false
let splashClosed = false

function createSplashWindow(): Promise<void> {
	splashWindow = new BrowserWindow({
		width: 400,
		height: 300,
		frame: false,
		resizable: false,
		alwaysOnTop: true,
		center: true,
		show: true,
		backgroundColor: '#0f172a',
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
		},
	})
	splashWindow.on('closed', () => {
		splashWindow = null
	})
	// NB: splash.html lives next to the sources, not in dist/.
	return splashWindow.loadFile(path.join(__dirname, '../splash.html')).then(() => undefined)
}

function createMainWindow(): void {
	const isMac = process.platform === 'darwin'
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 860,
		minWidth: 960,
		minHeight: 640,
		show: false, // revealed via maybeRevealMain() once content is ready
		backgroundColor: '#f1f5f9',
		autoHideMenuBar: true,
		// Single title bar: the native title text is hidden so it doesn't
		// duplicate the app's own header. Native window controls stay —
		// traffic lights on macOS, caption buttons via overlay on Windows/Linux —
		// and the header's top strip acts as the drag handle (see #topbar CSS).
		title: 'Resume Tailor',
		titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
		titleBarOverlay: isMac ? undefined : { color: '#ffffff', symbolColor: '#0f172a', height: 36 },
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
		trafficLightPosition: { x: 16, y: 16 },
	})
	mainWindow.on('ready-to-show', () => {
		mainReadyToShow = true
		maybeRevealMain()
	})
	mainWindow.on('closed', () => {
		mainWindow = null
	})
	// Fullscreen hides the OS controls, so tell the renderer to collapse the
	// header's top strip (it would otherwise sit there as dead space).
	mainWindow.on('enter-full-screen', () => sendFullscreenChanged(true))
	mainWindow.on('leave-full-screen', () => sendFullscreenChanged(false))
}

function sendFullscreenChanged(fullscreen: boolean): void {
	try {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send('resume-tailor:fullscreen-changed', fullscreen)
		}
	} catch (err) {
		console.error('[titlebar] fullscreen notify failed:', err)
	}
}

// Keep the Windows/Linux caption-button overlay readable in both themes.
// macOS traffic lights need no theming, so this is a no-op there.
let lastOverlayDark: boolean | null = null
function syncTitleBarOverlay(theme: string): void {
	if (process.platform === 'darwin') return
	const dark = theme === 'dark'
	if (dark === lastOverlayDark || !mainWindow || mainWindow.isDestroyed()) return
	lastOverlayDark = dark
	try {
		mainWindow.setTitleBarOverlay({
			color: dark ? '#0f172a' : '#ffffff',
			symbolColor: dark ? '#e2e8f0' : '#0f172a',
			height: 36,
		})
	} catch (err) {
		console.error('[titlebar] overlay sync failed:', err)
	}
}

function maybeRevealMain(): void {
	// Show as soon as the renderer has painted real content; if the renderer
	// never signals (e.g. load failure), fall back to ready-to-show so we
	// never trap the user on the splash.
	if (splashClosed || !mainWindow || !mainReadyToShow) return
	if (!rendererReady) return
	revealMain()
}

function revealMain(): void {
	if (splashClosed) return
	splashClosed = true
	if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
	if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
}

async function loadRenderer(): Promise<void> {
	const win = mainWindow
	if (!win) return
	if (!app.isPackaged) {
		// Dev: prefer the Vite server so HMR works; fall back to a local
		// build if the dev server isn't running.
		try {
			await win.loadURL(DEV_URL)
			return
		} catch {
			console.warn(`[electron] dev server not reachable at ${DEV_URL}, falling back to dist/`)
		}
	}
	await win.loadFile(path.join(__dirname, '../../dist/index.html'))
}

async function boot(): Promise<void> {
	registerStoreIpc()
	registerPdfIpc()
	registerAgentIpc()

	ipcMain.on('resume-tailor:renderer-ready', () => {
		rendererReady = true
		maybeRevealMain()
	})

	await createSplashWindow()
	createMainWindow()
	// Theme the caption buttons before first paint from the stored theme.
	readStoreFile().then((state) => {
		if (state?.theme === 'light' || state?.theme === 'dark') syncTitleBarOverlay(state.theme)
	})

	// Safety net: never leave the user staring at the splash forever.
	setTimeout(revealMain, 8000)

	await loadRenderer()
}

// Single instance: focus the existing window instead of opening a second copy.
if (!app.requestSingleInstanceLock()) {
	app.quit()
} else {
	app.on('second-instance', () => {
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore()
			if (!mainWindow.isVisible()) mainWindow.show()
			mainWindow.focus()
		}
	})

	app
		.whenReady()
		.then(boot)
		.catch((err) => {
			console.error('[electron] boot failed:', err)
			app.quit()
		})

	app.on('window-all-closed', () => {
		if (process.platform !== 'darwin') app.quit()
	})

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			boot().catch((err) => {
				console.error('[electron] boot failed:', err)
				app.quit()
			})
		} else if (mainWindow && !mainWindow.isVisible()) mainWindow.show()
	})
}
