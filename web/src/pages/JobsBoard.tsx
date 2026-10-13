import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Loader2, MapPin, Plus, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import {
  createJob, JOB_STATUS_LABELS, KANBAN_COLUMNS, listJobs, updateJobStatus,
  type JobItem, type JobStatus,
} from '@/lib/jobs'

function errText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback
}

export default function JobsBoard() {
  const [jobList, setJobList] = useState<JobItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<JobStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [endTarget, setEndTarget] = useState<{ jobId: string } | null>(null)

  const [form, setForm] = useState({
    company: '', position: '', salary: '', city: '', source: '', jdText: '',
    status: 'wish' as JobStatus,
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { jobs } = await listJobs()
        if (!cancelled) setJobList(jobs)
      } catch (err) {
        toast.error(errText(err, '加载岗位列表失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  /** 换列：先乐观更新即时生效，再持久化；失败回滚（PRD §3.4 验收标准） */
  const moveJob = useCallback(async (jobId: string, status: JobStatus) => {
    const before = jobList
    setJobList((list) => list.map((j) => (j.id === jobId ? { ...j, status } : j)))
    try {
      const { job } = await updateJobStatus(jobId, status)
      setJobList((list) => list.map((j) => (j.id === jobId ? job : j)))
    } catch (err) {
      setJobList(before)
      toast.error(errText(err, '状态更新失败'))
    }
  }, [jobList])

  const drop = (col: JobStatus) => {
    const jobId = dragId
    setDragId(null)
    setOverCol(null)
    if (!jobId) return
    const current = jobList.find((j) => j.id === jobId)
    if (!current || current.status === col) return
    // 终态「已结束」需二次确认（PRD §3.4）
    if (col === 'ended') {
      setEndTarget({ jobId })
      return
    }
    void moveJob(jobId, col)
  }

  async function handleCreate() {
    if (!form.company.trim() || !form.position.trim()) {
      toast.error('请填写公司名称与岗位名称')
      return
    }
    setCreating(true)
    try {
      const { job } = await createJob({
        company: form.company.trim(),
        position: form.position.trim(),
        salary: form.salary.trim(),
        city: form.city.trim(),
        source: form.source.trim(),
        jdText: form.jdText.trim(),
        status: form.status,
      })
      setJobList((list) => [job, ...list])
      toast.success('已记录新岗位')
      setOpen(false)
      setForm({ company: '', position: '', salary: '', city: '', source: '', jdText: '', status: 'wish' })
    } catch (err) {
      toast.error(errText(err, '保存失败'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">求职进度看板</h1>
          <p className="mt-1 text-sm text-slate-500">拖拽卡片切换状态，点击卡片进入详情时间线 · 共 {jobList.length} 个岗位</p>
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />记录新投递
        </Button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中…
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {KANBAN_COLUMNS.map((col) => {
            const items = jobList.filter((j) => j.status === col.key)
            return (
              <div
                key={col.key}
                onDragOver={(e) => { e.preventDefault(); setOverCol(col.key) }}
                onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
                onDrop={() => drop(col.key)}
                className={`flex w-64 shrink-0 flex-col rounded-xl bg-slate-200/60 p-2 transition-colors ${
                  overCol === col.key ? 'ring-2 ring-indigo-400' : ''
                }`}
              >
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className={`h-2 w-2 rounded-full ${col.color}`} />
                  <span className="text-sm font-semibold">{col.label}</span>
                  <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
                </div>
                <div className="min-h-24 space-y-2">
                  {items.map((j) => (
                    <Link
                      key={j.id}
                      to={`/jobs/${j.id}`}
                      draggable
                      onDragStart={() => setDragId(j.id)}
                      onDragEnd={() => { setDragId(null); setOverCol(null) }}
                      className={`block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${
                        dragId === j.id ? 'opacity-40' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight">{j.company}</p>
                        <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600">{j.position}</p>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                        <span>{j.salary ?? '面议'}</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />{j.city ?? '-'}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        更新于 {formatDate(j.updatedAt)}
                        {j.source ? ` · ${j.source}` : ''}
                        {j.eventCount > 0 ? ` · ${j.eventCount} 条动态` : ''}
                      </p>
                    </Link>
                  ))}
                  {items.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-xs text-slate-400">
                      拖拽岗位到此处
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { setForm((f) => ({ ...f, status: col.key })); setOpen(true) }}
                  className="mt-2 flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium text-slate-500 hover:bg-white/70"
                >
                  <Plus className="h-3.5 w-3.5" /> 添加
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>记录新岗位</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>公司 *</Label>
                <Input
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  placeholder="如：字节跳动"
                />
              </div>
              <div className="space-y-2">
                <Label>岗位 *</Label>
                <Input
                  value={form.position}
                  onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                  placeholder="如：前端开发工程师"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>薪资范围</Label>
                <Input
                  value={form.salary}
                  onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))}
                  placeholder="如：25-40K·16薪"
                />
              </div>
              <div className="space-y-2">
                <Label>城市</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="如：北京"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>投递渠道</Label>
              <Input
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                placeholder="如：BOSS直聘 / 内推 / 官网"
              />
            </div>
            <div className="space-y-2">
              <Label>岗位 JD（将用于简历优化与面试题生成）</Label>
              <Textarea
                value={form.jdText}
                onChange={(e) => setForm((f) => ({ ...f, jdText: e.target.value }))}
                placeholder="粘贴完整 JD…"
                className="min-h-24"
              />
            </div>
            <div className="space-y-2">
              <Label>初始状态</Label>
              <div className="flex flex-wrap gap-2">
                {KANBAN_COLUMNS.map((c) => (
                  <Badge
                    key={c.key}
                    variant={form.status === c.key ? 'default' : 'outline'}
                    className={`cursor-pointer ${
                      form.status === c.key
                        ? 'bg-indigo-600 hover:bg-indigo-600'
                        : 'hover:border-indigo-400 hover:text-indigo-600'
                    }`}
                    onClick={() => setForm((f) => ({ ...f, status: c.key }))}
                  >
                    {c.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 终态二次确认（PRD §3.4：任意阶段可进入「已结束」，需二次确认） */}
      <AlertDialog open={!!endTarget} onOpenChange={(o) => !o && setEndTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>标记为「已结束」？</AlertDialogTitle>
            <AlertDialogDescription>
              该岗位将进入终态「{JOB_STATUS_LABELS.ended}」，且不可再流转回其他阶段。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => {
                const jobId = endTarget?.jobId
                setEndTarget(null)
                if (jobId) void moveJob(jobId, 'ended')
              }}
            >
              确认结束
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}