import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { getEntry, loadIndex } from '../lib/dataModel.js'

const MAX_CONCURRENT = 5
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
      // 처음 알림을 켠 시점을 기준으로 새 댓글만 표시합니다.
      let baseline = localStorage.getItem(baselineKey)
      if (!baseline) {
        baseline = new Date().toISOString()
        localStorage.setItem(baselineKey, baseline)
      }
      const { json: index } = await loadIndex(auth.client)
      const jobs = Object.entries(index).flatMap(([date, authors]) =>
        (Array.isArray(authors) ? authors : []).map((author) => ({ date, author })))
      const results = []
      let cursor = 0
      async function worker() {
        while (cursor < jobs.length) {
          const { date, author } = jobs[cursor++]
          const result = await getEntry(auth.client, date, author)
          if (!result?.json) continue
          const comments = result.json.comments || []
          const mine = comments.filter((c) => c.author === memberId)
          for (const comment of comments) {
            if (comment.author === memberId || !comment.createdAt || comment.createdAt <= baseline) continue
            const isMyEntry = author === memberId
            const participatedBefore = mine.some((c) => c.createdAt && c.createdAt < comment.createdAt)
            if (!isMyEntry && !participatedBefore) continue
            results.push({
              id: `${date}/${author}/${comment.id}`,
              date, author, comment,
              type: isMyEntry ? 'mine' : 'reply',
            })
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, jobs.length) }, worker))
      if (currentRun !== runId.current) return
      results.sort((a, b) => b.comment.createdAt.localeCompare(a.comment.createdAt))
      setItems(results)
      setReadIdsState(readIds(key))
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

  const unread = items.filter((item) => !readIdsState.includes(item.id)).length
  function openItem(item) {
    if (!readIdsState.includes(item.id)) {
      const next = [...readIdsState, item.id]
      setReadIdsState(next)
      localStorage.setItem(key, JSON.stringify(next))
    }
    setOpen(false)
    onOpenEntry(item.date, item.author)
  }

  return (
    <div className="notification-wrap">
      <button type="button" className="notification-trigger" onClick={() => { setOpen((v) => !v); if (!open) refresh() }} aria-label={`댓글 알림 ${unread}개`} title="댓글 알림">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
        {unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && <div className="notification-panel">
        <div className="notification-panel-header"><strong>댓글 알림</strong><button className="btn btn-ghost btn-small" onClick={refresh} disabled={loading}>{loading ? '확인 중…' : '새로고침'}</button></div>
        {error && <p className="notification-note">{error}</p>}
        {!loading && !error && items.length === 0 && <p className="notification-note">새 댓글 알림이 없습니다.</p>}
        {loading && items.length === 0 && <p className="notification-note">댓글을 확인하고 있습니다…</p>}
        <div className="notification-items">{items.map((item) => {
          const name = auth.members.find((m) => m.id === item.comment.author)?.displayName || item.comment.author
          const unreadItem = !readIdsState.includes(item.id)
          return <button key={item.id} className={`notification-item ${unreadItem ? 'unread' : ''}`} onClick={() => openItem(item)}>
            <span className="notification-item-title">{unreadItem ? '● ' : ''}{name}님이 {item.type === 'mine' ? '내 일기에 댓글을 남겼어요.' : '내가 댓글 단 일기에 새 댓글을 남겼어요.'}</span>
            <span className="notification-item-date">{item.date}</span>
            {item.comment.text && <span className="notification-item-preview">{item.comment.text}</span>}
          </button>
        })}</div>
      </div>}
    </div>
  )
}
