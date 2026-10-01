import type { ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renders GitHub release notes as GitHub-Flavored Markdown.
 *
 * `react-markdown` emits React elements rather than HTML, so there is no
 * `dangerouslySetInnerHTML` and no injection surface, and the strict CSP
 * (`script-src 'self'`) stays intact — the same safety the previous
 * hand-rolled renderer had, but with full GFM (tables, task lists, strike-
 * through, nested lists, autolinks) so the dialog matches github.com.
 *
 * Links and images are routed to the system browser; the CSP blocks remote
 * `img-src`, so an image is shown as a link to its source rather than a broken
 * `<img>`.
 */
function Link({ href, children }: { href?: string; children: ReactNode }): React.ReactElement {
  const target = href ?? ''
  return (
    <a
      href={target}
      onClick={(e) => {
        e.preventDefault()
        if (target) void window.api.openExternal(target)
      }}
      className="text-accent-ink underline underline-offset-2 hover:text-ink"
    >
      {children}
    </a>
  )
}

const COMPONENTS: Components = {
  a: ({ href, children }) => <Link href={href}>{children}</Link>,
  img: ({ src, alt }) => <Link href={typeof src === 'string' ? src : ''}>{alt || '图片'}</Link>,
  h1: ({ children }) => <p className="text-[13px] font-medium text-ink">{children}</p>,
  h2: ({ children }) => <p className="text-[13px] font-medium text-ink">{children}</p>,
  h3: ({ children }) => <p className="text-[12.5px] font-medium text-ink-2">{children}</p>,
  h4: ({ children }) => <p className="text-[12.5px] font-medium text-ink-2">{children}</p>,
  h5: ({ children }) => <p className="text-[12.5px] font-medium text-ink-2">{children}</p>,
  h6: ({ children }) => <p className="text-[12.5px] font-medium text-ink-2">{children}</p>,
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-medium text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="line-through">{children}</del>,
  ul: ({ children }) => (
    <ul className="flex list-disc flex-col gap-1 pl-4 marker:text-line-strong">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="flex list-decimal flex-col gap-1 pl-4 marker:text-line-strong">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  input: ({ type, checked }) =>
    type === 'checkbox' ? (
      <input
        type="checkbox"
        checked={checked}
        readOnly
        className="mr-1.5 translate-y-px accent-accent"
      />
    ) : null,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-line-strong pl-2.5 text-ink-2">{children}</blockquote>
  ),
  hr: () => <hr className="border-line" />,
  code: ({ children }) => (
    <code className="rounded-compact bg-subtle px-1 py-0.5 font-mono text-[11.5px] text-ink">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-control border border-line bg-subtle p-2.5 font-mono text-[11.5px] leading-relaxed text-ink [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[12px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-line bg-subtle px-2 py-1 font-medium text-ink">{children}</th>
  ),
  td: ({ children }) => <td className="border border-line px-2 py-1 align-top">{children}</td>
}

export function ReleaseNotes({ markdown }: { markdown: string }): React.ReactElement | null {
  const text = markdown.trim()
  if (!text) return null

  return (
    <div className="flex flex-col gap-2.5">
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </Markdown>
    </div>
  )
}
