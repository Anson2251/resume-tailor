import { PDFParse } from 'pdf-parse'
import { isElectron } from '../data/persistence'
import type { Job } from '../data/types'

export const JD_MAX_BYTES = 10 * 1024 * 1024
export const JD_MAX_PAGES = 20

type ElectronInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>

function invoke(): ElectronInvoke | null {
	const api = window.electronAPI as unknown as { invoke?: ElectronInvoke } | undefined
	return typeof api?.invoke === 'function' && isElectron() ? api.invoke : null
}

/** Extract readonly JD text from PDF bytes (local only). Caps at JD_MAX_PAGES. */
export async function extractJdText(pdf: ArrayBuffer): Promise<{ text: string; pageCount: number }> {
	const parser = new PDFParse({ data: new Uint8Array(pdf) })
	try {
		const res = await parser.getText({ first: JD_MAX_PAGES })
		return { text: res.text.trim(), pageCount: res.pages.length }
	} finally {
		await parser.destroy()
	}
}

function idb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open('resume-tailor-jds', 1)
		req.onupgradeneeded = () => req.result.createObjectStore('pdfs')
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error)
	})
}

/** Persist PDF bytes outside the workspace JSON. Returns the pdfRefId. */
export async function saveJdPdf(jobId: string, data: ArrayBuffer): Promise<string> {
	const pdfRefId = `${jobId}.pdf`
	const bridge = invoke()
	if (bridge) {
		await bridge('agent-jd:save', { jobId, data: Array.from(new Uint8Array(data)) })
		return pdfRefId
	}
	const db = await idb()
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction('pdfs', 'readwrite')
		tx.objectStore('pdfs').put(data, pdfRefId)
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
	})
	return pdfRefId
}

export async function loadJdPdf(pdfRefId: string): Promise<ArrayBuffer | null> {
	const bridge = invoke()
	if (bridge) {
		const bytes = (await bridge('agent-jd:load', pdfRefId)) as number[] | null
		return bytes ? new Uint8Array(bytes).buffer : null
	}
	const db = await idb()
	return new Promise((resolve, reject) => {
		const tx = db.transaction('pdfs', 'readonly')
		const rq = tx.objectStore('pdfs').get(pdfRefId)
		rq.onsuccess = () => resolve((rq.result as ArrayBuffer) ?? null)
		rq.onerror = () => reject(rq.error)
	})
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
): Promise<AttachResult> {
	if (file.size > JD_MAX_BYTES) return { error: 'That PDF is larger than 10MB.' }
	const buf = await file.arrayBuffer()
	try {
		const { text, pageCount } = await extractJdText(buf)
		const pdfRefId = await saveJdPdf(job.id, buf)
		job.jobDescription = text
		job.jdSource = {
			filename: file.name,
			pageCount,
			extractedAt: new Date().toISOString(),
			pdfRefId,
		}
		if (!text) return { warning: 'No selectable text in this PDF — the agent will work from the filename only.' }
		return {}
	} catch {
		return { error: 'Could not read that PDF.' }
	}
}
