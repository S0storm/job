import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Eye, FileText, History, Loader2, Pencil, Plus, Star, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ApiError } from '@/lib/api'
import {
  createResume,
  deleteResume,
  listResumes,
  updateResume,
  uploadResumeFile,
  type ResumeSummary,
} from '@/lib/resumes'
import { formatDate } from '@/lib/format'

function errText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback
}

export default function ResumeList() {
  const navigate = useNavigate()
  const [resumes, setResumes] = useState<ResumeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ResumeSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const data = await listResumes()
      setResumes(data.resumes)
    } catch (err) {
      toast.error(errText(err, '加载简历列表失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate() {
    setBusy(true)
    try {
      const { resume } = await createResume({ title: '未命名简历' })
      navigate(`/resume/${resume.id}`)
    } catch (err) {
      toast.error(errText(err, '新建简历失败'))
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(file: File) {
    setBusy(true)
    let createdId: string | null = null
    try {
      const title = file.name.replace(/\.(pdf|docx)$/i, '').trim() || '未命名简历'
      const { resume } = await createResume({ title })
      createdId = resume.id
      const parsed = await uploadResumeFile(resume.id, file)
      await updateResume(resume.id, { content: parsed.content, sourceFile: parsed.filename })
      toast.success('已解析文件内容，请确认后保存')
      navigate(`/resume/${resume.id}`)
    } catch (err) {
      // 解析失败时不留下空壳简历
      if (createdId) await deleteResume(createdId).catch(() => undefined)
      toast.error(errText(err, '文件上传解析失败'))
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await updateResume(id, { isDefault: true })
      toast.success('已设为默认简历')
      await load()
    } catch (err) {
      toast.error(errText(err, '设置默认简历失败'))
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteResume(deleteTarget.id)
      toast.success('简历已删除')
      setDeleteTarget(null)
      await load()
    } catch (err) {
      toast.error(errText(err, '删除失败'))
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">简历中心</h1>
          <p className="mt-1 text-sm text-slate-500">管理你的基础简历，并针对每个岗位生成定向优化版本</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleUpload(file)
            }}
          />
          <Button variant="outline" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            上传简历文件
          </Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700" disabled={busy} onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />新建简历
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-52 items-center justify-center text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resumes.map((r) => (
            <Card
              key={r.id}
              className="group cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => navigate(`/resume/${r.id}/view`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <FileText className="h-5.5 w-5.5" />
                  </div>
                  {r.isDefault ? (
                    <Badge className="gap-1 bg-amber-100 text-amber-700 hover:bg-amber-100">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> 默认
                    </Badge>
                  ) : (
                    <button
                      className="text-xs text-slate-400 hover:text-indigo-600"
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleSetDefault(r.id)
                      }}
                    >
                      设为默认
                    </button>
                  )}
                </div>
                <h3 className="mt-4 font-semibold">{r.title}</h3>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">{r.preview || '暂无内容'}</p>
                <div className="mt-4 flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <History className="h-3.5 w-3.5" />
                    {r.versionCount} 个优化版本
                  </span>
                  <span>更新于 {formatDate(r.updatedAt)}</span>
                </div>
                <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link to={`/resume/${r.id}/view`}>
                      <Eye className="mr-1 h-3.5 w-3.5" />查看
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link to={`/resume/${r.id}`}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />编辑
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link to={`/optimize?resume=${r.id}`}>定向优化</Link>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0 text-slate-400 hover:text-rose-600"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTarget(r)
                    }}
                    aria-label="删除简历"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          <button
            onClick={handleCreate}
            disabled={busy}
            className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition-colors hover:border-indigo-400 hover:text-indigo-500 disabled:opacity-60"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100">
              <Plus className="h-5.5 w-5.5" />
            </div>
            <span className="text-sm font-medium">新建一份简历</span>
            <span className="text-xs">支持上传 PDF / DOCX 自动解析为文本</span>
          </button>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除简历</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除「{deleteTarget?.title}」吗？该简历下的所有优化版本将一并删除，且无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={handleDelete}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}