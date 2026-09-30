import { useState } from 'react'
import { Plus, QrCode, UserCircle, PencilSimple, Trash, UploadSimple } from '@phosphor-icons/react'
import type { Account } from '@shared/types'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent } from '../components/ui/dialog'
import { Field, PageHeader, Panel, Td, Th, Table } from '../components/ui/panel'
import { Input, MonoInput } from '../components/ui/input'
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/states'
import { QrLoginDialog } from '../components/app/QrLoginDialog'

export function AccountsPage(): React.ReactElement {
  const { state, ready } = useStore()
  const toast = useToast()

  const [editing, setEditing] = useState<{ open: boolean; index: number }>({ open: false, index: -1 })
  const [form, setForm] = useState<Account>({ nickname: '', key: '' })
  const [autoFilling, setAutoFilling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = editing.index >= 0

  function openAdd(): void {
    setForm({ nickname: '', key: '' })
    setEditing({ open: true, index: -1 })
    setError(null)
  }

  function openEdit(account: Account, index: number): void {
    setForm({ ...account })
    setEditing({ open: true, index })
    setError(null)
  }

  async function autoFillNickname(): Promise<void> {
    if (!form.key) return
    setAutoFilling(true)
    try {
      const name = await window.api.getNickname(form.key)
      if (name) {
        setForm((f) => ({ ...f, nickname: name }))
        toast.success(`已获取昵称: ${name}`)
      } else {
        toast.error('未能获取昵称，请检查 access_key')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setAutoFilling(false)
    }
  }

  async function save(): Promise<void> {
    if (!form.key.trim()) {
      setError('access_key 不能为空')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        await window.api.editAccount(editing.index, form.nickname, form.key)
        toast.success('账号已更新')
      } else {
        await window.api.addAccount(form.nickname, form.key)
        toast.success('账号已添加')
      }
      setEditing({ open: false, index: -1 })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove(index: number, nickname: string): Promise<void> {
    try {
      await window.api.deleteAccount(index)
      toast.success(`已删除 ${nickname || '该账号'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function importLegacy(): Promise<void> {
    setImporting(true)
    try {
      const result = await window.api.importLegacyConfig()
      if (result.imported) {
        toast.success(`已导入 ${result.accounts} 个账号、${result.tasks} 个任务`)
      } else {
        toast.info('没有导入任何内容')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="账号管理"
        description="每个账号需要一条 B 站 access_key，用于发送弹幕、点赞和挂榜。"
        actions={
          <>
            <Button onClick={() => setQrOpen(true)}>
              <QrCode size={15} />
              扫码登录
            </Button>
            <Button variant="primary" onClick={openAdd}>
              <Plus size={15} weight="bold" />
              添加账号
            </Button>
          </>
        }
      />

      {!ready ? (
        <Panel className="overflow-hidden">
          <TableSkeleton />
        </Panel>
      ) : state.accounts.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<UserCircle size={18} />}
            title="还没有账号"
            description="用扫码登录自动获取，或手动粘贴一条 access_key。如果你在用旧版，可以直接导入它的配置文件。"
            action={
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => setQrOpen(true)}>
                  <QrCode size={15} />
                  扫码登录
                </Button>
                <Button onClick={() => void importLegacy()} disabled={importing}>
                  <UploadSimple size={15} />
                  {importing ? '导入中...' : '导入旧版配置'}
                </Button>
              </div>
            }
          />
        </Panel>
      ) : (
        <>
          <Table
            head={
              <tr>
                <Th className="w-12 text-right">#</Th>
                <Th>昵称</Th>
                <Th>Access Key</Th>
                <Th className="w-[132px] text-right">操作</Th>
              </tr>
            }
          >
            {state.accounts.map((account, index) => (
              <tr key={account.key} className="hover:bg-subtle">
                <Td className="text-right font-mono text-[12px] text-ink-3">
                  {index + 1}
                </Td>
                <Td className="font-medium">
                  {account.nickname || <span className="text-ink-3">未命名</span>}
                </Td>
                <Td className="font-mono text-[12px] text-ink-2">
                  {account.key.slice(0, 10)}
                  <span className="text-ink-3">…{account.key.slice(-4)}</span>
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(account, index)}>
                      <PencilSimple size={14} />
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger-wash hover:text-danger"
                      onClick={() => void remove(index, account.nickname)}
                    >
                      <Trash size={14} />
                      删除
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>

          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => void importLegacy()} disabled={importing}>
              <UploadSimple size={14} />
              {importing ? '导入中...' : '从旧版配置导入'}
            </Button>
          </div>
        </>
      )}

      <Dialog
        open={editing.open}
        onOpenChange={(open) => setEditing((e) => ({ ...e, open }))}
      >
        <DialogContent
          open={editing.open}
          title={isEdit ? '编辑账号' : '添加账号'}
          description="扫码登录可以自动填好这两项。"
          width="sm"
          footer={
            <>
              <Button onClick={() => setEditing({ open: false, index: -1 })}>取消</Button>
              <Button variant="primary" onClick={() => void save()} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {error ? <ErrorState message={error} /> : null}

            <Field label="昵称" hint="只用于区分账号，可以随便填。">
              <Input
                value={form.nickname}
                onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
                placeholder="例如：小号A"
              />
            </Field>

            <Field label="Access Key" hint="B 站账号的登录凭证，请勿分享给他人。">
              <MonoInput
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                placeholder="粘贴 access_key"
              />
            </Field>

            {!isEdit ? (
              <div>
                <Button
                  size="sm"
                  onClick={() => void autoFillNickname()}
                  disabled={!form.key || autoFilling}
                >
                  {autoFilling ? '获取中...' : '自动获取昵称'}
                </Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <QrLoginDialog open={qrOpen} onOpenChange={setQrOpen} />
    </>
  )
}
