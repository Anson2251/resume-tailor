import { createModels } from '@earendil-works/pi-ai'
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic'
import { googleProvider } from '@earendil-works/pi-ai/providers/google'
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai'
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter'
import type { StreamFn } from '@earendil-works/pi-agent-core'

export interface ModelChoice {
	provider: string
	id: string
	label: string
}

export const MODEL_CHOICES: ModelChoice[] = [
	{ provider: 'anthropic', id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
	{ provider: 'anthropic', id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
	{ provider: 'openai', id: 'gpt-4o', label: 'GPT-4o' },
]

export const DEFAULT_MODEL: ModelChoice = MODEL_CHOICES[0]

export const models = createModels()
models.setProvider(anthropicProvider())
models.setProvider(openaiProvider())
models.setProvider(googleProvider())
models.setProvider(openrouterProvider())

/** Bound stream function for `new Agent({ streamFn })`. */
export const streamFn: StreamFn = (model, ctx, opts) => models.streamSimple(model, ctx, opts)
