import { useEffect, useState } from 'react'
import { StudentPublicDTO, studentAuth } from './api'

type State =
  | { status: 'loading' }
  | { status: 'anon' }
  | { status: 'authed'; student: StudentPublicDTO }

/**
 * Хук состояния ученика. Читает cookie через GET /students/me на монтировании.
 * Null → ученик анонимный (это нормальный режим — всегда можно пройти без логина).
 */
export function useStudent(): State & { signOut: () => Promise<void>; reload: () => Promise<void> } {
  const [state, setState] = useState<State>({ status: 'loading' })

  async function reload() {
    const s = await studentAuth.me()
    if (s) setState({ status: 'authed', student: s })
    else setState({ status: 'anon' })
  }

  useEffect(() => {
    reload()
  }, [])

  return {
    ...state,
    reload,
    signOut: async () => {
      await studentAuth.logout().catch(() => {})
      setState({ status: 'anon' })
    },
  }
}
