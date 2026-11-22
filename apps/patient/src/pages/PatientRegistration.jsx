import { useState } from "react";
import { registerPatient } from "../services/api";

export default function PatientRegistration({ onRegistered, onBackToLogin }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password.length < 12) {
      setError("Password must be at least 12 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await registerPatient({
        fullName,
        email,
        password,
        phone: phone.trim() || undefined,
      });

      onRegistered(email.trim().toLowerCase());
    } catch (err) {
      setError(err.message || "Failed to create patient account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-6 text-slate-900 font-sans">
      <div className="w-full max-w-lg bg-white rounded-lg shadow-xl border border-slate-200 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-sky-50 text-sky-700 mb-2 border border-sky-200">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-slate-900">
            Create Patient Account
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Register for online doctor appointments, verified e-prescriptions, and diagnostic records
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs leading-relaxed"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="reg-fullName"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Full Legal Name *
            </label>
            <input
              id="reg-fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="e.g. Undhad Harshil"
              className="ent-input text-xs"
            />
          </div>

          <div>
            <label
              htmlFor="reg-email"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Email Address *
            </label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="patient@example.com"
              className="ent-input text-xs"
            />
          </div>

          <div>
            <label
              htmlFor="reg-phone"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Mobile Contact Number
            </label>
            <input
              id="reg-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91-9876543210"
              className="ent-input text-xs font-mono"
            />
          </div>

          <div>
            <label
              htmlFor="reg-password"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Security Password *
            </label>
            <input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Min 12 characters"
              className="ent-input text-xs"
            />
            <span
              className={`text-[11px] mt-1 block ${
                password.length >= 12
                  ? "text-emerald-700 font-medium"
                  : "text-slate-400"
              }`}
            >
              {password.length}/12 characters minimum
            </span>
          </div>

          <div>
            <label
              htmlFor="reg-confirmPassword"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Confirm Password *
            </label>
            <input
              id="reg-confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Confirm password"
              className="ent-input text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-md text-xs shadow-xs transition disabled:opacity-50 flex items-center justify-center cursor-pointer"
          >
            {loading ? "Creating Account..." : "Create Account & Verify Email"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-200 text-center">
          <p className="text-xs text-slate-500">
            Already have a patient account?{" "}
            <button
              type="button"
              onClick={onBackToLogin}
              className="text-sky-700 hover:underline font-semibold"
            >
              Sign in &rarr;
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
