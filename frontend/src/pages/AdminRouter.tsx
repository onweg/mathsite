import { useAdminAuth } from '../lib/auth'
import { AdminDashboard } from './AdminDashboard'
import { AdminLogin } from './AdminLogin'

export function AdminRouter() {
  const auth = useAdminAuth()

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

  return <AdminDashboard user={auth.user} token={auth.token} onSignOut={auth.signOut} />
}
