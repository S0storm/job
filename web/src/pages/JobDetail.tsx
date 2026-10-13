import { useCallback, useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import {
  ArrowLeft, Banknote, Globe, Loader2, MapPin, Pencil, Plus, Sparkles, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ApiError } from '@/lib/api'
import { formatDate, formatDateTime } from '@/lib/format'
import {
  createJobEvent, deleteJob, deleteJobEvent, getJob, JOB_EVENT_TYPES, JOB_STATUS_FLOW,
  KANBAN_COLUMNS, updateJob, updateJobStatus,
  type JobEventItem, type JobEventType, type JobItem, type JobStatus,
} from '@/lib/jobs'

function errText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback
}

function todayInput() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function JobDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const [job, setJob] = useState<JobItem | null>(null)
  const [events, setEvents] = useState<JobEventItem[]>([])
  const [loading, setLoading] = useState(true)

  const [editOpen, setEditOpen] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [form, setForm] = useState({
    company: '', position: '', salary: '', city: '', source: '', jdText: '',
  })

  const [eventOpen, setEventOpen] = useState(false)
  const [savingEvent, setSavingEvent] = useState(false)
  const [eventForm, setEventForm] = useState<{ type: JobEventType; eventDate: string; note: string }>({
    type: '投递简历', eventDate: todayInput(), note: '',
  })

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [deleteEventTarget, setDeleteEventTarget] = useState<JobEventItem | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await getJob(id)
      setJob(data.job)
      setEvents(data.events)
    } catch (err) {
      toast.error(errText(err, '加载岗位详情失败'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  function openEdit() {
    if (!job) return
    setForm({
      company: job.company,
      position: job.position,
      salary: job.salary ?? '',
      city: job.city ?? '',
      source: job.source ?? '',
      jdText: job.jdText ?? '',
    })
    setEditOpen(true)
  }

  async function handleSaveEdit() {
    if (!job) return
    if (!form.company.trim() || !form.position.trim()) {
      toast.error('请填写公司名称与岗位名称')
      return
    }
    setSavingEdit(true)
    try {
      const { job: updated } = await updateJob(job.id, {
        company: form.company.trim(),
        position: form.position.trim(),
        salary: form.salary.trim(),
        city: form.city.trim(),
        source: form.source.trim(),
        jdText: form.jdText.trim(),
      })
      setJob(updated)
      toast.success('已保存')
      setEditOpen(false)
    } catch (err) {
      toast.error(errText(err, '保存失败'))
    } finally {
      setSavingEdit(false)
    }
  }

  async function changeStatus(status: JobStatus) {
    if (!job) return
    try {
      const { job: updated } = await updateJobStatus(job.id, status)
      setJob(updated)
      toast.success(`已流转为「${KANBAN_COLUMNS.find((c) => c.key === status)?.label}」`)
    } catch (err) {
      toast.error(errText(err, '状态更新失败'))
    }
  }

  async function handleAddEvent() {
    if (!job) return
    if (!eventForm.eventDate) {
      toast.error('请选择事件日期')
      return
    }
    setSavingEvent(true)
    try {
      const { event } = await createJobEvent(job.id, {
        type: eventForm.type,
        eventDate: eventForm.eventDate,
        note: eventForm.note.trim(),
      })
      // 时间线按日期倒序插入，保持与后端一致（PRD §3.4）
      setEvents((list) => [...list, event].sort((a, b) => b.eventDate.localeCompare(a.eventDate)))
      setJob((j) => (j ? { ...j, eventCount: j.eventCount + 1, updatedAt: event.createdAt } : j))
      toast.success('已记录事件')
      setEventOpen(false)
      setEventForm({ type: '投递简历', eventDate: todayInput(), note: '' })
    } catch (err) {
      toast.error(errText(err, '记录事件失败'))
    } finally {
      setSavingEvent(false)
    }
  }

  async function handleDeleteEvent() {
    if (!deleteEventTarget) return
    const target = deleteEventTarget
    setDeleteEventTarget(null)
    try {
      await deleteJobEvent(target.id)
      setEvents((list) => list.filter((e) => e.id !== target.id))
      setJob((j) => (j ? { ...j, eventCount: Math.max(0, j.eventCount - 1) } : j))
      toast.success('已删除事件')
    } catch (err) {
      toast.error(errText(err, '删除失败'))
    }
  }

  async function handleDeleteJob() {
    if (!job) return
    try {
      await deleteJob(job.id)
      toast.success('已删除岗位')
      navigate('/jobs')
    } catch (err) {
      toast.error(errText(err, '删除失败'))
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中…
      </div>
    )
  }

  if (!job) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <p className="text-sm text-slate-500">岗位不存在或已被删除</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/jobs">返回看板</Link></Button>
      </div>
    )
  }

  const col = KANBAN_COLUMNS.find((c) => c.key === job.status) ?? KANBAN_COLUMNS[0]
  const flowIndex = JOB_STATUS_FLOW.indexOf(job.status)
  const nextStatus = flowIndex >= 0 ? JOB_STATUS_FLOW[flowIndex + 1] : undefined
  const nextLabel = nextStatus ? KANBAN_COLUMNS.find((c) => c.key === nextStatus)?.label : undefined

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon"><Link to="/jobs"><ArrowLeft className="h-4.5 w-4.5" /></Link></Button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold">{job.company}</h1>
              <Badge className={`${col.color} text-white hover:${col.color}`}>{col.label}</Badge>
            </div>
            <p className="text-sm text-slate-500">{job.position}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openEdit}><Pencil className="mr-2 h-4 w-4" />编辑</Button>
          <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
            <Link to={`/interview?job=${job.id}`}><Sparkles className="mr-2 h-4 w-4" />生成面试题</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
        <span className="flex items-center gap-1.5"><Banknote className="h-4 w-4" />{job.salary ?? '面议'}</span>
        <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{job.city ?? '-'}</span>
        <span className="flex items-center gap-1.5"><Globe className="h-4 w-4" />投递渠道：{job.source ?? '-'}</span>
        <span>最近更新：{formatDateTime(job.updatedAt)}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* 时间线 */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">流程时间线</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setEventOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />记录事件
            </Button>
          </CardHeader>
          <CardContent>
            {events.length === 0 && <p className="py-8 text-center text-sm text-slate-400">暂无记录，点击右上角记录第一个事件</p>}
            <div className="space-y-5">
              {events.map((e, i) => (
                <div key={e.id} className="group relative pl-6">
                  {i < events.length - 1 && <span className="absolute left-[7px] top-6 h-full w-px bg-slate-200" />}
                  <span className={`absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 ${
                    i === 0 ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300 bg-white'
                  }`} />
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${i === 0 ? 'text-indigo-700' : ''}`}>{e.type}</p>
                    <span className="text-xs text-slate-400">{formatDate(e.eventDate)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 px-2 text-slate-400 opacity-0 group-hover:opacity-100"
                      onClick={() => setDeleteEventTarget(e)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {e.note && <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-600">{e.note}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {/* JD */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">岗位 JD</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">
                {job.jdText || '尚未录入 JD'}
              </p>
              <Separator className="my-4" />
              <Button asChild variant="outline" size="sm" className="w-full" disabled={!job.jdText}>
                <Link to={`/optimize?job=${job.id}`}>用这份 JD 优化简历</Link>
              </Button>
            </CardContent>
          </Card>

          {/* 快捷操作 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">快捷操作</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {nextStatus && nextLabel ? (
                <Button variant="outline" className="w-full justify-start" onClick={() => void changeStatus(nextStatus)}>
                  推进到下一阶段（{col.label} → {nextLabel}）
                </Button>
              ) : (
                <Button variant="outline" className="w-full justify-start" disabled>
                  {job.status === 'ended' ? '流程已结束' : '已到流程末段'}
                </Button>
              )}
              {job.status !== 'ended' && (
                <Button
                  variant="outline"
                  className="w-full justify-start text-rose-600 hover:text-rose-700"
                  onClick={() => setEndOpen(true)}
                >
                  标记流程终止
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full justify-start text-rose-600 hover:text-rose-700"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />删除该岗位
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 编辑信息 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑岗位信息</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>公司 *</Label>
                <Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>岗位 *</Label>
                <Input value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>薪资范围</Label>
                <Input value={form.salary} onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>城市</Label>
                <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>投递渠道</Label>
              <Input value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>岗位 JD</Label>
              <Textarea value={form.jdText} onChange={(e) => setForm((f) => ({ ...f, jdText: e.target.value }))} className="min-h-32" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 记录事件 */}
      <Dialog open={eventOpen} onOpenChange={setEventOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>记录流程事件</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>事件类型</Label>
                <Select
                  value={eventForm.type}
                  onValueChange={(v) => setEventForm((f) => ({ ...f, type: v as JobEventType }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {JOB_EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>事件日期</Label>
                <Input
                  type="date"
                  value={eventForm.eventDate}
                  onChange={(e) => setEventForm((f) => ({ ...f, eventDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea
                value={eventForm.note}
                onChange={(e) => setEventForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="面试反馈、待准备事项、面试官提问…"
                className="min-h-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEventOpen(false)}>取消</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleAddEvent} disabled={savingEvent}>
              {savingEvent && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除事件 */}
      <AlertDialog open={!!deleteEventTarget} onOpenChange={(o) => !o && setDeleteEventTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除该事件？</AlertDialogTitle>
            <AlertDialogDescription>删除后无法恢复，时间线将不再展示该条记录。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={handleDeleteEvent}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除岗位 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除岗位「{job.company}」？</AlertDialogTitle>
            <AlertDialogDescription>将同时删除该岗位下的事件与面试题，且无法恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={handleDeleteJob}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 终止流程二次确认 */}
      <AlertDialog open={endOpen} onOpenChange={setEndOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>标记为「已结束」？</AlertDialogTitle>
            <AlertDialogDescription>该岗位将进入终态「已结束」，且不可再流转回其他阶段。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => { setEndOpen(false); void changeStatus('ended') }}
            >
              确认结束
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}