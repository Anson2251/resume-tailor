import { describe, expect, it } from 'vitest'
import { buildExportZip, parseImportBytes } from './transfer'

function bytes(text: string): Uint8Array {
	return new TextEncoder().encode(text)
}

describe('zip transfer', () => {
	it('round-trips workspace, settings and PDF bytes', async () => {
		const buf = new ArrayBuffer(8)
		const pdf = new Uint8Array(buf)
		pdf.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
		const zip = await buildExportZip({
			workspace: { version: 3, hello: 'world' },
			settings: { version: 1, theme: 'dark' },
			blobs: [{ name: 'job-1.pdf', data: buf }],
		})
		const parsed = await parseImportBytes(zip)
		expect(parsed.kind).toBe('zip')
		if (parsed.kind !== 'zip') return
		expect(parsed.bundle.workspaceRaw).toEqual({ version: 3, hello: 'world' })
		expect(parsed.bundle.settingsRaw).toEqual({ version: 1, theme: 'dark' })
		expect(Array.from(parsed.bundle.blobs['job-1.pdf'])).toEqual(Array.from(pdf))
	})

	it('accepts legacy bare-JSON exports', async () => {
		const parsed = await parseImportBytes(bytes(JSON.stringify({ master: {}, jobs: [] })))
		expect(parsed.kind).toBe('legacy-json')
		if (parsed.kind !== 'legacy-json') return
		expect(parsed.workspaceRaw).toEqual({ master: {}, jobs: [] })
	})

	it('rejects garbage and zips without a workspace entry', async () => {
		expect(await parseImportBytes(bytes('definitely not json or zip'))).toEqual({ kind: 'unrecognized' })
		const { zip, strToU8 } = await import('fflate')
		const noWorkspace = await new Promise<Uint8Array>((resolve, reject) => {
			zip({ 'other.txt': strToU8('hi') }, (err, out) => (err ? reject(err) : resolve(out)))
		})
		expect((await parseImportBytes(noWorkspace)).kind).toBe('unrecognized')
	})
})
