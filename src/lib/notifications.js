import { getEntry, loadIndex } from './dataModel.js'

export const NOTIFICATIONS_PATH = 'notifications.json'
export const NOTIFICATIONS_LIMIT = 100

export async function loadNotifications(client) {
  const result = await client.getJson(NOTIFICATIONS_PATH)
  return result || { json: { version: 1, events: [], historyImported: false }, sha: undefined }
}

export function commentEvent(date, entryAuthor, comment, commentsBefore = []) {
  const recipients = [...new Set([entryAuthor, ...commentsBefore.filter(c => c.createdAt && c.createdAt < comment.createdAt).map(c => c.author)])].filter(id => id !== comment.author)
  return { id: `${date}/${entryAuthor}/${comment.id}`, date, entryAuthor,
    commentId: comment.id, author: comment.author, recipients, createdAt: comment.createdAt,
    text: (comment.text || '').slice(0, 120) }
}

function compact(events) {
  const unique = new Map()
  for (const event of events) if (event?.id && event?.createdAt) unique.set(event.id, event)
  return [...unique.values()].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, NOTIFICATIONS_LIMIT)
}

export async function mutateNotifications(client, updater) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { json, sha } = await loadNotifications(client)
    const next = updater(json)
    if (!next) return
    try {
      await client.putJson(NOTIFICATIONS_PATH, { ...next, version: 1, events: compact(next.events || []) },
        { sha, message: '댓글 알림 기록 갱신' })
      return
    } catch (error) {
      if (error.status === 409 || error.status === 422) continue
      throw error
    }
  }
  throw new Error('알림 기록을 동시에 수정해 저장하지 못했습니다. 잠시 후 다시 시도해주세요.')
}

export async function syncCommentNotifications(client, date, entryAuthor, beforeComments, afterComments) {
  const before = new Map((beforeComments || []).map(c => [c.id, c]))
  const after = new Map((afterComments || []).map(c => [c.id, c]))
  const additions = [...after.values()].filter(c => !before.has(c.id) && c.createdAt).map(c => commentEvent(date, entryAuthor, c, beforeComments))
  const removals = [...before.keys()].filter(id => !after.has(id)).map(id => `${date}/${entryAuthor}/${id}`)
  const updates = [...after.values()].filter(c => before.has(c.id) && c.text !== before.get(c.id).text).map(c => commentEvent(date, entryAuthor, c, beforeComments))
  if (!additions.length && !removals.length && !updates.length) return
  const removed = new Set(removals)
  const updated = new Map(updates.map(c => [c.id,c]))
  await mutateNotifications(client, state => ({ ...state,
    events: [...(state.events || []).filter(e => !removed.has(e.id)).map(e => updated.get(e.id) || e), ...additions] }))
}

// 기존 일기 기록은 사용자가 요청할 때만 한 번 읽습니다. 정기 알림 조회에는 사용하지 않습니다.
export async function importPreviousComments(client) {
  const { json: index } = await loadIndex(client)
  const jobs = Object.entries(index).flatMap(([date, authors]) =>
    (Array.isArray(authors) ? authors : []).map(entryAuthor => ({date,entryAuthor})))
  const events = []
  let cursor = 0
  async function worker() {
    while (cursor < jobs.length) {
      const {date,entryAuthor} = jobs[cursor++]
      const result = await getEntry(client, date, entryAuthor)
      const comments = result?.json?.comments || []
      for (const comment of comments) {
        if (comment.createdAt) events.push(commentEvent(date,entryAuthor,comment,comments))
      }
    }
  }
  await Promise.all(Array.from({length: Math.min(4,jobs.length)}, worker))
  await mutateNotifications(client, state => ({...state, historyImported: true, events: [...(state.events || []), ...events]}))
}
