import path from 'node:path'
import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import { fail } from './http'

/** PRD §3.2：上传文件 ≤ 5MB */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const ALLOWED_EXT = new Set(['.pdf', '.docx'])

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
}).single('file')

/** 包装 multer，把体积/上传错误转换为统一的 400 响应 */
export function handleResumeUpload(req: Request, res: Response, next: NextFunction) {
  multerUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return fail(res, 400, 'FILE_TOO_LARGE', '文件不能超过 5MB')
      }
      return fail(res, 400, 'UPLOAD_ERROR', '文件上传失败，请重试')
    }
    if (err) return fail(res, 400, 'UPLOAD_ERROR', '文件上传失败，请重试')
    next()
  })
}

/** MIME 双重校验：同时校验 Content-Type 与文件扩展名（PRD §3.2） */
export function isAllowedResumeFile(file: Express.Multer.File): boolean {
  const ext = path.extname(file.originalname).toLowerCase()
  return ALLOWED_MIME.has(file.mimetype) && ALLOWED_EXT.has(ext)
}

/** 将 PDF / DOCX 解析为纯文本 */
export async function extractResumeText(file: Express.Multer.File): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase()

  if (ext === '.pdf') {
    const parser = new PDFParse({ data: file.buffer })
    try {
      // pageJoiner 置空，避免默认的“-- n of m --”页边界标记混入简历正文
      const parsed = await parser.getText({ pageJoiner: '' })
      return parsed.text
    } finally {
      await parser.destroy()
    }
  }

  const parsed = await mammoth.extractRawText({ buffer: file.buffer })
  return parsed.value
}