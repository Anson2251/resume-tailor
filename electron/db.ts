import { app, ipcMain } from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'

// ---------------------------------------------------------------------------
// Unified desktop store: one SQLite file in app-data with `docs` (workspace,
// settings JSON) and `blobs` (JD PDFs) tables. Replaces the old trio of
// `resume-tailor.json` + `jd-pdfs/*.pdf` + per-concern localStorage keys.
//
// node:sqlite ships with Node 22 (Electron 38). If it ever fails to load,
// a file-based backend with the same interface takes over so the app keeps
// working — no native modules required either way.
// ---------------------------------------------------------------------------

const DB_FILENAME = 'resume-tailor.db'
const LEGACY_STORE_FILENAME = 'resume-tailor.json'
const LEGACY_JD_DIRNAME = 'jd-pdfs'

const DOC_KEYS = ['workspace', 'settings'] as const
type DocKey = (typeof DOC_KEYS)[number]

function isDocKey(key: unknown): key is DocKey {
	return key === 'workspace' || key === 'settings'
}

function isSafeKey(key: unknown): key is string {
	return typeof key === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(key)
}

interface Backend {
	getDoc(key: DocKey): Promise<string | null>
	setDoc(key: DocKey, json: string): Promise<void>
	getBlob(key: string): Promise<Buffer | null>
	putBlob(key: string, data: Buffer): Promise<void>
	deleteBlob(key: string): Promise<void>
	listBlobs(): Promise<string[]>
}

type SqliteDb = {
	exec: (sql: string) => void
	prepare: (sql: string) => {
		get: (...params: unknown[]) => Record<string, unknown> | undefined
		all: (...params: unknown[]) => Record<string, unknown>[]
		run: (...params: unknown[]) => void
	}
	close: () => void
}

function loadSqlite(): (new (path: string) => SqliteDb) | null {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const mod = require('node:sqlite') as { DatabaseSync?: new (path: string) => SqliteDb }
		return typeof mod.DatabaseSync === 'function' ? mod.DatabaseSync : null
	} catch {
		return null
	}
}

function sqliteBackend(dbPath: string, DatabaseSync: new (path: string) => SqliteDb): Backend {
	const db = new DatabaseSync(dbPath)
	db.exec('CREATE TABLE IF NOT EXISTS docs (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
	db.exec('CREATE TABLE IF NOT EXISTS blobs (key TEXT PRIMARY KEY, data BLOB NOT NULL)')
	const getDocStmt = db.prepare('SELECT value FROM docs WHERE key = ?')
	const setDocStmt = db.prepare(
		'INSERT INTO docs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
	)
	const getBlobStmt = db.prepare('SELECT data FROM blobs WHERE key = ?')
	const putBlobStmt = db.prepare(
		'INSERT INTO blobs (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data',
	)
	const deleteBlobStmt = db.prepare('DELETE FROM blobs WHERE key = ?')
	const listBlobsStmt = db.prepare('SELECT key FROM blobs')
	return {
		getDoc: async (key) => {
			const row = getDocStmt.get(key) as { value?: unknown } | undefined
			return typeof row?.value === 'string' ? row.value : null
		},
		setDoc: async (key, json) => {
			setDocStmt.run(key, json)
		},
		getBlob: async (key) => {
			const row = getBlobStmt.get(key) as { data?: unknown } | undefined
			if (!row) return null
			const data = row.data as Buffer | Uint8Array | null
			return data ? Buffer.from(data) : null
		},
		putBlob: async (key, data) => {
			putBlobStmt.run(key, data)
		},
		deleteBlob: async (key) => {
			deleteBlobStmt.run(key)
		},
		listBlobs: async () => {
			return listBlobsStmt.all().map((row) => String((row as { key: unknown }).key))
		},
	}
}

function fileBackend(userData: string): Backend {
	const docsPath = path.join(userData, 'resume-tailor.store.json')
	const blobsDir = path.join(userData, 'resume-tailor.blobs')
	async function readDocs(): Promise<Record<string, string>> {
		try {
			const parsed: unknown = JSON.parse(await fs.readFile(docsPath, 'utf-8'))
			const docs = (parsed as { docs?: unknown })?.docs
			if (!docs || typeof docs !== 'object') return {}
			const clean: Record<string, string> = {}
			for (const [k, v] of Object.entries(docs as Record<string, unknown>)) {
				if (typeof v === 'string') clean[k] = v
			}
			return clean
		} catch {
			return {}
		}
	}
	return {
		getDoc: async (key) => (await readDocs())[key] ?? null,
		setDoc: async (key, json) => {
			const docs = await readDocs()
			docs[key] = json
			await fs.mkdir(path.dirname(docsPath), { recursive: true })
			await fs.writeFile(docsPath, JSON.stringify({ version: 1, docs }), 'utf-8')
		},
		getBlob: async (key) => {
			try {
				return await fs.readFile(path.join(blobsDir, key))
			} catch {
				return null
			}
		},
		putBlob: async (key, data) => {
			await fs.mkdir(blobsDir, { recursive: true })
			await fs.writeFile(path.join(blobsDir, key), data)
		},
		deleteBlob: async (key) => {
			try {
				await fs.unlink(path.join(blobsDir, key))
			} catch {
				/* missing — no-op */
			}
		},
		listBlobs: async () => {
			try {
				return await fs.readdir(blobsDir)
			} catch {
				return []
			}
		},
	}
}

let backend: Backend | null = null

export function getBackend(): Backend {
	if (!backend) {
		const userData = app.getPath('userData')
		const DatabaseSync = loadSqlite()
		backend = DatabaseSync ? sqliteBackend(path.join(userData, DB_FILENAME), DatabaseSync) : fileBackend(userData)
	}
	return backend
}

/** Stored theme without running a migration (for pre-paint caption buttons). */
export async function peekStoredTheme(): Promise<string | null> {
	try {
		const raw = await getBackend().getDoc('settings')
		if (raw) {
			const theme = (JSON.parse(raw) as { theme?: unknown })?.theme
			if (theme === 'light' || theme === 'dark') return theme
		}
	} catch {
		/* fall through to legacy */
	}
	try {
		const raw = await fs.readFile(path.join(app.getPath('userData'), LEGACY_STORE_FILENAME), 'utf-8')
		const theme = (JSON.parse(raw) as { theme?: unknown })?.theme
		return theme === 'light' || theme === 'dark' ? theme : null
	} catch {
		return null
	}
}

export interface LegacyImport {
	workspace: unknown | null
	theme: string | null
}

/**
 * One-time production v2 import: old `resume-tailor.json` + `jd-pdfs/*.pdf`
 * become docs/blobs rows. Sources are renamed to `.bak` so re-runs are
 * no-ops and the old data stays recoverable.
 */
async function migrateLegacy(): Promise<LegacyImport> {
	const db = getBackend()
	const userData = app.getPath('userData')
	let workspace: unknown | null = null
	let theme: string | null = null
	try {
		const raw = await fs.readFile(path.join(userData, LEGACY_STORE_FILENAME), 'utf-8')
		const doc = JSON.parse(raw) as { theme?: unknown; workspace?: unknown }
		if (doc.workspace && typeof doc.workspace === 'object') {
			workspace = doc.workspace
			await db.setDoc('workspace', JSON.stringify(workspace))
		}
		if (doc.theme === 'light' || doc.theme === 'dark') theme = doc.theme
		await fs.rename(path.join(userData, LEGACY_STORE_FILENAME), path.join(userData, `${LEGACY_STORE_FILENAME}.bak`))
	} catch (err) {
		if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT'))
			console.error('[db] legacy read failed:', err)
	}
	try {
		const dir = path.join(userData, LEGACY_JD_DIRNAME)
		const files = await fs.readdir(dir)
		for (const file of files) {
			if (!isSafeKey(file) || !file.endsWith('.pdf')) continue
			try {
				await db.putBlob(file, await fs.readFile(path.join(dir, file)))
			} catch (err) {
				console.error('[db] legacy pdf import failed:', err)
			}
		}
		if (files.length) await fs.rename(dir, path.join(userData, `${LEGACY_JD_DIRNAME}.bak`))
	} catch (err) {
		if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT'))
			console.error('[db] legacy pdfs failed:', err)
	}
	return { workspace, theme }
}

export function registerDbIpc(): void {
	ipcMain.handle('resume-tailor:db-doc-get', async (_event, key: unknown) => {
		if (!isDocKey(key)) return null
		const raw = await getBackend().getDoc(key)
		if (!raw) return null
		try {
			return JSON.parse(raw) as unknown
		} catch {
			return null
		}
	})
	ipcMain.handle('resume-tailor:db-doc-set', async (_event, key: unknown, value: unknown) => {
		if (!isDocKey(key)) return false
		await getBackend().setDoc(key, JSON.stringify(value ?? null))
		return true
	})
	ipcMain.handle('resume-tailor:db-blob-put', async (_event, key: unknown, data: unknown) => {
		if (!isSafeKey(key) || !Array.isArray(data)) return false
		await getBackend().putBlob(key, Buffer.from(data as number[]))
		return true
	})
	ipcMain.handle('resume-tailor:db-blob-get', async (_event, key: unknown) => {
		if (!isSafeKey(key)) return null
		const buf = await getBackend().getBlob(key)
		return buf ? Array.from(buf) : null
	})
	ipcMain.handle('resume-tailor:db-blob-delete', async (_event, key: unknown) => {
		if (!isSafeKey(key)) return false
		await getBackend().deleteBlob(key)
		return true
	})
	ipcMain.handle('resume-tailor:db-blob-list', async () => getBackend().listBlobs())
	ipcMain.handle('resume-tailor:db-migrate-legacy', () => migrateLegacy())
}
