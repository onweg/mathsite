import { useAdminAuth } from '../lib/auth'
import { AdminDashboard } from './AdminDashboard'
import { AdminLogin } from './AdminLogin'
import { PrintClassPage } from './admin/PrintClassPage'

export function AdminRouter() {
  const auth = useAdminAuth()
  const path = typeof window !== 'undefined' ? window.location.pathname : ''

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

  if (path.startsWith('/admin/print')) {
    return <PrintClassPage token={auth.token} />
  }

  return <AdminDashboard user={auth.user} token={auth.token} onSignOut={auth.signOut} />
}
