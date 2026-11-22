import { useState } from "react";
import { sendUserCredentials } from "../services/api";

export default function CredentialDispatchModal({
  token,
  user,
  isOpen,
  onClose,
  onDispatched,
}) {
  const [customPassword, setCustomPassword] = useState("");
  const [useCustomPassword, setUseCustomPassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [dispatchResult, setDispatchResult] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  if (!isOpen || !user) return null;

  async function handleDispatch(e) {
    e.preventDefault();
    setError("");
    setSending(true);

    try {
      const payload = {};
      if (useCustomPassword && customPassword.trim()) {
        if (customPassword.trim().length < 12) {
          setError("Custom temporary password must be at least 12 characters long.");
          setSending(false);
          return;
        }
        payload.custom_password = customPassword.trim();
      }

      const res = await sendUserCredentials(token, user.id, payload);
      setDispatchResult(res);
      if (onDispatched) {
        onDispatched(res);
      }
    } catch (err) {
      setError(err.message || "Failed to dispatch access credentials.");
    } finally {
      setSending(false);
    }
  }

  function handleCopy(text, key) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  }

  function handleResetAndClose() {
    setDispatchResult(null);
    setCustomPassword("");
    setUseCustomPassword(false);
    setError("");
    onClose();
  }

  const roleLabel =
    user.role === "doctor"
      ? "Attending Doctor"
      : user.role === "staff"
      ? "Hospital Staff"
      : user.role?.replace("_", " ");

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-sky-700 to-indigo-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold">
                {dispatchResult ? "Credentials Established" : "Dispatch Access Credentials"}
              </h3>
              <p className="text-xs text-sky-100">
                Lesson 4.9 · Automated Security Onboarding
              </p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            type="button"
            className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/10 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center space-x-2">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {!dispatchResult ? (
            /* Dispatch Confirmation & Config View */
            <form onSubmit={handleDispatch} className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Recipient Name:</span>
                  <span className="font-semibold text-slate-800">{user.full_name}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Registered Email:</span>
                  <span className="font-mono text-slate-800 font-medium">{user.email}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Assigned Role:</span>
                  <span className="font-medium text-slate-800 capitalize">{roleLabel}</span>
                </div>
                {user.hospital_name && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Hospital:</span>
                    <span className="text-slate-700 font-medium">{user.hospital_name}</span>
                  </div>
                )}
                {user.credentials_sent_at && (
                  <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200">
                    <span className="text-slate-500 font-medium">Last Sent:</span>
                    <span className="text-emerald-700 font-medium">
                      {new Date(user.credentials_sent_at).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">
                    Temporary Password Option
                  </label>
                  <label className="flex items-center space-x-1.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCustomPassword}
                      onChange={(e) => setUseCustomPassword(e.target.checked)}
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span>Specify manual password</span>
                  </label>
                </div>

                {useCustomPassword ? (
                  <div>
                    <input
                      type="text"
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      placeholder="Minimum 12 characters (uppercase, numbers, symbols)"
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Must contain uppercase, lowercase, numbers, and symbols.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-sky-50/70 border border-sky-100 rounded-lg text-xs text-sky-900 flex items-start space-x-2">
                    <svg className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                      A cryptographically secure 14-character temporary password will be automatically generated and encrypted with bcrypt (cost factor 12).
                    </span>
                  </div>
                )}
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start space-x-2">
                <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>
                  <strong>Mandatory Password Reset:</strong> The recipient will be flagged with <code>must_change_password = true</code> and forced to choose a new permanent password immediately upon first sign-in.
                </span>
              </div>

              <div className="flex justify-end space-x-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-xs disabled:opacity-50 transition flex items-center space-x-1.5 cursor-pointer"
                >
                  {sending ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      <span>Dispatching Email...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span>Dispatch Onboarding Credentials</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Post-Dispatch Credentials Detail View */
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center space-x-2.5 text-xs text-emerald-800">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold">Credentials Dispatched Successfully</p>
                  <p className="text-[11px] text-emerald-700">
                    An onboarding email has been delivered to <strong>{dispatchResult.email}</strong>.
                  </p>
                </div>
              </div>

              {/* Credential Card */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Portal Sign-In Address
                  </label>
                  <div className="mt-1 flex items-center justify-between bg-white px-3 py-2 rounded-md border border-slate-200">
                    <span className="text-xs font-mono text-sky-700 select-all">
                      {dispatchResult.portal_url}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(dispatchResult.portal_url, "portal")}
                      className="text-xs text-slate-500 hover:text-slate-800 font-medium flex items-center space-x-1 cursor-pointer"
                    >
                      <span>{copiedKey === "portal" ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Assigned Username / Email
                  </label>
                  <div className="mt-1 flex items-center justify-between bg-white px-3 py-2 rounded-md border border-slate-200">
                    <span className="text-xs font-mono text-slate-800 select-all">
                      {dispatchResult.email}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(dispatchResult.email, "email")}
                      className="text-xs text-slate-500 hover:text-slate-800 font-medium flex items-center space-x-1 cursor-pointer"
                    >
                      <span>{copiedKey === "email" ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Temporary One-Time Password
                  </label>
                  <div className="mt-1 flex items-center justify-between bg-white px-3 py-2 rounded-md border border-amber-200 bg-amber-50/50">
                    <code className="text-xs font-mono font-bold text-amber-900 select-all tracking-wider">
                      {dispatchResult.temporary_password}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopy(dispatchResult.temporary_password, "password")}
                      className="text-xs text-amber-700 hover:text-amber-900 font-semibold flex items-center space-x-1 cursor-pointer"
                    >
                      <span>{copiedKey === "password" ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-100 p-2.5 rounded-md flex items-center justify-between">
                <span>Must reset password upon first login: <strong>Enforced</strong></span>
                <span className="font-mono text-slate-400">
                  Status: {dispatchResult.credential_delivery_status?.toUpperCase()}
                </span>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const bundle = `HealthMesh Login Credentials\nPortal URL: ${dispatchResult.portal_url}\nEmail: ${dispatchResult.email}\nTemporary Password: ${dispatchResult.temporary_password}\n(Notice: Immediate password change required on initial login)`;
                    handleCopy(bundle, "all");
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition flex items-center space-x-1 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  <span>{copiedKey === "all" ? "All Credentials Copied!" : "Copy Full Record"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-md transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
