// Ported from wisp-pro's libs/to-vnode (itself adapted from
// mdast-util-to-vnode): mdast -> Vue VNode with pluggable components.
// Differences: local helpers instead of `usexx`, and math nodes fall back
// to code/text rendering (no katex here) so streamed content never vanishes.

import type {
	Code,
	Heading,
	Html,
	Image,
	InlineCode,
	Link,
	List,
	ListItem,
	Node,
	Nodes,
	Parent,
	Root,
	Table,
	Text,
	Yaml,
} from 'mdast'
import type { Component, VNode } from 'vue'
import { Comment, h, Text as VText } from 'vue'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'

const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === 'function'

const isArray = (value: unknown): value is unknown[] => Array.isArray(value)

function merge(...sources: Record<string, unknown>[]): Record<string, unknown> {
	return Object.assign({}, ...sources)
}

function pick<T extends object, K extends keyof T>(source: T, keys: K[]): Pick<T, K> {
	const out = {} as Pick<T, K>
	for (const key of keys) {
		if (key in source) out[key] = source[key]
	}
	return out
}

export type ComponentReturn = Component | [Component, Record<string, unknown> | undefined]

export interface ToVNodeOptions {
	components?: Partial<Record<Nodes['type'], ComponentReturn | ((node: Node) => ComponentReturn)>>
}

export function toVNode(node: Root, options: ToVNodeOptions = {}): VNode {
	return createVNode(node, options, {
		index: 0,
		parent: null,
		isTableHeader: false,
	})
}

export interface CreateVNodeContext {
	index: number
	parent: Node | null
	isTableHeader: boolean
}

export function createVNode(node: Node, options: ToVNodeOptions = {}, context: CreateVNodeContext): VNode {
	let nodeComponent = options.components?.[node.type as Nodes['type']]
	let nodeComponentProps: Record<string, unknown> = {}

	if (isFunction(nodeComponent)) {
		nodeComponent = (nodeComponent as (node: Node) => ComponentReturn)(node)
	}
	if (isArray(nodeComponent)) {
		nodeComponentProps = (nodeComponent[1] as Record<string, unknown>) ?? {}
		nodeComponent = nodeComponent[0] as Component
	}

	// Widened so extension node types (e.g. math from remark-math) can be
	// matched below without tripping the mdast union exhaustiveness check.
	const nodeType: string = node.type as string

	switch (nodeType) {
		case 'blockquote': {
			return h(nodeComponent ?? 'blockquote', nodeComponentProps, () => createVNodes(node as Parent, options))
		}
		case 'break': {
			return h(nodeComponent ?? 'br', nodeComponentProps)
		}
		case 'code': {
			return nodeComponent
				? h(nodeComponent, merge(pick(node as Code, ['lang', 'meta', 'value']), nodeComponentProps))
				: h(
						'pre',
						{
							'data-lang': (node as Code).lang,
							'data-meta': (node as Code).meta,
						},
						h('code', (node as Code).value),
					)
		}
		case 'delete': {
			return h(nodeComponent ?? 's', nodeComponentProps, () => createVNodes(node as Parent, options))
		}
		case 'emphasis': {
			return h(nodeComponent ?? 'em', nodeComponentProps, () => createVNodes(node as Parent, options))
		}
		case 'heading': {
			return nodeComponent
				? h(nodeComponent, merge(pick(node as Heading, ['depth']), nodeComponentProps), () =>
						createVNodes(node as Parent, options),
					)
				: h(`h${(node as Heading).depth}`, () => createVNodes(node as Parent, options))
		}
		case 'html': {
			return nodeComponent
				? h(nodeComponent, merge(pick(node as Html, ['value']), nodeComponentProps))
				: h('span', {}, (node as Html).value)
		}
		case 'image': {
			return nodeComponent
				? h(nodeComponent, merge(pick(node as Image, ['url', 'alt', 'title']), nodeComponentProps))
				: h('img', {
						src: (node as Image).url,
						alt: (node as Image).alt,
						title: (node as Image).title,
					})
		}
		case 'inlineCode': {
			return nodeComponent
				? h(nodeComponent, merge(pick(node as InlineCode, ['value']), nodeComponentProps))
				: h('code', (node as InlineCode).value)
		}
		case 'inlineMath':
		case 'math': {
			// No math renderer in this app: show the source as code so the
			// content stays visible while streaming instead of vanishing.
			return nodeComponent
				? h(nodeComponent, merge(pick(node as InlineCode, ['value']), nodeComponentProps))
				: node.type === 'math'
					? h('pre', { 'data-lang': 'math' }, h('code', (node as unknown as InlineCode).value))
					: h('code', (node as unknown as InlineCode).value)
		}
		case 'link': {
			return nodeComponent
				? h(nodeComponent, merge({ target: '_blank' }, pick(node as Link, ['url', 'title']), nodeComponentProps), () =>
						createVNodes(node as Parent, options),
					)
				: h(
						'a',
						{
							href: (node as Link).url,
							target: '_blank',
							rel: 'noopener noreferrer',
						},
						() => createVNodes(node as Parent, options),
					)
		}
		case 'list': {
			return nodeComponent
				? h(nodeComponent, merge(pick(node as List, ['ordered', 'spread', 'start']), nodeComponentProps), () =>
						createVNodes(node as Parent, options),
					)
				: h((node as List).ordered ? 'ol' : 'ul', () => createVNodes(node as Parent, options))
		}
		case 'listItem': {
			return nodeComponent
				? h(nodeComponent, merge(pick(node as ListItem, ['checked', 'spread']), nodeComponentProps), () =>
						createVNodes(node as Parent, options),
					)
				: h('li', () => createVNodes(node as Parent, options))
		}
		case 'paragraph': {
			return h(nodeComponent ?? 'p', nodeComponentProps, () => createVNodes(node as Parent, options))
		}
		case 'root': {
			return h(nodeComponent ?? 'div', nodeComponentProps, createVNodes(node as Parent, options))
		}
		case 'strong': {
			return h(nodeComponent ?? 'strong', nodeComponentProps, () => createVNodes(node as Parent, options))
		}
		case 'table': {
			return h(nodeComponent ?? 'table', nodeComponentProps, () => createVNodes(node as Parent, options))
		}
		case 'tableRow': {
			return nodeComponent
				? h(
						nodeComponent,
						merge(nodeComponentProps, {
							index: context.index,
							align: (context.parent as Table).align?.[context.index] ?? 'left',
						}),
						createVNodes(node as Parent, options),
					)
				: context.index === 0
					? h(
							'thead',
							h(
								'tr',
								{
									align: (context.parent as Table).align?.[context.index] ?? 'left',
								},
								createVNodes(node as Parent, options, { isTableHeader: true }),
							),
						)
					: (() => {
							const result = h(
								'tbody',
								(context.parent as Table).children.slice(1).map((child) =>
									h(
										'tr',
										{
											align: (context.parent as Table).align?.[context.index] ?? 'left',
										},
										createVNodes(child as Parent, options),
									),
								),
							)
							;(context.parent as Table).children = [] // destroy the original tree as it has been rendered
							return result
						})()
		}
		case 'tableCell': {
			return h(
				nodeComponent ?? (context.isTableHeader ? 'th' : 'td'),
				nodeComponentProps,
				createVNodes(node as Parent, options),
			)
		}
		case 'text': {
			return h(VText, (node as Text).value)
		}
		case 'thematicBreak': {
			return h(nodeComponent ?? 'hr', nodeComponentProps)
		}
		case 'yaml': {
			return nodeComponent
				? h(nodeComponent, merge({ lang: 'yaml', value: (node as Yaml).value }, nodeComponentProps))
				: h(
						'pre',
						{
							'data-lang': 'yaml',
						},
						h('code', (node as Yaml).value),
					)
		}
		default: {
			if (nodeComponent) {
				return h(nodeComponent, nodeComponentProps)
			}
			return h(Comment, JSON.stringify(node))
		}
	}
}

export function createVNodes(
	node: Parent,
	options: ToVNodeOptions = {},
	context: Partial<CreateVNodeContext> = {},
): VNode[] {
	return (
		node.children?.map((child, i) =>
			createVNode(child, options, {
				index: i,
				parent: node,
				isTableHeader: false,
				...context,
			}),
		) ?? []
	)
}

const processor = unified().use(remarkParse).use(remarkGfm)

/**
 * Parse markdown (GFM) and render it to a VNode tree with plain HTML
 * elements. Throws nothing — callers streaming partial text should fall
 * back to raw text on error instead of blanking the bubble.
 */
export function renderMarkdown(source: string): VNode {
	return toVNode(processor.parse(source))
}
