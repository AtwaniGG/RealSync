import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Shield, AlertTriangle,
  CheckCircle2, MailCheck, LogIn, RefreshCw,
} from 'lucide-react'
import $ from '../lib/tokens'
import { EASE } from '../lib/tokens'
import { supabase } from '../lib/supabaseClient'
import { isBlockedDomain } from '../lib/blockedDomains'

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: $.t4 }
  let score = 0
  if (pw.length >= 6) score++
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score: 1, label: 'Weak', color: $.red }
  if (score === 2) return { score: 2, label: 'Fair', color: $.orange }
  if (score === 3) return { score: 3, label: 'Good', color: $.amber }
  return { score: 4, label: 'Strong', color: $.green }
}

export default function SignUp() {
  const navigate = useNavigate()
  const isMobile = window.innerWidth <= 768
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [signupComplete, setSignupComplete] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resending, setResending] = useState(false)
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (resendIntervalRef.current) clearInterval(resendIntervalRef.current)
    }
  }, [])

  const strength = getPasswordStrength(password)

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password || !confirmPassword) {
      setError('All fields are required.')
      return
    }

    if (isBlockedDomain(email.trim())) {
      setError('Personal email providers (Gmail, Yahoo, Outlook, etc.) are not accepted. Please use your corporate or institutional email.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })
    setLoading(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    setRegisteredEmail(email.trim())
    setSignupComplete(true)
  }

  async function handleResendEmail() {
    if (resendCooldown > 0 || resending) return
    setResending(true)
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: registeredEmail })
    setResending(false)
    if (resendError) {
      setError(resendError.message)
      return
    }
    setResendCooldown(60)
    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current)
    resendIntervalRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (resendIntervalRef.current) clearInterval(resendIntervalRef.current)
          resendIntervalRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: $.bg2, border: `1px solid ${$.b1}`,
    borderRadius: 10, padding: '10px 36px 10px 36px',
    color: $.t1, fontSize: 14, outline: 'none',
    transition: 'border-color 150ms', fontFamily: 'Inter, sans-serif',
  }

  const form = (
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
      <div style={{ position: 'absolute', top: 0, left: 24, right: 24, height: 1, background: `linear-gradient(90deg, transparent, ${$.b3}, transparent)` }} />

      {signupComplete ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', padding: '8px 0' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: `linear-gradient(135deg, ${$.cyan}, ${$.blue})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MailCheck size={32} color="#fff" strokeWidth={1.8} />
            </div>
            <div style={{
              position: 'absolute', bottom: -8, left: -8, width: 28, height: 28,
              borderRadius: '50%', background: $.green, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 0 3px ${$.bg1}`,
            }}>
              <CheckCircle2 size={16} color="#fff" strokeWidth={2.5} />
            </div>
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 600, color: $.t1, margin: 0 }}>Account Created!</h2>

          <div style={{
            fontSize: 12, color: $.green, padding: '8px 14px', borderRadius: 8,
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
          }}>
            Check your inbox for a confirmation email, then sign in.
          </div>

          <p style={{ fontSize: 12, color: $.t3, lineHeight: 1.6, margin: 0 }}>
            We sent a verification link to your corporate email.
            Please verify to unlock real-time deepfake protection.
          </p>

          <button
            onClick={() => navigate('/login')}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 10,
              background: `linear-gradient(135deg, ${$.cyan}, ${$.blue})`,
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 0 20px rgba(34,211,238,0.2), 0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            <LogIn size={15} /> Back to Sign In
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
            <p style={{ fontSize: 12, color: $.t4, margin: 0 }}>Didn't receive the email?</p>
            <button
              onClick={handleResendEmail}
              disabled={resendCooldown > 0 || resending}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: resendCooldown > 0 || resending ? 'not-allowed' : 'pointer',
                color: resendCooldown > 0 || resending ? $.t4 : $.cyan,
                fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              {resending
                ? <><motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} style={{ display: 'inline-flex' }}><RefreshCw size={12} /></motion.span>Sending...</>
                : resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : 'Resend Verification Email'
              }
            </button>
          </div>
        </div>
      ) : (
        <>
          <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 600, color: $.t1, marginBottom: 4 }}>Create an account</h2>
          <p style={{ fontSize: 13, color: $.t3, marginBottom: isMobile ? 20 : 28 }}>Sign up with your corporate email</p>

          <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: 11, color: $.t3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500 }}>Corporate Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} color={$.t4} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }}
                  placeholder="you@company.com"
                  style={{ ...inputStyle, paddingLeft: 36, paddingRight: 12 }}
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
                  type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => { setPassword(e.target.value); setError('') }}
                  placeholder="Min. 6 characters"
                  style={{ ...inputStyle, paddingRight: 40 }}
                  onFocus={(e) => e.currentTarget.style.borderColor = $.cyan}
                  onBlur={(e) => e.currentTarget.style.borderColor = $.b1}
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: $.t4, display: 'flex', padding: 2 }}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {password && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ height: 3, background: $.bg3, borderRadius: 2, overflow: 'hidden', marginBottom: 3 }}>
                    <div style={{ height: '100%', width: `${(strength.score / 4) * 100}%`, background: strength.color, borderRadius: 2, transition: 'all 300ms' }} />
                  </div>
                  <span style={{ fontSize: 10, color: strength.color }}>{strength.label}</span>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label style={{ display: 'block', fontSize: 11, color: $.t3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500 }}>Confirm Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} color={$.t4} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
                  placeholder="Re-enter password"
                  style={{ ...inputStyle, paddingRight: 40 }}
                  onFocus={(e) => e.currentTarget.style.borderColor = $.cyan}
                  onBlur={(e) => e.currentTarget.style.borderColor = $.b1}
                />
                <button type="button" onClick={() => setShowConfirm((v) => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: $.t4, display: 'flex', padding: 2 }}>
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
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
                ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} />
                : <>Create Account <ArrowRight size={15} /></>
              }
            </motion.button>
          </form>

          <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 10, background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <AlertTriangle size={14} color={$.orange} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11, color: $.t3, lineHeight: 1.4 }}>Personal email providers (Gmail, Yahoo, Outlook, etc.) are not accepted. Use your corporate or institutional email.</span>
          </div>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: $.t3 }}>
            Already have an account?{' '}
            <button
              onClick={() => navigate('/login')}
              style={{ background: 'none', border: 'none', color: $.cyan, cursor: 'pointer', fontWeight: 500, fontSize: 13, padding: 0 }}
            >
              Sign in
            </button>
          </p>
        </>
      )}

      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: $.t4, fontSize: 11 }}>
        <Shield size={11} />
        <span>Protected by 256-bit SSL encryption</span>
      </div>
    </motion.div>
  )

  return (
    <div style={{ minHeight: '100vh', background: $.bg0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', padding: 24 }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 65%)', top: -300, right: -200, filter: 'blur(100px)' }} />
        <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 65%)', bottom: -250, left: -100, filter: 'blur(100px)' }} />
      </div>
      {form}
    </div>
  )
}
