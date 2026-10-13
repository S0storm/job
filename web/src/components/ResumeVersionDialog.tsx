import { useState } from 'react'
import { useNavigate } from 'react-router'
import { BookmarkPlus, Lightbulb, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { ApiError } from '@/lib/api'
import { createResume, type ResumeVersion } from '@/lib/resumes'
import { formatDateTime } from '@/lib/format'

function errText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback
}

interface Props {
  /** 当前查看的版本，为 null 表示关闭 */
  version: ResumeVersion | null
  onOpenChange: (open: boolean) => void
}

/** 优化版本详情：只读查看优化后全文，并可另存为一份新简历（PRD §3.2 / §3.3） */
export default function ResumeVersionDialog({ version, onOpenChange }: Props) {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  async function handleSaveAsResume() {
    if (!version) return
    setSaving(true)
    try {
      const { resume } = await createResume({
        title: version.label.trim() || '优化简历',
        content: version.optimizedContent,
      })
      toast.success(`已另存为新简历「${resume.title}」`)
      onOpenChange(false)
      navigate(`/resume/${resume.id}/view`)
    } catch (err) {
      toast.error(errText(err, '另存为新简历失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!version} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{version?.label ?? '优化版本'}</DialogTitle>
          <DialogDescription>
            {version ? `${formatDateTime(version.createdAt)} · ${version.suggestionCount} 条优化建议` : ''}
          </DialogDescription>
        </DialogHeader>

        {version && (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {version.jdSnapshot && (
              <section className="space-y-1.5">
                <h4 className="text-xs font-semibold text-slate-500">目标岗位 JD 快照</h4>
                <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                  {version.jdSnapshot}
                </p>
              </section>
            )}

            {version.suggestions.length > 0 && (
              <section className="space-y-1.5">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <Lightbulb className="h-3.5 w-3.5" /> 优化建议
                </h4>
                <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-slate-600">
                  {version.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </section>
            )}

            <Separator />

            <section className="space-y-1.5">
              <h4 className="text-xs font-semibold text-slate-500">优化后全文</h4>
              <p className="whitespace-pre-wrap rounded-lg border border-slate-200 px-3 py-2 font-mono text-[13px] leading-relaxed">
                {version.optimizedContent}
              </p>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            disabled={saving || !version}
            onClick={handleSaveAsResume}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <BookmarkPlus className="mr-2 h-4 w-4" />
            )}
            另存为新简历
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}