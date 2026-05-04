import { useState, useEffect, useMemo, useCallback } from 'react'
import { ServerIcon } from 'lucide-react'
import { api } from './api/client.js'
import { useToast } from './hooks/useToast.js'
import { useAuth } from './hooks/useAuth.js'
import { useAutoRefresh, DEFAULT_INTERVAL } from './hooks/useAutoRefresh.js'
import { Header } from './components/Header.jsx'
import { StatsBar } from './components/StatsBar.jsx'
import { FilterSortBar } from './components/FilterSortBar.jsx'
import { ServerCard } from './components/ServerCard.jsx'
import { ToastStack } from './components/Toast.jsx'
import { AuthModal } from './components/AuthModal.jsx'
import { Footer } from './components/Footer.jsx'
import {
  AddServerModal, BookModal, FreeModal,
  CommentModal, DeleteModal,
} from './components/Modals.jsx'

// ── Filter / sort helpers ─────────────────────────────────────────────────────

function matchesFilters(server, filters) {
  const { componentType } = filters
  if (componentType && server.component_type !== componentType) return false
  const { text, status, env, appSearch, bookedOnly, reachableOnly } = filters
  if (text      && !server.dns.toLowerCase().includes(text.toLowerCase()))                    return false
  if (status !== 'all' && server.status_label !== status)                                     return false
  if (env       && server.environment !== env)                                                return false
  if (appSearch && !(server.raw_rpmqa ?? '').toLowerCase().includes(appSearch.toLowerCase())) return false
  if (bookedOnly    && server.is_available)  return false
  if (reachableOnly && !server.reachable)    return false
  return true
}

const STATUS_ORDER = { available: 0, booked: 1, unreachable: 2, unknown: 3 }

function sortServers(servers, { key, dir }) {
  const mul = dir === 'asc' ? 1 : -1
  return [...servers].sort((a, b) => {
    let av, bv
    switch (key) {
      case 'dns':       av = a.dns.toLowerCase();               bv = b.dns.toLowerCase();               break
      case 'env':       av = a.environment ?? '';               bv = b.environment ?? '';               break
      case 'status':    av = STATUS_ORDER[a.status_label] ?? 3; bv = STATUS_ORDER[b.status_label] ?? 3; break
      case 'booked_by': av = a.booked_by ?? '';                 bv = b.booked_by ?? '';                 break
      case 'duration': {
        const e = s => s.booked_since ? Date.now() - new Date(s.booked_since).getTime() : -1
        av = e(a); bv = e(b); break
      }
      case 'updated':
        av = a.last_updated ? new Date(a.last_updated).getTime() : 0
        bv = b.last_updated ? new Date(b.last_updated).getTime() : 0
        break
      default: av = ''; bv = ''
    }
    if (av < bv) return -1 * mul
    if (av > bv) return  1 * mul
    return 0
  })
}

const NO_MODAL = { type: null, server: null }
function isConflict(err) { return err?.status === 409 }

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [servers,       setServers]       = useState([])
  const [loading,       setLoading]       = useState(true)
  const [refreshing,    setRefreshing]    = useState(false)
  const [updating,      setUpdating]      = useState(new Set())
  const [modal,         setModal]         = useState(NO_MODAL)
  const [modalLoading,  setModalLoading]  = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [autoInterval,  setAutoInterval]  = useState(DEFAULT_INTERVAL)
  const [filters, setFilters] = useState({
    text: '', status: 'all', env: '', appSearch: '', componentType: '',
    bookedOnly: false, reachableOnly: false,
  })
  const [sort, setSort] = useState({ key: 'dns', dir: 'asc' })

  const { toasts, success, error: toastError, info } = useToast()
  const auth = useAuth()

  // ── Initial load ──────────────────────────────────────────────────────────

  const loadServers = useCallback(async () => {
    setLoading(true)
    try   { setServers(await api.getAllServers()) }
    catch (e) { toastError(`Failed to load servers: ${e.message}`) }
    finally { setLoading(false) }
  }, [toastError])

  useEffect(() => { loadServers() }, [loadServers])

  // ── Silent background fetch (used by auto-refresh) ────────────────────────
  // No toast, no loading spinner — just quietly updates the data.

  const silentFetch = useCallback(async () => {
    try {
      const data = await api.getAllServers()
      setServers(data)
    } catch { /* network blip — silently ignore, will retry next tick */ }
  }, [])

  const { timeAgo, markRefreshed } = useAutoRefresh(silentFetch, autoInterval)

  // ── Derived ───────────────────────────────────────────────────────────────

  const componentTypes = useMemo(() =>
    [...new Set(servers.map(s => s.component_type).filter(Boolean))].sort()
  , [servers])

  const environments  = useMemo(() =>
    [...new Set(servers.map(s => s.environment).filter(Boolean))].sort()
  , [servers])

  const sortedServers = useMemo(() => sortServers(servers, sort), [servers, sort])
  const visibleCount  = useMemo(
    () => sortedServers.filter(s => matchesFilters(s, filters)).length,
    [sortedServers, filters],
  )

  // ── Conflict handler ──────────────────────────────────────────────────────

  async function handleConflict(dns) {
    toastError('This server was modified by someone else. Refreshing its data…')
    setModal(NO_MODAL)
    try {
      const fresh = await api.getServer(dns)
      setServers(prev => prev.map(s => s.dns === dns ? fresh : s))
    } catch { /* will be fixed by next auto-refresh */ }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async function handleLogin(username, password) {
    const ok = await auth.login(username, password)
    if (ok) { setShowAuthModal(false); success(`Signed in as ${username}`) }
  }

  async function handleLogout() { await auth.logout(); info('Signed out') }

  // ── Manual refresh (SSH poll — authenticated) ─────────────────────────────

  async function handleRefreshAll() {
    setRefreshing(true)
    info('Refreshing all servers…')
    try {
      setServers(await api.updateAllServers())
      markRefreshed()
      success('All servers refreshed')
    } catch (e) { toastError(`Refresh failed: ${e.message}`) }
    finally { setRefreshing(false) }
  }

  async function handleUpdateOne(dns) {
    setUpdating(prev => new Set([...prev, dns]))
    try {
      const updated = await api.updateServer(dns)
      setServers(prev => prev.map(s => s.dns === dns ? updated : s))
      success(`${dns} refreshed`)
    } catch (e) { toastError(`Update failed: ${e.message}`) }
    finally { setUpdating(prev => { const n = new Set(prev); n.delete(dns); return n }) }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function handleAddServer(dns) {
    setModalLoading(true)
    try {
      const s = await api.addServer(dns)
      setServers(prev => [s, ...prev])
      setModal(NO_MODAL); success(`Added: ${dns}`)
    } catch (e) { toastError(`Add failed: ${e.message}`) }
    finally { setModalLoading(false) }
  }

  async function handleDelete(dns, version) {
    setModalLoading(true)
    try {
      await api.deleteServer(dns, version)
      setServers(prev => prev.filter(s => s.dns !== dns))
      setModal(NO_MODAL); success(`Removed: ${dns}`)
    } catch (e) {
      if (isConflict(e)) { await handleConflict(dns) }
      else toastError(`Delete failed: ${e.message}`)
    } finally { setModalLoading(false) }
  }

  async function handleBook(dns, version, user, comment, hours) {
    setModalLoading(true)
    try {
      const updated = await api.bookServer(dns, version, user, comment, hours)
      setServers(prev => prev.map(s => s.dns === dns ? updated : s))
      setModal(NO_MODAL); success(`${dns} booked by ${user}`)
    } catch (e) {
      if (isConflict(e)) { await handleConflict(dns) }
      else toastError(`Booking failed: ${e.message}`)
    } finally { setModalLoading(false) }
  }

  async function handleFree(dns, version, comment) {
    setModalLoading(true)
    try {
      const updated = await api.freeServer(dns, version, comment)
      setServers(prev => prev.map(s => s.dns === dns ? updated : s))
      setModal(NO_MODAL); success(`${dns} is now free`)
    } catch (e) {
      if (isConflict(e)) { await handleConflict(dns) }
      else toastError(`Free failed: ${e.message}`)
    } finally { setModalLoading(false) }
  }

  async function handleChangeComment(dns, version, comment) {
    setModalLoading(true)
    try {
      const updated = await api.changeComment(dns, version, comment)
      setServers(prev => prev.map(s => s.dns === dns ? updated : s))
      setModal(NO_MODAL); success('Comment updated')
    } catch (e) {
      if (isConflict(e)) { await handleConflict(dns) }
      else toastError(`Failed: ${e.message}`)
    } finally { setModalLoading(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      <Header
        onAddServer={() => setModal({ type: 'add', server: null })}
        onRefreshAll={handleRefreshAll}
        refreshing={refreshing}
        authenticated={auth.authenticated}
        username={auth.username}
        onLogin={() => setShowAuthModal(true)}
        onLogout={handleLogout}
        interval={autoInterval}
        onIntervalChange={setAutoInterval}
        timeAgo={timeAgo}
      />

      <StatsBar servers={servers} />

      <FilterSortBar
        filters={filters}
        onFilterChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        environments={environments}
        componentTypes={componentTypes}
      />

      <div className="list-header">
        <span className="list-count">
          {loading
            ? 'Loading…'
            : `${visibleCount} of ${servers.length} server${servers.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Skeletons */}
      {loading && (
        <div className="server-list">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="server-card s-unknown" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="card-top">
                <div className="skel" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }} />
                <div className="skel" style={{ height: 14, width: `${140 + i * 30}px` }} />
                <div className="skel" style={{ height: 20, width: 64, borderRadius: 4 }} />
              </div>
              <div className="card-middle">
                <div className="skel" style={{ height: 12, width: '38%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && servers.length === 0 && (
        <div className="empty-state">
          <ServerIcon size={40} className="empty-icon" />
          <span className="empty-title">No servers registered</span>
          <span className="empty-sub">Sign in then click "Add Server" to get started</span>
        </div>
      )}

      {!loading && servers.length > 0 && visibleCount === 0 && (
        <div className="empty-state">
          <ServerIcon size={36} className="empty-icon" />
          <span className="empty-title">No matches</span>
          <span className="empty-sub">Try adjusting your filters</span>
        </div>
      )}

      {!loading && (
        <div className="server-list">
          {sortedServers.map((server, idx) => {
            const visible = matchesFilters(server, filters)
            return (
              <ServerCard
                key={server.dns}
                server={server}
                appSearch={filters.appSearch}
                updating={updating.has(server.dns)}
                authenticated={auth.authenticated}
                onBook={s    => setModal({ type: 'book',    server: s })}
                onFree={s    => setModal({ type: 'free',    server: s })}
                onDelete={s  => setModal({ type: 'delete',  server: s })}
                onUpdate={dns => handleUpdateOne(dns)}
                onChangeComment={s => setModal({ type: 'comment', server: s })}
                style={{
                  animationDelay: `${Math.min(idx, 15) * 35}ms`,
                  animation: 'fadeSlideUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
                  ...(visible ? {} : {
                    opacity: 0, transform: 'scale(0.99)',
                    maxHeight: 0, padding: 0, margin: 0,
                    borderWidth: 0, overflow: 'hidden', pointerEvents: 'none',
                  }),
                }}
              />
            )
          })}
        </div>
      )}

      {showAuthModal && (
        <AuthModal
          onLogin={handleLogin}
          loading={auth.loading}
          error={auth.error}
          onClearError={auth.clearError}
          onClose={() => { setShowAuthModal(false); auth.clearError() }}
        />
      )}

      {modal.type === 'add' && (
        <AddServerModal onConfirm={handleAddServer} onClose={() => setModal(NO_MODAL)} loading={modalLoading} />
      )}
      {modal.type === 'book' && (
        <BookModal server={modal.server} onConfirm={handleBook} onClose={() => setModal(NO_MODAL)} loading={modalLoading} />
      )}
      {modal.type === 'free' && (
        <FreeModal server={modal.server} onConfirm={handleFree} onClose={() => setModal(NO_MODAL)} loading={modalLoading} />
      )}
      {modal.type === 'comment' && (
        <CommentModal server={modal.server} onConfirm={handleChangeComment} onClose={() => setModal(NO_MODAL)} loading={modalLoading} />
      )}
      {modal.type === 'delete' && (
        <DeleteModal server={modal.server} onConfirm={handleDelete} onClose={() => setModal(NO_MODAL)} loading={modalLoading} />
      )}

      <Footer />

      <ToastStack toasts={toasts} />
    </div>
  )
}
