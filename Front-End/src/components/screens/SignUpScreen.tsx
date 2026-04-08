import { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Eye, EyeOff, Lock, Mail, AlertTriangle, CheckCircle2,
  MailCheck, LogIn, RefreshCw, Shield, Loader2, Users,
} from 'lucide-react';
import logo from 'figma:asset/4401d6799dc4e6061a79080f8825d69ae920f198.png';
import logoLight from '../../assets/realsync-logo-light.png';
import { supabase } from '../../lib/supabaseClient';
import { useTheme } from '../../contexts/ThemeContext';
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

function getPasswordStrength(pw: string): { score: number; label: string; barHex: string; textColor: string } {
  if (!pw) return { score: 0, label: '', barHex: 'rgba(255,255,255,0.06)', textColor: 'text-gray-600' };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 1, label: 'Weak', barHex: '#ef4444', textColor: 'text-red-400' };
  if (score === 2) return { score: 2, label: 'Fair', barHex: '#f97316', textColor: 'text-orange-400' };
  if (score === 3) return { score: 3, label: 'Good', barHex: '#eab308', textColor: 'text-yellow-400' };
  return { score: 4, label: 'Strong', barHex: '#10b981', textColor: 'text-emerald-400' };
}

const SOCIAL_PROOF = [
  { label: '500+', desc: 'Organizations' },
  { label: '99.4%', desc: 'Accuracy' },
  { label: '< 200ms', desc: 'Real-time' },
];

interface SignUpScreenProps {
  onSwitchToLogin: () => void;
}

export function SignUpScreen({ onSwitchToLogin }: SignUpScreenProps) {
  const { resolvedTheme } = useTheme();
  const activeLogo = resolvedTheme === 'light' ? logoLight : logo;

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
    <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-64 -left-32 w-[700px] h-[700px] bg-violet-500/8 rounded-full blur-[120px]" />
        <div className="absolute -bottom-64 -right-32 w-[600px] h-[600px] bg-cyan-500/8 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/3 w-[400px] h-[400px] bg-blue-500/6 rounded-full blur-[100px]" />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      {/* Main layout */}
      <div className="relative z-10 w-full max-w-6xl grid lg:grid-cols-2 gap-12 items-center">

        {/* Left Side — Brand panel */}
        <div className="hidden lg:flex flex-col gap-10 animate-in fade-in slide-in-from-left-8 duration-700">
          {/* Logo */}
          <div>
            <img src={activeLogo} alt="RealSync" className="h-10 w-auto" />
          </div>

          {/* Headline */}
          <div className="space-y-4">
            <h1 className="text-5xl font-bold text-white leading-[1.1] tracking-tight">
              Join{' '}
              <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                RealSync.
              </span>
            </h1>
            <p className="text-gray-400 text-base leading-relaxed max-w-md">
              Create your account and start protecting your meetings with AI-powered deepfake detection and real-time security analytics.
            </p>
          </div>

          {/* Social proof stats */}
          <div
            className="grid grid-cols-3 gap-4 p-6 rounded-2xl border border-white/7"
            style={{ background: 'rgba(255,255,255,0.025)' }}
          >
            {SOCIAL_PROOF.map((item, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl font-bold tracking-tight mb-1 bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
                  {item.label}
                </div>
                <div className="text-gray-600 text-xs">{item.desc}</div>
              </div>
            ))}
          </div>

          {/* Corporate email requirement callout */}
          <div className="flex items-start gap-4 p-4 rounded-2xl bg-gradient-to-r from-orange-500/8 to-transparent border border-orange-500/18">
            <div className="w-10 h-10 rounded-xl bg-orange-500/12 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-white text-sm font-semibold mb-1">Corporate Email Required</h3>
              <p className="text-gray-500 text-xs leading-relaxed">
                Personal email providers (Gmail, Yahoo, Outlook, etc.) are not accepted.
                Please use your corporate or institutional email address.
              </p>
            </div>
          </div>

          {/* Trust line */}
          <div className="flex items-center gap-2 text-gray-600 text-xs">
            <Users className="w-3.5 h-3.5" />
            <span>Join organizations using RealSync to secure their meetings</span>
          </div>
        </div>

        {/* Right Side — Form card */}
        <div className="w-full">
          <div
            className="rounded-3xl p-8 border border-white/8 shadow-2xl relative overflow-hidden"
            style={{
              background: 'rgba(15,15,22,0.85)',
              backdropFilter: 'blur(32px) saturate(150%)',
              WebkitBackdropFilter: 'blur(32px) saturate(150%)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.04)',
            }}
          >
            {/* Top shimmer line */}
            <div
              className="absolute top-0 left-8 right-8 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.5), rgba(34,211,238,0.5), transparent)' }}
            />

            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center mb-6">
              <img src={activeLogo} alt="RealSync" className="h-8 w-auto" />
            </div>

            {signupComplete ? (
              /* Success screen */
              <div className="flex flex-col items-center gap-5 text-center py-3">
                {/* Icon */}
                <div className="relative inline-block">
                  <div
                    className="w-18 h-18 rounded-2xl flex items-center justify-center"
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
                      boxShadow: '0 0 0 3px #0a0a14',
                    }}
                  >
                    <CheckCircle2 className="w-4 h-4 text-white" strokeWidth={2.5} />
                  </div>
                </div>

                <h2 className="text-white text-2xl font-bold tracking-tight">Account Created!</h2>

                <div className="text-sm text-emerald-400 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-4 py-3 w-full">
                  Account created! Check your inbox for a confirmation email, then sign in.
                </div>

                <p className="text-gray-500 text-sm leading-relaxed max-w-xs">
                  We've sent a verification link to your registered corporate email. Please verify your identity to unlock real-time deepfake protection.
                </p>

                <Button
                  onClick={onSwitchToLogin}
                  className="w-full h-12 text-white font-bold rounded-xl"
                  style={{
                    background: 'linear-gradient(135deg, #22d3ee, #3b82f6)',
                    boxShadow: '0 0 24px rgba(34,211,238,0.2), 0 4px 16px rgba(0,0,0,0.3)',
                  }}
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Back to Sign In
                </Button>

                <div className="space-y-1.5 w-full">
                  <p className="text-gray-600 text-xs">Didn't receive the email?</p>
                  <button
                    onClick={handleResendEmail}
                    disabled={resendCooldown > 0 || resending}
                    className={`text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 w-full ${
                      resendCooldown > 0 || resending
                        ? 'text-gray-600 cursor-not-allowed'
                        : 'text-cyan-400 hover:text-cyan-300'
                    }`}
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
              /* Sign up form */
              <div className="space-y-5">
                {/* Header */}
                <div>
                  <h2 className="text-white text-2xl font-bold tracking-tight mb-1.5">Create an account</h2>
                  <p className="text-gray-500 text-sm">Sign up with your corporate email</p>
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <label className="text-gray-400 text-xs uppercase tracking-widest font-semibold block">Corporate Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <Input
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-white/4 border-white/8 text-white placeholder:text-gray-600 h-12 pl-10 rounded-xl focus:bg-white/6 focus:border-violet-400/60 focus:ring-violet-400/20 transition-all"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <label className="text-gray-400 text-xs uppercase tracking-widest font-semibold block">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min. 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-white/4 border-white/8 text-white placeholder:text-gray-600 h-12 pl-10 pr-12 rounded-xl focus:bg-white/6 focus:border-violet-400/60 focus:ring-violet-400/20 transition-all"
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors p-1"
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
                      <p className={`text-xs font-medium ${strength.textColor}`}>{strength.label}</p>
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div className="space-y-2">
                  <label className="text-gray-400 text-xs uppercase tracking-widest font-semibold block">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <Input
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="bg-white/4 border-white/8 text-white placeholder:text-gray-600 h-12 pl-10 pr-12 rounded-xl focus:bg-white/6 focus:border-violet-400/60 focus:ring-violet-400/20 transition-all"
                    />
                    <button
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors p-1"
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Mobile domain notice */}
                <div className="lg:hidden flex items-center gap-2 text-xs text-gray-600">
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                  <span>Personal emails (Gmail, Yahoo, etc.) not accepted</span>
                </div>

                {/* Create account button */}
                <Button
                  onClick={handleSignUp}
                  disabled={isSubmitting}
                  className="w-full h-12 text-white font-bold rounded-xl shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    background: 'linear-gradient(135deg, #8b5cf6, #22d3ee)',
                    boxShadow: '0 0 24px rgba(139,92,246,0.2), 0 4px 16px rgba(0,0,0,0.3)',
                  }}
                >
                  {isSubmitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating Account...</>
                  ) : (
                    'Create Account'
                  )}
                </Button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/6" />
                  <span className="text-gray-600 text-xs font-medium tracking-wide">Or sign up with</span>
                  <div className="flex-1 h-px bg-white/6" />
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
                    className="flex items-center justify-center gap-2.5 h-11 rounded-xl border border-white/8 bg-white/3 text-gray-300 text-sm font-medium hover:bg-white/7 hover:border-white/16 hover:text-white transition-all"
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
                    className="flex items-center justify-center gap-2.5 h-11 rounded-xl border border-white/8 bg-white/3 text-gray-300 text-sm font-medium hover:bg-white/7 hover:border-white/16 hover:text-white transition-all"
                  >
                    <MicrosoftLogo />
                    Microsoft
                  </button>
                </div>

                {/* Form error */}
                {formError && (
                  <div className="text-sm text-red-400 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Domain restriction notice */}
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-orange-500/6 border border-orange-500/16">
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-400 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-500 text-xs leading-relaxed">
                    Personal email providers (Gmail, Yahoo, Outlook, etc.) are not accepted. Use your corporate or institutional email.
                  </span>
                </div>

                {/* Switch to sign in */}
                <div className="pt-4 border-t border-white/6 text-center">
                  <p className="text-gray-500 text-sm">
                    Already have an account?{' '}
                    <button
                      onClick={onSwitchToLogin}
                      className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
                    >
                      Sign in
                    </button>
                  </p>
                </div>
              </div>
            )}

            {/* SSL badge */}
            <div className="mt-6 flex items-center justify-center gap-2 text-gray-600 text-xs">
              <Shield className="w-3 h-3" />
              <span>Protected by 256-bit SSL encryption</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
