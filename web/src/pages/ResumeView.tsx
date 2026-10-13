import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, ChevronRight, FileText, History, Loader2, Pencil, Star } from 'lucide-react'
import { toast } from 'sonner'
import ResumeVersionDialog from '@/components/ResumeVersionDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ApiError } from '@/lib/api'
import { getResume, type ResumeDetail, type ResumeVersion } from '@/lib/resumes'
import { formatDateTime } from '@/lib/format'

function errText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback
}

/** 简历只读查看页（PRD §3.2：以展示状态查看正文与优化版本，不进入编辑态） */
export default function ResumeView() {
  const { id = '' } = useParams()
  const [resume, setResume] = useState<ResumeDetail | null>(null)
  const [versions, setVersions] = useState<ResumeVersion[]>([])
  const [activeVersion, setActiveVersion] = useState<ResumeVersion | null>(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await getResume(id)
        if (cancelled) return
        setResume(data.resume)
        setVersions(data.versions)
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) setMissing(true)
        else toast.error(errText(err, '加载简历失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

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

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/resume" aria-label="返回简历中心">
              <ArrowLeft className="h-4.5 w-4.5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">{resume.title}</h1>
              {resume.isDefault && (
                <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />默认
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              最后更新 {formatDateTime(resume.updatedAt)} · {resume.versionCount} 个优化版本
            </p>
          </div>
        </div>
        <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
          <Link to={`/resume/${resume.id}`}>
            <Pencil className="mr-2 h-4 w-4" />编辑内容
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">简历内容</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-slate-700">
              {resume.content || '暂无内容'}
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">简历信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" />
                来源：{resume.sourceFile ?? '手动创建'}
              </div>
              <div>创建于 {formatDateTime(resume.createdAt)}</div>
              <div>正文 {resume.content.length} 字符</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-slate-400" /> 优化版本历史
              </CardTitle>
            </CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <p className="text-sm text-slate-400">还没有优化版本</p>
              ) : (
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
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                        {v.jdSnapshot || '未记录 JD 快照'}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatDateTime(v.createdAt)} · {v.suggestionCount} 条优化建议
                      </p>
                      <ChevronRight className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300 transition-colors group-hover:text-indigo-500" />
                    </button>
                  ))}
                </div>
              )}
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