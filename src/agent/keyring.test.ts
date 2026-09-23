import { expect, it } from 'vitest'
import { deleteApiKey, getApiKey, setApiKey } from './keyring'

it('round-trips a key in session (web fallback)', async () => {
	await setApiKey('anthropic', 'sk-test-123')
	expect(await getApiKey('anthropic')).toBe('sk-test-123')
	await deleteApiKey('anthropic')
	expect(await getApiKey('anthropic')).toBe(null)
})
