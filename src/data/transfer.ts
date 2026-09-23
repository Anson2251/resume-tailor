import { strFromU8, strToU8, unzip, zip } from 'fflate'

export const WORKSPACE_ENTRY = 'workspace.json'
export const SETTINGS_ENTRY = 'settings.json'
export const BLOB_PREFIX = 'jd/'

export interface TransferBlobs {
	[name: string]: Uint8Array
}

export interface TransferBundle {
	workspaceRaw: unknown
	settingsRaw: unknown | null
	blobs: TransferBlobs
}

function zipAsync(data: Record<string, Uint8Array>): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		zip(data, (err, out) => (err ? reject(err) : resolve(out)))
	})
}

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
	return new Promise((resolve, reject) => {
		unzip(data, (err, out) => (err ? reject(err) : resolve(out as Record<string, Uint8Array>)))
	})
}

/** Build a self-contained export: workspace + settings docs plus raw JD PDFs. */
export async function buildExportZip(bundle: {
	workspace: unknown
	settings: unknown
	blobs: { name: string; data: ArrayBuffer }[]
}): Promise<Uint8Array> {
	const entries: Record<string, Uint8Array> = {
		[WORKSPACE_ENTRY]: strToU8(JSON.stringify(bundle.workspace)),
		[SETTINGS_ENTRY]: strToU8(JSON.stringify(bundle.settings)),
	}
	for (const blob of bundle.blobs) {
		entries[`${BLOB_PREFIX}${blob.name}`] = new Uint8Array(blob.data)
	}
	return zipAsync(entries)
}

export type ParseResult =
	{ kind: 'zip'; bundle: TransferBundle } | { kind: 'legacy-json'; workspaceRaw: unknown } | { kind: 'unrecognized' }

function isZipMagic(data: Uint8Array): boolean {
	return data.length > 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04
}

/**
 * Parse an import file: a `.zip` export (magic-byte detected, not by
 * extension) or a legacy bare-JSON workspace export.
 */
export async function parseImportBytes(data: Uint8Array): Promise<ParseResult> {
	if (isZipMagic(data)) {
		let files: Record<string, Uint8Array>
		try {
			files = await unzipAsync(data)
		} catch {
			return { kind: 'unrecognized' }
		}
		const rawWorkspace = files[WORKSPACE_ENTRY]
		if (!rawWorkspace) return { kind: 'unrecognized' }
		let workspaceRaw: unknown
		try {
			workspaceRaw = JSON.parse(strFromU8(rawWorkspace))
		} catch {
			return { kind: 'unrecognized' }
		}
		let settingsRaw: unknown | null = null
		if (files[SETTINGS_ENTRY]) {
			try {
				settingsRaw = JSON.parse(strFromU8(files[SETTINGS_ENTRY]))
			} catch {
				settingsRaw = null
			}
		}
		const blobs: TransferBlobs = {}
		for (const [name, bytes] of Object.entries(files)) {
			if (name.startsWith(BLOB_PREFIX) && name.length > BLOB_PREFIX.length) {
				blobs[name.slice(BLOB_PREFIX.length)] = bytes
			}
		}
		return { kind: 'zip', bundle: { workspaceRaw, settingsRaw, blobs } }
	}
	try {
		const text = new TextDecoder().decode(data)
		return { kind: 'legacy-json', workspaceRaw: JSON.parse(text) }
	} catch {
		return { kind: 'unrecognized' }
	}
}
