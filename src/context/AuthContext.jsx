import React, { createContext, useCallback, useEffect, useState } from 'react'
import { createClient } from '../lib/github.js'
import { loadConfig } from '../lib/dataModel.js'
import { SITE_TITLE } from '../config.js'

const STORAGE_KEY = 'exchange-diary-session-v1'
const DIARIES_KEY = 'exchange-diary-connections-v2'
const ACTIVE_KEY = 'exchange-diary-active-connection-v2'

const AuthContext = createContext(null)

function diaryId({ owner, repo }) {
  return `${String(owner || '').trim().toLowerCase()}/${String(repo || '').trim().toLowerCase()}`
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function readInitialState() {
  let diaries = readJson(DIARIES_KEY, [])
  if (!Array.isArray(diaries)) diaries = []

  const old = readJson(STORAGE_KEY, null)

  if (diaries.length === 0 && old?.owner && old?.repo && old?.token) {
    const migrated = {
      ...old,
      id: diaryId(old),
      title: old.title || SITE_TITLE,
    }
    diaries = [migrated]
    localStorage.setItem(DIARIES_KEY, JSON.stringify(diaries))
    localStorage.setItem(ACTIVE_KEY, migrated.id)
  }

  const activeId = localStorage.getItem(ACTIVE_KEY)
  let session = diaries.find((d) => d.id === activeId) || null

  // v1.1에서 이미 로그인되어 있었는데 ACTIVE_KEY만 없는 경우를 안전하게 복구
  if (!session && old?.owner && old?.repo && old?.token) {
    const id = diaryId(old)
    session = diaries.find((d) => d.id === id) || {
      ...old,
      id,
      title: old.title || SITE_TITLE,
    }
    if (!diaries.some((d) => d.id === id)) {
      diaries = [...diaries, session]
      localStorage.setItem(DIARIES_KEY, JSON.stringify(diaries))
    }
    localStorage.setItem(ACTIVE_KEY, id)
  }

  if (!session && diaries.length > 0) {
    session = diaries[0]
    localStorage.setItem(ACTIVE_KEY, session.id)
  }

  return { diaries, session }
}

export function AuthProvider({ children }) {
  const [initial] = useState(() => readInitialState())
  const [diaries, setDiaries] = useState(initial.diaries)
  const [session, setSession] = useState(initial.session)
  const [client, setClient] = useState(() => initial.session ? createClient(initial.session) : null)
  const [config, setConfig] = useState(null)
  const [configSha, setConfigSha] = useState(undefined)
  const [status, setStatus] = useState(initial.session ? 'loading' : 'needs-setup')
  const [error, setError] = useState(null)

  const saveDiaries = useCallback((next) => {
    setDiaries(next)
    localStorage.setItem(DIARIES_KEY, JSON.stringify(next))
  }, [])

  const refreshConfig = useCallback(async (specificClient) => {
    const activeClient = specificClient || client
    if (!activeClient) return
    try {
      const res = await loadConfig(activeClient)
      if (!res) {
        setConfig(null)
        setConfigSha(undefined)
        setStatus('needs-setup')
      } else {
        setConfig(res.json)
        setConfigSha(res.sha)
        setStatus('ready')
      }
      setError(null)
    } catch (e) {
      setError(e.message || '연결에 실패했어요.')
      setStatus('error')
    }
  }, [client])

  // v1.1과 같은 방식으로 현재 세션이 바뀔 때만 저장소를 다시 읽습니다.
  useEffect(() => {
    if (!session?.owner || !session?.repo || !session?.token) {
      setClient(null)
      setConfig(null)
      setConfigSha(undefined)
      setStatus('needs-setup')
      return
    }

    const c = createClient(session)
    setClient(c)
    setStatus('loading')
    localStorage.setItem(ACTIVE_KEY, session.id || diaryId(session))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    refreshConfig(c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.owner, session?.repo, session?.token])

  const connect = useCallback(async ({ owner, repo, token, memberId, title }) => {
    const base = {
      owner: owner.trim(),
      repo: repo.trim(),
      token: token.trim(),
      memberId,
    }
    const id = diaryId(base)
    const existing = diaries.find((d) => d.id === id)
    const next = {
      ...base,
      id,
      title: (title || existing?.title || SITE_TITLE).trim() || SITE_TITLE,
      memberId: memberId ?? existing?.memberId,
    }

    const c = createClient(next)
    await c.verify()

    const updated = [...diaries.filter((d) => d.id !== id), next]
    saveDiaries(updated)
    localStorage.setItem(ACTIVE_KEY, id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setStatus('loading')
    setSession(next)
    return next
  }, [diaries, saveDiaries])

  const switchDiary = useCallback(async (id) => {
    const target = diaries.find((d) => d.id === id)
    if (!target) throw new Error('저장된 일기장을 찾을 수 없어요.')

    // 전환 전에 권한을 확인하고, 성공한 경우에만 현재 일기장을 변경합니다.
    const c = createClient(target)
    await c.verify()

    localStorage.setItem(ACTIVE_KEY, target.id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(target))
    setConfig(null)
    setConfigSha(undefined)
    setStatus('loading')
    setSession(target)
  }, [diaries])

  const renameDiary = useCallback((title) => {
    if (!session) return
    const clean = title.trim() || SITE_TITLE
    const next = { ...session, title: clean }
    const updated = diaries.map((d) => d.id === session.id ? next : d)
    saveDiaries(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setSession(next)
  }, [diaries, saveDiaries, session])

  const removeDiary = useCallback((id) => {
    const updated = diaries.filter((d) => d.id !== id)
    saveDiaries(updated)

    if (session?.id !== id) return

    const next = updated[0] || null
    if (next) {
      localStorage.setItem(ACTIVE_KEY, next.id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setStatus('loading')
      setSession(next)
    } else {
      localStorage.removeItem(ACTIVE_KEY)
      localStorage.removeItem(STORAGE_KEY)
      setSession(null)
      setClient(null)
      setConfig(null)
      setConfigSha(undefined)
      setStatus('needs-setup')
    }
  }, [diaries, saveDiaries, session?.id])

  const setMemberId = useCallback((memberId) => {
    setSession((prev) => {
      if (!prev) return prev
      const next = { ...prev, memberId }
      setDiaries((current) => {
        const updated = current.map((d) => d.id === prev.id ? next : d)
        localStorage.setItem(DIARIES_KEY, JSON.stringify(updated))
        return updated
      })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const updateToken = useCallback(async (newToken) => {
    const trimmed = newToken.trim()
    if (!trimmed) throw new Error('토큰을 입력해주세요.')
    if (!session) throw new Error('연결된 일기장이 없어요.')

    const next = { ...session, token: trimmed }
    const c = createClient(next)
    await c.verify()

    const updated = diaries.map((d) => d.id === session.id ? next : d)
    saveDiaries(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setStatus('loading')
    setSession(next)
  }, [session, diaries, saveDiaries])

  // 현재 연결만 해제하고 등록한 일기장 목록은 남깁니다.
  const logout = useCallback(() => {
    localStorage.removeItem(ACTIVE_KEY)
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
    setClient(null)
    setConfig(null)
    setConfigSha(undefined)
    setStatus('needs-setup')
  }, [])

  const currentMember = config?.members?.find((m) => m.id === session?.memberId) || null

  const value = {
    session,
    client,
    config,
    configSha,
    setConfig,
    setConfigSha,
    currentMember,
    members: config?.members || [],
    status,
    error,
    diaries,
    diaryTitle: session?.title || SITE_TITLE,
    connect,
    logout,
    setMemberId,
    updateToken,
    switchDiary,
    renameDiary,
    removeDiary,
    refreshConfig: () => refreshConfig(client),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있어요.')
  return ctx
}
