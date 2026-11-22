import { useState, useEffect } from "react";
import { getDepartments, getDesignations, createStaff } from "../services/api";
import CustomDropdown from "../components/CustomDropdown";

export const AVAILABLE_PERMISSIONS = [
  // Front Desk & Reception
  { key: "patient_registration", label: "Patient Registration & Intake", category: "Reception" },
  { key: "appointment_booking", label: "Appointment Scheduling", category: "Reception" },
  { key: "queue_management", label: "Queue & OPD Flow Management", category: "Reception" },
  { key: "visitor_pass", label: "Visitor Badging & Security Pass", category: "Reception" },

  // Clinical & Nursing
  { key: "patient_vitals", label: "Vitals Recording & Triage", category: "Nursing" },
  { key: "bed_allocation", label: "Bed & Ward Allocation", category: "Nursing" },
  { key: "triage_entry", label: "Emergency Triage Scoring", category: "Nursing" },
  { key: "medication_admin", label: "Medication Administration", category: "Nursing" },
  { key: "doctor_notes_view", label: "View Physician Progress Notes", category: "Nursing" },

  // Pharmacy
  { key: "prescription_dispense", label: "Prescription Dispensing", category: "Pharmacy" },
  { key: "pharmacy_inventory", label: "Pharmaceutical Inventory Control", category: "Pharmacy" },
  { key: "stock_alerts", label: "Stock Expiry & Threshold Alerts", category: "Pharmacy" },
  { key: "medication_billing", label: "Medication POS Billing", category: "Pharmacy" },

  // Laboratory & Diagnostics
  { key: "specimen_collection", label: "Specimen Collection & Barcoding", category: "Laboratory" },
  { key: "lab_result_entry", label: "Diagnostic Test Results Entry", category: "Laboratory" },
  { key: "test_report_upload", label: "Upload Diagnostic Images/Reports", category: "Laboratory" },
  { key: "lab_equipment_log", label: "Lab Equipment Calibration Log", category: "Laboratory" },

  // Accounting & Billing
  { key: "invoice_generation", label: "Generate Invoices & Estimates", category: "Accounting" },
  { key: "payment_collection", label: "Cash & Payment Settlements", category: "Accounting" },
  { key: "insurance_claims", label: "TPA & Insurance Claims", category: "Accounting" },
  { key: "financial_reports", label: "Ledger Settlements & Financial Reports", category: "Accounting" },
];

const PRESET_MAPPINGS = {
  receptionist: ["patient_registration", "appointment_booking", "queue_management", "visitor_pass"],
  nurse: ["patient_vitals", "bed_allocation", "triage_entry", "medication_admin", "doctor_notes_view"],
  pharmacist: ["prescription_dispense", "pharmacy_inventory", "stock_alerts", "medication_billing"],
  "lab staff": ["specimen_collection", "lab_result_entry", "test_report_upload", "lab_equipment_log"],
  "lab technician": ["specimen_collection", "lab_result_entry", "test_report_upload", "lab_equipment_log"],
  accountant: ["invoice_generation", "payment_collection", "insurance_claims", "financial_reports"],
};

export default function CreateStaffModal({ token, hospitalId, isOpen, onClose, onSuccess }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [shiftTiming, setShiftTiming] = useState("Morning (08:00 - 16:00)");
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [isTemporaryPassword, setIsTemporaryPassword] = useState(true);

  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    setError("");
    setLoadingLookups(true);

    Promise.all([
      getDepartments(token).catch(() => []),
      getDesignations(token).catch(() => []),
    ])
      .then(([depts, desigs]) => {
        const activeDepts = Array.isArray(depts) ? depts.filter((d) => d.status === "active") : [];
        setDepartments(activeDepts);
        if (activeDepts.length > 0) {
          setDepartmentId(String(activeDepts[0].id));
        }

        const activeDesigs = Array.isArray(desigs) ? desigs.filter((d) => d.status === "active") : [];
        setDesignations(activeDesigs);

        // Pre-select first non-doctor designation
        const staffDesig = activeDesigs.find(
          (d) =>
            !d.name.toLowerCase().includes("doctor") &&
            !d.name.toLowerCase().includes("physician") &&
            !d.name.toLowerCase().includes("surgeon")
        );
        if (staffDesig) {
          setDesignationId(String(staffDesig.id));
          applyPresetForDesignation(staffDesig.name);
        } else if (activeDesigs.length > 0) {
          setDesignationId(String(activeDesigs[0].id));
          applyPresetForDesignation(activeDesigs[0].name);
        }
      })
      .finally(() => setLoadingLookups(false));
  }, [isOpen, token]);

  function applyPresetForDesignation(name) {
    if (!name) return;
    const lower = name.toLowerCase();
    for (const [key, perms] of Object.entries(PRESET_MAPPINGS)) {
      if (lower.includes(key)) {
        setSelectedPermissions(perms);
        return;
      }
    }
    setSelectedPermissions(["patient_registration"]);
  }

  function handleDesignationChange(newId) {
    setDesignationId(newId);
    const chosen = designations.find((d) => String(d.id) === String(newId));
    if (chosen) {
      applyPresetForDesignation(chosen.name);
    }
  }

  function togglePermission(key) {
    setSelectedPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }

  function handleGeneratePassword() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
    let generated = "";
    for (let i = 0; i < 14; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(generated);
    setIsTemporaryPassword(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!fullName.trim()) {
      setError("Staff member's full name is required.");
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("A valid email address is required.");
      return;
    }
    if (!password || password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim() || undefined,
        hospital_id: hospitalId ? Number(hospitalId) : undefined,
        department_id: departmentId ? Number(departmentId) : undefined,
        designation_id: designationId ? Number(designationId) : undefined,
        employee_id: employeeId.trim() || undefined,
        shift_timing: shiftTiming || undefined,
        permissions: selectedPermissions,
        temporary_password: isTemporaryPassword,
        must_change_password: isTemporaryPassword,
      };

      const result = await createStaff(token, payload);
      onSuccess?.(result);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to create staff account.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-sm">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                Onboard Clinical &amp; Operational Staff Member
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure staff credentials, designation (Receptionist, Nurse, Pharmacist, Lab, Accountant), department, and RBAC permissions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs flex items-center justify-between">
              <span className="font-medium">{error}</span>
              <button
                type="button"
                onClick={() => setError("")}
                className="font-bold text-rose-500 ml-3"
              >
                ×
              </button>
            </div>
          )}

          {/* Section 1: Account Credentials */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5 flex items-center justify-between">
              <span>1. Account Identity (Lesson 4.6)</span>
              <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-mono">
                Status: Pending Approval
              </span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sarah Jenkins"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="staff@hospital.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-700">
                    Initial Password (min 12 chars) <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium hover:underline"
                  >
                    Auto-Generate
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="At least 12 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <div className="flex items-center space-x-2 mt-1.5">
                  <input
                    type="checkbox"
                    id="staffMustChangePass"
                    checked={isTemporaryPassword}
                    onChange={(e) => setIsTemporaryPassword(e.target.checked)}
                    className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <label htmlFor="staffMustChangePass" className="text-[11px] text-slate-600">
                    Require password change upon first login
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Direct Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="+91 98765 00000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Designation & Department Assignment */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5">
              2. Designation &amp; Department Assignment (Lesson 4.7 &amp; 4.8)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Staff Designation <span className="text-rose-500">*</span>
                </label>
                {loadingLookups ? (
                  <div className="text-xs text-slate-400 py-2">Loading designations...</div>
                ) : (
                  <CustomDropdown
                    value={designationId}
                    onChange={(val) => handleDesignationChange(val)}
                    options={[
                      { value: "", label: "-- Select Designation --" },
                      ...designations.map((desig) => ({
                        value: desig.id,
                        label: `${desig.name} ${desig.hospital_id ? "(Hospital)" : "(Global)"}`,
                      })),
                    ]}
                    placeholder="-- Select Designation --"
                  />
                )}
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Selecting designation automatically pre-configures recommended permissions.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Assigned Hospital Department <span className="text-rose-500">*</span>
                </label>
                {loadingLookups ? (
                  <div className="text-xs text-slate-400 py-2">Loading departments...</div>
                ) : (
                  <CustomDropdown
                    value={departmentId}
                    onChange={(val) => setDepartmentId(val)}
                    options={[
                      { value: "", label: "-- Select Department --" },
                      ...departments.map((dept) => ({
                        value: dept.id,
                        label: `${dept.name}${dept.master_department_name ? ` (${dept.master_department_name})` : ""}`,
                      })),
                    ]}
                    placeholder="-- Select Department --"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Employee ID / Badge Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. EMP-REC-001"
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
                  value={shiftTiming}
                  onChange={(val) => setShiftTiming(val)}
                  options={[
                    { value: "Morning (08:00 - 16:00)", label: "Morning (08:00 - 16:00)" },
                    { value: "Evening (16:00 - 00:00)", label: "Evening (16:00 - 00:00)" },
                    { value: "Night (00:00 - 08:00)", label: "Night (00:00 - 08:00)" },
                    { value: "General Shift (09:00 - 18:00)", label: "General Shift (09:00 - 18:00)" },
                    { value: "Rotating Roster", label: "Rotating Roster" },
                  ]}
                  placeholder="Select Shift"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Granular Permissions Configuration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                3. Staff Granular Permissions Matrix (Lesson 4.8)
              </h4>
              <span className="text-[11px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                {selectedPermissions.length} Granted
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto p-1 bg-slate-50/50 rounded-lg border border-slate-200">
              {AVAILABLE_PERMISSIONS.map((perm) => {
                const isChecked = selectedPermissions.includes(perm.key);
                return (
                  <label
                    key={perm.key}
                    className={`flex items-start space-x-2.5 p-2 rounded-md border text-xs cursor-pointer transition ${
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
                      <div className="font-medium text-xs leading-tight flex items-center justify-between">
                        <span>{perm.label}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          [{perm.category}]
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                        {perm.key}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              Staff accounts are created with pending authorization status.
            </span>
            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 border border-slate-300 rounded-md text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-md text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-xs flex items-center space-x-1.5 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Registering...</span>
                  </>
                ) : (
                  <span>Register Staff Member</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
