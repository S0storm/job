import { apiFetch } from './api'

export interface ResumeSummary {
  id: string
  title: string
  isDefault: boolean
  sourceFile: string | null
  preview: string
  createdAt: string
  updatedAt: string
  versionCount: number
}

export interface ResumeDetail extends ResumeSummary {
  content: string
}

export interface ResumeVersion {
  id: string
  label: string
  jdSnapshot: string
  optimizedContent: string
  suggestions: string[]
  suggestionCount: number
  createdAt: string
}

/** PRD §3.2：简历正文上限 */
export const RESUME_CONTENT_MAX = 20000

export function listResumes() {
  return apiFetch<{ resumes: ResumeSummary[] }>('/resumes')
}

export function getResume(id: string) {
  return apiFetch<{ resume: ResumeDetail; versions: ResumeVersion[] }>(`/resumes/${id}`)
}

export function createResume(input: { title: string; content?: string }) {
  return apiFetch<{ resume: ResumeDetail }>('/resumes', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateResume(
  id: string,
  input: { title?: string; content?: string; sourceFile?: string | null; isDefault?: boolean },
) {
  return apiFetch<{ resume: ResumeDetail }>(`/resumes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteResume(id: string) {
  return apiFetch<{ ok: true }>(`/resumes/${id}`, { method: 'DELETE' })
}

export function uploadResumeFile(id: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return apiFetch<{ content: string; filename: string }>(`/resumes/${id}/upload`, {
    method: 'POST',
    body: form,
  })
}

export function createResumeVersion(
  id: string,
  input: { label: string; jdSnapshot: string; optimizedContent: string; suggestions: string[] },
) {
  return apiFetch<{ version: ResumeVersion }>(`/resumes/${id}/versions`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}