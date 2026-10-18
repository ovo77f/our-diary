import React from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import Avatar from './Avatar.jsx'
import NotificationBell from './NotificationBell.jsx'

export default function Layout({ activeMemberId, onSelectMember, onOpenSettings, onOpenNotificationEntry, children }) {
  const auth = useAuth()

  function handleMemberClick(id) {
    // 같은 멤버를 다시 누르면 캘린더 보기로 돌아갑니다.
    onSelectMember(activeMemberId === id ? null : id)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-heading">
            <button className="logo" onClick={() => onSelectMember(null)} title="캘린더로 돌아가기">
              {auth.diaryTitle}
            </button>
            <div className="sidebar-heading-actions">
              <NotificationBell onOpenEntry={onOpenNotificationEntry} />
              <button className="mobile-settings-btn" type="button" onClick={onOpenSettings} aria-label="설정" title="설정">
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.05 1.57V21h-3v-.09a1.7 1.7 0 0 0-1.05-1.57 1.7 1.7 0 0 0-1.87.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15.7 1.7 1.7 0 0 0 5.43 14.6H5v-3h.43A1.7 1.7 0 0 0 7 10.55a1.7 1.7 0 0 0-.34-1.87L6.6 8.62 8.72 6.5l.06.06a1.7 1.7 0 0 0 1.87.34A1.7 1.7 0 0 0 11.7 5.33V5h3v.33a1.7 1.7 0 0 0 1.05 1.57 1.7 1.7 0 0 0 1.87-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.87 1.7 1.7 0 0 0 1.57 1.05H21v3h-.03A1.7 1.7 0 0 0 19.4 15Z"/></svg>
              </button>
            </div>
          </div>

          <nav className="member-nav">
            <button
              className={`member-nav-item home-nav-item ${activeMemberId === null ? 'active' : ''}`}
              onClick={() => onSelectMember(null)}
            >
              <span className="home-nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M4 10.8 12 4l8 6.8V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-8.2Z"
                    stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="member-nav-name">홈</span>
            </button>
            {auth.members.map((m) => (
              <button
                key={m.id}
                className={`member-nav-item ${activeMemberId === m.id ? 'active' : ''}`}
                style={{ '--author-color': m.color }}
                onClick={() => handleMemberClick(m.id)}
                title={`${m.displayName}의 글 모아보기`}
              >
                <Avatar member={m} size={30} />
                <span className="member-nav-name">{m.displayName}</span>
                {m.id === auth.currentMember?.id && <span className="me-badge">나</span>}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <button className="btn btn-ghost" onClick={onOpenSettings}>설정</button>
          <button className="btn btn-ghost" onClick={auth.logout}>로그아웃</button>
        </div>
      </aside>

      <main className="main-area">{children}</main>
    </div>
  )
}
