import { useState, useEffect } from "react";
import { getStaffProfile, updateStaffProfile } from "../services/api";
import CustomDropdown from "../components/CustomDropdown";

const SHIFT_OPTIONS = [
  "Morning (08:00 - 16:00)",
  "Evening (16:00 - 00:00)",
  "Night (00:00 - 08:00)",
  "General Shift (09:00 - 18:00)",
  "Rotating Roster",
  "On-Call / Flexible",
];

export default function StaffProfile({ session }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [phone, setPhone] = useState("");
  const [shiftTiming, setShiftTiming] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    setLoading(true);
    setError("");

    getStaffProfile(session.token, session.user.id)
      .then((data) => {
        setProfile(data);
        setPhone(data.phone || "");
        setShiftTiming(data.shift_timing || "");
      })
      .catch((err) => setError(err.message || "Failed to load profile."))
      .finally(() => setLoading(false));
  }, [session]);

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    setSaving(true);
    try {
      const payload = {
        phone: phone.trim() || null,
        shift_timing: shiftTiming.trim() || null,
      };

      const updated = await updateStaffProfile(session.token, session.user.id, payload);
      setProfile((prev) => ({ ...prev, ...payload, ...updated }));
      setSuccessMsg("Your staff profile details have been updated successfully.");
      setIsEditing(false);
    } catch (err) {
      setError(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center">
        <svg className="animate-spin h-6 w-6 text-indigo-600 mb-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span>Loading your staff profile and credentials...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-full bg-indigo-600 text-white font-bold text-xl flex items-center justify-center shadow-md">
            {profile?.full_name
              ? profile.full_name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()
              : "ST"}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-slate-900">{profile?.full_name}</h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {profile?.status ? profile.status.toUpperCase() : "ACTIVE"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {profile?.designation_name || "Operational Staff"} &bull; {profile?.department_name || "General Unit"}
              {profile?.employee_id ? ` &bull; Badge: ${profile.employee_id}` : ""}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {profile?.hospital_name} (#{profile?.hospital_code || profile?.hospital_id})
            </p>
          </div>
        </div>

        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition cursor-pointer self-start sm:self-center"
          >
            Edit Contact Details
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between">
          <span className="font-medium">{error}</span>
          <button onClick={() => setError("")} className="font-bold text-rose-500">×</button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between">
          <span className="font-medium">{successMsg}</span>
          <button onClick={() => setSuccessMsg("")} className="font-bold text-emerald-500">×</button>
        </div>
      )}

      {/* Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
            Designation Role
          </span>
          <span className="text-lg font-bold text-indigo-700 mt-1 block">
            {profile?.designation_name || "Clinical Support Staff"}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Hospital Unit: {profile?.department_name || "Unassigned"}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
            Employee Badge ID
          </span>
          <span className="font-mono text-xl font-bold text-slate-900 mt-1 block">
            {profile?.employee_id || "None Assigned"}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">Internal workforce code</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
            Shift Assignment
          </span>
          <span className="text-base font-bold text-slate-900 mt-1 block truncate">
            {profile?.shift_timing || "Standard Day Shift"}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">Current scheduled roster</span>
        </div>
      </div>

      {isEditing ? (
        <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-200">
            Edit Contact &amp; Shift Preference
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Direct Contact Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9876543210"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Shift Timing Preference
              </label>
              <CustomDropdown
                value={shiftTiming || ""}
                onChange={(val) => setShiftTiming(val)}
                options={[
                  ...(shiftTiming && !SHIFT_OPTIONS.includes(shiftTiming) ? [{ value: shiftTiming, label: shiftTiming }] : []),
                  ...SHIFT_OPTIONS.map((opt) => ({ value: opt, label: opt })),
                ]}
                placeholder="Select shift timing preference..."
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-semibold transition disabled:opacity-50"
            >
              {saving ? "Saving Changes..." : "Save Details"}
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
          {/* Active Permissions Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
              Granted RBAC Functional Permissions (Lesson 4.8)
            </h3>

            {Array.isArray(profile?.permissions) && profile.permissions.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {profile.permissions.map((p) => (
                  <div
                    key={p}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-800 border border-indigo-200"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                    <span className="font-mono">{p}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No specific permissions granted yet.</p>
            )}
          </div>

          {/* Account credentials info */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Account Identity &amp; Contact Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Official Email:</span>
                <span className="font-medium text-slate-900">{profile?.email}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Direct Phone:</span>
                <span className="font-medium text-slate-900">{profile?.phone || "None registered"}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Assigned Facility:</span>
                <span className="font-medium text-slate-800">
                  {profile?.hospital_name} (#{profile?.hospital_code || profile?.hospital_id})
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Primary Department:</span>
                <span className="font-medium text-slate-800">{profile?.department_name || "General Unit"}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
