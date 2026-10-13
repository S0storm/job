import { apiFetch } from './api'

/** PRD §3.6 首页仪表盘：统计口径全部由后端聚合（前端不独立计算） */

export interface OverviewStats {
  appliedTotal: number
  appliedThisMonth: number
  interviewingCount: number
  interviewingHint: string
  weekInterviewCount: number
  nextInterview: { at: string; company: string; type: string } | null
  offerCount: number
  offerHint: string
}

export interface FunnelStage {
  label: string
  count: number
}

export interface ActiveJob {
  id: string
  company: string
  position: string
  city: string | null
  salary: string | null
  source: string | null
  status: 'written' | 'interviewing'
  updatedAt: string
}

export interface WeekEvent {
  id: string
  jobId: string
  company: string
  position: string
  type: string
  eventDate: string
  note: string | null
}

export interface Overview {
  stats: OverviewStats
  funnel: FunnelStage[]
  activeJobs: ActiveJob[]
  weekEvents: WeekEvent[]
}

export function getOverview() {
  return apiFetch<Overview>('/stats/overview')
}