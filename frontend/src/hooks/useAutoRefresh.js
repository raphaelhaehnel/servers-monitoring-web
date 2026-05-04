import { useState, useEffect, useRef, useCallback } from 'react'

// Available interval options exposed to the UI.
// Value is seconds; 0 means "off".
export const INTERVAL_OPTIONS = [
  { label: 'Off',   value: 0 },
  { label: '10s',   value: 10 },
  { label: '30s',   value: 30 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
]

export const DEFAULT_INTERVAL = 10   // seconds

/**
 * Drives background polling and tracks "last refreshed X ago".
 *
 * @param {Function} onRefresh  Async callback executed on each tick.
 *                              Should update server state silently (no toast).
 * @param {number}   interval   Polling interval in seconds (0 = paused).
 *
 * @returns {{ lastRefreshedAt: Date|null, timeAgo: string, triggerNow: Function }}
 */
export function useAutoRefresh(onRefresh, interval) {
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null)
  const [timeAgo,         setTimeAgo]         = useState('')
  const onRefreshRef = useRef(onRefresh)
  const runningRef   = useRef(false)

  // Keep ref current so the interval closure never captures a stale callback.
  useEffect(() => { onRefreshRef.current = onRefresh }, [onRefresh])

  // ── "X ago" ticker — updates every second ────────────────────────────────
  useEffect(() => {
    function tick() {
      if (!lastRefreshedAt) { setTimeAgo(''); return }
      const s = Math.floor((Date.now() - lastRefreshedAt.getTime()) / 1000)
      if (s <  5)  { setTimeAgo('just now'); return }
      if (s < 60)  { setTimeAgo(`${s}s ago`); return }
      const m = Math.floor(s / 60)
      if (m < 60)  { setTimeAgo(`${m}m ago`); return }
      setTimeAgo(`${Math.floor(m / 60)}h ago`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [lastRefreshedAt])

  // ── Core refresh executor ─────────────────────────────────────────────────
  const execute = useCallback(async () => {
    if (runningRef.current) return          // skip if previous call still in flight
    runningRef.current = true
    try {
      await onRefreshRef.current()
      setLastRefreshedAt(new Date())
    } finally {
      runningRef.current = false
    }
  }, [])

  // ── Interval scheduler ────────────────────────────────────────────────────
  useEffect(() => {
    if (!interval) return                   // 0 = off
    const id = setInterval(execute, interval * 1000)
    return () => clearInterval(id)
  }, [interval, execute])

  // Expose manual trigger (e.g. the "Refresh All" button also marks the time)
  const markRefreshed = useCallback(() => setLastRefreshedAt(new Date()), [])

  return { lastRefreshedAt, timeAgo, markRefreshed }
}
