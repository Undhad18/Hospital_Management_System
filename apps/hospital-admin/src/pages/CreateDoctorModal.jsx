import { useState, useEffect } from "react";
import { getDepartments, getDesignations, createDoctor } from "../services/api";
import CustomDropdown from "../components/CustomDropdown";

export default function CreateDoctorModal({ token, hospitalId, isOpen, onClose, onSuccess }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [experienceYears, setExperienceYears] = useState("0");
  const [qualifications, setQualifications] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiryDate, setLicenseExpiryDate] = useState("");
  const [consultationFee, setConsultationFee] = useState("500");
  const [bio, setBio] = useState("");
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
        // Filter to active departments
        const activeDepts = Array.isArray(depts)
          ? depts.filter((d) => d.status === "active")
          : [];
        setDepartments(activeDepts);
        if (activeDepts.length > 0) {
          setDepartmentId(String(activeDepts[0].id));
        }

        // Filter to active designations relevant to doctor/clinical
        const activeDesigs = Array.isArray(desigs)
          ? desigs.filter((d) => d.status === "active")
          : [];
        setDesignations(activeDesigs);
        const docDesig = activeDesigs.find(
          (d) =>
            d.name.toLowerCase().includes("doctor") ||
            d.name.toLowerCase().includes("consultant") ||
            d.name.toLowerCase().includes("physician")
        );
        if (docDesig) {
          setDesignationId(String(docDesig.id));
        } else if (activeDesigs.length > 0) {
          setDesignationId(String(activeDesigs[0].id));
        }
      })
      .finally(() => setLoadingLookups(false));
  }, [isOpen, token]);

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
      setError("Doctor's full name is required.");
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
    const feeNum = Number(consultationFee);
    if (isNaN(feeNum) || feeNum < 0) {
      setError("Consultation fee cannot be negative.");
      return;
    }
    const expNum = Number(experienceYears);
    if (isNaN(expNum) || expNum < 0 || expNum > 80) {
      setError("Years of experience must be between 0 and 80.");
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
        experience_years: expNum,
        qualifications: qualifications.trim() || undefined,
        specialization: specialization.trim() || undefined,
        license_number: licenseNumber.trim() || undefined,
        license_expiry_date: licenseExpiryDate || undefined,
        consultation_fee: feeNum,
        bio: bio.trim() || undefined,
        temporary_password: isTemporaryPassword,
        must_change_password: isTemporaryPassword,
      };

      const result = await createDoctor(token, payload);
      onSuccess?.(result);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to create doctor account.");
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
            <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-bold text-sm">
              <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                Onboard Clinical Doctor &amp; Specialist
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Register physician credentials, assign hospital department, designation, and consultation fees
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

          {/* Section 1: Personal & Account Credentials */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5 flex items-center justify-between">
              <span>1. Account &amp; Identity Credentials (Lesson 4.3)</span>
              <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-mono">
                Initial Status: Pending Approval
              </span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Doctor Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Eleanor Vance"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="doctor@hospital.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
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
                    className="text-[11px] text-teal-600 hover:text-teal-700 font-medium hover:underline"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <div className="flex items-center space-x-2 mt-1.5">
                  <input
                    type="checkbox"
                    id="docMustChangePass"
                    checked={isTemporaryPassword}
                    onChange={(e) => setIsTemporaryPassword(e.target.checked)}
                    className="w-3.5 h-3.5 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                  />
                  <label htmlFor="docMustChangePass" className="text-[11px] text-slate-600">
                    Require password change upon first login
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Contact Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Department & Designation Assignment */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5">
              2. Hospital Department &amp; Designation Assignment (Lesson 4.4)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Department / Clinical Specialty <span className="text-rose-500">*</span>
                </label>
                {loadingLookups ? (
                  <div className="text-xs text-slate-400 py-2">Loading departments...</div>
                ) : (
                  <CustomDropdown
                    value={departmentId}
                    onChange={(val) => setDepartmentId(val)}
                    options={[
                      { value: "", label: "-- Select Active Department --" },
                      ...departments.map((dept) => ({
                        value: dept.id,
                        label: `${dept.name}${dept.master_department_name ? ` (${dept.master_department_name})` : ""}`,
                      })),
                    ]}
                    placeholder="-- Select Active Department --"
                  />
                )}
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Only active departments in this facility are available.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Clinical Designation / Title <span className="text-rose-500">*</span>
                </label>
                {loadingLookups ? (
                  <div className="text-xs text-slate-400 py-2">Loading designations...</div>
                ) : (
                  <CustomDropdown
                    value={designationId}
                    onChange={(val) => setDesignationId(val)}
                    options={[
                      { value: "", label: "-- Select Designation --" },
                      ...designations.map((desig) => ({
                        value: desig.id,
                        label: `${desig.name} ${desig.hospital_id ? "(Hospital Custom)" : "(Global Title)"}`,
                      })),
                    ]}
                    placeholder="-- Select Designation --"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Professional Experience, Education, License & Fees */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5">
              3. Professional Experience, Education, License &amp; Fees (Lesson 4.5)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Specialization
                </label>
                <input
                  type="text"
                  placeholder="e.g. Interventional Cardiology"
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Qualifications &amp; Degrees
                </label>
                <input
                  type="text"
                  placeholder="e.g. MBBS, MD, DM"
                  value={qualifications}
                  onChange={(e) => setQualifications(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Years of Experience
                </label>
                <input
                  type="number"
                  min="0"
                  max="80"
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Medical License Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. MED-IN-2024-9988"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  License Expiry Date
                </label>
                <input
                  type="date"
                  value={licenseExpiryDate}
                  onChange={(e) => setLicenseExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Consultation Fee (₹ INR) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-medium text-slate-400">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={consultationFee}
                    onChange={(e) => setConsultationFee(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Clinical Biography &amp; Practice Highlights
              </label>
              <textarea
                rows="2"
                placeholder="Brief summary of clinical expertise, patient care philosophy, or notable achievements..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              Doctor accounts require administrator approval before active consultation.
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
                className="px-4 py-2 rounded-md text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 transition shadow-xs flex items-center space-x-1.5 disabled:opacity-50"
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
                  <span>Register Doctor Account</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
