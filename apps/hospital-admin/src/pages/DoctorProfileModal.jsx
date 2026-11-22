import { useState, useEffect } from "react";
import { getDoctorById, getDepartments, getDesignations, updateDoctor } from "../services/api";
import CredentialDispatchModal from "./CredentialDispatchModal";
import CustomDropdown from "../components/CustomDropdown";

export default function DoctorProfileModal({ token, doctorId, isOpen, onClose, onUpdated }) {
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showCredModal, setShowCredModal] = useState(false);

  // Edit fields
  const [departmentId, setDepartmentId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [status, setStatus] = useState("active");
  const [consultationFee, setConsultationFee] = useState("0");
  const [experienceYears, setExperienceYears] = useState("0");
  const [qualifications, setQualifications] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiryDate, setLicenseExpiryDate] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");

  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);

  useEffect(() => {
    if (!isOpen || !doctorId) return;

    setLoading(true);
    setError("");
    setSuccessMsg("");
    setIsEditing(false);

    Promise.all([
      getDoctorById(token, doctorId),
      getDepartments(token).catch(() => []),
      getDesignations(token).catch(() => []),
    ])
      .then(([doc, depts, desigs]) => {
        setDoctor(doc);
        setDepartments(Array.isArray(depts) ? depts.filter((d) => d.status === "active") : []);
        setDesignations(Array.isArray(desigs) ? desigs.filter((d) => d.status === "active") : []);

        // Populate edit state
        setDepartmentId(doc.department_id ? String(doc.department_id) : "");
        setDesignationId(doc.designation_id ? String(doc.designation_id) : "");
        setStatus(doc.status || "pending");
        setConsultationFee(doc.consultation_fee !== null && doc.consultation_fee !== undefined ? String(doc.consultation_fee) : "0");
        setExperienceYears(doc.experience_years !== null && doc.experience_years !== undefined ? String(doc.experience_years) : "0");
        setQualifications(doc.qualifications || "");
        setSpecialization(doc.specialization || "");
        setLicenseNumber(doc.license_number || "");
        setLicenseExpiryDate(doc.license_expiry_date ? doc.license_expiry_date.slice(0, 10) : "");
        setPhone(doc.phone || "");
        setBio(doc.bio || "");
      })
      .catch((err) => setError(err.message || "Unable to load doctor profile."))
      .finally(() => setLoading(false));
  }, [isOpen, doctorId, token]);

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

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

    setSaving(true);
    try {
      const payload = {
        department_id: departmentId ? Number(departmentId) : null,
        designation_id: designationId ? Number(designationId) : null,
        status,
        consultation_fee: feeNum,
        experience_years: expNum,
        qualifications: qualifications.trim() || null,
        specialization: specialization.trim() || null,
        license_number: licenseNumber.trim() || null,
        license_expiry_date: licenseExpiryDate || null,
        phone: phone.trim() || null,
        bio: bio.trim() || null,
      };

      const updated = await updateDoctor(token, doctorId, payload);
      setDoctor((prev) => ({ ...prev, ...payload, ...updated }));
      setSuccessMsg("Doctor profile updated successfully.");
      setIsEditing(false);
      onUpdated?.(updated);
    } catch (err) {
      setError(err.message || "Failed to update doctor profile.");
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
            <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-800 font-bold text-sm flex items-center justify-center border border-teal-200">
              {doctor?.full_name
                ? doctor.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                : "DR"}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-slate-900 leading-tight">
                  {doctor?.full_name || "Doctor Profile"}
                </h3>
                {doctor?.status && (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                      doctor.status === "active"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : doctor.status === "pending"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {doctor.status.toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {doctor?.designation_name || "Physician"} &bull; {doctor?.department_name || "General Unit"}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!loading && !isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition"
              >
                Edit Credentials
              </button>
            )}
            <button
              onClick={onClose}
              type="button"
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition"
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
              <svg className="animate-spin h-6 w-6 text-teal-600 mb-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Loading clinical profile...</span>
            </div>
          ) : isEditing ? (
            /* Edit Form */
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Department Assignment (Lesson 4.4)
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
                    Designation Assignment (Lesson 4.4)
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
                    Consultation Fee (₹ INR) (Lesson 4.5)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-slate-400">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={consultationFee}
                      onChange={(e) => setConsultationFee(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Years of Experience (Lesson 4.5)
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
                    Specialization
                  </label>
                  <input
                    type="text"
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
                    value={qualifications}
                    onChange={(e) => setQualifications(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Medical License Number
                  </label>
                  <input
                    type="text"
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
                    Contact Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Clinical Biography
                </label>
                <textarea
                  rows="3"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
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
                  className="px-4 py-1.5 rounded-md text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 transition shadow-xs disabled:opacity-50"
                >
                  {saving ? "Saving Changes..." : "Save Profile Updates"}
                </button>
              </div>
            </form>
          ) : (
            /* View Mode */
            <div className="space-y-5">
              {/* Clinical Overview Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/70 p-4 rounded-lg border border-slate-200">
                <div>
                  <span className="text-[11px] font-semibold uppercase text-slate-400 block">
                    Consultation Fee
                  </span>
                  <span className="text-base font-bold text-slate-900 mt-0.5 block">
                    ₹{doctor?.consultation_fee ? Number(doctor.consultation_fee).toFixed(2) : "0.00"}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase text-slate-400 block">
                    Experience
                  </span>
                  <span className="text-base font-bold text-slate-900 mt-0.5 block">
                    {doctor?.experience_years || 0} Years
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase text-slate-400 block">
                    Specialty Unit
                  </span>
                  <span className="text-sm font-semibold text-teal-700 mt-0.5 block truncate">
                    {doctor?.department_name || "Unassigned"}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase text-slate-400 block">
                    Hospital Node
                  </span>
                  <span className="text-sm font-semibold text-slate-800 mt-0.5 block truncate">
                    {doctor?.hospital_name || `#${doctor?.hospital_id}`}
                  </span>
                </div>
              </div>

              {/* Regulatory & Qualifications Section */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Medical Qualifications &amp; Licensure (Lesson 4.5)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block">Degrees &amp; Qualifications:</span>
                    <span className="font-semibold text-slate-800">
                      {doctor?.qualifications || "Not specified"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Area of Specialization:</span>
                    <span className="font-semibold text-slate-800">
                      {doctor?.specialization || "General Medicine"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Medical License Number:</span>
                    <span className="font-mono font-medium text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block mt-0.5">
                      {doctor?.license_number || "Pending verification"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">License Expiry Date:</span>
                    <span className="font-medium text-slate-800">
                      {doctor?.license_expiry_date
                        ? new Date(doctor.license_expiry_date).toLocaleDateString()
                        : "Not recorded"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contact & Security Credentials */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Contact &amp; Account Delivery Status (Lesson 4.9 Prep)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block">Official Email:</span>
                    <span className="font-medium text-slate-900">{doctor?.email}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Direct Phone:</span>
                    <span className="font-medium text-slate-900">{doctor?.phone || "None provided"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Credentials Delivery Status:</span>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {doctor?.credentials_sent_at ? (
                        <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-medium">
                          ✓ Sent {new Date(doctor.credentials_sent_at).toLocaleDateString()}
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
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span>{doctor?.credentials_sent_at ? "Re-send" : "Dispatch Credentials"}</span>
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 block">First-Time Password Change:</span>
                    <span className="font-medium text-slate-700">
                      {doctor?.must_change_password ? "Required" : "Completed / Standard"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bio */}
              {doctor?.bio && (
                <div className="border border-slate-200 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                    Clinical Biography &amp; Practice Highlights
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                    {doctor.bio}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-mono">
            ID #{doctor?.id} &bull; Registered {doctor?.created_at ? new Date(doctor.created_at).toLocaleDateString() : ""}
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
        user={doctor ? { ...doctor, role: "doctor" } : null}
        isOpen={showCredModal}
        onClose={() => setShowCredModal(false)}
        onDispatched={(res) => {
          setDoctor((prev) => ({
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
