import { isElectron } from '../data/persistence'

const mem = new Map<string, string>()

type Bridge = { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }

function bridge(): Bridge | null {
	if (typeof window === 'undefined' || !isElectron()) return null
	const api = window.electronAPI as unknown as { invoke?: Bridge['invoke'] } | undefined
	return typeof api?.invoke === 'function' ? { invoke: api.invoke } : null
}

/** Web fallback is session-memory only — never persisted. */
export async function setApiKey(provider: string, key: string): Promise<void> {
	const b = bridge()
	if (b) {
		await b.invoke('agent-key:set', provider, key)
		return
	}
	mem.set(provider, key)
}

export async function getApiKey(provider: string): Promise<string | null> {
	const b = bridge()
	if (b) return (await b.invoke('agent-key:get', provider)) as string | null
	return mem.get(provider) ?? null
}

export async function deleteApiKey(provider: string): Promise<void> {
	const b = bridge()
	if (b) {
		await b.invoke('agent-key:delete', provider)
		return
	}
	mem.delete(provider)
}
