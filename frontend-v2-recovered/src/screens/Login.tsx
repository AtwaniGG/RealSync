import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Shield, Mic, Brain } from 'lucide-react'
import $ from '../lib/tokens'
import { EASE } from '../lib/tokens'

const FEATURES = [
  { icon: Shield, title: 'Deepfake Detection', desc: 'AI-powered visual manipulation analysis in real-time', color: $.cyan },
  { icon: Brain, title: 'Emotion Analysis', desc: 'Track facial expressions and behavioral patterns', color: $.blue },
  { icon: Mic, title: 'Audio Forensics', desc: 'Voice synthesis and manipulation detection', color: $.violet },
]

export default function Login() {
  const navigate = useNavigate()
  const isMobile = window.innerWidth <= 768
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError('Email is required.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    setTimeout(() => { setLoading(false); navigate('/') }, 1000)
  }

  const loginForm = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
      style={{
        width: '100%', maxWidth: isMobile ? '100%' : 380,
        background: $.bg1, border: `1px solid ${$.b1}`,
        borderRadius: 20, padding: isMobile ? 20 : 32, position: 'relative',
      }}
    >
      {/* Top shimmer line */}
      <div style={{ position: 'absolute', top: 0, left: 24, right: 24, height: 1, background: `linear-gradient(90deg, transparent, ${$.b3}, transparent)` }} />

      <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 600, color: $.t1, marginBottom: 4 }}>Welcome back</h2>
      <p style={{ fontSize: 13, color: $.t3, marginBottom: isMobile ? 20 : 28 }}>Sign in with your corporate email</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Email */}
        <div>
          <label style={{ display: 'block', fontSize: 11, color: $.t3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500 }}>Email</label>
          <div style={{ position: 'relative' }}>
            <Mail size={15} color={$.t4} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={{
                width: '100%', padding: '10px 12px 10px 36px',
                background: $.bg2, border: `1px solid ${$.b1}`,
                borderRadius: 10, color: $.t1, fontSize: 14, outline: 'none',
                transition: 'border-color 150ms', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = $.cyan}
              onBlur={(e) => e.currentTarget.style.borderColor = $.b1}
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label style={{ display: 'block', fontSize: 11, color: $.t3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500 }}>Password</label>
          <div style={{ position: 'relative' }}>
            <Lock size={15} color={$.t4} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              style={{
                width: '100%', padding: '10px 40px 10px 36px',
                background: $.bg2, border: `1px solid ${$.b1}`,
                borderRadius: 10, color: $.t1, fontSize: 14, outline: 'none',
                transition: 'border-color 150ms', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = $.cyan}
              onBlur={(e) => e.currentTarget.style.borderColor = $.b1}
            />
            <button
              type="button" onClick={() => setShowPw((v) => !v)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: $.t4, padding: 2, display: 'flex' }}
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.p
              key="error"
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              style={{ fontSize: 12, color: $.red, margin: 0 }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <div style={{ textAlign: 'right', marginTop: -8 }}>
          <button type="button" style={{ background: 'none', border: 'none', color: $.cyan, fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 500, transition: 'opacity 150ms' }}>
            Forgot password?
          </button>
        </div>

        {/* Submit */}
        <motion.button
          type="submit" disabled={loading}
          whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
          style={{
            width: '100%', padding: '11px 0', borderRadius: 10,
            background: `linear-gradient(135deg, ${$.cyan}, ${$.blue})`,
            border: 'none', color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 0 20px rgba(34,211,238,0.2), 0 4px 12px rgba(0,0,0,0.3)',
            opacity: loading ? 0.7 : 1, transition: 'opacity 200ms',
          }}
        >
          {loading
            ? <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }}
              />
            : <>Sign in <ArrowRight size={15} /></>
          }
        </motion.button>
      </form>

      <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: $.t3 }}>
        Don't have an account?{' '}
        <button style={{ background: 'none', border: 'none', color: $.cyan, cursor: 'pointer', fontWeight: 500, fontSize: 13, padding: 0 }}>
          Request access
        </button>
      </p>

      <div style={{ marginTop: 20, padding: '10px 12px', borderRadius: 10, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Shield size={14} color={$.blue} />
        <span style={{ fontSize: 11, color: $.t3, lineHeight: 1.4 }}>Corporate or institutional email required. Personal providers (Gmail, Yahoo) are not accepted.</span>
      </div>
    </motion.div>
  )

  if (isMobile) {
    return (
      <div style={{ minHeight: '100vh', background: $.bg0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        {/* Orbs */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 65%)', top: -200, right: -100, filter: 'blur(80px)' }} />
          <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 65%)', bottom: -150, left: -100, filter: 'blur(80px)' }} />
        </div>

        {/* Brand header */}
        <div style={{ padding: '32px 20px 20px', position: 'relative', zIndex: 1 }}>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${$.cyan}, ${$.violet})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(34,211,238,0.3)' }}>
              <Eye size={18} color="#fff" strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: $.t1, letterSpacing: '-0.3px' }}>RealSync</div>
              <div style={{ fontSize: 10, color: $.t3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Real-Time Meeting Intelligence</div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08, ease: EASE }}>
            <h1 style={{ fontSize: 26, fontWeight: 600, color: $.t1, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 8 }}>
              See what's{' '}
              <span style={{ background: `linear-gradient(135deg, ${$.cyan}, ${$.blue})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>real</span>.
            </h1>
            <p style={{ fontSize: 13, color: $.t2, lineHeight: 1.5, marginBottom: 0 }}>AI-powered deepfake detection for video meetings.</p>
          </motion.div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            {FEATURES.slice(0, 2).map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: 0.15 + i * 0.06, ease: EASE }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: `linear-gradient(135deg, ${f.color}08, transparent)`, border: `1px solid ${f.color}15` }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: `${f.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <f.icon size={14} color={f.color} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: $.t1, marginBottom: 1 }}>{f.title}</div>
                  <div style={{ fontSize: 11, color: $.t3, lineHeight: 1.3 }}>{f.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, padding: '0 16px 32px', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
          {loginForm}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: $.bg0, display: 'flex', position: 'relative', overflow: 'hidden' }}>
      {/* Orbs */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 65%)', top: -300, right: -200, filter: 'blur(100px)' }} />
        <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 65%)', bottom: -250, left: -100, filter: 'blur(100px)' }} />
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 60%)', top: '50%', left: '30%', filter: 'blur(80px)' }} />
      </div>

      {/* Left panel — marketing */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 64px', position: 'relative', zIndex: 1 }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${$.cyan}, ${$.violet})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 24px rgba(34,211,238,0.3), 0 0 48px rgba(34,211,238,0.1)' }}>
            <Eye size={22} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: $.t1, letterSpacing: '-0.3px' }}>RealSync</div>
            <div style={{ fontSize: 11, color: $.t3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Real-Time Meeting Intelligence</div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1, ease: EASE }}>
          <h1 style={{ fontSize: 40, fontWeight: 600, color: $.t1, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 16, maxWidth: 480 }}>
            See what's{' '}
            <span style={{ background: `linear-gradient(135deg, ${$.cyan}, ${$.blue})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>real</span>.
          </h1>
          <p style={{ fontSize: 15, color: $.t2, lineHeight: 1.6, maxWidth: 420, marginBottom: 40 }}>
            AI-powered deepfake detection and emotion analysis for video meetings. Protect your organization from identity fraud in real time.
          </p>
        </motion.div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.2 + i * 0.08, ease: EASE }} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, background: `linear-gradient(135deg, ${f.color}08, transparent)`, border: `1px solid ${f.color}15` }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: `${f.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <f.icon size={18} color={f.color} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: $.t1, marginBottom: 2 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: $.t3, lineHeight: 1.4 }}>{f.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{ width: 480, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px', position: 'relative', zIndex: 1 }}>
        {loginForm}
      </div>
    </div>
  )
}
