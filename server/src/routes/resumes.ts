import { Router } from 'express'
import type { Prisma, Resume, ResumeVersion } from '@prisma/client'
import { prisma } from '../db'
import { fail } from '../lib/http'
import { extractResumeText, handleResumeUpload, isAllowedResumeFile } from '../lib/upload'
import { requireAuth } from '../middleware/auth'

/** PRD §3.2：简历正文 ≤ 20,000 字符 */
const CONTENT_MAX = 20000
const PREVIEW_MAX = 80

const router = Router()
router.use(requireAuth)

function preview(content: string): string {
  const firstLine = content.split('\n').find((line) => line.trim().length > 0) ?? ''
  return firstLine.trim().slice(0, PREVIEW_MAX)
}

function toResumeSummary(resume: Resume, versionCount: number) {
  return {
    id: resume.id,
    title: resume.title,
    isDefault: resume.isDefault,
    sourceFile: resume.sourceFile,
    preview: preview(resume.content),
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
    versionCount,
  }
}

function toResumeDetail(resume: Resume, versionCount: number) {
  return { ...toResumeSummary(resume, versionCount), content: resume.content }
}

function toVersion(version: ResumeVersion) {
  const suggestions = Array.isArray(version.suggestions) ? (version.suggestions as string[]) : []
  return {
    id: version.id,
    label: version.label,
    jdSnapshot: version.jdSnapshot,
    optimizedContent: version.optimizedContent,
    suggestions,
    suggestionCount: suggestions.length,
    createdAt: version.createdAt,
  }
}

async function findOwnedResume(id: string, userId: string): Promise<Resume | null> {
  return prisma.resume.findFirst({ where: { id, userId } })
}

router.get('/', async (req, res) => {
  const userId = (req.user!.id)
  const resumes = await prisma.resume.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    include: { _count: { select: { versions: true } } },
  })
  res.json({ resumes: resumes.map((r) => toResumeSummary(r, r._count.versions)) })
})

router.post('/', async (req, res) => {
  const userId = (req.user!.id)
  const { title, content } = (req.body ?? {}) as { title?: unknown; content?: unknown }

  if (typeof title !== 'string' || !title.trim()) {
    return fail(res, 400, 'VALIDATION_ERROR', '请填写简历标题')
  }
  if (content !== undefined && typeof content !== 'string') {
    return fail(res, 400, 'VALIDATION_ERROR', '简历正文格式不正确')
  }
  const text = typeof content === 'string' ? content : ''
  if (text.length > CONTENT_MAX) {
    return fail(res, 400, 'CONTENT_TOO_LONG', `简历正文不能超过 ${CONTENT_MAX} 字符`)
  }

  const existingCount = await prisma.resume.count({ where: { userId } })
  const resume = await prisma.resume.create({
    data: { userId, title: title.trim(), content: text, isDefault: existingCount === 0 },
  })

  res.status(201).json({ resume: toResumeDetail(resume, 0) })
})

router.get('/:id', async (req, res) => {
  const resume = await findOwnedResume(String(req.params.id), (req.user!.id))
  if (!resume) return fail(res, 404, 'NOT_FOUND', '简历不存在')

  const versions = await prisma.resumeVersion.findMany({
    where: { resumeId: resume.id },
    orderBy: { createdAt: 'desc' },
  })

  res.json({ resume: toResumeDetail(resume, versions.length), versions: versions.map(toVersion) })
})

router.put('/:id', async (req, res) => {
  const userId = (req.user!.id)
  const resume = await findOwnedResume(String(req.params.id), userId)
  if (!resume) return fail(res, 404, 'NOT_FOUND', '简历不存在')

  const { title, content, sourceFile, isDefault } = (req.body ?? {}) as {
    title?: unknown
    content?: unknown
    sourceFile?: unknown
    isDefault?: unknown
  }

  const data: Prisma.ResumeUpdateInput = {}

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      return fail(res, 400, 'VALIDATION_ERROR', '简历标题不能为空')
    }
    data.title = title.trim()
  }
  if (content !== undefined) {
    if (typeof content !== 'string') {
      return fail(res, 400, 'VALIDATION_ERROR', '简历正文格式不正确')
    }
    if (content.length > CONTENT_MAX) {
      return fail(res, 400, 'CONTENT_TOO_LONG', `简历正文不能超过 ${CONTENT_MAX} 字符`)
    }
    data.content = content
  }
  if (sourceFile !== undefined) {
    if (sourceFile !== null && typeof sourceFile !== 'string') {
      return fail(res, 400, 'VALIDATION_ERROR', '来源文件名格式不正确')
    }
    data.sourceFile = sourceFile
  }

  const updated = await prisma.$transaction(async (tx) => {
    // PRD §3.2：一个用户仅一份默认简历，设置新默认时自动取消旧的
    if (isDefault === true) {
      await tx.resume.updateMany({
        where: { userId, id: { not: resume.id } },
        data: { isDefault: false },
      })
      data.isDefault = true
    }
    return tx.resume.update({ where: { id: resume.id }, data })
  })

  const versionCount = await prisma.resumeVersion.count({ where: { resumeId: resume.id } })
  res.json({ resume: toResumeDetail(updated, versionCount) })
})

router.delete('/:id', async (req, res) => {
  const resume = await findOwnedResume(String(req.params.id), (req.user!.id))
  if (!resume) return fail(res, 404, 'NOT_FOUND', '简历不存在')

  await prisma.resume.delete({ where: { id: resume.id } }) // 级联删除版本
  res.json({ ok: true })
})

router.post('/:id/upload', handleResumeUpload, async (req, res) => {
  const resume = await findOwnedResume(String(req.params.id), (req.user!.id))
  if (!resume) return fail(res, 404, 'NOT_FOUND', '简历不存在')

  const file = req.file
  if (!file) return fail(res, 400, 'NO_FILE', '请选择要上传的文件')
  if (!isAllowedResumeFile(file)) {
    return fail(res, 400, 'INVALID_FILE_TYPE', '仅支持 PDF / DOCX 文件')
  }

  let text: string
  try {
    text = (await extractResumeText(file)).trim()
  } catch {
    return fail(res, 422, 'PARSE_FAILED', '文件解析失败，请确认文件未加密或损坏')
  }

  if (!text) return fail(res, 422, 'PARSE_EMPTY', '未能从文件中解析出文本内容')
  if (text.length > CONTENT_MAX) {
    return fail(res, 400, 'CONTENT_TOO_LONG', `解析内容超过 ${CONTENT_MAX} 字符，请精简后重试`)
  }

  // 仅返回解析结果，由前端确认后再保存，避免解析异常影响原有正文（PRD §3.2）
  res.json({ content: text, filename: file.originalname })
})

router.post('/:id/versions', async (req, res) => {
  const resume = await findOwnedResume(String(req.params.id), (req.user!.id))
  if (!resume) return fail(res, 404, 'NOT_FOUND', '简历不存在')

  const { label, jdSnapshot, optimizedContent, suggestions } = (req.body ?? {}) as {
    label?: unknown
    jdSnapshot?: unknown
    optimizedContent?: unknown
    suggestions?: unknown
  }

  if (typeof label !== 'string' || !label.trim()) {
    return fail(res, 400, 'VALIDATION_ERROR', '请填写版本名称')
  }
  if (typeof optimizedContent !== 'string' || !optimizedContent.trim()) {
    return fail(res, 400, 'VALIDATION_ERROR', '优化后的简历内容不能为空')
  }
  if (jdSnapshot !== undefined && typeof jdSnapshot !== 'string') {
    return fail(res, 400, 'VALIDATION_ERROR', 'JD 快照格式不正确')
  }
  const suggestionList = Array.isArray(suggestions) ? suggestions.map(String) : []

  const version = await prisma.$transaction(async (tx) => {
    const created = await tx.resumeVersion.create({
      data: {
        resumeId: resume.id,
        label: label.trim(),
        jdSnapshot: typeof jdSnapshot === 'string' ? jdSnapshot : '',
        optimizedContent,
        suggestions: suggestionList,
      },
    })
    // 触发 resumes.updated_at，使列表中的「最近更新」反映最新版本
    await tx.resume.update({ where: { id: resume.id }, data: {} })
    return created
  })

  res.status(201).json({ version: toVersion(version) })
})

export const resumesRouter = router