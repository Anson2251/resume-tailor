import { isElectron } from '../persistence'
import { electronStore } from './electron'
import type { Store } from './types'
import { webStore } from './web'

let cached: Store | null = null

/** Process-wide store singleton: SQLite (Electron) or IndexedDB (web). */
export function getStore(): Store {
	if (!cached) cached = isElectron() ? electronStore() : webStore()
	return cached
}

/** Test seam: swap the singleton for an in-memory fake. */
export function __setStoreForTests(store: Store | null): void {
	cached = store
}
