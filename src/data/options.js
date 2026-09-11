export const TEMPLATES = [
	{ id: 'modern', name: 'Modern', hint: 'Accent header', font: 'sans' },
	{ id: 'classic', name: 'Classic', hint: 'Centered serif', font: 'serif' },
	{ id: 'minimal', name: 'Minimal', hint: 'Airy + hairlines', font: 'sans' }
]

/** The body can flow in 1 or 2 columns (per profile). */
export const COLUMNS = [1, 2]

export const ACCENTS = ['#4f46e5', '#0f766e', '#1e3a5f', '#b45309', '#be123c', '#334155']

/** Body font choices for the resume. `family` is the CSS font-family stack. */
export const FONTS = [
	{
		id: 'sans',
		name: 'Sans',
		hint: 'Clean and modern',
		family: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
	},
	{
		id: 'serif',
		name: 'Serif',
		hint: 'Classic and formal',
		family: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif'
	},
	{
		id: 'mono',
		name: 'Mono',
		hint: 'Technical and precise',
		family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'
	}
]

export const DEFAULT_FONT = FONTS[0].id

export const FONT_IDS = FONTS.map((font) => font.id)

/** Resolve a font id to its CSS font-family stack (falling back to the default). */
export function fontStack(fontId) {
	return (FONTS.find((font) => font.id === fontId) ?? FONTS[0]).family
}

/** The font a template uses unless the profile overrides it. */
export function templateFont(templateId) {
	return TEMPLATES.find((template) => template.id === templateId)?.font ?? DEFAULT_FONT
}
