import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { loadNotifications, importPreviousComments } from '../lib/notifications.js'

const keyFor = (auth) => `exchange-diary-notification-read-v1:${auth.session?.owner?.toLowerCase()}/${auth.session?.repo?.toLowerCase()}:${auth.currentMember?.id}`
const baselineKeyFor = (auth) => `exchange-diary-notification-start-v1:${auth.session?.owner?.toLowerCase()}/${auth.session?.repo?.toLowerCase()}:${auth.currentMember?.id}`
function readIds(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}

export default function NotificationBell({ onOpenEntry }) {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [readIdsState, setReadIdsState] = useState([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [historyImported, setHistoryImported] = useState(false)
  const [error, setError] = useState('')
  const runId = useRef(0)
  const key = keyFor(auth)
  const baselineKey = baselineKeyFor(auth)
  const memberId = auth.currentMember?.id

  const refresh = useCallback(async () => {
    if (!auth.client || !memberId) return
    const currentRun = ++runId.current
    setLoading(true)
    setError('')
    try {
      let baseline = localStorage.getItem(baselineKey)
      if (!baseline) {
        baseline = new Date().toISOString()
        localStorage.setItem(baselineKey, baseline)
      }
      const { json } = await loadNotifications(auth.client)
      if (currentRun !== runId.current) return
      const relevant = (json.events || []).filter(e => (e.recipients || []).includes(memberId))
      const storedRead = readIds(key)
      const historicalIds = relevant.filter(e => e.createdAt <= baseline).map(e => e.id)
      const mergedRead = [...new Set([...storedRead, ...historicalIds])]
      if (mergedRead.length !== storedRead.length) localStorage.setItem(key, JSON.stringify(mergedRead))
      setItems(relevant)
      setReadIdsState(mergedRead)
      setHistoryImported(!!json.historyImported)
    } catch (e) {
      if (currentRun === runId.current) setError(e.message || '알림을 불러오지 못했습니다.')
    } finally {
      if (currentRun === runId.current) setLoading(false)
    }
  }, [auth.client, memberId, baselineKey, key])

  useEffect(() => {
    setItems([])
    setReadIdsState(readIds(key))
    setOpen(false)
    refresh()
    const timer = setInterval(refresh, 120000)
    return () => { ++runId.current; clearInterval(timer) }
  }, [refresh, key])

  async function importHistory() {
    if (importing || !auth.client) return
    setImporting(true)
    setError('')
    try {
      // 가져온 과거 댓글은 현재 멤버에게 이미 읽은 알림으로 표시합니다.
      const {json: old} = await loadNotifications(auth.client)
      const oldIds = new Set((old.events || []).map(e => e.id))
      await importPreviousComments(auth.client)
      const {json: updated} = await loadNotifications(auth.client)
      const added = (updated.events || []).filter(e => !oldIds.has(e.id)).map(e => e.id)
      localStorage.setItem(key, JSON.stringify([...new Set([...readIds(key), ...added])]))
      await refresh()
    } catch(e) { setError(e.message || '이전 댓글을 가져오지 못했습니다.') }
    finally { setImporting(false) }
  }

  const unread = items.filter(item => !readIdsState.includes(item.id)).length
  function openItem(item) {
    if (!readIdsState.includes(item.id)) {
      const next = [...readIdsState, item.id]
      setReadIdsState(next)
      localStorage.setItem(key, JSON.stringify(next))
    }
    setOpen(false)
    onOpenEntry(item.date, item.entryAuthor)
  }

  return <div className="notification-wrap">
    <button type="button" className="notification-trigger" onClick={() => { setOpen(v => !v); if (!open) refresh() }} aria-label={`댓글 알림 ${unread}개`} title="댓글 알림">
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
      {unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <div className="notification-panel">
      <div className="notification-panel-header"><strong>댓글 알림</strong><button className="btn btn-ghost btn-small" onClick={refresh} disabled={loading || importing}>{loading ? '확인 중…' : '새로고침'}</button></div>
      {!historyImported && <div className="notification-note">기존 댓글도 알림 목록에 넣으시려면 한 번만 가져오세요. <button type="button" className="btn btn-small" disabled={importing} onClick={importHistory}>{importing ? '가져오는 중…' : '이전 댓글 가져오기'}</button></div>}
      {!historyImported && <p className="notification-note">최근 댓글 알림 최대 100개를 보관합니다. 오래된 알림이 사라져도 댓글은 유지됩니다.</p>}
      {error && <p className="notification-note">{error}</p>}
      {!loading && !error && items.length === 0 && <p className="notification-note">표시할 댓글이 없습니다.</p>}
      {loading && items.length === 0 && <p className="notification-note">댓글을 확인하고 있습니다…</p>}
      <div className="notification-items">{items.map(item => {
        const name = auth.members.find(m => m.id === item.author)?.displayName || item.author
        const unreadItem = !readIdsState.includes(item.id)
        const mine = item.entryAuthor === memberId
        return <button key={item.id} className={`notification-item ${unreadItem ? 'unread' : ''}`} onClick={() => openItem(item)}>
          <span className="notification-item-title">{unreadItem ? '● ' : ''}{name}님이 {mine ? '내 일기에 댓글을 남겼어요.' : '내가 댓글 단 일기에 새 댓글을 남겼어요.'}</span>
          <span className="notification-item-date">{item.date}</span>
          {item.text && <span className="notification-item-preview">{item.text}</span>}
        </button>
      })}</div>
    </div>}
  </div>
}
