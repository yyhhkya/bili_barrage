import { useEffect, useState } from 'react'
import { Minus, Square, X, CornersOut } from '@phosphor-icons/react'
import { cn } from '../../lib/utils'
// Vite inlines this as a data URL at build time, so the renderer stays free of
// network loads and the CSP needs no exception.
import iconUrl from '../../../../../resources/icon.png'

/**
 * Frameless-window title bar.
 *
 * `-webkit-app-region: drag` makes the whole strip draggable; every interactive
 * child must opt back out with `no-drag`, otherwise the buttons cannot be
 * clicked. Double-clicking the drag region toggles maximise, which Windows
 * users expect and which the custom bar would otherwise lose.
 *
 * The close button is the only destructive affordance in the chrome, so it is
 * the only one that turns red on hover.
 */
export function TitleBar(): React.ReactElement {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.api.windowIsMaximized().then(setMaximized)
    return window.api.onWindowState((s) => setMaximized(s.maximized))
  }, [])

  return (
    <div
      className="flex h-9 shrink-0 items-center border-b border-line bg-surface select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onDoubleClick={() => void window.api.windowToggleMaximize().then(setMaximized)}
    >
      <div className="flex items-center gap-2 pl-3">
        <img src={iconUrl} alt="" width={16} height={16} className="shrink-0 rounded-[4px]" />
        {/*
          Centring this needs more than `items-center`, in two steps:

          1. `leading-none` + `block`. Left on the default line box, the CJK
             metrics in ZCOOL KuaiLe add descender space under the glyphs, and
             `items-center` then centres that padded box rather than the text.
          2. `translate-y-px`. Even with the line box collapsed, the font's
             ascent/descent split leaves the glyphs sitting 1.25px above the
             bar's centre (measured with a Range over the text node). Nudging
             the container by 1px lands it within 0.25px, which is
             sub-pixel and not perceptible.
        */}
        <span className="block translate-y-px font-medium text-[12.5px] leading-none tracking-tight text-ink-2">
          B站弹幕助手
        </span>
      </div>

      <div
        className="ml-auto flex h-full items-stretch"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <ChromeButton label="最小化" onClick={() => void window.api.windowMinimize()}>
          <Minus size={14} weight="bold" />
        </ChromeButton>

        <ChromeButton
          label={maximized ? '还原' : '最大化'}
          onClick={() => void window.api.windowToggleMaximize().then(setMaximized)}
        >
          {maximized ? (
            <CornersOut size={13} weight="bold" />
          ) : (
            <Square size={11} weight="bold" />
          )}
        </ChromeButton>

        <ChromeButton label="关闭" danger onClick={() => void window.api.windowClose()}>
          <X size={14} weight="bold" />
        </ChromeButton>
      </div>
    </div>
  )
}

function ChromeButton({
  label,
  onClick,
  danger,
  children
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'press grid w-11 place-items-center text-ink-2',
        danger
          ? 'hover:bg-danger hover:text-white'
          : 'hover:bg-subtle hover:text-ink'
      )}
    >
      {children}
    </button>
  )
}
