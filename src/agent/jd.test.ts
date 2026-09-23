import { describe, expect, it } from 'vitest'
import { jdBlobUrl } from './jd'

describe('jd store', () => {
	it('builds an object URL for the pdfium iframe', () => {
		const url = jdBlobUrl(new ArrayBuffer(8))
		expect(url.startsWith('blob:')).toBe(true)
		URL.revokeObjectURL(url)
	})
})
