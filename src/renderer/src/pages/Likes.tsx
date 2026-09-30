import { useEffect, useState } from 'react'
import { ThumbsUp, UserCircle } from '@phosphor-icons/react'
import { useAppState } from '../lib/store'
import { useToast } from '../lib/toast'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Field, PageHeader, Panel } from '../components/ui/panel'
import { EmptyState, ErrorState } from '../components/ui/states'
import { AccountPicker } from '../components/app/AccountPicker'
import { CountBadge } from '../components/ui/badge'

/** Bilibili's practical daily ceiling per account, used to warn before a ban. */
const DAILY_LIKE_LIMIT = 5000

export function LikesPage(): React.ReactElement {
  const { accounts } = useAppState()
  const toast = useToast()

  const [roomId, setRoomId] = useState('')
  const [clickTime, setClickTime] = useState(30)
  const [selected, setSelected] = useState<number[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({})
  const [totals, setTotals] = useState<Record<string, { total: number }>>({})

  async function refreshCounts(room: string): Promise<void> {
    try {
      const [totalList, perRoom] = await Promise.all([
        window.api.getLikeCountsTotal(),
        room.trim() ? window.api.getLikeCounts(room.trim()) : Promise.resolve({})
      ])
      const map: Record<string, { total: number }> = {}
      for (const entry of totalList) map[entry.key] = { total: entry.total }
      setTotals(map)
      setRoomCounts(perRoom)
    } catch {
      // Counters are informational; a failed refresh must not disrupt the page.
    }
  }

  // Debounced so typing a room id does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void refreshCounts(roomId), 400)
    return () => clearTimeout(t)
  }, [roomId])

  async function like(): Promise<void> {
    if (!roomId.trim() || !selected.length) return
    setSending(true)
    setError(null)
    try {
      await window.api.sendLikes(roomId.trim(), clickTime, selected)
      toast.success(`已向房间 ${roomId.trim()} 提交点赞`)
      setTimeout(() => {
        void refreshCounts(roomId)
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  if (!accounts.length) {
    return (
      <>
        <PageHeader title="点赞" />
        <Panel>
          <EmptyState
            icon={<UserCircle size={18} />}
            title="需要先添加账号"
            description="点赞需要至少一个账号。到「账号管理」添加后再回来。"
          />
        </Panel>
      </>
    )
  }

  const canLike = roomId.trim() !== '' && selected.length > 0

  return (
    <>
      <PageHeader
        title="点赞"
        description="每个账号提交一次点赞请求，次数会被累加到当天的统计里。"
      />

      <Panel className="p-5">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-5">
            <Field label="房间号" className="w-56">
              <Input
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="例如：30866874"
                inputMode="numeric"
              />
            </Field>

            <Field label="点赞次数" hint="单次提交的点击次数，上限 1000。" className="w-40">
              <Input
                type="number"
                min={1}
                max={1000}
                value={clickTime}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setClickTime(Number.isFinite(n) ? Math.min(1000, Math.max(1, n)) : 1)
                }}
                className="font-mono tabular-nums"
              />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-[12.5px] font-medium text-ink-2">
              选择账号
              <span className="ml-2 font-normal text-ink-3">
                徽标显示今日累计次数
              </span>
            </p>
            <AccountPicker
              accounts={accounts}
              selected={selected}
              onChange={setSelected}
              trailing={(account) => {
                const total = totals[account.key]?.total ?? 0
                const inRoom = roomCounts[account.key]
                return (
                  <span className="flex shrink-0 gap-1">
                    {total > 0 ? (
                      <CountBadge value={total} limit={DAILY_LIKE_LIMIT} label="今日" />
                    ) : null}
                    {roomId.trim() && inRoom != null ? (
                      <CountBadge value={inRoom} limit={DAILY_LIKE_LIMIT} label="本房" />
                    ) : null}
                  </span>
                )
              }}
            />
          </div>

          {error ? <ErrorState message={error} /> : null}

          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={() => void like()} disabled={!canLike || sending}>
              <ThumbsUp size={15} weight="fill" />
              {sending ? '提交中...' : '开始点赞'}
            </Button>
            {!canLike ? (
              <span className="text-[12px] text-ink-3">
                填写房间号并选择账号后可以点赞
              </span>
            ) : null}
          </div>
        </div>
      </Panel>
    </>
  )
}
