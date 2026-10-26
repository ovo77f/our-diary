import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import Avatar from './Avatar.jsx'
import RemoteImage from './RemoteImage.jsx'
import Lightbox from './Lightbox.jsx'

export default function CommentList({ comments, onEdit, onDelete, busy = false }) {
  const auth = useAuth()
  const [lightboxPath, setLightboxPath] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit(comment) {
    setEditingId(comment.id)
    setDraft(comment.text || '')
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft('')
    setError('')
  }

  async function submitEdit(comment) {
    if (saving || busy) return
    const text = draft.trim()
    if (!text && !comment.image) {
      setError('댓글 내용을 입력해주세요.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onEdit(comment.id, text)
      cancelEdit()
    } catch (err) {
      setError(err.message || '댓글 수정에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteComment(comment) {
    if (busy || saving) return
    if (!window.confirm('이 댓글을 삭제할까요? 삭제한 댓글은 되돌릴 수 없어요.')) return
    setError('')
    try {
      await onDelete(comment.id)
      if (editingId === comment.id) cancelEdit()
    } catch (err) {
      setError(err.message || '댓글 삭제에 실패했어요.')
    }
  }

  if (!comments || comments.length === 0) {
    return <p className="comment-empty">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>
  }
  return (
    <>
      <ul className="comment-list">
        {comments.map((c) => {
          const member = auth.members.find((m) => m.id === c.author)
          const mine = auth.currentMember?.id === c.author
          const isEditing = editingId === c.id
          return (
            <li key={c.id} className="comment-item">
              <Avatar member={member} size={26} />
              <div className="comment-body">
                <div className="comment-meta">
                  <span className="comment-author">{member?.displayName || c.author}</span>
                  <span className="comment-time">{formatTime(c.createdAt)}</span>
                  {c.editedAt && <span className="comment-time">(수정됨)</span>}
                  {mine && !isEditing && (
                    <span className="comment-actions">
                      <button type="button" className="btn btn-ghost btn-small" disabled={busy || saving} onClick={() => startEdit(c)}>수정</button>
                      <button type="button" className="btn btn-ghost btn-small btn-danger" disabled={busy || saving} onClick={() => deleteComment(c)}>삭제</button>
                    </span>
                  )}
                </div>
                {isEditing ? (
                  <div className="comment-edit">
                    <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} aria-label="댓글 내용 수정" disabled={busy || saving} />
                    {c.image && <p className="comment-time">첨부된 사진은 그대로 유지됩니다.</p>}
                    {error && <p className="setup-error">{error}</p>}
                    <div className="comment-edit-actions">
                      <button type="button" className="btn btn-primary btn-small" disabled={busy || saving || (!draft.trim() && !c.image)} onClick={() => submitEdit(c)}>{saving ? '저장 중...' : '저장'}</button>
                      <button type="button" className="btn btn-ghost btn-small" disabled={saving} onClick={cancelEdit}>취소</button>
                    </div>
                  </div>
                ) : c.text ? <p className="comment-text">{c.text}</p> : null}
                {c.image && (
                  <button type="button" className="comment-image-btn" onClick={() => setLightboxPath(c.image)} aria-label="사진 크게 보기">
                    <RemoteImage path={c.image} className="comment-image" />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <Lightbox path={lightboxPath} onClose={() => setLightboxPath(null)} />
    </>
  )
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
