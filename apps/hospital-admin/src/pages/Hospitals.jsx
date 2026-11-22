import { useEffect, useState } from "react";
import {
  getHospitals,
  updateHospitalProfile,
  uploadHospitalMedia,
  getMediaUrl,
} from "../services/api";
import { subscribeToEvent } from "../services/socket";

export default function Hospitals({ token }) {
  const [hospital, setHospital] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("profile"); // 'profile' | 'hours' | 'images' | 'upi'

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    postal_code: "",
    is_24_7: true,
    regular_hours: "08:00 AM - 08:00 PM",
    upi_id: "",
    payee_name: "",
  });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saveError, setSaveError] = useState("");

  // Media upload state
  const [logoFile, setLogoFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [copiedCode, setCopiedCode] = useState(false);

  function handleCopyCode(code) {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  useEffect(() => {
    loadHospitalProfile();
  }, [token]);

  // Real-time synchronization for hospital profile
  useEffect(() => {
    if (!token) return;

    const unsub = subscribeToEvent("hospital:updated", () => {
      // Only refresh if not actively saving
      if (!saving) {
        loadHospitalProfile();
      }
    }, token);

    return () => {
      unsub();
    };
  }, [token, saving]);

  async function loadHospitalProfile() {
    setLoading(true);
    setError("");
    try {
      const data = await getHospitals(token);
      if (Array.isArray(data) && data.length > 0) {
        const h = data[0];
        setHospital(h);

        let hoursObj = { is_24_7: true, regular_hours: "08:00 AM - 08:00 PM" };
        try {
          if (typeof h.working_hours === "string") {
            hoursObj = JSON.parse(h.working_hours);
          } else if (h.working_hours) {
            hoursObj = h.working_hours;
          }
        } catch {
          hoursObj = { is_24_7: false, regular_hours: String(h.working_hours) };
        }

        setFormData({
          name: h.name || "",
          email: h.email || "",
          phone: h.phone || "",
          address: h.address || "",
          postal_code: h.postal_code || "",
          is_24_7: hoursObj.is_24_7 ?? true,
          regular_hours: hoursObj.regular_hours || "08:00 AM - 08:00 PM",
          upi_id: h.upi_id || "",
          payee_name: h.payee_name || h.name || "",
        });
      } else {
        setError("No hospital facility is assigned to this administrator account.");
      }
    } catch (err) {
      setError(err.message || "Failed to load hospital profile.");
    } finally {
      setLoading(false);
    }
  }

  async function handleProfileSave(e) {
    e.preventDefault();
    if (!hospital) return;
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      const working_hours = {
        is_24_7: formData.is_24_7,
        regular_hours: formData.regular_hours,
      };

      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        postal_code: formData.postal_code,
        working_hours,
        upi_id: formData.upi_id,
        payee_name: formData.payee_name,
      };

      await updateHospitalProfile(token, hospital.id, payload);
      setSaveSuccess("Hospital specifications and settings updated successfully.");
      await loadHospitalProfile();
      setTimeout(() => setSaveSuccess(""), 4000);
    } catch (err) {
      setSaveError(err.message || "Unable to update hospital profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadMedia(e) {
    e.preventDefault();
    if (!hospital) return;
    if (!logoFile && !bannerFile) {
      setSaveError("Please choose a logo or banner file before uploading.");
      return;
    }

    setUploading(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      const form = new FormData();
      if (logoFile) form.append("logo", logoFile);
      if (bannerFile) form.append("image", bannerFile);

      await uploadHospitalMedia(token, hospital.id, form);
      setSaveSuccess("Hospital emblem and photography published successfully.");
      setLogoFile(null);
      setBannerFile(null);
      setUploadKey((k) => k + 1);
      await loadHospitalProfile();
      setTimeout(() => setSaveSuccess(""), 4000);
    } catch (err) {
      setSaveError(err.message || "Failed to upload image file.");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center p-16">
        <div className="flex flex-col items-center space-y-3">
          <svg className="animate-spin h-6 w-6 text-sky-600 mb-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-xs text-slate-500 font-medium">
            Loading facility specifications...
          </span>
        </div>
      </div>
    );
  }

  if (error || !hospital) {
    return (
      <div className="w-full p-6 bg-white border border-rose-200 rounded-lg shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm text-slate-900">Console Advisory</h3>
          <p className="text-xs text-rose-700 mt-0.5">{error || "Hospital profile not found."}</p>
        </div>
        <button
          onClick={() => {
            if (error && (error.toLowerCase().includes("token") || error.toLowerCase().includes("authoriz"))) {
              sessionStorage.removeItem("hms_session");
              localStorage.removeItem("hms_session");
              window.location.reload();
            } else {
              loadHospitalProfile();
            }
          }}
          className="px-3.5 py-1.5 bg-white border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-md shadow-xs transition"
        >
          {error && (error.toLowerCase().includes("token") || error.toLowerCase().includes("authoriz")) ? "Sign In Again" : "Retry Connection"}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* ======================= COMPACT KPI TILES ROW ======================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        {/* KPI 1 */}
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Facility Status
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1 capitalize">
              {hospital.status || "Active"}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1"></span>
                Operational Node
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Operating Schedule
            </p>
            <p className="text-base font-bold text-slate-900 mt-1 truncate max-w-[140px]">
              {formData.is_24_7 ? "24/7 Emergency" : "Standard Shift"}
            </p>
            <span className="text-xs text-slate-500 mt-1 inline-block">
              {formData.is_24_7 ? "Trauma & Inpatient Open" : formData.regular_hours}
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200">
            <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              UPI Settlement
            </p>
            <p className="text-base font-bold text-slate-900 mt-1 truncate max-w-[140px]">
              {formData.upi_id ? "Active" : "Unconfigured"}
            </p>
            <span className="text-xs text-slate-500 mt-1 inline-block font-mono truncate max-w-[150px]">
              {formData.upi_id || "No VPA assigned"}
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Facility Code
            </p>
            <p className="text-xl font-bold font-mono text-slate-900 mt-1">
              {hospital.code}
            </p>
            <span className="text-xs text-slate-500 mt-1 inline-block">
              Internal Facility #{hospital.id}
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200">
            <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        </div>
      </div>

      {/* ======================= MAIN FACILITY SETTINGS CARD ======================= */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden w-full">
        {/* Facility Identity Header */}
        <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-md bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-slate-700 font-bold text-lg shrink-0">
              {hospital.logo_url ? (
                <img
                  src={getMediaUrl(hospital.logo_url)}
                  alt={hospital.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{hospital.name.charAt(0)}</span>
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-semibold text-slate-900 tracking-tight">
                  {hospital.name}
                </h2>
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  {hospital.code}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                <span>Facility ID #{hospital.id}</span>
                {hospital.city_name && (
                  <>
                    <span>&bull;</span>
                    <span>{hospital.city_name}, {hospital.state_name || ""}</span>
                  </>
                )}
                <span>&bull;</span>
                <span className="text-emerald-700 font-medium">Licensed Healthcare Facility</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
              {hospital.status?.toUpperCase() || "ACTIVE"}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-200 flex space-x-6 text-xs font-medium bg-white">
          {[
            { id: "profile", label: "Profile & Contact" },
            { id: "hours", label: "Operating Hours & Emergency" },
            { id: "images", label: "Branding & Media" },
            { id: "upi", label: "UPI & Payment QR" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 border-b-2 transition ${
                  isActive
                    ? "border-sky-600 text-sky-700 font-semibold"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Status Alerts */}
        {saveError && (
          <div className="m-5 mb-0 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs">
            {saveError}
          </div>
        )}
        {saveSuccess && (
          <div className="m-5 mb-0 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs">
            {saveSuccess}
          </div>
        )}

        <div className="p-6">
          {/* TAB 1: Profile & Contact */}
          {activeTab === "profile" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
              {/* Left Column: Form & Specifications (8 cols on XL) */}
              <div className="lg:col-span-7 xl:col-span-8 space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Facility Specifications &amp; Core Directory
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure institutional nomenclature, communication helpdesks, and physical campus parameters.
                  </p>
                </div>

                <form onSubmit={handleProfileSave} className="space-y-6">
                  {/* Group 1: Core Facility Identification */}
                  <div className="p-4 rounded-lg bg-slate-50/70 border border-slate-200/80 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        1. Facility Identification
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Node #{hospital.id}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Facility Legal Name <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 font-medium"
                            placeholder="e.g. Apex Multispecialty Hospital"
                          />
                          <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-700">
                            Internal Facility Code
                          </label>
                          <span className="text-[10px] text-slate-400">Locked by Super Admin</span>
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            disabled
                            value={hospital.code}
                            className="w-full pl-9 pr-3 py-2 bg-slate-100 border border-slate-200 rounded-md text-xs text-slate-600 font-mono font-semibold cursor-not-allowed select-all"
                          />
                          <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Unique routing prefix used across staff logins and clinical IDs.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Group 2: Communications & Helpdesk */}
                  <div className="p-4 rounded-lg bg-slate-50/70 border border-slate-200/80 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        2. Communications &amp; Helpdesk
                      </span>
                      <span className="text-[10px] text-emerald-700 font-medium">
                        Patient-Facing
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Official Institutional Email
                        </label>
                        <div className="relative">
                          <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            placeholder="admin@hospital.org"
                            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                          <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Reception / Emergency Helpline Phone
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            placeholder="+91-9876543210"
                            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                          />
                          <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Group 3: Physical Campus & Regional Jurisdiction */}
                  <div className="p-4 rounded-lg bg-slate-50/70 border border-slate-200/80 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        3. Campus Location &amp; Regional Jurisdiction
                      </span>
                      {hospital.city_name && (
                        <span className="text-[10px] font-mono text-slate-500">
                          {hospital.city_name}, {hospital.state_name || ""}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Campus Street Address
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            placeholder="Plot 14, Health Boulevard, Medical Enclave"
                            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                          <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Postal / PIN Code
                        </label>
                        <input
                          type="text"
                          value={formData.postal_code}
                          onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                          placeholder="400001"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Submit Action Bar */}
                  <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-2 text-slate-500 text-xs">
                      <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Changes sync instantly across Doctor, Staff, and Patient systems.</span>
                    </div>

                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-md shadow-xs transition flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          <span>Saving Changes...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Save Profile Details</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Column: Facility Live Snapshot & Operational Intelligence Panel (4 cols on XL) */}
              <div className="lg:col-span-5 xl:col-span-4 space-y-4">
                {/* Visual Facility Live Identity Card */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-lg p-5 shadow-sm border border-slate-700/60 relative overflow-hidden">
                  <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl pointer-events-none"></div>

                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 rounded-lg bg-white/10 backdrop-blur-xs border border-white/20 overflow-hidden flex items-center justify-center font-bold text-white text-base">
                      {hospital.logo_url ? (
                        <img
                          src={getMediaUrl(hospital.logo_url)}
                          alt={hospital.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{hospital.name.charAt(0)}</span>
                      )}
                    </div>

                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
                      ACTIVE NODE
                    </span>
                  </div>

                  <div className="mt-4">
                    <h4 className="text-sm font-bold tracking-tight text-white line-clamp-1">
                      {formData.name || hospital.name}
                    </h4>
                    <p className="text-[11px] text-slate-300 mt-0.5 line-clamp-1">
                      {formData.address || hospital.address || "Medical Campus Registered"}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-mono">
                        Facility Code
                      </span>
                      <span className="font-mono text-xs font-bold text-sky-300">
                        {hospital.code}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyCode(hospital.code)}
                      className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px] font-medium text-white transition flex items-center space-x-1 cursor-pointer"
                      title="Copy Facility Code"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>{copiedCode ? "Copied!" : "Copy Code"}</span>
                    </button>
                  </div>
                </div>

                {/* Operational Quick Access & Status Checklist */}
                <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-xs space-y-3.5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                      Operational Health
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Module Quicklinks
                    </span>
                  </div>

                  {/* Item 1: Operating Hours */}
                  <div className="flex items-center justify-between p-2.5 rounded-md bg-slate-50 border border-slate-100">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-7 h-7 rounded bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-slate-800 block">
                          {formData.is_24_7 ? "24/7 Emergency Service" : "Scheduled Shifts"}
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate max-w-[160px]">
                          {formData.is_24_7 ? "Trauma admissions open" : formData.regular_hours}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("hours")}
                      className="text-xs text-sky-600 hover:text-sky-800 font-medium hover:underline cursor-pointer"
                    >
                      Edit →
                    </button>
                  </div>

                  {/* Item 2: UPI Settlement */}
                  <div className="flex items-center justify-between p-2.5 rounded-md bg-slate-50 border border-slate-100">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-7 h-7 rounded bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-slate-800 block">
                          {formData.upi_id ? "Digital UPI Active" : "No VPA Assigned"}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono block truncate max-w-[160px]">
                          {formData.upi_id || "Unconfigured QR"}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("upi")}
                      className="text-xs text-sky-600 hover:text-sky-800 font-medium hover:underline cursor-pointer"
                    >
                      Setup →
                    </button>
                  </div>

                  {/* Item 3: Branding & Media */}
                  <div className="flex items-center justify-between p-2.5 rounded-md bg-slate-50 border border-slate-100">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-7 h-7 rounded bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-slate-800 block">
                          Visual Identity
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {hospital.logo_url ? "Logo Uploaded" : "No Logo"} &bull; {hospital.image_url ? "Banner Active" : "No Banner"}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("images")}
                      className="text-xs text-sky-600 hover:text-sky-800 font-medium hover:underline cursor-pointer"
                    >
                      Media →
                    </button>
                  </div>
                </div>

                {/* Emergency Assistance Hotline Banner */}
                {formData.phone && (
                  <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200/80 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                          Published Emergency Hotline
                        </span>
                        <span className="font-mono text-xs font-bold text-amber-950 block">
                          {formData.phone}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded font-medium">
                      24/7 Active
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Operating Hours & Emergency */}
          {activeTab === "hours" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
              {/* Form Section */}
              <div className="lg:col-span-7 xl:col-span-8 space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Clinical Schedule &amp; Emergency Protocols
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Define inpatient triage availability and general outpatient clinic timings.
                  </p>
                </div>

                <form onSubmit={handleProfileSave} className="space-y-5">
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between p-3 bg-white rounded-md border border-slate-200">
                      <div>
                        <h4 className="text-xs font-semibold text-slate-900">
                          Emergency &amp; Trauma Department
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Enables round-the-clock emergency room, ambulance intake, and intensive care admissions.
                        </p>
                      </div>
                      <label className="flex items-center cursor-pointer space-x-2 shrink-0">
                        <input
                          type="checkbox"
                          checked={formData.is_24_7}
                          onChange={(e) => setFormData({ ...formData, is_24_7: e.target.checked })}
                          className="w-4 h-4 rounded text-sky-600 border-slate-300 focus:ring-sky-500 cursor-pointer"
                        />
                        <span className={`text-xs font-semibold ${formData.is_24_7 ? "text-emerald-700" : "text-slate-500"}`}>
                          24/7 Active
                        </span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Regular Outpatient Operating Hours
                      </label>
                      <input
                        type="text"
                        value={formData.regular_hours}
                        onChange={(e) => setFormData({ ...formData, regular_hours: e.target.value })}
                        placeholder="e.g. Mon-Sat: 08:00 AM - 08:00 PM, Sun: 09:00 AM - 02:00 PM"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Communicated to patients booking doctor appointments and consulting queues.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-3 border-t border-slate-200">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-md shadow-xs transition disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? "Saving Schedule..." : "Save Operating Hours"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Weekly Timeline Visual Preview */}
              <div className="lg:col-span-5 xl:col-span-4 space-y-4">
                <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-xs">
                  <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider block mb-3">
                    Weekly Clinical Coverage
                  </span>
                  <div className="space-y-2 text-xs">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, idx) => (
                      <div key={day} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-slate-50 text-slate-700">
                        <span className="font-semibold text-slate-800">{day}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[11px] text-slate-600">
                            {idx === 6 ? "09:00 AM - 02:00 PM" : "08:00 AM - 08:00 PM"}
                          </span>
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Emergency Trauma Status:</span>
                    <span className="font-semibold text-emerald-700">
                      {formData.is_24_7 ? "Always Open" : "Standard Shift"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Branding & Media */}
          {activeTab === "images" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
              {/* Upload Form (8 cols on XL) */}
              <div className="lg:col-span-7 xl:col-span-8 space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Institutional Visual Identity &amp; Campus Photography
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Upload official facility seals, heraldry, and high-resolution campus photography.
                  </p>
                </div>

                <form onSubmit={handleUploadMedia} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Logo Section */}
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                      <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider block">
                        Facility Emblem / Logo
                      </span>
                      <div className="w-24 h-24 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-xs">
                        {logoFile ? (
                          <img
                            src={URL.createObjectURL(logoFile)}
                            alt="Logo preview"
                            className="w-full h-full object-cover"
                          />
                        ) : hospital.logo_url ? (
                          <img
                            src={getMediaUrl(hospital.logo_url)}
                            alt="Current logo"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">No Logo</span>
                        )}
                      </div>
                      <input
                        key={`logo-${uploadKey}`}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => setLogoFile(e.target.files[0] || null)}
                        className="text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-50 cursor-pointer"
                      />
                      <p className="text-[10px] text-slate-400">Square PNG, JPEG, WebP up to 2MB</p>
                    </div>

                    {/* Banner Section */}
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                      <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider block">
                        Campus Showcase Banner
                      </span>
                      <div className="w-full h-24 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-xs">
                        {bannerFile ? (
                          <img
                            src={URL.createObjectURL(bannerFile)}
                            alt="Banner preview"
                            className="w-full h-full object-cover"
                          />
                        ) : hospital.image_url ? (
                          <img
                            src={getMediaUrl(hospital.image_url)}
                            alt="Current banner"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">No Banner</span>
                        )}
                      </div>
                      <input
                        key={`banner-${uploadKey}`}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => setBannerFile(e.target.files[0] || null)}
                        className="text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-50 cursor-pointer"
                      />
                      <p className="text-[10px] text-slate-400">Recommended: 1200x400 landscape banner</p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-3 border-t border-slate-200">
                    <button
                      type="submit"
                      disabled={uploading || (!logoFile && !bannerFile)}
                      className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-md shadow-xs transition disabled:opacity-50 cursor-pointer"
                    >
                      {uploading ? "Publishing Media..." : "Upload Selected Media"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Column: Live Directory Preview Card */}
              <div className="lg:col-span-5 xl:col-span-4 space-y-4">
                <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-xs">
                  <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider block mb-3">
                    Patient Directory Preview
                  </span>
                  <div className="rounded-lg border border-slate-200 overflow-hidden shadow-xs">
                    <div className="h-24 bg-slate-100 relative">
                      {bannerFile ? (
                        <img src={URL.createObjectURL(bannerFile)} alt="Preview" className="w-full h-full object-cover" />
                      ) : hospital.image_url ? (
                        <img src={getMediaUrl(hospital.image_url)} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-slate-200 flex items-center justify-center text-xs text-slate-400">Campus Banner</div>
                      )}
                      <div className="absolute -bottom-4 left-3 w-10 h-10 rounded-md bg-white border border-slate-200 overflow-hidden shadow-xs">
                        {logoFile ? (
                          <img src={URL.createObjectURL(logoFile)} alt="Logo" className="w-full h-full object-cover" />
                        ) : hospital.logo_url ? (
                          <img src={getMediaUrl(hospital.logo_url)} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-bold text-slate-700 flex items-center justify-center h-full">{hospital.name.charAt(0)}</span>
                        )}
                      </div>
                    </div>
                    <div className="pt-6 p-3 bg-white">
                      <h4 className="text-xs font-bold text-slate-900">{formData.name || hospital.name}</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">{formData.address || hospital.address || "Address"}</p>
                      <div className="mt-2 flex items-center space-x-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {formData.is_24_7 ? "24/7 Available" : "OPD Open"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">#{hospital.code}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: UPI & Payment QR */}
          {activeTab === "upi" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
              {/* Form Section */}
              <div className="lg:col-span-6 xl:col-span-6 space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Instant UPI Direct Settlement Terminal
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Connect your institutional bank VPA to automatically generate dynamic QR codes on OPD bills.
                  </p>
                </div>

                <form onSubmit={handleProfileSave} className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Hospital UPI ID (Virtual Payment Address) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.upi_id}
                        onChange={(e) => setFormData({ ...formData, upi_id: e.target.value })}
                        placeholder="e.g. metrohospital@okhdfcbank"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 font-mono font-semibold focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Payments settle directly into your facility bank account without intermediary hold.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Payee Display Name
                      </label>
                      <input
                        type="text"
                        value={formData.payee_name}
                        onChange={(e) => setFormData({ ...formData, payee_name: e.target.value })}
                        placeholder="e.g. Metro Multispecialty Accounts"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-3 border-t border-slate-200">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-md shadow-xs transition disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? "Saving UPI..." : "Update UPI Settings"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Column: High-Res Payment Terminal Standee */}
              <div className="lg:col-span-6 xl:col-span-6 space-y-4">
                <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs text-center flex flex-col items-center">
                  <span className="px-2.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-semibold uppercase tracking-wider mb-3">
                    Official Facility Standee Preview
                  </span>

                  <div className="w-48 h-48 bg-white p-2.5 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center shadow-xs">
                    {hospital.qr_code_url ? (
                      <img
                        src={getMediaUrl(hospital.qr_code_url)}
                        alt="Hospital UPI QR"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-slate-400 text-center font-medium p-3">
                        Configure UPI ID to generate dynamic QR code
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-bold text-slate-900 mt-4">
                    {hospital.payee_name || hospital.name}
                  </h4>
                  <p className="font-mono text-xs font-bold text-sky-700 mt-0.5">
                    {hospital.upi_id || "No VPA Configured"}
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-100 w-full flex items-center justify-center space-x-3 text-slate-400 text-[11px]">
                    <span className="font-medium text-slate-600">Accepted:</span>
                    <span>Google Pay</span>
                    <span>&bull;</span>
                    <span>PhonePe</span>
                    <span>&bull;</span>
                    <span>Paytm</span>
                    <span>&bull;</span>
                    <span>BHIM UPI</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
