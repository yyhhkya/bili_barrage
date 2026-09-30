import { useState } from 'react'
import { ClockCountdown, Plus, PencilSimple, Trash, Play, Stop } from '@phosphor-icons/react'
import type { Task } from '@shared/types'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent } from '../components/ui/dialog'
import { Input, Textarea } from '../components/ui/input'
import { Field, PageHeader, Panel, Table, Td, Th } from '../components/ui/panel'
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/states'
import { StatusPill } from '../components/ui/badge'
import { AccountPicker } from '../components/app/AccountPicker'

interface TaskForm {
  room_remark: string
  room_id: string
  content: string
  interval: number
  selected: number[]
}

const EMPTY_FORM: TaskForm = {
  room_remark: '',
  room_id: '',
  content: '',
  interval: 5,
  selected: []
}

export function TasksPage(): React.ReactElement {
  const { state, ready } = useStore()
  const { accounts, tasks } = state
  const toast = useToast()

  const [dialog, setDialog] = useState<{ open: boolean; index: number }>({ open: false, index: -1 })
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isEdit = dialog.index >= 0

  function openAdd(): void {
    setForm(EMPTY_FORM)
    setDialog({ open: true, index: -1 })
    setError(null)
  }

  function openEdit(task: Task, index: number): void {
    // Map stored account keys back to their current positions.
    const selected = task.account_keys
      .map((key) => accounts.findIndex((a) => a.key === key))
      .filter((i) => i >= 0)
    setForm({
      room_remark: task.room_remark,
      room_id: task.room_id,
      content: task.content,
      interval: task.interval,
      selected
    })
    setDialog({ open: true, index })
    setError(null)
  }

  async function save(): Promise<void> {
    if (!form.room_id.trim()) {
      setError('房间号不能为空')
      return
    }
    if (!form.content.trim()) {
      setError('弹幕内容不能为空')
      return
    }
    if (!form.selected.length) {
      setError('至少选择一个账号')
      return
    }

    setSaving(true)
    try {
      const payload = {
        room_remark: form.room_remark,
        room_id: form.room_id.trim(),
        content: form.content,
        interval: form.interval
      }
      if (isEdit) {
        await window.api.editTask(dialog.index, payload, form.selected)
        toast.success('任务已更新')
      } else {
        await window.api.addTask(payload, form.selected)
        toast.success('任务已添加')
      }
      setDialog({ open: false, index: -1 })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function toggle(task: Task, index: number): Promise<void> {
    try {
      if (task.status === '运行中') {
        await window.api.stopTask(index)
      } else {
        await window.api.startTask(index)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function remove(task: Task, index: number): Promise<void> {
    try {
      await window.api.deleteTask(index)
      toast.success(`已删除任务「${task.room_remark || task.room_id}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <PageHeader
        title="定时任务"
        description="按固定间隔循环发送弹幕，同时让所选账号保持挂榜。"
        actions={
          <Button variant="primary" onClick={openAdd} disabled={!accounts.length}>
            <Plus size={15} weight="bold" />
            添加任务
          </Button>
        }
      />

      {!ready ? (
        <Panel className="overflow-hidden">
          <TableSkeleton />
        </Panel>
      ) : tasks.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<ClockCountdown size={18} />}
            title="还没有定时任务"
            description={
              accounts.length
                ? '添加一个任务，填好房间号和弹幕内容，它会按你设定的间隔自动循环发送。'
                : '定时任务需要账号。先到「账号管理」添加账号。'
            }
            action={
              accounts.length ? (
                <Button variant="primary" onClick={openAdd}>
                  <Plus size={15} weight="bold" />
                  添加任务
                </Button>
              ) : null
            }
          />
        </Panel>
      ) : (
        <Table
          head={
            <tr>
              <Th className="w-[120px]">备注</Th>
              <Th className="w-[110px]">房间号</Th>
              <Th>弹幕内容</Th>
              <Th className="w-[72px] text-right">间隔</Th>
              <Th className="w-[168px]">账号</Th>
              <Th className="w-[88px]">状态</Th>
              <Th className="w-[190px] text-right">操作</Th>
            </tr>
          }
        >
          {tasks.map((task, index) => {
            const running = task.status === '运行中'
            const transitioning = task.status === '启动中' || task.status === '停止中'
            return (
              <tr key={`${task.id}-${index}`} className="hover:bg-subtle">
                <Td className="truncate text-ink-2">
                  {task.room_remark || <span className="text-ink-3">无</span>}
                </Td>
                <Td className="font-mono text-[12.5px]">{task.room_id}</Td>
                <Td className="max-w-0">
                  <span className="block truncate" title={task.content}>
                    {task.content}
                  </span>
                </Td>
                <Td className="text-right font-mono text-[12.5px] tabular-nums">
                  {task.interval} 分
                </Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {task.accounts.slice(0, 2).map((name, i) => (
                      <span
                        key={`${name}-${i}`}
                        className="max-w-[72px] truncate rounded-full bg-subtle px-1.5 py-0.5 text-[11.5px] text-ink-2"
                      >
                        {name || '未命名'}
                      </span>
                    ))}
                    {task.accounts.length > 2 ? (
                      <span className="rounded-full bg-subtle px-1.5 py-0.5 font-mono text-[11.5px] text-ink-3">
                        +{task.accounts.length - 2}
                      </span>
                    ) : null}
                  </span>
                </Td>
                <Td>
                  <StatusPill status={task.status} />
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void toggle(task, index)}
                      disabled={transitioning}
                    >
                      {running ? <Stop size={13} weight="fill" /> : <Play size={13} weight="fill" />}
                      {running ? '停止' : '启动'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(task, index)}>
                      <PencilSimple size={13} />
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger-wash hover:text-danger"
                      onClick={() => void remove(task, index)}
                    >
                      <Trash size={13} />
                      删除
                    </Button>
                  </div>
                </Td>
              </tr>
            )
          })}
        </Table>
      )}

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}>
        <DialogContent
          open={dialog.open}
          title={isEdit ? '编辑任务' : '添加任务'}
          description="多条弹幕用英文逗号分隔，会按顺序轮流发送。"
          footer={
            <>
              <Button onClick={() => setDialog({ open: false, index: -1 })}>取消</Button>
              <Button variant="primary" onClick={() => void save()} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {error ? <ErrorState message={error} /> : null}

            <div className="flex gap-4">
              <Field label="备注" hint="可选，方便区分。" className="flex-1">
                <Input
                  value={form.room_remark}
                  onChange={(e) => setForm((f) => ({ ...f, room_remark: e.target.value }))}
                  placeholder="例如：日常打卡"
                />
              </Field>
              <Field label="房间号" className="w-40">
                <Input
                  value={form.room_id}
                  onChange={(e) => setForm((f) => ({ ...f, room_id: e.target.value }))}
                  placeholder="30866874"
                  inputMode="numeric"
                />
              </Field>
            </div>

            <Field label="弹幕内容" hint="多条用英文逗号分隔，例如：打卡,晚上好,来了">
              <Textarea
                rows={3}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="打卡,晚上好"
              />
            </Field>

            <Field label="间隔（分钟）" className="w-40">
              <Input
                type="number"
                min={1}
                max={1440}
                value={form.interval}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setForm((f) => ({
                    ...f,
                    interval: Number.isFinite(n) ? Math.min(1440, Math.max(1, n)) : 1
                  }))
                }}
                className="font-mono tabular-nums"
              />
            </Field>

            <div>
              <p className="mb-2 text-[12.5px] font-medium text-ink-2">选择账号</p>
              <AccountPicker
                accounts={accounts}
                selected={form.selected}
                onChange={(selected) => setForm((f) => ({ ...f, selected }))}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
