import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { blankThread, normalizeThread } from './threads'
import { __setStoreForTests } from '../data/store'
import type { Store } from '../data/store/types'
import { copyJdPdf, listJdPdfIds, pruneJdPdfs, referencedJdPdfs, saveJdPdf } from './jd'
import { blankResume } from '../data/resume'
import { blankJob } from '../data/workspace'

function bytes(...values: number[]): ArrayBuffer {
	const buf = new ArrayBuffer(values.length)
	new Uint8Array(buf).set(values)
	return buf
}

function memoryStore(): Store {
	const docs = new Map<string, unknown>()
	const blobs = new Map<string, ArrayBuffer>()
	return {
		getDoc: async (key) => docs.get(key) ?? null,
		setDoc: async (key, value) => void docs.set(key, value),
		getBlob: async (key) => blobs.get(key) ?? null,
		putBlob: async (key, data) => void blobs.set(key, data),
		deleteBlob: async (key) => void blobs.delete(key),
		listBlobs: async () => [...blobs.keys()],
	}
}

describe('normalizeThread', () => {
	it('returns blank for garbage', () => {
		expect(normalizeThread(null)).toEqual(blankThread())
		expect(normalizeThread({ messages: { x: { role: 'tool', text: 't' } } })).toEqual(blankThread())
	})

	it('keeps valid paths and drops corrupt nodes and dangling edges', () => {
		const thread = normalizeThread({
			entryId: 'u1',
			edges: { u1: null, a1: 'u1', orphan: 'missing', u1bad: 'zzz' },
			messages: {
				u1: { id: 'u1', role: 'user', text: 'hi', timestamp: 1 },
				a1: { id: 'a1', role: 'assistant', text: 'hello', timestamp: 2 },
				orphan: { id: 'orphan', role: 'user', text: 'dropped parent', timestamp: 3 },
				bad: { id: 'bad', role: 'tool', text: 'x', timestamp: 4 },
			},
			decisions: 'nope',
		})
		expect(Object.keys(thread.messages).sort()).toEqual(['a1', 'orphan', 'u1'])
		expect(thread.edges['a1']).toBe('u1')
		expect(thread.entryId).toBe('u1')
		expect(thread.decisions).toBe(null)
	})

	it('repairs a dangling entry point', () => {
		const thread = normalizeThread({
			entryId: 'gone',
			edges: { u1: null },
			messages: { u1: { id: 'u1', role: 'user', text: 'hi', timestamp: 1 } },
			decisions: [0],
		})
		expect(thread.entryId).toBe('u1')
		expect(thread.decisions).toEqual([0])
	})
})

describe('jd blob lifecycle', () => {
	let store: Store
	beforeEach(() => {
		store = memoryStore()
		__setStoreForTests(store)
	})
	afterEach(() => {
		__setStoreForTests(null)
	})

	it('copies bytes to the duplicated job id and prunes orphans', async () => {
		const master = blankResume()
		const job = blankJob('J1', master)
		const refId = await saveJdPdf(job.id, bytes(1, 2, 3), store)
		const copyRef = await copyJdPdf('new-id', refId, store)
		expect(copyRef).toBe('new-id.pdf')
		expect(await listJdPdfIds(store)).toEqual(expect.arrayContaining([refId, 'new-id.pdf']))

		await pruneJdPdfs(new Set(['new-id.pdf']), store)
		expect(await listJdPdfIds(store)).toEqual(['new-id.pdf'])
	})

	it('copy returns null for missing bytes and lists only pdf keys', async () => {
		expect(await copyJdPdf('n', 'missing.pdf', store)).toBe(null)
		await store.putBlob('notes.txt', bytes(0))
		expect(await listJdPdfIds(store)).toEqual([])
	})

	it('collects referenced refIds from jobs', () => {
		const master = blankResume()
		const job = blankJob('J1', master)
		job.jdSource = { filename: 'a.pdf', pageCount: 1, extractedAt: '', pdfRefId: 'x.pdf' }
		expect(referencedJdPdfs([job])).toEqual(new Set(['x.pdf']))
	})
})
