import { extractText, getDocumentProxy } from 'unpdf'
import { getStore } from '../data/store'
import type { Store } from '../data/store/types'
import type { Job } from '../data/types'

export const JD_MAX_BYTES = 10 * 1024 * 1024
export const JD_MAX_PAGES = 20

/** Blob keys are pdfRefIds (`<jobId>.pdf`). */
function isPdfKey(key: string): boolean {
	return key.endsWith('.pdf')
}

/** Extract readonly JD text from PDF bytes (local only). */
export async function extractJdText(pdf: ArrayBuffer): Promise<{ text: string; pageCount: number }> {
	// pdf.js detaches (transfers) the buffer it parses — hand it a copy so
	// the caller's bytes stay usable (e.g. saveJdPdf right after this).
	const proxy = await getDocumentProxy(new Uint8Array(pdf.slice(0)))
	const { totalPages, text } = await extractText(proxy, { mergePages: true })
	return { text: text.trim(), pageCount: totalPages }
}

/** Persist PDF bytes in the store. Returns the pdfRefId. */
export async function saveJdPdf(jobId: string, data: ArrayBuffer, store: Store = getStore()): Promise<string> {
	const pdfRefId = `${jobId}.pdf`
	await store.putBlob(pdfRefId, data)
	return pdfRefId
}

export async function loadJdPdf(pdfRefId: string, store: Store = getStore()): Promise<ArrayBuffer | null> {
	if (!isPdfKey(pdfRefId)) return null
	return store.getBlob(pdfRefId)
}

export async function deleteJdPdf(pdfRefId: string, store: Store = getStore()): Promise<void> {
	if (!isPdfKey(pdfRefId)) return
	await store.deleteBlob(pdfRefId)
}

export async function listJdPdfIds(store: Store = getStore()): Promise<string[]> {
	return (await store.listBlobs()).filter(isPdfKey)
}

/**
 * Give a duplicated job its own copy of the PDF bytes so the two jobs don't
 * share one blob. Returns the new pdfRefId, or null when the source is gone
 * (caller should then clear the dangling jdSource).
 */
export async function copyJdPdf(newJobId: string, pdfRefId: string, store: Store = getStore()): Promise<string | null> {
	const bytes = await loadJdPdf(pdfRefId, store)
	if (!bytes) return null
	return saveJdPdf(newJobId, bytes, store)
}

/** Delete every stored JD PDF that no live job references. */
export async function pruneJdPdfs(aliveRefIds: Set<string>, store: Store = getStore()): Promise<void> {
	const stored = await listJdPdfIds(store)
	await Promise.all(stored.filter((id) => !aliveRefIds.has(id)).map((id) => store.deleteBlob(id)))
}

/** All pdfRefIds referenced by a job list. */
export function referencedJdPdfs(jobs: Job[]): Set<string> {
	const refs = new Set<string>()
	for (const job of jobs) {
		if (job.jdSource?.pdfRefId) refs.add(job.jdSource.pdfRefId)
	}
	return refs
}

/** Object URL for the pdfium `<iframe>` viewer. Caller must revoke it. */
export function jdBlobUrl(data: ArrayBuffer, mime = 'application/pdf'): string {
	return URL.createObjectURL(new Blob([data], { type: mime }))
}

export interface AttachResult {
	error?: string
	warning?: string
}

/** Replace a job's JD from a picked PDF file. Updates jobDescription (readonly) + jdSource. */
export async function attachJdPdf(
	job: Job,
	file: { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
	store: Store = getStore(),
): Promise<AttachResult> {
	if (file.size > JD_MAX_BYTES) return { error: 'That PDF is larger than 10MB.' }
	let buf: ArrayBuffer
	try {
		buf = await file.arrayBuffer()
	} catch (error) {
		console.error('[jd] reading the upload failed:', error)
		return { error: 'Could not read that PDF.' }
	}
	let text: string
	let pageCount: number
	try {
		;({ text, pageCount } = await extractJdText(buf))
	} catch (error) {
		console.error('[jd] text extraction failed:', error)
		return { error: 'Could not read that PDF.' }
	}
	try {
		const pdfRefId = await saveJdPdf(job.id, buf, store)
		job.jobDescription = text
		job.jdSource = {
			filename: file.name,
			pageCount,
			extractedAt: new Date().toISOString(),
			pdfRefId,
		}
	} catch (error) {
		console.error('[jd] storing the PDF failed:', error)
		return { error: 'Could not store that PDF.' }
	}
	if (!text) return { warning: 'No selectable text in this PDF — the agent will work from the filename only.' }
	return {}
}
