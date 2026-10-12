import { useEffect, useState } from 'react'
import { AdminUser, me } from './api'

const TOKEN_KEY = 'mathsite.admin.token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore (private mode) */
  }
}

type AuthState =
  | { status: 'loading' }
  | { status: 'anon' }
  | { status: 'authed'; user: AdminUser; token: string }

export function useAdminAuth(): AuthState & {
  signIn: (user: AdminUser, token: string) => void
  signOut: () => void
} {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setState({ status: 'anon' })
      return
    }
    me(token)
      .then((user) => setState({ status: 'authed', user, token }))
      .catch(() => {
        setToken(null)
        setState({ status: 'anon' })
      })
  }, [])

  return {
    ...state,
    signIn: (user, token) => {
      setToken(token)
      setState({ status: 'authed', user, token })
    },
    signOut: () => {
      setToken(null)
      setState({ status: 'anon' })
    },
  }
}
