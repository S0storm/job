import { Routes, Route, Navigate } from 'react-router'
import AppLayout from '@/components/AppLayout'
import RequireAuth from '@/components/RequireAuth'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/lib/auth'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import ResumeList from '@/pages/ResumeList'
import ResumeEdit from '@/pages/ResumeEdit'
import ResumeView from '@/pages/ResumeView'
import Optimize from '@/pages/Optimize'
import JobsBoard from '@/pages/JobsBoard'
import JobDetail from '@/pages/JobDetail'
import Interview from '@/pages/Interview'
import Settings from '@/pages/Settings'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/resume" element={<ResumeList />} />
            <Route path="/resume/:id/view" element={<ResumeView />} />
            <Route path="/resume/:id" element={<ResumeEdit />} />
            <Route path="/optimize" element={<Optimize />} />
            <Route path="/jobs" element={<JobsBoard />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/interview" element={<Interview />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
      </Routes>
      <Toaster position="top-center" />
    </AuthProvider>
  )
}