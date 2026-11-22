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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-slate-800">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-50 text-sky-600 mb-3 border border-sky-100 shadow-sm">
            <svg
              className="w-7 h-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            {purpose === "registration"
              ? "Verify Your Email"
              : "Verify Reset Code"}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            We sent a 6-digit code to{" "}
            <span className="font-semibold text-slate-800">{email}</span>
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-start space-x-2"
          >
            <svg className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {info && (
          <div
            role="status"
            className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm flex items-start space-x-2"
          >
            <svg className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>{info}</span>
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-5">
          <div>
            <label
              htmlFor="otp-code"
              className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 text-center"
            >
              Enter 6-Digit Code
            </label>
            <input
              id="otp-code"
              type="text"
              maxLength="6"
              pattern="[0-9]*"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              autoFocus
              className="w-full text-center text-3xl font-mono tracking-widest py-3 px-4 bg-slate-50 border-2 border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 focus:bg-white focus:ring-4 focus:ring-sky-100 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-sm shadow-md shadow-sky-600/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? "Verifying..." : "Verify Code"}
          </button>
        </form>

        <div className="mt-6 text-center flex flex-col space-y-2">
          <p className="text-xs text-slate-500">
            Didn't receive the code?{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={countdown > 0 || resending}
              className="font-bold text-sky-600 hover:text-sky-700 disabled:text-slate-400 disabled:cursor-not-allowed hover:underline ml-1"
            >
              {countdown > 0
                ? `Resend in ${countdown}s`
                : resending
                ? "Sending..."
                : "Resend Code"}
            </button>
          </p>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-slate-500 hover:text-slate-700 hover:underline pt-2"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
