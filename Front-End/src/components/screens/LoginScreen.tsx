import { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Eye, EyeOff, Shield, Lock, Mail, ShieldCheck,
  Loader2, ArrowRight,
} from 'lucide-react';
import logoWhite from '../../assets/realsync-logo-white.png';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'sonner';

interface LoginScreenProps {
  onSwitchToSignUp?: () => void;
  oauthError?: string | null;
  onClearOAuthError?: () => void;
}

// Real Google SVG logo
const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" className="flex-shrink-0">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

// Real Microsoft SVG logo
const MicrosoftLogo = () => (
  <svg width="18" height="18" viewBox="0 0 21 21" className="flex-shrink-0">
    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
  </svg>
);

// Scan line component — CSS keyframe based to avoid Framer Motion dependency
function ScanLine({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [height, setHeight] = useState(600);

  useEffect(() => {
    if (containerRef.current) setHeight(containerRef.current.offsetHeight);
  }, [containerRef]);

  return (
    <>
      <style>{`
        @keyframes scanSweep {
          from { transform: translateY(0); }
          to { transform: translateY(${height}px); }
        }
        .scan-line {
          animation: scanSweep 4s linear 0.7s infinite;
        }
      `}</style>
      <div
        className="scan-line absolute left-0 right-0 h-px pointer-events-none z-10"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      />
    </>
  );
}

export function LoginScreen({ onSwitchToSignUp, oauthError, onClearOAuthError }: LoginScreenProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // 2FA MFA challenge state
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaVerifying, setMfaVerifying] = useState(false);

  const handleGoogleLogin = async () => {
    setFormError(null);
    onClearOAuthError?.();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setFormError(error.message);
  };

  const handleMicrosoftLogin = async () => {
    setFormError(null);
    onClearOAuthError?.();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { redirectTo: window.location.origin, scopes: 'email profile openid' },
    });
    if (error) setFormError(error.message);
  };

  const handleSignIn = async () => {
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);
    onClearOAuthError?.();

    if (!email.trim()) {
      setEmailError('Email is required.');
      if (!password) setPasswordError('Password is required.');
      return;
    }
    if (!password) {
      setPasswordError('Password is required.');
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
        setEmailError('Email not confirmed');
      } else if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
        setPasswordError('Incorrect email or password');
      } else if (msg.includes('invalid email')) {
        setEmailError('Invalid email address');
      } else {
        setPasswordError(error.message);
      }
      setIsSubmitting(false);
      return;
    }

    try {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData && aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal2') {
        setMfaRequired(true);
        setIsSubmitting(false);
        return;
      }
    } catch {
      // MFA not configured, continue normally
    }

    setIsSubmitting(false);
  };

  const handleMfaVerify = async () => {
    if (mfaCode.length !== 6) {
      setMfaError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setMfaVerifying(true);
    setMfaError(null);

    try {
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const totpFactor = factorsData?.totp?.find((f: { status: string }) => f.status === 'verified');
      if (!totpFactor) {
        setMfaError('No 2FA factor found. Please contact support.');
        setMfaVerifying(false);
        return;
      }

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code: mfaCode,
      });
      if (verifyError) throw verifyError;
    } catch (err: unknown) {
      setMfaError(err instanceof Error ? err.message : 'Invalid code. Please try again.');
    } finally {
      setMfaVerifying(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-4 py-12"
      style={{ background: '#08080c' }}
    >
      {/* ── Animated orbs ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full"
          style={{
            width: 500, height: 500,
            right: '-5%', top: '-10%',
            background: 'rgba(34,211,238,0.12)',
            filter: 'blur(200px)',
            animation: 'orbDriftA 10s ease-in-out infinite alternate',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 600, height: 600,
            left: '-15%', bottom: '-10%',
            background: 'rgba(139,92,246,0.10)',
            filter: 'blur(240px)',
            animation: 'orbDriftB 12s ease-in-out infinite alternate',
          }}
        />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 hidden md:block"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      <style>{`
        @keyframes orbDriftA {
          from { transform: translate(0, 0); }
          to { transform: translate(-30px, 20px); }
        }
        @keyframes orbDriftB {
          from { transform: translate(0, 0); }
          to { transform: translate(25px, -20px); }
        }
        @keyframes logoPulse {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.02); opacity: 1; }
        }
      `}</style>

      {/* ── Logo ── */}
      <div
        className="relative z-10 mb-4"
        style={{ animation: 'logoPulse 3s ease-in-out infinite' }}
      >
        <img
          src={logoWhite}
          alt="RealSync"
          className="w-auto"
          style={{ height: 80 }}
        />
      </div>

      {/* ── Tagline ── */}
      <p
        className="relative z-10 mb-8 text-sm"
        style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter, sans-serif' }}
      >
        AI-Powered Meeting Security
      </p>

      {/* ── Glass card ── */}
      <div
        ref={cardRef}
        className="relative z-10 w-full max-w-[420px] overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(20px) saturate(120%)',
          WebkitBackdropFilter: 'blur(20px) saturate(120%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          padding: '40px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03) inset',
        }}
      >
        {/* Scan line */}
        <ScanLine containerRef={cardRef} />

        {mfaRequired ? (
          /* ── MFA Challenge ── */
          <div className="space-y-6">
            <div className="text-center">
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)', boxShadow: '0 0 32px rgba(34,211,238,0.25)' }}
              >
                <ShieldCheck className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-white text-2xl font-bold mb-2 tracking-tight">Two-Factor Authentication</h2>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Enter the 6-digit code from your authenticator app</p>
            </div>

            <Input
              type="text"
              maxLength={6}
              placeholder="000000"
              value={mfaCode}
              onChange={(e) => { setMfaCode(e.target.value.replace(/\D/g, '')); setMfaError(null); }}
              className="text-white text-center text-3xl tracking-[0.6em] h-16 font-mono"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
              }}
              autoFocus
            />
            {mfaError && <p className="text-red-400 text-sm text-center">{mfaError}</p>}

            <Button
              onClick={handleMfaVerify}
              disabled={mfaVerifying || mfaCode.length !== 6}
              className="w-full h-12 text-white font-semibold"
              style={{
                background: 'linear-gradient(135deg, #22d3ee, #3b82f6)',
                borderRadius: 12,
                boxShadow: '0 0 24px rgba(34,211,238,0.25)',
              }}
            >
              {mfaVerifying ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying...</>
              ) : (
                <><Shield className="w-4 h-4 mr-2" />Verify</>
              )}
            </Button>

            <button
              onClick={async () => {
                await supabase.auth.signOut();
                setMfaRequired(false);
                setMfaCode('');
                setMfaError(null);
              }}
              className="w-full text-center text-sm transition-colors"
              style={{ color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          /* ── Login form ── */
          <div className="space-y-5">
            {/* Header */}
            <div>
              <h2 className="text-white text-2xl font-bold tracking-tight mb-1.5">Welcome back</h2>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Sign in with your corporate email</p>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label
                className="block uppercase tracking-widest font-medium"
                style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}
              >
                Email
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: emailError ? '#f87171' : 'rgba(255,255,255,0.3)' }}
                />
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                  className="text-white h-12 pl-10 rounded-xl transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: emailError ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={(e) => {
                    if (!emailError) {
                      e.currentTarget.style.borderColor = 'rgba(34,211,238,0.5)';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,211,238,0.1)';
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = emailError ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
              {emailError && <p className="text-red-400 text-xs mt-1">{emailError}</p>}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label
                  className="uppercase tracking-widest font-medium"
                  style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}
                >
                  Password
                </label>
                <button
                  onClick={async () => {
                    if (!email.trim()) {
                      setEmailError('Enter your email first to reset password.');
                      return;
                    }
                    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                      redirectTo: window.location.origin,
                    });
                    if (error) {
                      setFormError(error.message);
                    } else {
                      setFormError(null);
                      toast.success('Password reset email sent! Check your inbox.');
                    }
                  }}
                  className="text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ color: '#22D3EE', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: passwordError ? '#f87171' : 'rgba(255,255,255,0.3)' }}
                />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
                  className="text-white h-12 pl-10 pr-12 rounded-xl transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: passwordError ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={(e) => {
                    if (!passwordError) {
                      e.currentTarget.style.borderColor = 'rgba(34,211,238,0.5)';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,211,238,0.1)';
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = passwordError ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors p-1"
                  style={{ color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordError && <p className="text-red-400 text-xs mt-1">{passwordError}</p>}
            </div>

            {/* Sign in button */}
            <Button
              onClick={handleSignIn}
              disabled={isSubmitting}
              className="w-full h-12 text-white font-bold rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #22d3ee, #3b82f6)',
                boxShadow: '0 0 24px rgba(34,211,238,0.25)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 36px rgba(34,211,238,0.4)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 24px rgba(34,211,238,0.25)'; }}
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in...</>
              ) : (
                <>Sign in securely <ArrowRight className="w-4 h-4" /></>
              )}
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <span className="text-xs font-medium tracking-wide" style={{ color: 'rgba(255,255,255,0.3)' }}>or</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>

            {/* OAuth domain error */}
            {oauthError && (
              <div
                className="text-sm rounded-xl px-4 py-3 flex items-start gap-2"
                style={{ color: '#fb923c', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}
              >
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span>{oauthError}</span>
              </div>
            )}

            {/* OAuth buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleGoogleLogin}
                className="flex items-center justify-center gap-2.5 h-11 rounded-xl text-sm font-medium transition-all"
                style={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.09)';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                }}
              >
                <GoogleLogo />
                Google
              </button>
              <button
                onClick={handleMicrosoftLogin}
                className="flex items-center justify-center gap-2.5 h-11 rounded-xl text-sm font-medium transition-all"
                style={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.09)';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                }}
              >
                <MicrosoftLogo />
                Microsoft
              </button>
            </div>

            {/* Form error */}
            {formError && (
              <div
                className="text-sm rounded-xl px-4 py-3"
                style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                {formError}
              </div>
            )}

            {/* Switch to sign up */}
            <div
              className="pt-4 text-center"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Don't have an account?{' '}
                <button
                  onClick={onSwitchToSignUp}
                  className="font-semibold transition-opacity hover:opacity-75"
                  style={{ color: '#22D3EE', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Sign up
                </button>
              </p>
            </div>

            {/* Corporate notice */}
            <div
              className="flex items-start gap-2.5 p-3 rounded-xl"
              style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.14)' }}
            >
              <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#3b82f6' }} />
              <span className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Corporate or institutional email required. Personal providers (Gmail, Yahoo) are not accepted.
              </span>
            </div>
          </div>
        )}

        {/* SSL badge */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          <Lock className="w-3 h-3" />
          <span>Protected by 256-bit SSL encryption</span>
        </div>
      </div>
    </div>
  );
}
