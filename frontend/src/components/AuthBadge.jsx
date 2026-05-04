import { ShieldCheck, ShieldOff, LogOut, LogIn } from 'lucide-react'

/**
 * Compact auth indicator shown in the header.
 * - Authenticated:   green shield + username + logout button
 * - Unauthenticated: grey shield  + "Sign in" button
 */
export function AuthBadge({ authenticated, username, onLogin, onLogout }) {
  if (authenticated) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(34,212,138,0.08)',
        border: '1px solid rgba(34,212,138,0.22)',
        borderRadius: 8,
        padding: '5px 10px 5px 8px',
      }}>
        <ShieldCheck size={14} style={{ color: 'var(--available)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: 'var(--available)', fontFamily: 'var(--font-mono)' }}>
          {username}
        </span>
        <button
          className="btn btn-sm btn-ghost"
          onClick={onLogout}
          title="Sign out"
          style={{ height: 24, padding: '0 8px', fontSize: 11 }}
        >
          <LogOut size={11} />
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: 'rgba(107,114,128,0.08)',
      border: '1px solid rgba(107,114,128,0.2)',
      borderRadius: 8,
      padding: '5px 10px 5px 8px',
    }}>
      <ShieldOff size={14} style={{ color: 'var(--unknown)', flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--unknown)', fontFamily: 'var(--font-mono)' }}>
        Read only
      </span>
      <button
        className="btn btn-sm btn-primary"
        onClick={onLogin}
        style={{ height: 24, padding: '0 10px', fontSize: 11 }}
      >
        <LogIn size={11} />
        Sign in
      </button>
    </div>
  )
}
