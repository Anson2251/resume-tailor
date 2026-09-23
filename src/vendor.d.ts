import type { DefineComponent } from 'vue'

declare module 'vue-markdown-render' {
	const VueMarkdown: DefineComponent<
		{
			source?: string
			options?: Record<string, unknown> | null
		},
		Record<string, never>,
		unknown
	>
	export default VueMarkdown
}
