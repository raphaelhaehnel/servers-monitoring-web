import { RefreshCw, Plus } from 'lucide-react'
import { AuthBadge } from './AuthBadge.jsx'
import { INTERVAL_OPTIONS } from '../hooks/useAutoRefresh.js'

export function Header({
  onAddServer, onRefreshAll, refreshing,
  authenticated, username, onLogin, onLogout,
  interval, onIntervalChange,
  timeAgo,
}) {
  return (
    <header className="header">
      <div className="header-brand">
        <h1 className="header-title">Fac<span>IT</span></h1>
        <span className="header-sep">/</span>
        <span className="header-sub">Infrastructure Monitor</span>
      </div>

      <div className="header-actions">
        <AuthBadge
          authenticated={authenticated}
          username={username}
          onLogin={onLogin}
          onLogout={onLogout}
        />

        {/* ── Auto-refresh controls ── */}
        <div className="autorefresh-group">
          {/* Last-refreshed indicator */}
          {timeAgo && (
            <span className="autorefresh-ago" title="Time since last background refresh">
              {timeAgo}
            </span>
          )}

          {/* Interval selector */}
          <div className="autorefresh-selector" title="Auto-refresh interval">
            <RefreshCw size={11} className="autorefresh-icon" style={interval > 0 ? { color: 'var(--accent)' } : {}} />
            <select
              className="autorefresh-sel"
              value={interval}
              onChange={e => onIntervalChange(Number(e.target.value))}
            >
              {INTERVAL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Manual refresh */}
          <button
            className="btn btn-ghost"
            onClick={onRefreshAll}
            disabled={refreshing || !authenticated}
            title={!authenticated ? 'You need to be authenticated to perform this operation' : 'Refresh all servers via SSH now'}
            style={!authenticated ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
          >
            <RefreshCw
              size={13}
              style={refreshing ? { animation: 'spin 0.7s linear infinite' } : {}}
            />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <button
          className="btn btn-primary"
          onClick={onAddServer}
          disabled={!authenticated}
          title={!authenticated ? 'You need to be authenticated to perform this operation' : 'Add a new server'}
          style={!authenticated ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
        >
          <Plus size={13} />
          Add Server
        </button>
      </div>
    </header>
  )
}
