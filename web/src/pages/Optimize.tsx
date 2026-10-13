import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  CheckCircle2,
  Download,
  FileText,
  Lightbulb,
  Loader2,
  Save,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { getAiTask, optimizeResume } from '@/lib/ai'
import { getJob } from '@/lib/jobs'
import {
  createResumeVersion,
  getResume,
  listResumes,
  updateResume,
  RESUME_CONTENT_MAX,
  type ResumeSummary,
} from '@/lib/resumes'
import { formatDate } from '@/lib/format'

/** 轮询间隔（PRD §7：GET /ai/tasks/:id 轮询） */
const POLL_INTERVAL_MS = 1500

function errText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback
}

export default function Optimize() {
  const [searchParams] = useSearchParams()

  const [resumes, setResumes] = useState<ResumeSummary[]>([])
  const [resumeId, setResumeId] = useState('')
  const [resumeTitle, setResumeTitle] = useState('')
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [jdText, setJdText] = useState('')

  const [loading, setLoading] = useState(true)
  const [savingContent, setSavingContent] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [optimizedText, setOptimizedText] = useState('')
  const [tokens, setTokens] = useState<number | null>(null)
  const [versionLabel, setVersionLabel] = useState('')
  const [savingVersion, setSavingVersion] = useState(false)

  const pollTimer = useRef<number | null>(null)

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current)
      pollTimer.current = null
    }
  }, [])

  // 初始化：加载简历列表，选中默认简历（或被 ?resume= 深链指定的简历）
  // 若带 ?job= 深链（来自岗位详情「用这份 JD 优化简历」），自动带入该岗位 JD（PRD §3.4 关联跳转）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const { resumes: list } = await listResumes()
        if (cancelled) return
        setResumes(list)
        const wanted = params.get('resume')
        const picked = list.find((r) => r.id === wanted) ?? list.find((r) => r.isDefault) ?? list[0]
        if (picked) setResumeId(picked.id)

        const wantedJob = params.get('job')
        if (wantedJob) {
          try {
            const { job } = await getJob(wantedJob)
            if (!cancelled && job.jdText) setJdText(job.jdText)
          } catch {
            // 岗位不存在时忽略，不影响简历选择
          }
        }
      } catch (err) {
        toast.error(errText(err, '加载简历列表失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  // 切换简历：载入正文与默认版本名
  useEffect(() => {
    if (!resumeId) return
    let cancelled = false
    void (async () => {
      try {
        const { resume } = await getResume(resumeId)
        if (cancelled) return
        setResumeTitle(resume.title)
        setContent(resume.content)
        setSavedContent(resume.content)
        setVersionLabel(`${resume.title} · ${formatDate(new Date())}`)
        setSuggestions([])
        setOptimizedText('')
        setTokens(null)
      } catch (err) {
        toast.error(errText(err, '加载简历失败'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [resumeId])

  useEffect(() => () => stopPolling(), [stopPolling])

  const startPolling = useCallback((taskId: string) => {
    const tick = async () => {
      try {
        const { task } = await getAiTask(taskId)
        if (task.status === 'succeeded' && task.result) {
          setSuggestions(task.result.suggestions)
          setOptimizedText(task.result.optimized_content)
          setTokens((task.tokensIn ?? 0) + (task.tokensOut ?? 0))
          setGenerating(false)
          toast.success('优化完成')
          return
        }
        if (task.status === 'failed') {
          setGenerating(false)
          toast.error(task.error?.message ?? '生成失败，请重试')
          return
        }
        pollTimer.current = window.setTimeout(tick, POLL_INTERVAL_MS)
      } catch (err) {
        setGenerating(false)
        toast.error(errText(err, '获取生成结果失败，请重试'))
      }
    }
    pollTimer.current = window.setTimeout(tick, POLL_INTERVAL_MS)
  }, [])

  async function handleGenerate() {
    if (!resumeId) {
      toast.error('请先选择简历')
      return
    }
    if (!jdText.trim()) {
      toast.error('请粘贴目标岗位 JD')
      return
    }
    if (!content.trim()) {
      toast.error('简历内容为空，请先补充原文')
      return
    }

    stopPolling()
    setGenerating(true)
    setSuggestions([])
    setOptimizedText('')
    setTokens(null)
    try {
      const { task_id } = await optimizeResume({ resumeId, jdText })
      startPolling(task_id)
    } catch (err) {
      setGenerating(false)
      toast.error(errText(err, '发起优化失败'))
      if (err instanceof ApiError && err.code === 'AI_NOT_CONFIGURED') {
        toast.info('可在「设置」页填写 Kimi API Key')
      }
    }
  }

  async function handleSaveContent() {
    if (!resumeId) return
    if (content.length > RESUME_CONTENT_MAX) {
      toast.error(`正文不能超过 ${RESUME_CONTENT_MAX} 字符`)
      return
    }
    setSavingContent(true)
    try {
      await updateResume(resumeId, { content })
      setSavedContent(content)
      toast.success('原文已保存')
    } catch (err) {
      toast.error(errText(err, '保存原文失败'))
    } finally {
      setSavingContent(false)
    }
  }

  async function handleSaveVersion() {
    if (!resumeId) return
    if (!optimizedText.trim()) {
      toast.error('暂无可保存的优化结果')
      return
    }
    if (!versionLabel.trim()) {
      toast.error('请填写版本名称')
      return
    }
    setSavingVersion(true)
    try {
      await createResumeVersion(resumeId, {
        label: versionLabel.trim(),
        jdSnapshot: jdText.trim(),
        optimizedContent: optimizedText,
        suggestions,
      })
      toast.success('已保存为新的定向版本，可在简历详情页回溯')
    } catch (err) {
      toast.error(errText(err, '保存版本失败'))
    } finally {
      setSavingVersion(false)
    }
  }

  function handleExport() {
    if (!optimizedText.trim()) {
      toast.error('暂无可导出的内容')
      return
    }
    const lines: string[] = [`# ${resumeTitle || '简历'} · 定向优化`, '']
    if (jdText.trim()) lines.push('## 目标岗位 JD', '', jdText.trim(), '')
    if (suggestions.length) {
      lines.push('## 优化建议', '')
      suggestions.forEach((s, i) => lines.push(`${i + 1}. ${s}`))
      lines.push('')
    }
    lines.push('## 优化后简历', '', optimizedText)

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(resumeTitle || '简历').replace(/\s+/g, '_')}_定向优化_${formatDate(new Date())}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success('已导出 Markdown')
  }

  const contentDirty = content !== savedContent
  const contentOverLimit = content.length > RESUME_CONTENT_MAX
  const hasResult = suggestions.length > 0 || !!optimizedText.trim()

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中…
      </div>
    )
  }

  if (resumes.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <p className="text-sm text-slate-500">还没有简历，请先在「简历中心」创建或上传一份</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/resume">前往简历中心</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">AI 简历优化工作台</h1>
          <p className="mt-1 text-sm text-slate-500">左侧确认输入 → 右侧生成优化结果 → 保存为新的定向版本</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={resumeId} onValueChange={setResumeId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="选择简历" />
            </SelectTrigger>
            <SelectContent>
              {resumes.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.title}
                  {r.isDefault ? '（默认）' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={handleGenerate}
            disabled={generating || !resumeId}
          >
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {generating ? 'Kimi 生成中…' : hasResult ? '重新生成' : '生成优化'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 左：输入区 */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-slate-400" /> 简历原文（可编辑）
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-7"
                  onClick={handleSaveContent}
                  disabled={savingContent || !contentDirty || contentOverLimit}
                >
                  {savingContent ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  保存原文
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-56 whitespace-pre-wrap font-mono text-[13px] leading-relaxed"
                placeholder="简历原文…"
              />
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>AI 将基于已保存的原文进行优化</span>
                <span className={contentOverLimit ? 'text-rose-500' : ''}>
                  {content.length} / {RESUME_CONTENT_MAX}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">目标岗位 JD（可编辑）</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                className="min-h-32 text-[13px] leading-relaxed"
                placeholder="粘贴目标岗位的 JD 文本，AI 将据此寻找匹配缺口…"
              />
            </CardContent>
          </Card>
        </div>

        {/* 右：AI 结果区 */}
        <div className="space-y-4">
          <Card className="border-indigo-200 bg-gradient-to-b from-indigo-50/60 to-white">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="h-4 w-4 text-amber-500" /> 优化点说明
                {tokens !== null && !generating && (
                  <Badge className="ml-auto bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
                    已生成 · 消耗 {tokens.toLocaleString()} tokens
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {generating ? (
                <div className="space-y-2.5">
                  {[80, 65, 90, 55].map((w, i) => (
                    <div key={i} className="h-4 animate-pulse rounded bg-indigo-100" style={{ width: `${w}%` }} />
                  ))}
                </div>
              ) : suggestions.length > 0 ? (
                <ul className="space-y-2.5">
                  {suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-slate-400">
                  填写 JD 后点击「生成优化」，这里会显示逐条优化建议
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">优化后全文（可编辑）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {generating ? (
                <div className="space-y-2.5">
                  {[100, 95, 100, 70, 100, 85, 60].map((w, i) => (
                    <div key={i} className="h-4 animate-pulse rounded bg-slate-100" style={{ width: `${w}%` }} />
                  ))}
                </div>
              ) : (
                <Textarea
                  value={optimizedText}
                  onChange={(e) => setOptimizedText(e.target.value)}
                  placeholder="优化结果将在此显示，可继续手动润色…"
                  className="min-h-72 whitespace-pre-wrap font-mono text-[13px] leading-relaxed"
                />
              )}

              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">版本名称</label>
                <Input
                  value={versionLabel}
                  onChange={(e) => setVersionLabel(e.target.value)}
                  placeholder="例如：字节跳动 · 前端工程师 · 定向优化"
                  disabled={generating}
                />
              </div>

              <Separator />
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSaveVersion}
                  disabled={generating || savingVersion || !optimizedText.trim()}
                >
                  {savingVersion ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  保存为新版本
                </Button>
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={generating || !optimizedText.trim()}
                >
                  <Download className="mr-2 h-4 w-4" />导出 Markdown
                </Button>
              </div>
              <p className="text-xs text-slate-400">版本将记录 JD 快照与优化建议，可在简历详情页回溯</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}