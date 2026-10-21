import { useEffect } from 'react'
import { useAdminAuth } from '../lib/auth'
import { AdminDashboard } from './AdminDashboard'
import { AdminLogin } from './AdminLogin'
import { PrintClassPage } from './admin/PrintClassPage'
import { PrintQuizPage } from './admin/PrintQuizPage'

export function AdminRouter() {
  const auth = useAdminAuth()
  const path = typeof window !== 'undefined' ? window.location.pathname : ''

  // На главной есть custom cursor (body { cursor: none }).
  // В админке он мешает — работаем системным курсором.
  useEffect(() => {
    const prev = document.body.style.cursor
    document.body.style.cursor = 'auto'
    return () => {
      document.body.style.cursor = prev
    }
  }, [])

  if (auth.status === 'loading') {
    return (
      <div className="min-h-screen bg-ink-950 text-paper-50/50 flex items-center justify-center text-sm">
        загрузка…
      </div>
    )
  }

  if (auth.status === 'anon') {
    return <AdminLogin onSuccess={auth.signIn} />
  }

  if (path.startsWith('/admin/print-quiz')) {
    return <PrintQuizPage token={auth.token} />
  }

  if (path.startsWith('/admin/print')) {
    return <PrintClassPage token={auth.token} />
  }

  return <AdminDashboard user={auth.user} token={auth.token} onSignOut={auth.signOut} />
}
