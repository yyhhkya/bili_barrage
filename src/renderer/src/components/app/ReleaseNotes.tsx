import type { ReactNode } from 'react'

/**
 * Minimal Markdown renderer for GitHub release notes.
 *
 * Why hand-rolled rather than `marked` + a sanitiser:
 * - Release notes come from a remote source. Rendering them as HTML means an
 *   injection surface and a sanitiser dependency to close it. Emitting React
 *   elements instead makes that impossible by construction, and the strict CSP
 *   (`script-src 'self'`) stays intact.
 * - GitHub's auto-generated notes only use a handful of constructs: `##`
 *   headings, `*` bullets, `**bold**`, links, and inline code. Supporting the
 *   full CommonMark spec would be code nobody asked for.
 *
 * Anything unrecognised is rendered as plain text, which is the safe default.
 */

type Inline =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'link'; value: string; href: string }

/** Splits a line into inline tokens. Code spans win, so `**` inside them is literal. */
function parseInline(input: string): Inline[] {
  const out: Inline[] = []
  // Order matters: code, then links, then emphasis, then bare URLs.
  const pattern =
    /(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(https?:\/\/[^\s<>()]+)/g

  let last = 0
  let m: RegExpExecArray | null
  while ((m = pattern.exec(input)) !== null) {
    if (m.index > last) out.push({ kind: 'text', value: input.slice(last, m.index) })
    const tok = m[0]
    if (tok.startsWith('`')) {
      out.push({ kind: 'code', value: tok.slice(1, -1) })
    } else if (tok.startsWith('[')) {
      const split = tok.indexOf('](')
      out.push({ kind: 'link', value: tok.slice(1, split), href: tok.slice(split + 1, -1) })
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      out.push({ kind: 'bold', value: tok.slice(2, -2) })
    } else if (tok.startsWith('*')) {
      out.push({ kind: 'italic', value: tok.slice(1, -1) })
    } else {
      out.push({ kind: 'link', value: tok, href: tok })
    }
    last = m.index + tok.length
  }
  if (last < input.length) out.push({ kind: 'text', value: input.slice(last) })
  return out
}

function Link({ href, children }: { href: string; children: ReactNode }): React.ReactElement {
  // A plain <a href> would ask the webview to navigate. Sending it to the
  // system browser is both what the user expects and what the main process's
  // navigation guard would end up doing anyway.
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        void window.api.openExternal(href)
      }}
      className="text-accent-ink underline underline-offset-2 hover:text-ink"
    >
      {children}
    </a>
  )
}

function renderInline(tokens: Inline[], keyPrefix: string): ReactNode[] {
  return tokens.map((tk, i) => {
    const key = `${keyPrefix}-${i}`
    switch (tk.kind) {
      case 'code':
        return (
          <code
            key={key}
            className="rounded-compact bg-subtle px-1 py-0.5 font-mono text-[11.5px] text-ink"
          >
            {tk.value}
          </code>
        )
      case 'bold':
        return (
          <strong key={key} className="font-medium text-ink">
            {tk.value}
          </strong>
        )
      case 'italic':
        return (
          <em key={key} className="italic">
            {tk.value}
          </em>
        )
      case 'link':
        return (
          <Link key={key} href={tk.href}>
            {tk.value}
          </Link>
        )
      default:
        return <span key={key}>{tk.value}</span>
    }
  })
}

export function ReleaseNotes({ markdown }: { markdown: string }): React.ReactElement | null {
  const text = markdown.trim()
  if (!text) return null

  const lines = text.split(/\r?\n/)
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (/^\s*```/.test(line)) {
      const buf: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++])
      i++ // closing fence
      blocks.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-control border border-line bg-subtle p-2.5 font-mono text-[11.5px] leading-relaxed text-ink"
        >
          {buf.join('\n')}
        </pre>
      )
      continue
    }

    // Blank line
    if (!line.trim()) {
      i++
      continue
    }

    // Horizontal rule
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      blocks.push(<hr key={key++} className="border-line" />)
      i++
      continue
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      blocks.push(
        <p
          key={key++}
          className={
            level <= 2
              ? 'text-[13px] font-medium text-ink'
              : 'text-[12.5px] font-medium text-ink-2'
          }
        >
          {renderInline(parseInline(heading[2]), `h${key}`)}
        </p>
      )
      i++
      continue
    }

    // List (consecutive items form one block)
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const content = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '')
        // GitHub prefixes auto-generated entries with "- "; a nested marker
        // can appear after a task-list checkbox.
        items.push(
          <li key={items.length} className="pl-0.5">
            {renderInline(parseInline(content.replace(/^\[[ x]\]\s*/, '')), `li${key}-${items.length}`)}
          </li>
        )
        i++
      }
      blocks.push(
        <ul key={key++} className="flex list-disc flex-col gap-1 pl-4 marker:text-line-strong">
          {items}
        </ul>
      )
      continue
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote
          key={key++}
          className="border-l-2 border-line-strong pl-2.5 text-ink-2"
        >
          {renderInline(parseInline(buf.join(' ')), `bq${key}`)}
        </blockquote>
      )
      continue
    }

    // Paragraph: consume until a blank line or a line that starts another block
    const para: string[] = [line]
    i++
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
    ) {
      para.push(lines[i++])
    }
    blocks.push(
      <p key={key++} className="leading-relaxed">
        {renderInline(parseInline(para.join(' ')), `p${key}`)}
      </p>
    )
  }

  return <div className="flex flex-col gap-2.5">{blocks}</div>
}
