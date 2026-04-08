import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './screens/Dashboard'
import Sessions from './screens/Sessions'
import Reports from './screens/Reports'
import Settings from './screens/Settings'
import Login from './screens/Login'
import SignUp from './screens/SignUp'
import CompleteProfile from './screens/CompleteProfile'
import FAQ from './screens/FAQ'
import { SessionProvider, useSessionContext } from './contexts/SessionContext'
import { WebSocketProvider } from './contexts/WebSocketContext'
import { NotificationProvider } from './contexts/NotificationContext'

const PROTOTYPE_MODE = import.meta.env.VITE_PROTOTYPE_MODE === '1';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { supabaseSession, loadingAuth, needsOnboarding } = useSessionContext()

  if (loadingAuth) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 14 }}>
        Loading...
      </div>
    )
  }

  // In prototype mode, skip auth check
  if (PROTOTYPE_MODE) return <>{children}</>

  if (!supabaseSession) {
    return <Navigate to="/login" replace />
  }

  if (needsOnboarding) {
    return <Navigate to="/complete-profile" replace />
  }

  return <>{children}</>
}

function AppWithSession() {
  const { activeSession } = useSessionContext()

  return (
    <WebSocketProvider sessionId={activeSession?.sessionId ?? null}>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/complete-profile" element={<CompleteProfile />} />
            <Route element={
              <AuthGuard>
                <AppLayout />
              </AuthGuard>
            }>
              <Route path="/" element={<Dashboard />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/faq" element={<FAQ />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </WebSocketProvider>
  )
}

export default function App() {
  return (
    <SessionProvider>
      <AppWithSession />
    </SessionProvider>
  )
}
