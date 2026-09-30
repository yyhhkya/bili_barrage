import { useMemo, useState } from 'react'
import { Smiley, PaperPlaneTilt, UserCircle } from '@phosphor-icons/react'
import type { Emoticon, EmoticonGroup } from '@shared/types'
import { useAppState } from '../lib/store'
import { useToast } from '../lib/toast'
import { Button } from '../components/ui/button'
import { CheckboxRow } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import { Field, PageHeader, Panel } from '../components/ui/panel'
import { EmptyState } from '../components/ui/states'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover'
import { AccountPicker } from '../components/app/AccountPicker'

export function SendPage(): React.ReactElement {
  const { accounts } = useAppState()
  const toast = useToast()

  const [roomId, setRoomId] = useState('')
  const [content, setContent] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [concurrent, setConcurrent] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [emojiOpen, setEmojiOpen] = useState(false)
  const [emojiAccount, setEmojiAccount] = useState(0)
  const [groups, setGroups] = useState<EmoticonGroup[]>([])
  const [activeGroup, setActiveGroup] = useState(0)
  const [groupItems, setGroupItems] = useState<Emoticon[]>([])
  const [loadingEmoji, setLoadingEmoji] = useState(false)

  const canSend = roomId.trim() !== '' && content.trim() !== '' && selected.length > 0

  const selectedLabel = useMemo(() => {
    if (!selected.length) return '未选择账号'
    if (selected.length === accounts.length) return `全部 ${accounts.length} 个账号`
    return `已选 ${selected.length} 个账号`
  }, [selected, accounts.length])

  async function openEmojiPanel(): Promise<void> {
    if (!accounts.length) return
    setEmojiOpen(true)
    await loadGroups(emojiAccount)
  }

  async function loadGroups(index: number): Promise<void> {
    if (!roomId.trim()) {
      toast.info('请先填写房间号，表情包按房间获取')
      setEmojiOpen(false)
      return
    }
    setLoadingEmoji(true)
    setGroups([])
    setGroupItems([])
    setActiveGroup(0)
    try {
      const result = await window.api.getEmoticons(index, roomId.trim())
      setGroups(result)
      if (result.length) await loadGroup(0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingEmoji(false)
    }
  }

  async function loadGroup(index: number): Promise<void> {
    setActiveGroup(index)
    setGroupItems([])
    try {
      setGroupItems(await window.api.loadEmojiGroup(index))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  function insertEmoji(emoticon: Emoticon): void {
    setContent((c) => c + emoticon.emoji)
    setEmojiOpen(false)
  }

  async function send(): Promise<void> {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      await window.api.sendDanmaku(roomId.trim(), content, selected, 0, concurrent)
      toast.success(`已向房间 ${roomId.trim()} 发送弹幕`)
      setContent('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  if (!accounts.length) {
    return (
      <>
        <PageHeader title="发送弹幕" />
        <Panel>
          <EmptyState
            icon={<UserCircle size={18} />}
            title="需要先添加账号"
            description="发送弹幕至少需要一个账号。到「账号管理」添加后再回来。"
          />
        </Panel>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="发送弹幕"
        description="同一个房间号可以同时用多个账号发送，内容相同。"
      />

      <Panel className="p-5">
        <div className="flex flex-col gap-5">
          <Field label="房间号" hint="直播间地址 live.bilibili.com 后面那串数字。" className="max-w-xs">
            <Input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="例如：21452505"
              inputMode="numeric"
            />
          </Field>

          <Field label="弹幕内容">
            <div className="flex items-start gap-2">
              <Input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSend) void send()
                }}
                placeholder="输入要发送的弹幕"
              />
              <Popover
                open={emojiOpen}
                onOpenChange={(o) => (o ? void openEmojiPanel() : setEmojiOpen(false))}
              >
                <PopoverTrigger asChild>
                  <Button className="size-8 shrink-0 p-0" aria-label="选择表情">
                    <Smiley size={16} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent open={emojiOpen} className="w-[420px]">
                  {loadingEmoji ? (
                    <p className="py-8 text-center text-[12.5px] text-ink-3">
                      正在加载表情...
                    </p>
                  ) : groups.length === 0 ? (
                    <p className="py-8 text-center text-[12.5px] text-ink-3">
                      没有取到表情包，检查房间号或账号权限。
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[12px] font-medium text-ink-2">
                          选择表情
                        </span>
                        <select
                          value={emojiAccount}
                          onChange={(e) => {
                            const idx = Number(e.target.value)
                            setEmojiAccount(idx)
                            void loadGroups(idx)
                          }}
                          className="h-6 rounded-compact border border-line bg-surface px-1.5 text-[12px] text-ink-2 focus:border-accent focus:outline-none"
                        >
                          {accounts.map((a, i) => (
                            <option key={a.key} value={i}>
                              {a.nickname || `账号 ${i + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {groups.map((group, i) => (
                          <button
                            key={`${group.name}-${i}`}
                            type="button"
                            onClick={() => void loadGroup(i)}
                            aria-label={group.name || `分组 ${i + 1}`}
                            className={
                              'press grid size-8 place-items-center rounded-compact border ' +
                              (i === activeGroup
                                ? 'border-accent bg-accent-wash'
                                : 'border-transparent hover:bg-subtle')
                            }
                          >
                            {group.cover ? (
                              <img
                                src={group.cover}
                                alt=""
                                className="size-[22px] object-contain"
                                width={22}
                                height={22}
                              />
                            ) : (
                              <span className="px-1 text-[10px] leading-tight text-ink-2">
                                {group.name.slice(0, 2)}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>

                      <div className="grid max-h-[320px] grid-cols-6 gap-1 overflow-y-auto">
                        {groupItems.map((item) => (
                          <button
                            key={item.emoji}
                            type="button"
                            onClick={() => insertEmoji(item)}
                            title={item.descript || item.emoji}
                            className="press flex flex-col items-center gap-0.5 rounded-compact p-1.5 hover:bg-subtle"
                          >
                            <img
                              src={item.url}
                              alt={item.descript || item.emoji}
                              className="size-11 object-contain"
                              width={44}
                              height={44}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </Field>

          <div>
            <p className="mb-2 text-[12.5px] font-medium text-ink-2">
              选择账号
              <span className="ml-2 font-normal text-ink-3">{selectedLabel}</span>
            </p>
            <AccountPicker accounts={accounts} selected={selected} onChange={setSelected} />

            <div className="mt-3 max-w-sm">
              <CheckboxRow
                label="并发发送"
                checked={concurrent}
                onCheckedChange={(v) => setConcurrent(v === true)}
              />
              <p className="mt-1 pl-7 text-[12px] text-ink-3">
                关闭后账号之间间隔 0.5 秒依次发送。并发更快，但更容易触发风控。
              </p>
            </div>
          </div>

          {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}

          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={() => void send()} disabled={!canSend || sending}>
              <PaperPlaneTilt size={15} weight="fill" />
              {sending ? '发送中...' : '发送弹幕'}
            </Button>
            {!canSend ? (
              <span className="text-[12px] text-ink-3">
                填写房间号、弹幕内容并选择账号后可以发送
              </span>
            ) : null}
          </div>
        </div>
      </Panel>
    </>
  )
}
