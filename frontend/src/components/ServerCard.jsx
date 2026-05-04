import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, BookOpen, BookX, MessageSquare, Trash2,
  ChevronDown, ChevronUp, Clock, User, Activity, Package,
  Lock, AlertTriangle, AlertOctagon, History,
  PlusCircle, LogIn, LogOut, FileText, Copy, Check,
  Network, Cpu, Database, HelpCircle,
} from 'lucide-react'

// ── Clipboard copy hook ───────────────────────────────────────────────────────

function useCopy(timeout = 1800) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), timeout)
    })
  }, [timeout])
  return { copied, copy }
}

// ── Expiry computation ────────────────────────────────────────────────────────

const WARNING_THRESHOLD_MS = 15 * 60 * 1000

function computeExpiry(bookedSince, durationHours) {
  if (!bookedSince || !durationHours) return { state: 'ok', countdown: null }
  const elapsedMs = Date.now() - new Date(bookedSince).getTime()
  const remainMs  = durationHours * 3600000 - elapsedMs
  if (remainMs <= 0) return { state: 'overdue',  countdown: formatDuration(Math.abs(remainMs)) + ' overdue' }
  if (remainMs <= WARNING_THRESHOLD_MS) return { state: 'warning', countdown: formatDuration(remainMs) + ' left' }
  return { state: 'ok', countdown: null }
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

function useExpiry(bookedSince, durationHours) {
  const [expiry, setExpiry] = useState(() => computeExpiry(bookedSince, durationHours))
  useEffect(() => {
    if (!bookedSince || !durationHours) return
    setExpiry(computeExpiry(bookedSince, durationHours))
    const id = setInterval(() => setExpiry(computeExpiry(bookedSince, durationHours)), 30_000)
    return () => clearInterval(id)
  }, [bookedSince, durationHours])
  return expiry
}

// ── Component type metadata ───────────────────────────────────────────────────
// Add a new entry here when a new component type is added on the backend.

const COMPONENT_META = {
  Gateway: {
    icon:        Network,
    color:       '#818cf8',   // indigo
    bg:          'rgba(129,140,248,0.10)',
    border:      'rgba(129,140,248,0.22)',
    detailLabel: 'Gateways',
  },
  Microservice: {
    icon:        Cpu,
    color:       '#22d3ee',   // cyan
    bg:          'rgba(34,211,238,0.10)',
    border:      'rgba(34,211,238,0.22)',
    detailLabel: 'Service',
  },
  RedisWriter: {
    icon:        Database,
    color:       '#fb923c',   // orange
    bg:          'rgba(251,146,60,0.10)',
    border:      'rgba(251,146,60,0.22)',
    detailLabel: 'Writers',
  },
}

function getComponentMeta(type) {
  return COMPONENT_META[type] ?? {
    icon:        HelpCircle,
    color:       'var(--text3)',
    bg:          'rgba(107,114,128,0.08)',
    border:      'rgba(107,114,128,0.18)',
    detailLabel: 'Details',
  }
}

// ── Component section ─────────────────────────────────────────────────────────

// Status string → { color, bg, border } for instance/detail coloring
function statusStyle(status) {
  if (!status) return {}
  const s = status.toLowerCase()
  if (s === 'active')        return {
    color: 'var(--available)', background: 'rgba(34,212,138,0.07)',
    borderColor: 'rgba(34,212,138,0.22)',
  }
  if (s === 'server down')   return {
    color: 'var(--unreachable)', background: 'rgba(248,113,113,0.07)',
    borderColor: 'rgba(248,113,113,0.22)',
  }
  // Invalid State or anything else → yellow/warning
  return {
    color: 'var(--warning)', background: 'rgba(245,158,11,0.07)',
    borderColor: 'rgba(245,158,11,0.22)',
  }
}

function StatusDot({ status }) {
  const s = statusStyle(status)
  return (
    <span
      className="instance-dot"
      style={{ background: s.color ?? 'var(--text3)' }}
    />
  )
}

function ComponentSection({ server }) {
  const type = server.component_type
  if (!type) return null

  const meta      = getComponentMeta(type)
  const Icon      = meta.icon
  const instances = server.component_instances ?? []
  const details   = server.component_details   ?? []

  // ── Microservice — single row: [Type badge] [ServiceName colored by health] [IP]
  if (type === 'Microservice') {
    const inst = instances[0]
    const svcName = details[0] ?? inst?.name ?? '—'
    const style = statusStyle(inst?.status)
    return (
      <div className="component-section">
        <div className="component-row">
          <span
            className="component-type-badge"
            style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
          >
            <Icon size={10} />{type}
          </span>
          <span className="detail-tag" style={style} title={inst?.status ?? ''}>
            {inst && <StatusDot status={inst.status} />}
            {svcName}
          </span>
          {server.server_ip && <span className="component-ip">{server.server_ip}</span>}
        </div>
      </div>
    )
  }

  // ── Gateway — single row: [Type badge] [GW-Name colored by health] … [IP]
  // Instance names come from Status; each colored by its own health.
  if (type === 'Gateway') {
    return (
      <div className="component-section">
        <div className="component-row">
          <span
            className="component-type-badge"
            style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
          >
            <Icon size={10} />{type}
          </span>
          <div className="component-instances">
            {instances.map((inst, i) => {
              const style = statusStyle(inst.status)
              return (
                <span key={i} className="detail-tag" style={style} title={inst.status}>
                  <StatusDot status={inst.status} />
                  {inst.name}
                </span>
              )
            })}
          </div>
          {server.server_ip && <span className="component-ip">{server.server_ip}</span>}
        </div>
        {/* Installed gateway software names from fk command, if different from instances */}
        {details.length > 0 && (
          <div className="component-row component-details-row">
            <span className="fl">{meta.detailLabel}</span>
            <div className="component-details">
              {details.map((d, i) => <span key={i} className="detail-tag">{d}</span>)}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── RedisWriter / Unknown — instances as colored tags, same pattern
  return (
    <div className="component-section">
      <div className="component-row">
        <span
          className="component-type-badge"
          style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
        >
          <Icon size={10} />{type}
        </span>
        <div className="component-instances">
          {instances.map((inst, i) => {
            const style = statusStyle(inst.status)
            return (
              <span key={i} className="detail-tag" style={style} title={inst.status}>
                <StatusDot status={inst.status} />
                {inst.name}
              </span>
            )
          })}
        </div>
        {server.server_ip && <span className="component-ip">{server.server_ip}</span>}
      </div>
      {details.length > 0 && (
        <div className="component-row component-details-row">
          <span className="fl">{meta.detailLabel}</span>
          <div className="component-details">
            {details.map((d, i) => <span key={i} className="detail-tag">{d}</span>)}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Audit log helpers ─────────────────────────────────────────────────────────

const ACTION_META = {
  registered:      { icon: PlusCircle, color: 'var(--accent)',   label: 'Registered' },
  booked:          { icon: LogIn,      color: 'var(--booked)',   label: 'Booked'     },
  freed:           { icon: LogOut,     color: 'var(--available)',label: 'Freed'      },
  comment_changed: { icon: FileText,   color: 'var(--text3)',    label: 'Comment'    },
}

function formatTimestamp(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleString(undefined, {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function AuditLog({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="audit-log audit-empty">
        <History size={13} style={{ opacity: 0.3 }} />
        <span>No history yet</span>
      </div>
    )
  }
  const entries = [...history].reverse()
  return (
    <div className="audit-log">
      {entries.map((entry, i) => {
        const meta = ACTION_META[entry.action] ?? ACTION_META.comment_changed
        const Icon = meta.icon
        const isLast = i === entries.length - 1
        return (
          <div key={entry.id ?? i} className={`audit-entry${isLast ? ' audit-entry-last' : ''}`}>
            <div className="audit-timeline">
              <div className="audit-dot" style={{ background: meta.color }} />
              {!isLast && <div className="audit-line" />}
            </div>
            <div className="audit-content">
              <div className="audit-header">
                <Icon size={11} style={{ color: meta.color, flexShrink: 0 }} />
                <span className="audit-action" style={{ color: meta.color }}>{meta.label}</span>
                {entry.by && <span className="audit-by">by {entry.by}</span>}
                <span className="audit-time">{formatTimestamp(entry.timestamp)}</span>
              </div>
              {entry.detail && <div className="audit-detail">{entry.detail}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Other helpers ─────────────────────────────────────────────────────────────

function timeSince(dateStr) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function bookedDuration(bookedSince, durationHours) {
  if (!bookedSince) return null
  const elapsedH   = (Date.now() - new Date(bookedSince).getTime()) / 3600000
  const elapsedStr = elapsedH < 1 ? `${Math.floor(elapsedH * 60)}m` : `${elapsedH.toFixed(1)}h`
  if (durationHours) {
    const pct = Math.min(100, Math.round((elapsedH / durationHours) * 100))
    return `${elapsedStr} / ${durationHours}h (${pct}%)`
  }
  return `${elapsedStr} elapsed`
}

function highlightApp(text, query) {
  if (!query || !text) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (<>{text.slice(0, idx)}<span className="app-hl">{text.slice(idx, idx + query.length)}</span>{text.slice(idx + query.length)}</>)
}

const STATUS_LABEL = {
  available: 'Available', booked: 'Booked',
  unreachable: 'Unreachable', unknown: 'Unknown',
}

const AUTH_TOOLTIP = 'You need to be authenticated to perform this operation'

function ActionBtn({ authenticated, className, onClick, title, disabled, children, style }) {
  const blocked = !authenticated
  return (
    <button
      className={className}
      onClick={blocked ? undefined : onClick}
      disabled={disabled && !blocked}
      title={blocked ? AUTH_TOOLTIP : title}
      style={{ ...style, ...(blocked ? { opacity: 0.38, cursor: 'not-allowed' } : {}) }}
    >
      {blocked ? <><Lock size={10} style={{ flexShrink: 0 }} />{children}</> : children}
    </button>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ServerCard({
  server, appSearch, updating, authenticated,
  onBook, onFree, onDelete, onUpdate, onChangeComment,
  style,
}) {
  const [showApps,    setShowApps]    = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const { copied, copy } = useCopy()

  const sl        = server.status_label ?? 'unknown'
  const booked    = sl === 'booked'
  const appLines  = (server.raw_rpmqa ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  const filteredApps = appSearch
    ? appLines.filter(l => l.toLowerCase().includes(appSearch.toLowerCase()))
    : appLines
  const duration  = bookedDuration(server.booked_since, server.booking_duration_hours)
  const updated   = timeSince(server.last_updated)
  const histCount = server.history?.length ?? 0

  const { state: expiryState, countdown } = useExpiry(
    server.booked_since, server.booking_duration_hours,
  )
  const expiryClass = booked && expiryState !== 'ok' ? ` card-${expiryState}` : ''

  return (
    <div
      className={`server-card s-${sl}${updating ? ' card-updating' : ''}${expiryClass}`}
      style={style}
    >
      {/* ── Top row: dot · dns · copy · env · status · expiry · actions ── */}
      <div className="card-top">
        <span className={`s-dot ${sl}`} />
        <span className="dns-name" title={server.dns}>{server.dns}</span>
        <button
          className={`btn btn-sm btn-icon btn-ghost copy-dns-btn${copied ? ' copy-dns-copied' : ''}`}
          onClick={() => copy(server.dns)}
          title={copied ? 'Copied!' : `Copy ${server.dns}`}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
        </button>

        {server.environment && <span className="badge badge-env">{server.environment}</span>}
        <span className={`badge badge-${sl}`}>{STATUS_LABEL[sl]}</span>

        {booked && expiryState === 'warning' && (
          <span className="badge badge-expiry-warning" title={`Booking expires soon: ${countdown}`}>
            <AlertTriangle size={10} />{countdown}
          </span>
        )}
        {booked && expiryState === 'overdue' && (
          <span className="badge badge-expiry-overdue" title="This booking has exceeded its intended duration">
            <AlertOctagon size={10} />{countdown}
          </span>
        )}

        <div className="card-actions">
          {booked ? (
            <ActionBtn authenticated={authenticated} className="btn btn-sm btn-ghost"
              onClick={() => onFree(server)} title="Free this server">
              <BookX size={12} /> Free
            </ActionBtn>
          ) : (
            <ActionBtn authenticated={authenticated} className="btn btn-sm btn-primary"
              onClick={() => onBook(server)} disabled={sl === 'unreachable'} title="Book this server">
              <BookOpen size={12} /> Book
            </ActionBtn>
          )}
          <ActionBtn authenticated={authenticated} className="btn btn-sm btn-icon btn-ghost"
            onClick={() => onChangeComment(server)} title="Edit comment">
            <MessageSquare size={12} />
          </ActionBtn>
          <ActionBtn authenticated={authenticated} className="btn btn-sm btn-icon btn-ghost"
            onClick={() => onUpdate(server.dns)} disabled={updating} title="Refresh via SSH">
            <RefreshCw size={12} style={updating ? { animation: 'spin 0.7s linear infinite' } : {}} />
          </ActionBtn>
          <button
            className={`btn btn-sm btn-icon btn-ghost${showHistory ? ' btn-active' : ''}`}
            onClick={() => setShowHistory(v => !v)}
            title={showHistory ? 'Hide history' : `Show history (${histCount} event${histCount !== 1 ? 's' : ''})`}
            style={showHistory ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
          >
            <History size={12} />
            {histCount > 0 && <span className="history-count">{histCount}</span>}
          </button>
          <ActionBtn authenticated={authenticated} className="btn btn-sm btn-icon btn-danger"
            onClick={() => onDelete(server)} title="Remove server">
            <Trash2 size={12} />
          </ActionBtn>
        </div>
      </div>

      {/* ── Component section: type · instances · details ── */}
      <ComponentSection server={server} />

      {/* ── Booking row (only when booked) ── */}
      {booked && (server.booked_by || duration) && (
        <div className="card-middle">
          {server.booked_by && (
            <div className="field">
              <User size={10} style={{ color: 'var(--text3)', flexShrink: 0 }} />
              <span className="fl">by</span>
              <span className="fv bk">{server.booked_by}</span>
            </div>
          )}
          {duration && (
            <div className="field">
              <Clock size={10} style={{ flexShrink: 0, color: expiryState === 'overdue' ? 'var(--overdue)' : expiryState === 'warning' ? 'var(--warning)' : 'var(--text3)' }} />
              <span className="fl">time</span>
              <span className="fv" style={{
                color: expiryState === 'overdue' ? 'var(--overdue)' : expiryState === 'warning' ? 'var(--warning)' : undefined,
                fontWeight: expiryState !== 'ok' ? 600 : undefined,
              }}>{duration}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Bottom row: apps · comment · last updated ── */}
      <div className="card-bottom">
        {appLines.length > 0 && (
          <div className="field" style={{ alignItems: 'center' }}>
            <Package size={10} style={{ color: 'var(--text3)', flexShrink: 0 }} />
            <span className="fl">pkgs</span>
            <span className="fv app">
              {appSearch && filteredApps.length > 0
                ? highlightApp(filteredApps[0], appSearch)
                : server.installed_applications}
              {appSearch && filteredApps.length > 1 && (
                <span style={{ color: 'var(--accent)', marginLeft: 6 }}>+{filteredApps.length - 1}</span>
              )}
            </span>
            <button
              className="btn btn-sm btn-icon btn-ghost"
              style={{ width: 22, height: 22, marginLeft: 4 }}
              onClick={() => setShowApps(v => !v)}
              title={showApps ? 'Collapse' : 'Expand package list'}
            >
              {showApps ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          </div>
        )}
        {server.comment && (
          <div className="field">
            <MessageSquare size={10} style={{ color: 'var(--text3)', flexShrink: 0 }} />
            <span className="fv it">{server.comment}</span>
          </div>
        )}
        {updated && (
          <div className="field" style={{ marginLeft: 'auto' }}>
            <Clock size={10} style={{ color: 'var(--text3)', flexShrink: 0 }} />
            <span className="fv" style={{ color: 'var(--text3)', fontSize: 11 }}>{updated}</span>
          </div>
        )}
      </div>

      {/* ── Expanded package list ── */}
      {showApps && appLines.length > 0 && (
        <div className="apps-expanded">
          {appLines.map((line, i) => {
            const isMatch = appSearch && line.toLowerCase().includes(appSearch.toLowerCase())
            return (
              <span key={i} className={`app-line${isMatch ? ' hl' : ''}`}>
                {appSearch ? highlightApp(line, appSearch) : line}
              </span>
            )
          })}
        </div>
      )}

      {/* ── Audit log ── */}
      {showHistory && (
        <div className="audit-wrap">
          <div className="audit-wrap-header">
            <History size={11} style={{ color: 'var(--text3)' }} />
            <span>History</span>
            <span className="audit-count">{histCount} event{histCount !== 1 ? 's' : ''}</span>
          </div>
          <AuditLog history={server.history} />
        </div>
      )}
    </div>
  )
}
