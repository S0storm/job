import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  CheckCircle2, ChevronDown, ChevronUp, Circle, Loader2, RefreshCw, Sparkles, Target,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ApiError } from '@/lib/api'
import { listJobs, type JobItem } from '@/lib/jobs'
import { listResumes, type ResumeSummary } from '@/lib/resumes'
import {
  generateInterviewQuestions, listInterviewQuestions, QUESTION_CATEGORY_KEYS,
  QUESTION_CATEGORY_LABELS, setQuestionMastered, type InterviewQuestionItem,
} from '@/lib/interview'

function errText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback
}

export default function Interview() {
  const [searchParams] = useSearchParams()

  const [jobs, setJobs] = useState<JobItem[]>([])
  const [resumes, setResumes] = useState<ResumeSummary[]>([])
  const [jobId, setJobId] = useState('')
  const [questions, setQuestions] = useState<InterviewQuestionItem[]>([])
  const [openId, setOpenId] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // 仅「已投递」及之后的岗位可生成面试题（PRD §3.5）
  const eligibleJobs = jobs.filter((j) => j.status !== 'wish' && j.status !== 'ended')
  const selectedJob = eligibleJobs.find((j) => j.id === jobId) ?? null
  const defaultResume = resumes.find((r) => r.isDefault) ?? resumes[0] ?? null

  // 初始化：加载岗位与简历，按 ?job= 深链或默认选中第一个可用岗位
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [{ jobs: jobList }, { resumes: resumeList }] = await Promise.all([
          listJobs(),
          listResumes(),
        ])
        if (cancelled) return
        setJobs(jobList)
        setResumes(resumeList)
        const wanted = new URLSearchParams(window.location.search).get('job')
        const usable = jobList.filter((j) => j.status !== 'wish' && j.status !== 'ended')
        const picked = usable.find((j) => j.id === wanted) ?? usable[0]
        if (picked) setJobId(picked.id)
      } catch (err) {
        toast.error(errText(err, '加载岗位列表失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  // 切换岗位：载入该岗位题库（PRD §3.5 岗位关联）
  useEffect(() => {
    if (!jobId) {
      setQuestions([])
      return
    }
    let cancelled = false
    setLoadingQuestions(true)
    void (async () => {
      try {
        const { questions: list } = await listInterviewQuestions(jobId)
        if (cancelled) return
        setQuestions(list)
        setOpenId(list[0]?.id ?? null)
      } catch (err) {
        if (!cancelled) toast.error(errText(err, '加载题库失败'))
      } finally {
        if (!cancelled) setLoadingQuestions(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [jobId])

  const doGenerate = useCallback(async () => {
    if (!jobId) return
    if (!defaultResume) {
      toast.error('还没有简历，请先在「简历中心」创建一份')
      return
    }
    setGenerating(true)
    try {
      const { questions: list } = await generateInterviewQuestions({
        jobId,
        resumeId: defaultResume.id,
      })
      setQuestions(list)
      setOpenId(list[0]?.id ?? null)
      toast.success(`已生成 ${list.length} 道面试题`)
    } catch (err) {
      toast.error(errText(err, '生成失败，请重试'))
      if (err instanceof ApiError && err.code === 'AI_NOT_CONFIGURED') {
        toast.info('可在「设置」页填写 Kimi API Key')
      }
    } finally {
      setGenerating(false)
    }
  }, [jobId, defaultResume])

  function handleGenerateClick() {
    if (!jobId) return
    if (!defaultResume) {
      toast.error('还没有简历，请先在「简历中心」创建一份')
      return
    }
    // 「重新生成」整批替换，需二次确认（PRD §3.5）
    if (questions.length > 0) {
      setConfirmOpen(true)
      return
    }
    void doGenerate()
  }

  async function toggleMastered(q: InterviewQuestionItem) {
    const next = !q.mastered
    setQuestions((list) => list.map((x) => (x.id === q.id ? { ...x, mastered: next } : x)))
    try {
      await setQuestionMastered(q.id, next)
    } catch (err) {
      setQuestions((list) => list.map((x) => (x.id === q.id ? { ...x, mastered: !next } : x)))
      toast.error(errText(err, '标记失败，请重试'))
    }
  }

  const masteredCount = questions.filter((q) => q.mastered).length

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中…
      </div>
    )
  }

  if (eligibleJobs.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <p className="text-sm text-slate-500">
          还没有进行中的岗位。「意向 / 已结束」的岗位无法生成面试题，请先在求职看板记录投递进展
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/jobs">前往求职看板</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">面试题练习</h1>
          <p className="mt-1 text-sm text-slate-500">由 AI 基于岗位 JD + 你的简历生成，按类别针对性准备</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={jobId} onValueChange={setJobId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="选择岗位" /></SelectTrigger>
            <SelectContent>
              {eligibleJobs.map((j) => (
                <SelectItem key={j.id} value={j.id}>{j.company} · {j.position}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={handleGenerateClick}
            disabled={generating || !jobId}
          >
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : questions.length > 0 ? (
              <RefreshCw className="mr-2 h-4 w-4" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {generating ? '生成中…' : questions.length > 0 ? '重新生成' : '生成面试题'}
          </Button>
        </div>
      </div>

      {selectedJob && (
        <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-700">
          <Sparkles className="h-4 w-4" />
          <span>
            当前题库：{selectedJob.company} · {selectedJob.position}
            {questions.length > 0 ? ` · 已掌握 ${masteredCount}/${questions.length} 题` : ' · 尚未生成'}
          </span>
          <span className="ml-auto text-xs text-indigo-400">
            出题简历：{defaultResume ? defaultResume.title : '未找到简历'}
          </span>
        </div>
      )}

      {loadingQuestions ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载题库…
        </div>
      ) : generating ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
          ))}
          <p className="text-center text-xs text-slate-400">Kimi 正在基于 JD 与简历出题，约需 20–60 秒…</p>
        </div>
      ) : questions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <p className="text-sm text-slate-500">
              该岗位还没有题库，点击右上角「生成面试题」由 AI 生成 9 道定向题目
            </p>
            {!defaultResume && (
              <p className="text-xs text-rose-500">
                需先在<Link to="/resume" className="mx-1 underline">简历中心</Link>创建一份简历
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="tech">
          <TabsList>
            {QUESTION_CATEGORY_KEYS.map((c) => (
              <TabsTrigger key={c} value={c}>
                {QUESTION_CATEGORY_LABELS[c]}
                <Badge variant="secondary" className="ml-2">
                  {questions.filter((q) => q.category === c).length}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          {QUESTION_CATEGORY_KEYS.map((c) => {
            const items = questions.filter((q) => q.category === c)
            return (
              <TabsContent key={c} value={c} className="mt-4 space-y-3">
                {items.length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-400">该分类暂无题目</p>
                )}
                {items.map((q) => {
                  const open = openId === q.id
                  return (
                    <Card key={q.id} className={q.mastered ? 'opacity-75' : ''}>
                      <CardContent className="p-0">
                        <div className="flex items-start gap-3 p-4">
                          {/* 掌握标记独立成可点击控件，避免嵌套在展开按钮内 */}
                          <button
                            type="button"
                            aria-label={q.mastered ? '取消已掌握标记' : '标记为已掌握'}
                            className="mt-0.5 shrink-0 text-emerald-500"
                            onClick={() => void toggleMastered(q)}
                          >
                            {q.mastered
                              ? <CheckCircle2 className="h-5 w-5 fill-emerald-100" />
                              : <Circle className="h-5 w-5 text-slate-300" />}
                          </button>
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-start gap-2 text-left"
                            onClick={() => setOpenId(open ? null : q.id)}
                          >
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-medium leading-relaxed ${q.mastered ? 'line-through decoration-slate-300' : ''}`}>
                                {q.question}
                              </p>
                              {q.keyPoints.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <Badge variant="outline" className="gap-1 text-[11px] font-normal">
                                    <Target className="h-3 w-3" /> 考察点：
                                  </Badge>
                                  {q.keyPoints.map((k) => (
                                    <Badge key={k} variant="secondary" className="text-[11px] font-normal">{k}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            {open
                              ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                              : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                          </button>
                        </div>
                        {open && (
                          <div className="border-t border-slate-100 bg-slate-50/60 p-4 pl-12">
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{q.answer}</p>
                            <p className="mt-3 text-xs text-slate-400">参考答案由 Kimi 基于你的简历生成，点击题目前圆圈标记“已掌握”</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </TabsContent>
            )
          })}
        </Tabs>
      )}

      <p className="text-center text-xs text-slate-400">
        P1 版本规划：AI 模拟面试对话模式（多轮追问 + 评分）·
        <Link to="/dashboard" className="ml-1 text-indigo-500 hover:underline">返回仪表盘</Link>
      </p>

      {/* 重新生成整批替换，二次确认（PRD §3.5） */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重新生成整批题目？</AlertDialogTitle>
            <AlertDialogDescription>
              将替换该岗位现有的 {questions.length} 道题目（含已掌握标记），且无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => { setConfirmOpen(false); void doGenerate() }}
            >
              确认重新生成
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}