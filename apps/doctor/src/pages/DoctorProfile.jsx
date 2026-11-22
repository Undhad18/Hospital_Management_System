import { useState, useEffect, useCallback } from "react";
import {
  getDoctorProfile,
  updateDoctorProfile,
  getDoctorSchedules,
  updateDoctorSchedules,
  getDoctorLeaves,
  addDoctorLeave,
  deleteDoctorLeave,
} from "../services/api";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function DoctorProfile({ session }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [phone, setPhone] = useState("");
  const [consultationFee, setConsultationFee] = useState("0");
  const [bio, setBio] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Weekly Schedules state (Lesson 6.2)
  const [schedules, setSchedules] = useState(
    DAY_NAMES.map((name, i) => ({
      day_of_week: name.toLowerCase(),
      day_name: name,
      start_time: "09:00",
      end_time: "17:00",
      break_start: "13:00",
      break_end: "14:00",
      slot_duration_minutes: 30,
      is_available: i >= 1 && i <= 5, // Mon-Fri default true
    }))
  );
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState("");

  // Leaves state (Lesson 6.2)
  const [leaves, setLeaves] = useState([]);
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [savingLeave, setSavingLeave] = useState(false);
  const [leaveError, setLeaveError] = useState("");

  const doctorId = session?.user?.id;

  const loadData = useCallback(async () => {
    if (!doctorId || !session?.token) return;
    setLoading(true);
    setError("");

    try {
      const [profileData, schedData, leaveData] = await Promise.all([
        getDoctorProfile(session.token, doctorId),
        getDoctorSchedules(session.token, doctorId).catch(() => []),
        getDoctorLeaves(session.token, doctorId).catch(() => []),
      ]);

      setProfile(profileData);
      setPhone(profileData.phone || "");
      setConsultationFee(profileData.consultation_fee ? String(profileData.consultation_fee) : "0");
      setBio(profileData.bio || "");

      if (Array.isArray(schedData) && schedData.length > 0) {
        setSchedules((prev) =>
          prev.map((day) => {
            const matched = schedData.find((s) => {
              const sDay = String(s.day_of_week).toLowerCase().trim();
              const targetDay = String(day.day_of_week).toLowerCase().trim();
              if (sDay === targetDay) return true;
              if (typeof s.day_of_week === "number" && DAY_NAMES[s.day_of_week]?.toLowerCase() === targetDay) return true;
              return false;
            });
            if (matched) {
              return {
                ...day,
                start_time: (matched.start_time || "09:00").slice(0, 5),
                end_time: (matched.end_time || "17:00").slice(0, 5),
                break_start: (matched.break_start || "13:00").slice(0, 5),
                break_end: (matched.break_end || "14:00").slice(0, 5),
                slot_duration_minutes: matched.slot_duration_minutes || 30,
                is_available: Boolean(matched.is_available),
              };
            }
            return day;
          })
        );
      }

      if (Array.isArray(leaveData)) {
        setLeaves(leaveData);
      }
    } catch (err) {
      setError(err.message || "Failed to load clinical profile.");
    } finally {
      setLoading(false);
    }
  }, [doctorId, session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    const feeNum = Number(consultationFee);
    if (isNaN(feeNum) || feeNum < 0) {
      setError("Consultation fee cannot be negative.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        phone: phone.trim() || null,
        consultation_fee: feeNum,
        bio: bio.trim() || null,
      };

      const updated = await updateDoctorProfile(session.token, doctorId, payload);
      setProfile((prev) => ({ ...prev, ...payload, ...updated }));
      setSuccessMsg("Your professional profile has been updated successfully.");
      setIsEditing(false);
    } catch (err) {
      setError(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  }

  function handleScheduleChange(dayIndex, field, value) {
    setSchedules((prev) =>
      prev.map((item, idx) => (idx === dayIndex ? { ...item, [field]: value } : item))
    );
  }

  async function handleSaveSchedules() {
    setSavingSchedule(true);
    setScheduleMsg("");
    setError("");

    try {
      const formatted = schedules.map((s) => ({
        day_of_week: String(s.day_of_week).toLowerCase(),
        start_time: s.start_time,
        end_time: s.end_time,
        break_start: s.break_start || null,
        break_end: s.break_end || null,
        slot_duration_minutes: 30,
        is_available: s.is_available ? 1 : 0,
      }));

      await updateDoctorSchedules(session.token, doctorId, formatted);
      setScheduleMsg("Weekly recurring consultation schedules saved successfully.");
    } catch (err) {
      setError(err.message || "Failed to save weekly schedule.");
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleAddLeave(e) {
    e.preventDefault();
    if (!leaveDate) return;
    setLeaveError("");
    setSavingLeave(true);

    try {
      await addDoctorLeave(session.token, doctorId, {
        leave_date: leaveDate,
        reason: leaveReason || "Scheduled personal leave",
      });
      setLeaveDate("");
      setLeaveReason("");
      const updated = await getDoctorLeaves(session.token, doctorId);
      setLeaves(updated);
    } catch (err) {
      setLeaveError(err.message || "Failed to schedule leave date.");
    } finally {
      setSavingLeave(false);
    }
  }

  async function handleDeleteLeave(leaveId) {
    try {
      await deleteDoctorLeave(session.token, doctorId, leaveId);
      setLeaves((prev) => prev.filter((l) => l.id !== leaveId));
    } catch (err) {
      setError(err.message || "Failed to cancel leave.");
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center">
        <svg className="animate-spin h-6 w-6 text-teal-600 mb-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span>Loading your clinical profile...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-full bg-teal-600 text-white font-bold text-xl flex items-center justify-center shadow-md">
            {profile?.full_name
              ? profile.full_name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()
              : "DR"}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-slate-900">{profile?.full_name}</h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {profile?.status ? profile.status.toUpperCase() : "ACTIVE"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {profile?.designation_name || "Physician"} &bull; {profile?.department_name || "General Medicine"}
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
            className="px-4 py-2 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition cursor-pointer self-start sm:self-center"
          >
            Edit Bio &amp; Rates
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

      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
            Consultation Fee
          </span>
          <span className="text-2xl font-bold text-teal-700 mt-1 block">
            ₹{profile?.consultation_fee ? Number(profile.consultation_fee).toFixed(2) : "0.00"}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">Per patient OPD consultation</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
            Clinical Experience
          </span>
          <span className="text-2xl font-bold text-slate-900 mt-1 block">
            {profile?.experience_years || 0} Years
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">Recognized clinical practice</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
            Assigned Room / Clinic
          </span>
          <span className="text-2xl font-bold text-slate-800 mt-1 block">
            {profile?.room_number || "OPD #304"}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">Facility Outpatient Department</span>
        </div>
      </div>

      {/* Profile Form (Edit mode or Read-only) */}
      {isEditing ? (
        <form onSubmit={handleSaveProfile} className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
            Edit Practice Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Consultation Fee (₹) *
              </label>
              <input
                type="number"
                min="0"
                step="50"
                value={consultationFee}
                onChange={(e) => setConsultationFee(e.target.value)}
                required
                className="ent-input text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Direct Contact Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="ent-input text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Practice Biography &amp; Clinical Focus
            </label>
            <textarea
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Provide a clinical biography, areas of specialization, and patient care philosophies..."
              className="ent-input text-xs"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="ent-btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="ent-btn-primary text-xs"
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
              Regulatory Licensure &amp; Degrees (Lesson 4.5)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Medical License Number:</span>
                <span className="font-mono font-medium text-slate-900 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 inline-block mt-0.5">
                  {profile?.license_number || "Not on file"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Academic Qualifications:</span>
                <span className="font-semibold text-slate-800">
                  {profile?.qualifications || "Not specified"}
                </span>
              </div>
            </div>
          </div>

          {profile?.bio && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Practice Highlights &amp; Clinical Biography
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50/50 p-4 rounded-lg border border-slate-100">
                {profile.bio}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* Lesson 6.2: Doctor Weekly Consultation Schedule & Availability Management */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Weekly Consultation Schedule &amp; Slot Management (Lesson 6.2)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure your weekly working hours and lunch break. Dynamic 30-min booking slots are calculated automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveSchedules}
            disabled={savingSchedule}
            className="ent-btn-primary text-xs self-start sm:self-auto"
          >
            {savingSchedule ? "Saving Schedule..." : "Save Weekly Schedule"}
          </button>
        </div>

        {scheduleMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded">
            {scheduleMsg}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 px-3 font-semibold">Day of Week</th>
                <th className="py-2 px-3 font-semibold">Available</th>
                <th className="py-2 px-3 font-semibold">Start Time</th>
                <th className="py-2 px-3 font-semibold">End Time</th>
                <th className="py-2 px-3 font-semibold">Break Start</th>
                <th className="py-2 px-3 font-semibold">Break End</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedules.map((day, idx) => (
                <tr key={day.day_of_week} className={day.is_available ? "hover:bg-slate-50" : "bg-slate-50/60 opacity-60"}>
                  <td className="py-2.5 px-3 font-semibold text-slate-800 capitalize">
                    {day.day_name || day.day_of_week}
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="checkbox"
                      checked={day.is_available}
                      onChange={(e) => handleScheduleChange(idx, "is_available", e.target.checked)}
                      className="rounded text-teal-600 focus:ring-teal-500 h-4 w-4"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="time"
                      disabled={!day.is_available}
                      value={day.start_time}
                      onChange={(e) => handleScheduleChange(idx, "start_time", e.target.value)}
                      className="ent-input text-xs py-1 px-2 w-28 disabled:bg-slate-100"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="time"
                      disabled={!day.is_available}
                      value={day.end_time}
                      onChange={(e) => handleScheduleChange(idx, "end_time", e.target.value)}
                      className="ent-input text-xs py-1 px-2 w-28 disabled:bg-slate-100"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="time"
                      disabled={!day.is_available}
                      value={day.break_start}
                      onChange={(e) => handleScheduleChange(idx, "break_start", e.target.value)}
                      className="ent-input text-xs py-1 px-2 w-28 disabled:bg-slate-100"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="time"
                      disabled={!day.is_available}
                      value={day.break_end}
                      onChange={(e) => handleScheduleChange(idx, "break_end", e.target.value)}
                      className="ent-input text-xs py-1 px-2 w-28 disabled:bg-slate-100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Lesson 6.2: Scheduled Doctor Leaves & Absence Calendar */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Approved Leaves &amp; Scheduled Absence (Lesson 6.2)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Mark dates when you will be unavailable for consultations. Appointment booking for these dates will be blocked automatically.
          </p>
        </div>

        {leaveError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded">
            {leaveError}
          </div>
        )}

        <form onSubmit={handleAddLeave} className="flex flex-col sm:flex-row items-end gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Leave Date *
            </label>
            <input
              type="date"
              min={new Date().toISOString().split("T")[0]}
              value={leaveDate}
              onChange={(e) => setLeaveDate(e.target.value)}
              required
              className="ent-input text-xs py-1.5"
            />
          </div>
          <div className="flex-1 w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason / Notes
            </label>
            <input
              type="text"
              placeholder="e.g. Annual Medical Conference, Personal leave"
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              className="ent-input text-xs py-1.5"
            />
          </div>
          <button
            type="submit"
            disabled={savingLeave || !leaveDate}
            className="ent-btn-primary text-xs shrink-0 py-2 px-4"
          >
            {savingLeave ? "Scheduling..." : "Add Leave"}
          </button>
        </form>

        <div className="overflow-x-auto">
          {leaves.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center">No upcoming leaves scheduled.</p>
          ) : (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 px-3 font-semibold">Leave Date</th>
                  <th className="py-2 px-3 font-semibold">Reason</th>
                  <th className="py-2 px-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaves.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                      {l.leave_date}
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {l.reason || "Approved Leave"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteLeave(l.id)}
                        className="text-rose-600 hover:text-rose-800 font-medium text-xs cursor-pointer"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
