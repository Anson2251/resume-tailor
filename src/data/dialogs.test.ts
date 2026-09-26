import { describe, expect, it } from 'vitest'
import {
	acceptDialog,
	ackNotify,
	activeDialog,
	confirmDialog,
	dialogQueue,
	dismissDialog,
	notifyDialog,
	promptDialog,
	submitPrompt,
} from './dialogs'

describe('dialog queue', () => {
	it('resolves confirms on accept or dismiss', async () => {
		const pending = confirmDialog({ title: 'Delete?', body: 'Gone.' })
		expect(activeDialog()?.kind).toBe('confirm')
		acceptDialog()
		await expect(pending).resolves.toBe(true)
		expect(activeDialog()).toBe(null)

		const cancelled = confirmDialog({ title: 'Delete?', body: 'Gone.' })
		dismissDialog()
		await expect(cancelled).resolves.toBe(false)
	})

	it('resolves prompts with the trimmed draft, empty as cancel', async () => {
		const pending = promptDialog({ title: 'Rename', label: '', initial: 'Old' })
		submitPrompt('  New  ')
		await expect(pending).resolves.toBe('New')

		const empty = promptDialog({ title: 'Rename', label: '' })
		submitPrompt('   ')
		await expect(empty).resolves.toBe(null)
	})

	it('queues FIFO and acknowledges notices', async () => {		const first = confirmDialog({ title: 'First', body: '1' })
		const second = notifyDialog({ title: 'Second', body: '2' })
		expect(dialogQueue().queue).toHaveLength(2)
		expect(activeDialog()?.title).toBe('First')
		acceptDialog()
		await expect(first).resolves.toBe(true)
		expect(activeDialog()?.title).toBe('Second')
		ackNotify()
		await expect(second).resolves.toBeUndefined()
		expect(activeDialog()).toBe(null)
	})

	it('passes the markdown flag through (defaults to false)', () => {
		void notifyDialog({ title: 'N', body: '**hi**', markdown: true })
		expect(activeDialog()).toMatchObject({ kind: 'notify', markdown: true })
		ackNotify()
		void confirmDialog({ title: 'C', body: 'plain' })
		expect(activeDialog()).toMatchObject({ kind: 'confirm', markdown: false })
		dismissDialog()
	})
})
