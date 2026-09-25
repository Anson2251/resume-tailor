import { reactive } from 'vue'

export interface ConfirmOptions {
	title: string
	body: string
	confirmLabel?: string
	danger?: boolean
}

export interface PromptOptions {
	title: string
	label: string
	initial?: string
	placeholder?: string
	maxLength?: number
	confirmLabel?: string
}

export interface NotifyOptions {
	title: string
	body: string
}

type DialogState =
	| ({ kind: 'confirm' } & ConfirmOptions & { resolve: (value: boolean) => void })
	| ({ kind: 'prompt' } & PromptOptions & { resolve: (value: string | null) => void })
	| ({ kind: 'notify' } & NotifyOptions & { resolve: () => void })

interface DialogStore {
	queue: DialogState[]
}

/**
 * Promise-based app dialogs rendered by DialogHost (Flowbite modals — the
 * native prompt()/alert() family is unavailable in Electron and blocks
 * inconsistently across browsers). Requests queue FIFO; each resolves when
 * the user answers or dismisses (dismiss === cancel).
 */
const store = reactive<DialogStore>({ queue: [] })

export function dialogQueue(): DialogStore {
	return store
}

/** Currently visible dialog (head of the queue), if any. */
export function activeDialog(): DialogState | null {
	return store.queue[0] ?? null
}

function settle(state: DialogState): void {
	const i = store.queue.indexOf(state)
	if (i !== -1) store.queue.splice(i, 1)
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		store.queue.push({
			kind: 'confirm',
			title: opts.title,
			body: opts.body,
			confirmLabel: opts.confirmLabel ?? 'Confirm',
			danger: opts.danger ?? false,
			resolve: (value: boolean) => {
				resolve(value)
			},
		})
	})
}

export function promptDialog(opts: PromptOptions): Promise<string | null> {
	return new Promise<string | null>((resolve) => {
		store.queue.push({
			kind: 'prompt',
			title: opts.title,
			label: opts.label,
			initial: opts.initial ?? '',
			placeholder: opts.placeholder ?? '',
			maxLength: opts.maxLength ?? 120,
			confirmLabel: opts.confirmLabel ?? 'Save',
			resolve: (value: string | null) => {
				resolve(value)
			},
		})
	})
}

export function notifyDialog(opts: NotifyOptions): Promise<void> {
	return new Promise<void>((resolve) => {
		store.queue.push({ kind: 'notify', title: opts.title, body: opts.body, resolve })
	})
}

/** Resolve the head dialog as cancelled/dismissed (modal @close, Cancel). */
export function dismissDialog(): void {
	const current = activeDialog()
	if (!current) return
	settle(current)
	if (current.kind === 'confirm') current.resolve(false)
	else if (current.kind === 'prompt') current.resolve(null)
	else current.resolve()
}

/** Resolve the head confirm as accepted. */
export function acceptDialog(): void {
	const current = activeDialog()
	if (!current || current.kind !== 'confirm') return
	settle(current)
	current.resolve(true)
}

/** Resolve the head prompt with its draft (empty resolves as cancel). */
export function submitPrompt(draft: string): void {
	const current = activeDialog()
	if (!current || current.kind !== 'prompt') return
	settle(current)
	const value = draft.trim()
	current.resolve(value ? value : null)
}

/** Resolve the head notice as acknowledged. */
export function ackNotify(): void {
	const current = activeDialog()
	if (!current || current.kind !== 'notify') return
	settle(current)
	current.resolve()
}
