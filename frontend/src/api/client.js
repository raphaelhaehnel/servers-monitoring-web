/**
 * API client.
 *
 * Mutating calls attach Authorization: Bearer <token> and include the
 * server's current `version` for optimistic concurrency control.
 * A HTTP 409 means another user modified the record first — the caller
 * should show a "please refresh" error and NOT apply the stale update.
 */

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api/v1'
const AUTH = (import.meta.env.VITE_API_URL ?? '')

let _token = null
export function setToken(t)  { _token = t }
export function clearToken() { _token = null }
export function getToken()   { return _token }

async function req(method, url, body, requiresAuth = false) {
  const headers = { 'Content-Type': 'application/json' }
  if (requiresAuth && _token) headers['Authorization'] = `Bearer ${_token}`

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return null
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(data?.detail ?? `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return data
}

const pub  = (method, path, body) => req(method, BASE + path, body, false)
const priv = (method, path, body) => req(method, BASE + path, body, true)

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  login:  (username, password) =>
    req('POST', `${AUTH}/auth/login`,  { username, password }, false),
  logout: (token) =>
    req('POST', `${AUTH}/auth/logout`, { token }, false),
  verify: (token) =>
    req('GET',  `${AUTH}/auth/verify?token=${encodeURIComponent(token)}`, undefined, false),
}

// ── Servers ───────────────────────────────────────────────────────────────────

export const api = {
  // Public reads (no token, no version)
  getAllServers: ()          => pub('GET',  '/servers'),
  getServer:    (dns)       => pub('GET',  `/servers/${encodeURIComponent(dns)}`),
  getServers:   (dnsList)   => pub('POST', '/servers/query', { dns_list: dnsList }),

  // Protected writes — version is the server.version the UI last saw
  addServer:    (dns) =>
    priv('POST', '/servers', { dns }),

  deleteServer: (dns, version) =>
    priv('DELETE', `/servers/${encodeURIComponent(dns)}`, { version }),

  bookServer: (dns, version, user, comment, hours) =>
    priv('POST', '/servers/book', { dns, version, user, comment, duration_hours: hours ?? null }),

  freeServer: (dns, version, comment) =>
    priv('POST', '/servers/free', { dns, version, comment: comment ?? null }),

  changeComment: (dns, version, comment) =>
    priv('POST', '/servers/comment', { dns, version, comment }),

  // SSH refresh — no version needed (polls never cause user conflicts)
  updateServer:     (dns) => priv('POST', `/servers/${encodeURIComponent(dns)}/update`),
  updateAllServers: ()    => priv('POST', '/servers/update-all'),
}
