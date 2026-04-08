import { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Eye, EyeOff, Lock, Mail, AlertTriangle, CheckCircle2,
  MailCheck, LogIn, RefreshCw, Shield, Loader2, ArrowRight,
} from 'lucide-react';
import logoWhite from '../../assets/realsync-logo-white.png';
import { supabase } from '../../lib/supabaseClient';
import { isBlockedDomain } from '../../lib/blockedDomains';

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

function getPasswordStrength(pw: string): { score: number; label: string; barHex: string } {
  if (!pw) return { score: 0, label: '', barHex: 'rgba(255,255,255,0.06)' };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 1, label: 'Weak', barHex: '#ef4444' };
  if (score === 2) return { score: 2, label: 'Fair', barHex: '#f97316' };
  if (score === 3) return { score: 3, label: 'Good', barHex: '#eab308' };
  return { score: 4, label: 'Strong', barHex: '#10b981' };
}

// Scan line component — CSS keyframe based
function ScanLine({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [height, setHeight] = useState(700);

  useEffect(() => {
    if (containerRef.current) setHeight(containerRef.current.offsetHeight);
  }, [containerRef]);

  return (
    <>
      <style>{`
        @keyframes scanSweepSignUp {
          from { transform: translateY(0); }
          to { transform: translateY(${height}px); }
        }
        .scan-line-signup {
          animation: scanSweepSignUp 4s linear 0.7s infinite;
        }
      `}</style>
      <div
        className="scan-line-signup absolute left-0 right-0 h-px pointer-events-none z-10"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      />
    </>
  );
}

interface SignUpScreenProps {
  onSwitchToLogin: () => void;
}

export function SignUpScreen({ onSwitchToLogin }: SignUpScreenProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [signupComplete, setSignupComplete] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    };
  }, []);

  const strength = getPasswordStrength(password);

  const handleSignUp = async () => {
    setFormError(null);

    if (!email.trim() || !password || !confirmPassword) {
      setFormError('All fields are required.');
      return;
    }

    if (isBlockedDomain(email.trim())) {
      setFormError(
        'Personal email providers (Gmail, Yahoo, Outlook, etc.) are not accepted. Please use your corporate or institutional email address.'
      );
      return;
    }

    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    setIsSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setRegisteredEmail(email.trim());
    setSignupComplete(true);
  };

  const handleResendEmail = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);

    const { error } = await supabase.auth.resend({ type: 'signup', email: registeredEmail });

    setResending(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setResendCooldown(60);

    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    resendIntervalRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
          resendIntervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
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

        {signupComplete ? (
          /* ── Success screen ── */
          <div className="flex flex-col items-center gap-5 text-center py-3">
            <div className="relative inline-block">
              <div
                className="flex items-center justify-center rounded-2xl"
                style={{
                  width: 72, height: 72,
                  background: 'linear-gradient(135deg, #22d3ee, #3b82f6)',
                  boxShadow: '0 0 32px rgba(34,211,238,0.3)',
                }}
              >
                <MailCheck className="w-9 h-9 text-white" strokeWidth={1.8} />
              </div>
              <div
                className="absolute -bottom-2.5 -left-2.5 flex items-center justify-center rounded-full"
                style={{
                  width: 30, height: 30,
                  background: '#10b981',
                  boxShadow: '0 0 0 3px #08080c',
                }}
              >
                <CheckCircle2 className="w-4 h-4 text-white" strokeWidth={2.5} />
              </div>
            </div>

            <h2 className="text-white text-2xl font-bold tracking-tight">Account Created!</h2>

            <div
              className="text-sm rounded-xl px-4 py-3 w-full"
              style={{ color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)' }}
            >
              Account created! Check your inbox for a confirmation email, then sign in.
            </div>

            <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              We've sent a verification link to your registered corporate email. Please verify your identity to unlock real-time deepfake protection.
            </p>

            <Button
              onClick={onSwitchToLogin}
              className="w-full h-12 text-white font-bold rounded-xl flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #22d3ee, #3b82f6)',
                boxShadow: '0 0 24px rgba(34,211,238,0.25)',
              }}
            >
              <LogIn className="w-4 h-4" />
              Back to Sign In
            </Button>

            <div className="space-y-1.5 w-full">
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Didn't receive the email?</p>
              <button
                onClick={handleResendEmail}
                disabled={resendCooldown > 0 || resending}
                className="text-sm font-semibold flex items-center justify-center gap-1.5 w-full transition-opacity"
                style={{
                  color: resendCooldown > 0 || resending ? 'rgba(255,255,255,0.3)' : '#22D3EE',
                  cursor: resendCooldown > 0 || resending ? 'not-allowed' : 'pointer',
                  background: 'none', border: 'none',
                }}
              >
                {resending ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Sending...</>
                ) : resendCooldown > 0 ? (
                  `Resend in ${resendCooldown}s`
                ) : (
                  'Resend Verification Email'
                )}
              </button>
            </div>
          </div>
        ) : (
          /* ── Sign up form ── */
          <div className="space-y-4">
            {/* Header */}
            <div>
              <h2 className="text-white text-2xl font-bold tracking-tight mb-1.5">Create an account</h2>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Sign up with your corporate email</p>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label
                className="block uppercase tracking-widest font-medium"
                style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}
              >
                Corporate Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="text-white h-12 pl-10 rounded-xl transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(34,211,238,0.5)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,211,238,0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label
                className="block uppercase tracking-widest font-medium"
                style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="text-white h-12 pl-10 pr-12 rounded-xl transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(34,211,238,0.5)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,211,238,0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
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

              {/* Password strength */}
              {password && (
                <div className="space-y-1.5 pt-1">
                  <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${(strength.score / 4) * 100}%`, background: strength.barHex }}
                    />
                  </div>
                  <p className="text-xs font-medium" style={{ color: strength.barHex }}>{strength.label}</p>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-2">
              <label
                className="block uppercase tracking-widest font-medium"
                style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}
              >
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                <Input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="text-white h-12 pl-10 pr-12 rounded-xl transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(34,211,238,0.5)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,211,238,0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors p-1"
                  style={{ color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Form error */}
            {formError && (
              <div
                className="text-sm rounded-xl px-4 py-3 flex items-start gap-2"
                style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Create account button */}
            <Button
              onClick={handleSignUp}
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
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating Account...</>
              ) : (
                <>Create Account <ArrowRight className="w-4 h-4" /></>
              )}
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <span className="text-xs font-medium tracking-wide" style={{ color: 'rgba(255,255,255,0.3)' }}>or</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>

            {/* OAuth buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={async () => {
                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: window.location.origin },
                  });
                  if (error) setFormError(error.message);
                }}
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
                onClick={async () => {
                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'azure',
                    options: { redirectTo: window.location.origin, scopes: 'email profile openid' },
                  });
                  if (error) setFormError(error.message);
                }}
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

            {/* Domain restriction notice */}
            <div
              className="flex items-start gap-2.5 p-3 rounded-xl"
              style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.16)' }}
            >
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#f97316' }} />
              <span className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Personal email providers (Gmail, Yahoo, Outlook, etc.) are not accepted. Use your corporate or institutional email.
              </span>
            </div>

            {/* Switch to sign in */}
            <div
              className="pt-4 text-center"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Already have an account?{' '}
                <button
                  onClick={onSwitchToLogin}
                  className="font-semibold transition-opacity hover:opacity-75"
                  style={{ color: '#22D3EE', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Sign in
                </button>
              </p>
            </div>
          </div>
        )}

        {/* SSL badge */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          <Shield className="w-3 h-3" />
          <span>Protected by 256-bit SSL encryption</span>
        </div>
      </div>
    </div>
  );
}
