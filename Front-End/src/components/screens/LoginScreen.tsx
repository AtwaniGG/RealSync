import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Eye, EyeOff, Shield, Lock, Mail, ShieldCheck,
  Loader2, Mic, Brain,
} from 'lucide-react';
import logo from 'figma:asset/4401d6799dc4e6061a79080f8825d69ae920f198.png';
import logoLight from '../../assets/realsync-logo-light.png';
import { supabase } from '../../lib/supabaseClient';
import { useTheme } from '../../contexts/ThemeContext';
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

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Deepfake Detection',
    desc: 'Advanced AI models analyze video feeds instantly',
    colorClass: 'text-cyan-400',
    bgClass: 'bg-cyan-500/10',
    borderClass: 'border-cyan-500/20',
    gradientClass: 'from-cyan-500/10',
  },
  {
    icon: Brain,
    title: 'Emotion Analysis',
    desc: 'Track facial expressions and behavioral patterns',
    colorClass: 'text-blue-400',
    bgClass: 'bg-blue-500/10',
    borderClass: 'border-blue-500/20',
    gradientClass: 'from-blue-500/10',
  },
  {
    icon: Mic,
    title: 'Audio Forensics',
    desc: 'Voice synthesis and manipulation detection',
    colorClass: 'text-violet-400',
    bgClass: 'bg-violet-500/10',
    borderClass: 'border-violet-500/20',
    gradientClass: 'from-violet-500/10',
  },
];

export function LoginScreen({ onSwitchToSignUp, oauthError, onClearOAuthError }: LoginScreenProps) {
  const { resolvedTheme } = useTheme();
  const activeLogo = resolvedTheme === 'light' ? logoLight : logo;

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
    <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-64 -left-32 w-[700px] h-[700px] bg-cyan-500/8 rounded-full blur-[120px]" />
        <div className="absolute -bottom-64 -right-32 w-[600px] h-[600px] bg-violet-500/8 rounded-full blur-[120px]" />
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
              See what's{' '}
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                real.
              </span>
            </h1>
            <p className="text-gray-400 text-base leading-relaxed max-w-md">
              AI-powered deepfake detection and emotion analysis for video meetings.
              Protect your organization from identity fraud in real time.
            </p>
          </div>

          {/* Feature cards */}
          <div className="space-y-3 max-w-md">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r ${f.gradientClass} to-transparent border ${f.borderClass}`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className={`w-10 h-10 rounded-xl ${f.bgClass} flex items-center justify-center flex-shrink-0`}>
                  <f.icon className={`w-5 h-5 ${f.colorClass}`} />
                </div>
                <div>
                  <h3 className="text-white text-sm font-semibold mb-0.5">{f.title}</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Trust indicator */}
          <div className="flex items-center gap-2 text-gray-600 text-xs">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Trusted by security teams across the region</span>
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
              style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.5), rgba(59,130,246,0.5), transparent)' }}
            />

            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center mb-6">
              <img src={activeLogo} alt="RealSync" className="h-8 w-auto" />
            </div>

            {mfaRequired ? (
              /* MFA Challenge */
              <div className="space-y-6">
                <div className="text-center">
                  <div
                    className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                    style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)', boxShadow: '0 0 32px rgba(34,211,238,0.25)' }}
                  >
                    <ShieldCheck className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-white text-2xl font-bold mb-2 tracking-tight">Two-Factor Authentication</h2>
                  <p className="text-gray-400 text-sm">Enter the 6-digit code from your authenticator app</p>
                </div>

                <Input
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => { setMfaCode(e.target.value.replace(/\D/g, '')); setMfaError(null); }}
                  className="bg-white/4 border-white/10 text-white text-center text-3xl tracking-[0.6em] h-16 font-mono focus:border-cyan-400/60 focus:ring-cyan-400/20"
                  autoFocus
                />
                {mfaError && <p className="text-red-400 text-sm text-center">{mfaError}</p>}

                <Button
                  onClick={handleMfaVerify}
                  disabled={mfaVerifying || mfaCode.length !== 6}
                  className="w-full h-12 text-white font-semibold shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6)', boxShadow: '0 0 20px rgba(34,211,238,0.25)' }}
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
                  className="w-full text-center text-gray-500 text-sm hover:text-gray-300 transition-colors"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              /* Login form */
              <div className="space-y-6">
                {/* Header */}
                <div>
                  <h2 className="text-white text-2xl font-bold tracking-tight mb-1.5">Welcome back</h2>
                  <p className="text-gray-500 text-sm">Sign in with your corporate email</p>
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <label className="text-gray-400 text-xs uppercase tracking-widest font-semibold block">Email</label>
                  <div className="relative">
                    <Mail className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${emailError ? 'text-red-400' : 'text-gray-600'}`} />
                    <Input
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                      className={`bg-white/4 border-white/8 text-white placeholder:text-gray-600 h-12 pl-10 rounded-xl focus:bg-white/6 transition-all ${
                        emailError
                          ? 'border-red-500/60 focus:border-red-500/80 focus:ring-red-500/20'
                          : 'focus:border-cyan-400/60 focus:ring-cyan-400/20'
                      }`}
                    />
                  </div>
                  {emailError && <p className="text-red-400 text-xs mt-1">{emailError}</p>}
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-gray-400 text-xs uppercase tracking-widest font-semibold">Password</label>
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
                      className="text-cyan-400 text-xs hover:text-cyan-300 transition-colors font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${passwordError ? 'text-red-400' : 'text-gray-600'}`} />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
                      className={`bg-white/4 border-white/8 text-white placeholder:text-gray-600 h-12 pl-10 pr-12 rounded-xl focus:bg-white/6 transition-all ${
                        passwordError
                          ? 'border-red-500/60 focus:border-red-500/80 focus:ring-red-500/20'
                          : 'focus:border-cyan-400/60 focus:ring-cyan-400/20'
                      }`}
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors p-1"
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
                  className="w-full h-12 text-white font-bold rounded-xl shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    background: 'linear-gradient(135deg, #22d3ee, #3b82f6)',
                    boxShadow: '0 0 24px rgba(34,211,238,0.2), 0 4px 16px rgba(0,0,0,0.3)',
                  }}
                >
                  {isSubmitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in...</>
                  ) : (
                    <><Shield className="w-4 h-4 mr-2" />Sign In Securely</>
                  )}
                </Button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/6" />
                  <span className="text-gray-600 text-xs font-medium tracking-wide">Or continue with</span>
                  <div className="flex-1 h-px bg-white/6" />
                </div>

                {/* OAuth domain error */}
                {oauthError && (
                  <div className="text-sm text-orange-400 bg-orange-500/8 border border-orange-500/20 rounded-xl px-4 py-3 flex items-start gap-2">
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
                    className="flex items-center justify-center gap-2.5 h-11 rounded-xl border border-white/8 bg-white/3 text-gray-300 text-sm font-medium hover:bg-white/7 hover:border-white/16 hover:text-white transition-all"
                  >
                    <GoogleLogo />
                    Google
                  </button>
                  <button
                    onClick={handleMicrosoftLogin}
                    className="flex items-center justify-center gap-2.5 h-11 rounded-xl border border-white/8 bg-white/3 text-gray-300 text-sm font-medium hover:bg-white/7 hover:border-white/16 hover:text-white transition-all"
                  >
                    <MicrosoftLogo />
                    Microsoft
                  </button>
                </div>

                {/* Form error */}
                {formError && (
                  <div className="text-sm text-red-400 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
                    {formError}
                  </div>
                )}

                {/* Switch to sign up */}
                <div className="pt-4 border-t border-white/6 text-center">
                  <p className="text-gray-500 text-sm">
                    Don't have an account?{' '}
                    <button
                      onClick={onSwitchToSignUp}
                      className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
                    >
                      Sign up
                    </button>
                  </p>
                </div>

                {/* Corporate notice */}
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/6 border border-blue-500/14">
                  <Shield className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-500 text-xs leading-relaxed">
                    Corporate or institutional email required. Personal providers (Gmail, Yahoo) are not accepted.
                  </span>
                </div>
              </div>
            )}

            {/* SSL badge */}
            <div className="mt-6 flex items-center justify-center gap-2 text-gray-600 text-xs">
              <Lock className="w-3 h-3" />
              <span>Protected by 256-bit SSL encryption</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
