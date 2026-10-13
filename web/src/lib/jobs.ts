import { apiFetch } from './api'

/** PRD §3.4 求职进度状态机（与 shared/types.ts 保持一致） */
export type JobStatus = 'wish' | 'applied' | 'written' | 'interviewing' | 'offer' | 'ended'

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  wish: '意向',
  applied: '已投递',
  written: '笔试中',
  interviewing: '面试中',
  offer: 'Offer',
  ended: '已结束',
}

export const JOB_STATUS_FLOW: JobStatus[] = ['wish', 'applied', 'written', 'interviewing', 'offer']

/** 看板 6 列（顺序固定，PRD §3.4） */
export const KANBAN_COLUMNS: { key: JobStatus; label: string; color: string }[] = [
  { key: 'wish', label: '意向', color: 'bg-slate-400' },
  { key: 'applied', label: '已投递', color: 'bg-blue-500' },
  { key: 'written', label: '笔试中', color: 'bg-amber-500' },
  { key: 'interviewing', label: '面试中', color: 'bg-violet-500' },
  { key: 'offer', label: 'Offer', color: 'bg-emerald-500' },
  { key: 'ended', label: '已结束', color: 'bg-rose-500' },
]

export type JobEventType =
  | '投递简历'
  | '笔试'
  | '一面'
  | '二面'
  | 'HR面'
  | 'Offer'
  | '流程终止'

export const JOB_EVENT_TYPES: JobEventType[] = [
  '投递简历',
  '笔试',
  '一面',
  '二面',
  'HR面',
  'Offer',
  '流程终止',
]

export interface JobItem {
  id: string
  company: string
  position: string
  salary: string | null
  city: string | null
  source: string | null
  jdText: string | null
  status: JobStatus
  eventCount: number
  createdAt: string
  updatedAt: string
}

export interface JobEventItem {
  id: string
  jobId: string
  type: JobEventType
  eventDate: string
  note: string | null
  createdAt: string
}

export interface JobInput {
  company: string
  position: string
  salary?: string
  city?: string
  source?: string
  jdText?: string
  status?: JobStatus
}

export function listJobs(status?: JobStatus) {
  const query = status ? `?status=${status}` : ''
  return apiFetch<{ jobs: JobItem[] }>(`/jobs${query}`)
}

export function getJob(id: string) {
  return apiFetch<{ job: JobItem; events: JobEventItem[] }>(`/jobs/${id}`)
}

export function createJob(input: JobInput) {
  return apiFetch<{ job: JobItem }>('/jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateJob(id: string, input: Partial<JobInput>) {
  return apiFetch<{ job: JobItem }>(`/jobs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function updateJobStatus(id: string, status: JobStatus) {
  return apiFetch<{ job: JobItem }>(`/jobs/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function deleteJob(id: string) {
  return apiFetch<{ ok: true }>(`/jobs/${id}`, { method: 'DELETE' })
}

export function createJobEvent(
  jobId: string,
  input: { type: JobEventType; eventDate: string; note?: string },
) {
  return apiFetch<{ event: JobEventItem }>(`/jobs/${jobId}/events`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteJobEvent(id: string) {
  return apiFetch<{ ok: true }>(`/events/${id}`, { method: 'DELETE' })
}