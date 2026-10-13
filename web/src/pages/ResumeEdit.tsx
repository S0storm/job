import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  History,
  Loader2,
  Save,
  Sparkles,
  Star,
  UploadCloud,
} from 'lucide-react'
import { toast } from 'sonner'
import ResumeVersionDialog from '@/components/ResumeVersionDialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ApiError } from '@/lib/api'
import {
  getResume,
  updateResume,
  uploadResumeFile,
  RESUME_CONTENT_MAX,
  type ResumeDetail,
  type ResumeVersion,
} from '@/lib/resumes'
import { formatDateTime } from '@/lib/format'

function errText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback
}

export default function ResumeEdit() {
  const { id = '' } = useParams()
  const [resume, setResume] = useState<ResumeDetail | null>(null)
  const [versions, setVersions] = useState<ResumeVersion[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [sourceFile, setSourceFile] = useState<string | null>(null)
  const [activeVersion, setActiveVersion] = useState<ResumeVersion | null>(null)

  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const data = await getResume(id)
      setResume(data.resume)
      setVersions(data.versions)
      setTitle(data.resume.title)
      setContent(data.resume.content)
      setSourceFile(data.resume.sourceFile)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setMissing(true)
      else toast.error(errText(err, '加载简历失败'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave() {
    if (!resume) return
    if (!title.trim()) {
      toast.error('请填写简历标题')
      return
    }
    if (content.length > RESUME_CONTENT_MAX) {
      toast.error(`正文不能超过 ${RESUME_CONTENT_MAX} 字符`)
      return
    }

    setSaving(true)
    try {
      const { resume: updated } = await updateResume(resume.id, {
        title: title.trim(),
        content,
        sourceFile,
      })
      setResume(updated)
      setTitle(updated.title)
      setContent(updated.content)
      setSourceFile(updated.sourceFile)
      toast.success('已保存')
    } catch (err) {
      toast.error(errText(err, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  async function handleUpload(file: File) {
    if (!resume) return
    setUploading(true)
    try {
      const parsed = await uploadResumeFile(resume.id, file)
      // 仅在解析成功后回填，失败不影响原有正文（PRD §3.2）
      setContent(parsed.content)
      setSourceFile(parsed.filename)
      toast.success(`已解析 ${parsed.filename}，请确认内容后点击保存`)
    } catch (err) {
      toast.error(errText(err, '文件解析失败'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSetDefault() {
    if (!resume || resume.isDefault) return
    try {
      const { resume: updated } = await updateResume(resume.id, { isDefault: true })
      setResume(updated)
      toast.success('已设为默认简历')
    } catch (err) {
      toast.error(errText(err, '设置默认简历失败'))
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中…
      </div>
    )
  }

  if (missing || !resume) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <p className="text-sm text-slate-500">简历不存在或已被删除</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/resume">返回简历中心</Link>
        </Button>
      </div>
    )
  }

  const overLimit = content.length > RESUME_CONTENT_MAX

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/resume">
              <ArrowLeft className="h-4.5 w-4.5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">{resume.title}</h1>
              {resume.isDefault ? (
                <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />默认
                </span>
              ) : (
                <button className="text-xs text-slate-400 hover:text-indigo-600" onClick={handleSetDefault}>
                  设为默认
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              最后更新 {formatDateTime(resume.updatedAt)} · 文本内容可直接编辑，提交 AI 优化前请确认信息准确
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            保存
          </Button>
          <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
            <Link to={`/optimize?resume=${resume.id}`}>
              <Sparkles className="mr-2 h-4 w-4" />AI 定向优化
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">简历内容</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="resume-title">
                简历标题
              </label>
              <Input id="resume-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="resume-content">
                正文（纯文本）
              </label>
              <Textarea
                id="resume-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-96 resize-y whitespace-pre-wrap font-mono text-[13px] leading-relaxed"
              />
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">提示：上传 PDF / DOCX 后自动解析为文本，复杂排版请人工核对。</span>
                <span className={overLimit ? 'text-rose-600' : 'text-slate-400'}>
                  {content.length} / {RESUME_CONTENT_MAX}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">重新上传解析</CardTitle>
            </CardHeader>
            <CardContent>
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
              <button
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-8 text-slate-400 transition-colors hover:border-indigo-400 hover:text-indigo-500 disabled:opacity-60"
              >
                {uploading ? (
                  <Loader2 className="h-7 w-7 animate-spin" />
                ) : (
                  <UploadCloud className="h-7 w-7" />
                )}
                <span className="text-sm font-medium">{uploading ? '解析中…' : '点击选择文件'}</span>
                <span className="text-xs">PDF / DOCX（≤5MB），解析后覆盖当前文本</span>
              </button>
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <FileText className="h-3.5 w-3.5" />
                当前来源：{sourceFile ?? '手动创建'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-slate-400" /> 优化版本历史
              </CardTitle>
            </CardHeader>
            <CardContent>
              {versions.length === 0 && (
                <p className="text-sm text-slate-400">还没有优化版本，点击右上角开始第一次 AI 优化</p>
              )}
              <div className="space-y-4">
                {versions.map((v, i) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setActiveVersion(v)}
                    className="group relative block w-full rounded-lg py-1.5 pl-5 pr-6 text-left transition-colors hover:bg-slate-50"
                  >
                    {i < versions.length - 1 && (
                      <span className="absolute left-[5px] top-6 h-full w-px bg-slate-200" />
                    )}
                    <span className="absolute left-0 top-3 h-2.5 w-2.5 rounded-full border-2 border-indigo-500 bg-white" />
                    <p className="text-sm font-medium">{v.label}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{v.jdSnapshot || '未记录 JD 快照'}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTime(v.createdAt)} · {v.suggestionCount} 条优化建议
                    </p>
                    <ChevronRight className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300 transition-colors group-hover:text-indigo-500" />
                  </button>
                ))}
              </div>
              <Separator className="my-4" />
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to={`/optimize?resume=${resume.id}`}>为新的岗位生成版本</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ResumeVersionDialog
        version={activeVersion}
        onOpenChange={(open) => !open && setActiveVersion(null)}
      />
    </div>
  )
}