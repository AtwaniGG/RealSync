import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Moon, Sun, Search, Menu, Clock, Wifi, Video, Settings, LogOut } from 'lucide-react'
import $ from '../../lib/tokens'
import { getTheme, setTheme, MONO_STYLE } from '../../lib/tokens'

interface HeaderProps {
  onCmdK: () => void
  onHamburger: () => void
}

export default function Header({ onCmdK, onHamburger }: HeaderProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = window.innerWidth <= 768
  const [elapsed, setElapsed] = useState(872)
  const [theme, setThemeState] = useState<'dark' | 'light'>(getTheme)
  const [avatarOpen, setAvatarOpen] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setElapsed((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  const pageLabel =
    location.pathname === '/' ? 'Dashboard'
    : location.pathname.startsWith('/sessions') ? 'Sessions'
    : location.pathname.startsWith('/reports') ? 'Reports'
    : location.pathname.startsWith('/settings') ? 'Settings'
    : 'RealSync'

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setThemeState(next)
    setTheme(next)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        margin: isMobile ? '8px 8px 0' : '12px 12px 0',
        padding: isMobile ? '8px 12px' : '10px 16px',
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: `1px solid ${$.b1}`,
        borderRadius: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        position: 'relative',
        zIndex: 100,
      }}
    >
      {/* Left side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
        {isMobile && (
          <button
            onClick={onHamburger}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: `1px solid ${$.b1}`, background: 'transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: $.t2, flexShrink: 0,
            }}
          >
            <Menu size={16} />
          </button>
        )}

        {/* Live indicator */}
        <div style={{ position: 'relative', width: 8, height: 8 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: $.green, boxShadow: `0 0 8px ${$.green}`,
          }} />
          <motion.div
            style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: `1.5px solid ${$.green}` }}
            animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
          />
        </div>

        <span style={{ fontSize: isMobile ? 13 : 14, color: $.t1, fontWeight: 600 }}>
          {pageLabel}
        </span>

        {!isMobile && (
          <>
            <div style={{ width: 1, height: 14, background: $.b1 }} />
            <span style={{ fontSize: 12, color: $.t2 }}>Q1 Board Review</span>
            <span style={{ fontSize: 10, color: $.t4, fontFamily: 'JetBrains Mono, monospace' }}>a3f8c1d0</span>
          </>
        )}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14 }}>
        {!isMobile && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Wifi size={11} color={$.t3} />
              <span style={{ fontSize: 10, color: $.t3, ...MONO_STYLE }}>5/5 · 23ms</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: $.green }}>
              <Video size={11} />
              <span style={{ fontSize: 10, ...MONO_STYLE }}>A+V+C</span>
            </div>
            <div style={{ width: 1, height: 14, background: $.b1 }} />
          </>
        )}

        {/* Session timer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Clock size={11} color={$.t3} />
          <span style={{ fontSize: 11, ...MONO_STYLE, color: $.t1 }}>{mm}:{ss}</span>
        </div>

        <div style={{ width: 1, height: 14, background: $.b1 }} />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            width: 28, height: 28, borderRadius: 7,
            border: `1px solid ${$.b1}`, background: 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: $.t3, transition: 'border-color 150ms, color 150ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = $.b2
            e.currentTarget.style.color = $.cyan
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = $.b1
            e.currentTarget.style.color = $.t3
          }}
        >
          {theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
        </button>

        {/* Cmd+K button */}
        {!isMobile && (
          <button
            onClick={onCmdK}
            title="Cmd+K"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 8px', background: $.bg2,
              border: `1px solid ${$.b1}`, borderRadius: 7,
              color: $.t3, cursor: 'pointer', fontSize: 11,
              transition: 'border-color 150ms',
            }}
          >
            <Search size={11} />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9 }}>Cmd+K</span>
          </button>
        )}

        {/* Avatar + dropdown */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => setAvatarOpen((v) => !v)}
            style={{
              width: 28, height: 28, borderRadius: 7,
              background: `linear-gradient(135deg, ${$.cyan}, ${$.blue})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: '#fff', cursor: 'pointer',
            }}
          >
            AS
          </div>

          <AnimatePresence>
            {avatarOpen && (
              <>
                {isMobile && (
                  <div onClick={() => setAvatarOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
                )}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    position: 'absolute', top: 36, right: 0, width: 180,
                    zIndex: 9999, background: $.bg2,
                    border: `1px solid ${$.b2}`, borderRadius: 10,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.5)', overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '10px 14px', borderBottom: `1px solid ${$.b1}` }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: $.t1 }}>Ahmed Sarhan</div>
                    <div style={{ fontSize: 11, color: $.t3 }}>ahmed@realsync.ai</div>
                  </div>
                  <button
                    onClick={() => { navigate('/settings'); setAvatarOpen(false) }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 14px', background: 'transparent', border: 'none',
                      color: $.t2, cursor: 'pointer', fontSize: 13, textAlign: 'left',
                      transition: 'background 100ms',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <Settings size={14} /> Profile Settings
                  </button>
                  <button
                    onClick={() => { navigate('/login'); setAvatarOpen(false) }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 14px', background: 'transparent', border: 'none',
                      color: $.red, cursor: 'pointer', fontSize: 13, textAlign: 'left',
                      transition: 'background 100ms',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.06)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <LogOut size={14} /> Sign Out
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
