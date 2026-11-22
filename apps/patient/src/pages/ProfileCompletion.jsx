import { useState } from "react";
import { patientStore } from "../services/patientData";
import { updatePatientProfile } from "../services/api";
import CustomDropdown from "../components/CustomDropdown";

export default function ProfileCompletion({ profile, onComplete, isMandatory = true }) {
  const [formData, setFormData] = useState({
    full_name: profile?.full_name || "",
    mobile: profile?.mobile || profile?.phone || "",
    dob: profile?.dob || "",
    gender: profile?.gender || "Male",
    blood_group: profile?.blood_group || "B+",
    address_line1: profile?.address_line1 || "",
    address_line2: profile?.address_line2 || "",
    country: profile?.country || "India",
    state: profile?.state || "Maharashtra",
    city: profile?.city || "Mumbai",
    pincode: profile?.pincode || profile?.postal_code || "",
    emergency_contact_name: profile?.emergency_contact_name || "",
    emergency_contact_number: profile?.emergency_contact_number || profile?.emergency_contact_phone || "",
    allergies: profile?.allergies || "",
    chronic_conditions: profile?.chronic_conditions || "",
    current_medicines: profile?.current_medicines || profile?.current_medications || "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const bloodGroups = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
  const genders = ["Male", "Female", "Other", "Prefer not to say"];

  function handleChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!formData.full_name.trim()) {
      setError("Please enter your full legal name.");
      return;
    }
    if (!formData.mobile.trim()) {
      setError("Please provide a valid mobile number for appointment SMS notifications.");
      return;
    }
    if (!formData.dob) {
      setError("Please select your date of birth.");
      return;
    }
    if (!formData.address_line1.trim() || !formData.city.trim() || !formData.pincode.trim()) {
      setError("Please complete your primary residence address details.");
      return;
    }
    if (!formData.emergency_contact_name.trim() || !formData.emergency_contact_number.trim()) {
      setError("Emergency contact details are mandatory for clinical safety and triage.");
      return;
    }

    setSaving(true);
    try {
      const savedSession = sessionStorage.getItem("hms_session") || localStorage.getItem("hms_session");
      const token = savedSession ? JSON.parse(savedSession)?.token : null;

      if (token) {
        const res = await updatePatientProfile(token, {
          full_name: formData.full_name,
          mobile: formData.mobile,
          dob: formData.dob,
          gender: formData.gender,
          blood_group: formData.blood_group,
          address_line1: formData.address_line1,
          address_line2: formData.address_line2,
          city: formData.city,
          pincode: formData.pincode,
          emergency_contact_name: formData.emergency_contact_name,
          emergency_contact_number: formData.emergency_contact_number,
          allergies: formData.allergies,
          chronic_conditions: formData.chronic_conditions,
          current_medicines: formData.current_medicines,
        });

        const updated = patientStore.updateProfile({
          ...formData,
          is_profile_completed: res.data.is_profile_completed,
          profile_completed: res.data.is_profile_completed,
        });
        onComplete(updated);
      } else {
        const updated = patientStore.updateProfile(formData);
        onComplete(updated);
      }
    } catch (err) {
      setError(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-6xl mx-auto py-2 font-sans">
      {/* Alert Banner for Mandatory Profile Guard */}
      {isMandatory && (
        <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start space-x-3 shadow-xs">
          <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <span className="font-semibold text-sm block mb-0.5">Mandatory Clinical Profile Required</span>
            <span className="leading-relaxed text-amber-800">
              In accordance with hospital medical records protocol, your medical baseline, blood group, address, and emergency contact details must be recorded before booking doctor appointments.
            </span>
          </div>
        </div>
      )}

      <div className="ent-card overflow-hidden">
        <div className="ent-card-header flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              {isMandatory ? "Patient Clinical Baseline & Profile Setup" : "Update Patient Profile"}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Accurate health metrics ensure proper medication dosage and emergency clinical readiness
            </p>
          </div>
          <span className="ent-chip-pending">
            {profile?.profile_completed ? "Profile Verified" : "Action Required"}
          </span>
        </div>

        {error && (
          <div className="m-6 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Section 1: Personal & Demographics */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 pb-1 border-b border-slate-100 flex items-center space-x-1.5">
              <span>1. Personal &amp; Demographic Identification</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Full Legal Name *
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => handleChange("full_name", e.target.value)}
                  required
                  placeholder="e.g. Undhad Harshil"
                  className="ent-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Mobile Number *
                </label>
                <input
                  type="tel"
                  value={formData.mobile}
                  onChange={(e) => handleChange("mobile", e.target.value)}
                  required
                  placeholder="+91-9876543210"
                  className="ent-input text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Date of Birth *
                </label>
                <input
                  type="date"
                  value={formData.dob}
                  onChange={(e) => handleChange("dob", e.target.value)}
                  required
                  className="ent-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Gender *
                </label>
                <CustomDropdown
                  value={formData.gender}
                  onChange={(val) => handleChange("gender", val)}
                  options={genders.map((g) => ({ value: g, label: g }))}
                  placeholder="Select Gender"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Blood Group *
                </label>
                <CustomDropdown
                  value={formData.blood_group}
                  onChange={(val) => handleChange("blood_group", val)}
                  options={bloodGroups.map((bg) => ({ value: bg, label: bg }))}
                  placeholder="Select Blood Group"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Residential Address */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 pb-1 border-b border-slate-100">
              2. Residential Address
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Address Line 1 (Flat, House No., Building) *
                </label>
                <input
                  type="text"
                  value={formData.address_line1}
                  onChange={(e) => handleChange("address_line1", e.target.value)}
                  required
                  placeholder="e.g. Flat 402, Lotus Residency"
                  className="ent-input text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Address Line 2 (Street, Area, Landmark)
                </label>
                <input
                  type="text"
                  value={formData.address_line2}
                  onChange={(e) => handleChange("address_line2", e.target.value)}
                  placeholder="e.g. MG Road, Near Bandra West Station"
                  className="ent-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  City *
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleChange("city", e.target.value)}
                  required
                  placeholder="e.g. Mumbai"
                  className="ent-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  State *
                </label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => handleChange("state", e.target.value)}
                  required
                  placeholder="e.g. Maharashtra"
                  className="ent-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Country *
                </label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => handleChange("country", e.target.value)}
                  required
                  className="ent-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Postal Pincode *
                </label>
                <input
                  type="text"
                  value={formData.pincode}
                  onChange={(e) => handleChange("pincode", e.target.value)}
                  required
                  placeholder="e.g. 400050"
                  className="ent-input text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Emergency Contact Details */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 pb-1 border-b border-slate-100">
              3. Emergency Contact Designation
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Emergency Contact Name *
                </label>
                <input
                  type="text"
                  value={formData.emergency_contact_name}
                  onChange={(e) => handleChange("emergency_contact_name", e.target.value)}
                  required
                  placeholder="e.g. Ramesh Undhad (Father)"
                  className="ent-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Emergency Contact Number *
                </label>
                <input
                  type="tel"
                  value={formData.emergency_contact_number}
                  onChange={(e) => handleChange("emergency_contact_number", e.target.value)}
                  required
                  placeholder="+91-9876500000"
                  className="ent-input text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Clinical Baseline */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 pb-1 border-b border-slate-100">
              4. Clinical History &amp; Medical Baseline
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Known Drug &amp; Environmental Allergies
                </label>
                <input
                  type="text"
                  value={formData.allergies}
                  onChange={(e) => handleChange("allergies", e.target.value)}
                  placeholder="e.g. Penicillin, Sulfa drugs, Peanuts (or 'None Known')"
                  className="ent-input text-xs"
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  Important: Physicians will be alerted before writing electronic prescriptions.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pre-existing Chronic Conditions
                </label>
                <input
                  type="text"
                  value={formData.chronic_conditions}
                  onChange={(e) => handleChange("chronic_conditions", e.target.value)}
                  placeholder="e.g. Hypertension, Type 2 Diabetes, Asthma (or 'None')"
                  className="ent-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Currently Active Medications
                </label>
                <input
                  type="text"
                  value={formData.current_medicines}
                  onChange={(e) => handleChange("current_medicines", e.target.value)}
                  placeholder="e.g. Telmisartan 20mg once daily morning"
                  className="ent-input text-xs"
                />
              </div>
            </div>
          </div>

          {/* Save Action */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="submit"
              disabled={saving}
              className="ent-btn-primary"
            >
              {saving ? "Verifying & Saving..." : "Save Medical Profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
