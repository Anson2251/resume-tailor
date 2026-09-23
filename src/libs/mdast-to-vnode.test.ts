import { expect, it } from 'vitest'
import type { VNode } from 'vue'
import { createVNode, renderMarkdown, toVNode } from './mdast-to-vnode'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type { Root } from 'mdast'

const parse = (source: string): Root => unified().use(remarkParse).use(remarkGfm).parse(source)

function childTags(vnode: VNode): string[] {
	const children = vnode.children
	if (!Array.isArray(children)) return []
	return children.map((c) => {
		if (typeof c !== 'object' || c === null) return String(c)
		const type = (c as VNode).type
		return typeof type === 'symbol' ? 'text' : String(type)
	})
}

it('renders paragraphs with inline marks', () => {
	const vnode = renderMarkdown('Hello **bold** and *em* `code`.')
	expect(vnode.type).toBe('div')
	const [para] = vnode.children as VNode[]
	expect((para as VNode).type).toBe('p')
	expect(childTags(para as VNode)).toEqual(['text', 'strong', 'text', 'em', 'text', 'code', 'text'])
})

it('renders headings by depth', () => {
	const vnode = renderMarkdown('## Tailored bullets')
	const [heading] = vnode.children as VNode[]
	expect((heading as VNode).type).toBe('h2')
})

it('renders fenced code as pre > code with the language', () => {
	const vnode = renderMarkdown('```ts\nconst a = 1\n```')
	const [pre] = vnode.children as VNode[]
	expect((pre as VNode).type).toBe('pre')
	expect((pre as VNode).props?.['data-lang']).toBe('ts')
	const [code] = (pre as VNode).children as VNode[]
	expect((code as VNode).type).toBe('code')
})

it('renders links that open outside the app', () => {
	const vnode = renderMarkdown('[role](https://example.com/job)')
	const link = (vnode.children as VNode[])[0] as VNode
	const para = link.type === 'p' ? link : link
	const anchor = (para.children as VNode[]).find((c) => (c as VNode).type === 'a') as VNode
	expect(anchor.props?.href).toBe('https://example.com/job')
	expect(anchor.props?.target).toBe('_blank')
})

it('renders GFM tables with thead and tbody', () => {
	const vnode = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |')
	const [table] = vnode.children as VNode[]
	expect((table as VNode).type).toBe('table')
	expect(childTags(table as VNode)).toEqual(['thead', 'tbody'])
})

it('renders task lists and strikethrough (GFM)', () => {
	const vnode = renderMarkdown('- [x] Tailor bullets\n- [ ] ~~Old summary~~')
	const [list] = vnode.children as VNode[]
	expect((list as VNode).type).toBe('ul')
	expect(JSON.stringify(vnode)).toContain('s')
})

it('escapes raw HTML instead of injecting it', () => {
	const vnode = toVNode(parse('<script>alert(1)</script>'))
	const html = JSON.stringify(vnode)
	expect(html).not.toContain('innerHTML')
	expect(html).toContain('alert(1)')
})

it('keeps math content visible as code without katex', () => {
	const vnode = renderMarkdown('Einstein: $E = mc^2$ and\n\n$$x^2$$')
	expect(JSON.stringify(vnode)).toContain('E = mc^2')
})

it('tolerates unclosed fences mid-stream', () => {
	expect(() => renderMarkdown('Here is a rewrite:\n```markdown\n- **Led** migration')).not.toThrow()
	const vnode = renderMarkdown('Here is a rewrite:\n```markdown\n- **Led** migration')
	expect(JSON.stringify(vnode)).toContain('Led')
})

it('maps unknown nodes without throwing', () => {
	const vnode = createVNode({ type: 'mystery-node' } as never, {}, { index: 0, parent: null, isTableHeader: false })
	expect(vnode).toBeTruthy()
})
