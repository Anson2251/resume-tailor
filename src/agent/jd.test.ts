import { describe, expect, it } from 'vitest'
import { attachJdPdf, extractJdText, jdBlobUrl } from './jd'
import { blankResume } from '../data/resume'
import { blankJob } from '../data/workspace'

describe('jd store', () => {
	it('builds an object URL for the pdfium iframe', () => {
		const url = jdBlobUrl(new ArrayBuffer(8))
		expect(url.startsWith('blob:')).toBe(true)
		URL.revokeObjectURL(url)
	})

	it('rejects oversized PDFs without touching storage', async () => {
		const job = blankJob('Test job', blankResume())
		const res = await attachJdPdf(job, {
			name: 'huge.pdf',
			size: 20 * 1024 * 1024,
			arrayBuffer: async () => {
				throw new Error('must not be read')
			},
		})
		expect(res.error).toMatch(/10MB/)
		expect(job.jdSource).toBe(null)
	})

	it('surfaces unreadable files as an error instead of throwing', async () => {
		const job = blankJob('Test job', blankResume())
		const res = await attachJdPdf(job, {
			name: 'broken.pdf',
			size: 100,
			arrayBuffer: async () => {
				throw new Error('unreadable')
			},
		})
		expect(res.error).toBe('Could not read that PDF.')
		expect(job.jdSource).toBe(null)
	})

	it('leaves the caller buffer intact for the store step', async () => {
		const { readFileSync } = await import('node:fs')
		const raw = readFileSync('bob-smith.pdf')
		const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
		const before = buf.byteLength
		const first = await extractJdText(buf)
		expect(buf.byteLength).toBe(before)
		// Parsing twice from the same bytes (extract, then store) must work.
		const second = await extractJdText(buf)
		expect(second.text).toBe(first.text)
		expect(second.pageCount).toBe(first.pageCount)
	}, 30000)
})
