import { useState, useEffect } from "react";
import { verifyOtp, resendOtp } from "../services/api";

export default function OtpVerificationModal({
  email,
  purpose = "registration",
  onSuccess,
  onCancel,
}) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (otp.trim().length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setLoading(true);

    try {
      const result = await verifyOtp({ email, otp: otp.trim(), purpose });
      setInfo(result.message || "Verification successful!");
      setTimeout(() => {
        onSuccess(result);
      }, 1200);
    } catch (err) {
      setError(err.message || "Invalid or expired verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (countdown > 0 || resending) return;
    setError("");
    setInfo("");
    setResending(true);

    try {
      const res = await resendOtp({ email, purpose });
      setInfo(res.message || "A fresh code was sent to your email.");
      setCountdown(60);
    } catch (err) {
      setError(err.message || "Failed to resend code.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 text-slate-800">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl border border-slate-200 p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-sky-50 text-sky-700 mb-2 border border-sky-200">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-900">
            {purpose === "registration"
              ? "Verify Email Address"
              : "Verify Security Code"}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            We sent a 6-digit confirmation code to{" "}
            <span className="font-mono text-sky-700 font-medium">{email}</span>
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs"
          >
            {error}
          </div>
        )}

        {info && (
          <div
            role="status"
            className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs"
          >
            {info}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label
              htmlFor="otp-input"
              className="block text-xs font-medium text-slate-700 mb-1 text-center"
            >
              Enter 6-Digit Code
            </label>
            <input
              id="otp-input"
              type="text"
              maxLength="6"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              required
              autoFocus
              className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-300 font-mono tracking-widest text-center text-xl focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading || otp.trim().length !== 6}
            className="w-full py-2 px-4 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium rounded-md text-xs shadow-xs transition flex items-center justify-center cursor-pointer"
          >
            {loading ? "Verifying Token..." : "Confirm & Continue"}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={handleResend}
            disabled={countdown > 0 || resending}
            className="text-sky-700 hover:underline disabled:text-slate-400 font-medium cursor-pointer disabled:cursor-not-allowed"
          >
            {resending
              ? "Sending..."
              : countdown > 0
              ? `Resend in ${countdown}s`
              : "Resend Code"}
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-slate-500 hover:text-slate-700 font-medium"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
