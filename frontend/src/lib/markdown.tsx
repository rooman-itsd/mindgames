import { Fragment, type ReactNode } from 'react'

// A deliberately small, dependency-free Markdown renderer for Article posts.
// It supports the common subset — headings, bold/italic, inline code, links,
// and bullet lists — and returns React nodes (never raw HTML), so there is no
// XSS surface. Anything it doesn't recognise renders as plain text.

// Inline: **bold**, *italic*, `code`, [label](http…). Escapes nothing because
// we emit React nodes, not HTML strings.
function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const key = `${keyBase}-${i++}`
    if (m[2] != null) nodes.push(<strong key={key}>{m[2]}</strong>)
    else if (m[3] != null) nodes.push(<em key={key}>{m[3]}</em>)
    else if (m[4] != null) nodes.push(<code key={key} className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em]">{m[4]}</code>)
    else if (m[5] != null && m[6] != null)
      nodes.push(
        <a key={key} href={m[6]} target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">
          {m[5]}
        </a>,
      )
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let list: string[] = []
  let key = 0

  const flushList = () => {
    if (!list.length) return
    const items = list
    blocks.push(
      <ul key={`ul-${key++}`} className="my-2 list-disc space-y-1 pl-5">
        {items.map((li, i) => <li key={i}>{inline(li, `li-${key}-${i}`)}</li>)}
      </ul>,
    )
    list = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^#{1,3}\s+/.test(line)) {
      flushList()
      const level = line.match(/^#+/)![0].length
      const content = line.replace(/^#{1,3}\s+/, '')
      const cls = level === 1 ? 'mt-3 text-lg font-bold' : level === 2 ? 'mt-3 text-base font-bold' : 'mt-2 text-sm font-semibold'
      blocks.push(<p key={`h-${key++}`} className={`${cls} text-ink`}>{inline(content, `h-${key}`)}</p>)
    } else if (/^[-*]\s+/.test(line)) {
      list.push(line.replace(/^[-*]\s+/, ''))
    } else if (line.trim() === '') {
      flushList()
    } else {
      flushList()
      blocks.push(<p key={`p-${key++}`} className="my-1.5">{inline(line, `p-${key}`)}</p>)
    }
  }
  flushList()

  return <div className={`text-[15px] leading-relaxed text-ink ${className}`}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>
}
