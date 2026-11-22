import { useState, useEffect } from "react";
import { getStaffById, getDepartments, getDesignations, updateStaff } from "../services/api";
import { AVAILABLE_PERMISSIONS } from "./CreateStaffModal";
import CredentialDispatchModal from "./CredentialDispatchModal";
import CustomDropdown from "../components/CustomDropdown";

const SHIFT_OPTIONS = [
  "Morning (08:00 - 16:00)",
  "Evening (16:00 - 00:00)",
  "Night (00:00 - 08:00)",
  "General Shift (09:00 - 18:00)",
  "Rotating Roster",
  "On-Call / Flexible",
];

export default function StaffProfileModal({ token, staffId, isOpen, onClose, onUpdated }) {
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showCredModal, setShowCredModal] = useState(false);

  // Edit state
  const [departmentId, setDepartmentId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [status, setStatus] = useState("active");
  const [employeeId, setEmployeeId] = useState("");
  const [shiftTiming, setShiftTiming] = useState("");
  const [phone, setPhone] = useState("");
  const [permissions, setPermissions] = useState([]);

  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);

  useEffect(() => {
    if (!isOpen || !staffId) return;

    setLoading(true);
    setError("");
    setSuccessMsg("");
    setIsEditing(false);

    Promise.all([
      getStaffById(token, staffId),
      getDepartments(token).catch(() => []),
      getDesignations(token).catch(() => []),
    ])
      .then(([stf, depts, desigs]) => {
        setStaff(stf);
        setDepartments(Array.isArray(depts) ? depts.filter((d) => d.status === "active") : []);
        setDesignations(Array.isArray(desigs) ? desigs.filter((d) => d.status === "active") : []);

        // Populate edit state
        setDepartmentId(stf.department_id ? String(stf.department_id) : "");
        setDesignationId(stf.designation_id ? String(stf.designation_id) : "");
        setStatus(stf.status || "pending");
        setEmployeeId(stf.employee_id || "");
        setShiftTiming(stf.shift_timing || "");
        setPhone(stf.phone || "");
        setPermissions(Array.isArray(stf.permissions) ? stf.permissions : []);
      })
      .catch((err) => setError(err.message || "Unable to load staff profile."))
      .finally(() => setLoading(false));
  }, [isOpen, staffId, token]);

  function togglePermission(key) {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    setSaving(true);
    try {
      const payload = {
        department_id: departmentId ? Number(departmentId) : null,
        designation_id: designationId ? Number(designationId) : null,
        status,
        employee_id: employeeId.trim() || null,
        shift_timing: shiftTiming.trim() || null,
        phone: phone.trim() || null,
        permissions,
      };

      const updated = await updateStaff(token, staffId, payload);
      setStaff((prev) => ({ ...prev, ...payload, ...updated }));
      setSuccessMsg("Staff profile and permissions updated successfully.");
      setIsEditing(false);
      onUpdated?.(updated);
    } catch (err) {
      setError(err.message || "Failed to update staff profile.");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-800 font-bold text-sm flex items-center justify-center border border-indigo-200">
              {staff?.full_name
                ? staff.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                : "ST"}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-slate-900 leading-tight">
                  {staff?.full_name || "Staff Profile"}
                </h3>
                {staff?.status && (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                      staff.status === "active"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : staff.status === "pending"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {staff.status.toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {staff?.designation_name || "Staff Member"} &bull; {staff?.department_name || "General Unit"}
                {staff?.employee_id ? ` &bull; Badge: ${staff.employee_id}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!loading && !isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition cursor-pointer"
              >
                Edit &amp; Permissions
              </button>
            )}
            <button
              onClick={onClose}
              type="button"
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs flex items-center justify-between">
              <span className="font-medium">{error}</span>
              <button onClick={() => setError("")} className="font-bold text-rose-500">×</button>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs flex items-center justify-between">
              <span className="font-medium">{successMsg}</span>
              <button onClick={() => setSuccessMsg("")} className="font-bold text-emerald-500">×</button>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center">
              <svg className="animate-spin h-6 w-6 text-indigo-600 mb-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Loading staff profile &amp; permissions...</span>
            </div>
          ) : isEditing ? (
            /* Edit Form */
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Department Assignment (Lesson 4.8)
                  </label>
                  <CustomDropdown
                    value={departmentId}
                    onChange={(val) => setDepartmentId(val)}
                    options={[
                      { value: "", label: "-- No Department --" },
                      ...departments.map((d) => ({
                        value: d.id,
                        label: `${d.name}${d.master_department_name ? ` (${d.master_department_name})` : ""}`,
                      })),
                    ]}
                    placeholder="-- No Department --"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Designation (Lesson 4.7)
                  </label>
                  <CustomDropdown
                    value={designationId}
                    onChange={(val) => setDesignationId(val)}
                    options={[
                      { value: "", label: "-- No Designation --" },
                      ...designations.map((d) => ({
                        value: d.id,
                        label: d.name,
                      })),
                    ]}
                    placeholder="-- No Designation --"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Account Status
                  </label>
                  <CustomDropdown
                    value={status}
                    onChange={(val) => setStatus(val)}
                    options={[
                      { value: "active", label: "Active (Authorized)" },
                      { value: "pending", label: "Pending Approval" },
                      { value: "inactive", label: "Inactive" },
                      { value: "suspended", label: "Suspended" },
                    ]}
                    placeholder="Select Status"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Employee ID
                  </label>
                  <input
                    type="text"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Shift Timing
                  </label>
                  <CustomDropdown
                    value={shiftTiming || ""}
                    onChange={(val) => setShiftTiming(val)}
                    options={[
                      ...(shiftTiming && !SHIFT_OPTIONS.includes(shiftTiming) ? [{ value: shiftTiming, label: shiftTiming }] : []),
                      ...SHIFT_OPTIONS.map((opt) => ({ value: opt, label: opt })),
                    ]}
                    placeholder="Select shift timing..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Granular Permissions Editor */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                    Assigned RBAC Capabilities ({permissions.length} Active)
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-1 bg-slate-50/50 rounded-lg border border-slate-200">
                  {AVAILABLE_PERMISSIONS.map((perm) => {
                    const isChecked = permissions.includes(perm.key);
                    return (
                      <label
                        key={perm.key}
                        className={`flex items-start space-x-2 p-2 rounded border text-xs cursor-pointer transition ${
                          isChecked
                            ? "bg-indigo-50/70 border-indigo-200 text-slate-900"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePermission(perm.key)}
                          className="mt-0.5 w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-xs leading-tight">
                            {perm.label}
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">
                            {perm.key}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded-md text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-xs disabled:opacity-50"
                >
                  {saving ? "Saving Changes..." : "Save Profile & Permissions"}
                </button>
              </div>
            </form>
          ) : (
            /* View Mode */
            <div className="space-y-5">
              {/* Overview Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/70 p-4 rounded-lg border border-slate-200">
                <div>
                  <span className="text-[11px] font-semibold uppercase text-slate-400 block">
                    Employee ID
                  </span>
                  <span className="font-mono text-sm font-bold text-slate-900 mt-0.5 block">
                    {staff?.employee_id || "Unassigned"}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase text-slate-400 block">
                    Shift Timing
                  </span>
                  <span className="text-xs font-semibold text-slate-800 mt-0.5 block truncate">
                    {staff?.shift_timing || "Standard"}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase text-slate-400 block">
                    Unit / Department
                  </span>
                  <span className="text-xs font-semibold text-indigo-700 mt-0.5 block truncate">
                    {staff?.department_name || "General Facility"}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase text-slate-400 block">
                    Permissions Count
                  </span>
                  <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                    {Array.isArray(staff?.permissions) ? staff.permissions.length : 0} Granted
                  </span>
                </div>
              </div>

              {/* Granular Active Permissions Chips */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
                  <span>Granted Functional Capabilities (Lesson 4.8)</span>
                  <span className="text-[11px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    Role: {staff?.designation_name || "Staff"}
                  </span>
                </h4>

                {Array.isArray(staff?.permissions) && staff.permissions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {staff.permissions.map((p) => {
                      const matched = AVAILABLE_PERMISSIONS.find((ap) => ap.key === p);
                      return (
                        <div
                          key={p}
                          className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                          <span>{matched ? matched.label : p}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({p})</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No specific permissions granted yet.</p>
                )}
              </div>

              {/* Delivery & Account Status */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Contact &amp; Account Delivery (Lesson 4.9 Prep)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block">Official Email:</span>
                    <span className="font-medium text-slate-900">{staff?.email}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Direct Phone:</span>
                    <span className="font-medium text-slate-900">{staff?.phone || "None provided"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Credentials Delivery Status:</span>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {staff?.credentials_sent_at ? (
                        <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-medium">
                          ✓ Sent {new Date(staff.credentials_sent_at).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-medium">
                          Not yet dispatched
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowCredModal(true)}
                        className="px-2 py-0.5 text-xs font-semibold rounded text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition cursor-pointer flex items-center space-x-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span>{staff?.credentials_sent_at ? "Re-send" : "Dispatch Credentials"}</span>
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Mandatory Password Reset:</span>
                    <span className="font-medium text-slate-700">
                      {staff?.must_change_password ? "Required on initial sign-in" : "Completed / Standard"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-mono">
            Staff ID #{staff?.id} &bull; Registered {staff?.created_at ? new Date(staff.created_at).toLocaleDateString() : ""}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Credential Dispatch Modal (Lesson 4.9) */}
      <CredentialDispatchModal
        token={token}
        user={staff ? { ...staff, role: "staff" } : null}
        isOpen={showCredModal}
        onClose={() => setShowCredModal(false)}
        onDispatched={(res) => {
          setStaff((prev) => ({
            ...prev,
            credential_delivery_status: "sent",
            credentials_sent_at: res.credentials_sent_at,
            must_change_password: true,
            status: prev.status === "pending" ? "active" : prev.status,
          }));
          setSuccessMsg(`Onboarding credentials dispatched to ${res.email}`);
          if (onUpdated) onUpdated();
        }}
      />
    </div>
  );
}
