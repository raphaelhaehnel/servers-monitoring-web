import { useState, useCallback } from 'react'
import { authApi, setToken, clearToken } from '../api/client.js'

/**
 * Manages authentication state for the whole app.
 *
 * The session token is kept in React state (and mirrored into the API
 * client module) – never written to localStorage or sessionStorage, so
 * it is automatically cleared when the tab is closed.
 */
export function useAuth() {
  const [authState, setAuthState] = useState({
    authenticated: false,
    username: null,
    token: null,
    loading: false,
    error: null,
  })

  const login = useCallback(async (username, password) => {
    setAuthState(s => ({ ...s, loading: true, error: null }))
    try {
      const { token, username: user } = await authApi.login(username, password)
      setToken(token)
      setAuthState({ authenticated: true, username: user, token, loading: false, error: null })
      return true
    } catch (err) {
      setAuthState(s => ({ ...s, loading: false, error: err.message }))
      return false
    }
  }, [])

  const logout = useCallback(async () => {
    const { token } = authState
    if (token) {
      try { await authApi.logout(token) } catch { /* ignore */ }
    }
    clearToken()
    setAuthState({ authenticated: false, username: null, token: null, loading: false, error: null })
  }, [authState])

  const clearError = useCallback(() => {
    setAuthState(s => ({ ...s, error: null }))
  }, [])

  return { ...authState, login, logout, clearError }
}
