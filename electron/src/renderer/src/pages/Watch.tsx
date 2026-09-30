import { useMemo, useState } from 'react'
import { Broadcast, UserCircle, Play, Stop } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useReducedMotion } from '../lib/use-reduced-motion'
import { useAppState, useWatch } from '../lib/store'
import { useToast } from '../lib/toast'
import { springSoft } from '../lib/motion'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Field, PageHeader, Panel, PanelHeader } from '../components/ui/panel'
import { EmptyState } from '../components/ui/states'
import { AccountPicker } from '../components/app/AccountPicker'
import { Badge } from '../components/ui/badge'
import { AnimatedNumber } from '../components/ui/animated-number'

type GroupBy = 'account' | 'room'

export function WatchPage(): React.ReactElement {
  const { accounts } = useAppState()
  const watch = useWatch()
  const toast = useToast()
  const reduce = useReducedMotion() ?? false

  const [roomId, setRoomId] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState<'start' | 'stop' | null>(null)
  const [groupBy, setGroupBy] = useState<GroupBy>('account')

  const canAct = roomId.trim() !== '' && selected.length > 0

  // Two groupings over the same set, which is how the original presented it.
  const byAccount = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const entry of watch) {
      const list = map.get(entry.account) ?? []
      list.push(entry.room_id)
      map.set(entry.account, list)
    }
    return [...map.entries()]
  }, [watch])

  const byRoom = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const entry of watch) {
      const list = map.get(entry.room_id) ?? []
      list.push(entry.account)
      map.set(entry.room_id, list)
    }
    return [...map.entries()]
  }, [watch])

  async function start(): Promise<void> {
    if (!canAct) return
    setBusy('start')
    try {
      await window.api.startWatch(roomId.trim(), selected)
      toast.success(`已开始挂榜房间 ${roomId.trim()}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function stop(): Promise<void> {
    if (!canAct) return
    setBusy('stop')
    try {
      await window.api.stopWatch(roomId.trim(), selected)
      toast.success(`已停止挂榜房间 ${roomId.trim()}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  if (!accounts.length) {
    return (
      <>
        <PageHeader title="挂榜" />
        <Panel>
          <EmptyState
            icon={<UserCircle size={18} />}
            title="需要先添加账号"
            description="挂榜需要至少一个账号。到「账号管理」添加后再回来。"
          />
        </Panel>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="挂榜"
        description="让账号保持在线状态。每个直播间每 60 秒发送一次心跳。"
      />

      <Panel className="p-5">
        <div className="flex flex-col gap-5">
          <Field label="房间号" className="max-w-xs">
            <Input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="例如：21452505"
              inputMode="numeric"
            />
          </Field>

          <div>
            <p className="mb-2 text-[12.5px] font-medium text-ink-2">选择账号</p>
            <AccountPicker accounts={accounts} selected={selected} onChange={setSelected} />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={() => void start()}
              disabled={!canAct || busy !== null}
            >
              <Play size={14} weight="fill" />
              {busy === 'start' ? '启动中...' : '开始挂榜'}
            </Button>
            <Button variant="danger" onClick={() => void stop()} disabled={!canAct || busy !== null}>
              <Stop size={14} weight="fill" />
              {busy === 'stop' ? '停止中...' : '停止挂榜'}
            </Button>
          </div>
        </div>
      </Panel>

      <div className="mt-5">
        <Panel>
          <PanelHeader
            title="当前挂榜状态"
            hint={
              watch.length
                ? `${watch.length} 个账号正在挂榜`
                : '还没有正在挂榜的账号'
            }
            actions={
              watch.length ? (
                <Button
                  size="sm"
                  onClick={() => setGroupBy((g) => (g === 'account' ? 'room' : 'account'))}
                >
                  {groupBy === 'account' ? '按直播间分组' : '按账号分组'}
                </Button>
              ) : null
            }
          />

          {watch.length === 0 ? (
            <EmptyState
              icon={<Broadcast size={18} />}
              title="暂无挂榜任务"
              description="在上面填写房间号并选择账号，然后点「开始挂榜」。"
            />
          ) : (
            <div className="grid gap-2.5 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {groupBy === 'account'
                ? byAccount.map(([account, rooms]) => (
                    <motion.div
                      key={account}
                      layout
                      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={springSoft}
                      className="rounded-panel border border-line bg-subtle p-3"
                    >
                      <div className="mb-2 flex items-center gap-1.5">
                        <UserCircle size={14} className="shrink-0 text-ink-3" />
                        <span className="truncate text-[12.5px] font-medium text-ink">
                          {account || '未命名'}
                        </span>
                        <span className="ml-auto font-mono text-[11.5px] text-ink-3">
                          <AnimatedNumber value={rooms.length} />
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {rooms.map((room) => (
                          <Badge key={room} tone="ok" mono>
                            {room}
                          </Badge>
                        ))}
                      </div>
                    </motion.div>
                  ))
                : byRoom.map(([room, names]) => (
                    <motion.div
                      key={room}
                      layout
                      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={springSoft}
                      className="rounded-panel border border-line bg-subtle p-3"
                    >
                      <div className="mb-2 flex items-center gap-1.5">
                        <Broadcast size={14} className="shrink-0 text-ink-3" />
                        <span className="truncate font-mono text-[12px] text-ink">{room}</span>
                        <span className="ml-auto font-mono text-[11.5px] text-ink-3">
                          <AnimatedNumber value={names.length} />
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {names.map((name) => (
                          <Badge key={name}>{name || '未命名'}</Badge>
                        ))}
                      </div>
                    </motion.div>
                  ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
