"use client";

import React, { useState, useEffect, Suspense, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { APP_NAME } from "@/lib/brand";
import OtpInput from "@/components/auth/OtpInput";
import {
  Sparkles,
  Lock,
  Mail,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  KeyRound,
} from "lucide-react";

function ForgotPasswordForm() {
  const router = useRouter();

  // 3 Steps: 'email' -> 'code' -> 'new_password'
  const [step, setStep] = useState<"email" | "code" | "new_password">("email");

  // Form Fields
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status & Notifications
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Timers & Lockout
  const [resendCooldown, setResendCooldown] = useState(0);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Lockout timer countdown (30s after 5 wrong attempts)
  useEffect(() => {
    if (!isLockedOut) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          setIsLockedOut(false);
          setErrorMessage(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isLockedOut]);

  // Step (a): Request Password Reset Code
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    setIsLoading(true);

    try {
      // Call resetPasswordForEmail with no redirect option
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);

      if (error) {
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes("rate limit") || error.status === 429) {
          setErrorMessage("Too many requests. Please wait a moment before requesting another code.");
          setIsLoading(false);
          return;
        }
      }

      // Always show neutral notice and advance to code entry
      setInfoNotice("If an account exists for this email, we sent a code.");
      setStep("code");
      setOtpCode("");
      setResendCooldown(60);
    } catch (err: any) {
      console.error("Reset password request failed:", err);
      // Still show neutral message to protect user privacy
      setInfoNotice("If an account exists for this email, we sent a code.");
      setStep("code");
      setOtpCode("");
      setResendCooldown(60);
    } finally {
      setIsLoading(false);
    }
  };

  // Step (b): Verify Recovery OTP
  const handleVerifyOtp = useCallback(
    async (codeToVerify?: string) => {
      const code = (codeToVerify || otpCode).trim();
      if (code.length !== 6 || isLoading || isLockedOut) return;

      setIsLoading(true);
      setErrorMessage(null);
      setSuccessNotice(null);

      try {
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code,
          type: "recovery",
        });

        if (error) {
          const errMsg = error.message.toLowerCase();
          const nextWrongAttempts = wrongAttempts + 1;

          if (nextWrongAttempts >= 5) {
            setIsLockedOut(true);
            setLockoutSeconds(30);
            setWrongAttempts(0);
            setErrorMessage("Too many incorrect attempts. Verification disabled for 30 seconds.");
            return;
          }

          setWrongAttempts(nextWrongAttempts);

          if (errMsg.includes("rate limit") || error.status === 429) {
            setErrorMessage("Too many requests. Please wait a moment before trying again.");
          } else {
            setErrorMessage("The verification code is invalid or has expired. Please check and try again.");
          }
          return;
        }

        // Recovery session established, proceed to set new password
        setWrongAttempts(0);
        setStep("new_password");
        setInfoNotice(null);
      } catch (err: any) {
        console.error("Recovery OTP verification failed:", err);
        setErrorMessage("Verification failed. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [email, otpCode, isLoading, isLockedOut, wrongAttempts]
  );

  // Step (b): Resend Recovery Code
  const handleResendCode = async () => {
    if (resendCooldown > 0 || isResending || isLockedOut) return;

    setIsResending(true);
    setErrorMessage(null);
    setSuccessNotice(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());

      if (error) {
        const errMsg = error.message.toLowerCase();
        if (errMsg.includes("rate limit") || error.status === 429) {
          setErrorMessage("Too many requests. Please wait a moment before requesting another code.");
        } else {
          setErrorMessage("Could not resend code. Please try again shortly.");
        }
        return;
      }

      setResendCooldown(60);
      setSuccessNotice("A new 6-digit code has been sent to your email.");
    } catch (err: any) {
      console.error("Resend error:", err);
      setErrorMessage("Could not resend code. Please try again shortly.");
    } finally {
      setIsResending(false);
    }
  };

  // Step (c): Update Password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    if (!password || !confirmPassword) {
      setErrorMessage("Please enter and confirm your new password.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        const errMsg = error.message.toLowerCase();
        if (errMsg.includes("rate limit") || error.status === 429) {
          setErrorMessage("Too many requests. Please wait a moment before trying again.");
        } else {
          setErrorMessage(error.message || "Failed to update password. Please try again.");
        }
        return;
      }

      // Password successfully updated, redirect to dashboard
      router.refresh();
      router.push("/dashboard");
    } catch (err: any) {
      console.error("Update password error:", err);
      setErrorMessage("Failed to update password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-emerald-500/20">
          <KeyRound className="w-6 h-6 text-slate-950 stroke-[2.5]" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{APP_NAME}</h1>
        <p className="text-xs text-slate-400 mt-1.5 flex items-center justify-center gap-1.5 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          {step === "email" && "Reset your password"}
          {step === "code" && "Verify recovery code"}
          {step === "new_password" && "Create a new password"}
        </p>
      </div>

      {/* Main Card */}
      <div className="rounded-2xl border border-slate-800/90 bg-[#0c1220]/80 backdrop-blur-xl p-8 shadow-2xl shadow-black/40">
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-start gap-3 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed flex-1">{errorMessage}</div>
          </div>
        )}

        {infoNotice && (
          <div className="mb-6 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-start gap-3 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed flex-1">{infoNotice}</div>
          </div>
        )}

        {successNotice && (
          <div className="mb-6 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-start gap-3 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed flex-1">{successNotice}</div>
          </div>
        )}

        {step === "email" && (
          /* Step (a): Enter email */
          <form onSubmit={handleRequestReset} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-sans"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                We will send a 6-digit recovery code to this email.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Sending code...</span>
                </>
              ) : (
                <>
                  <span>Send Recovery Code</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>
        )}

        {step === "code" && (
          /* Step (b): Enter 6-digit OTP code */
          <div className="space-y-6">
            <div className="text-center space-y-1.5">
              <h2 className="text-base font-semibold text-white">Enter recovery code</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Enter the 6-digit code we sent to <span className="font-medium text-slate-200">{email}</span>
              </p>
            </div>

            <div>
              <OtpInput
                value={otpCode}
                onChange={(val) => {
                  setOtpCode(val);
                  setErrorMessage(null);
                }}
                onComplete={(code) => handleVerifyOtp(code)}
                disabled={isLoading || isLockedOut}
                hasError={Boolean(errorMessage) && !isLockedOut}
                autoFocus={true}
              />

              {isLockedOut && (
                <p className="text-xs text-rose-400 text-center mt-2.5 font-medium">
                  Input temporarily disabled. Try again in {lockoutSeconds}s.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleVerifyOtp()}
              disabled={otpCode.length !== 6 || isLoading || isLockedOut}
              className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Verifying code...</span>
                </>
              ) : (
                <>
                  <span>Verify Code</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>

            {/* Actions: Resend and Change Email */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || isResending || isLockedOut}
                className="text-emerald-400 hover:text-emerald-300 font-medium disabled:text-slate-500 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isResending ? "animate-spin" : ""}`} />
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setOtpCode("");
                  setErrorMessage(null);
                  setInfoNotice(null);
                  setSuccessNotice(null);
                }}
                disabled={isLoading}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                Change email
              </button>
            </div>
          </div>
        )}

        {step === "new_password" && (
          /* Step (c): Set New Password */
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="text-center space-y-1 mb-2">
              <h2 className="text-base font-semibold text-white">Create new password</h2>
              <p className="text-xs text-slate-400">
                Choose a strong password with at least 8 characters.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-sans"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Must be at least 8 characters</p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-sans"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  title={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Updating password...</span>
                </>
              ) : (
                <>
                  <span>Update Password</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Back to sign in */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 text-center space-y-3">
          <p className="text-xs text-slate-400">
            Remember your password?{" "}
            <Link
              href="/login"
              className="text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-2 transition-colors ml-1"
            >
              Sign in
            </Link>
          </p>
          <p className="text-[11px] text-slate-500">Secure recovery</p>
        </div>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

      <Suspense
        fallback={
          <div className="w-full max-w-md p-8 rounded-2xl border border-slate-800 bg-[#0c1220] text-center text-slate-400 text-sm">
            Loading recovery portal...
          </div>
        }
      >
        <ForgotPasswordForm />
      </Suspense>
    </div>
  );
}
