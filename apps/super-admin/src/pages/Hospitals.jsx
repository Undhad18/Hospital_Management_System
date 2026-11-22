import { useEffect, useState, useMemo } from "react";
import {
  getHospitals,
  createHospital,
  updateHospital,
  uploadHospitalMedia,
  getHospitalQr,
  updateHospitalStatus,
  getMediaUrl,
} from "../services/api";
import CustomDropdown from "../components/CustomDropdown";
import Pagination, { usePagination } from "../components/Pagination";

export default function Hospitals({ token }) {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    code: "",
    email: "",
    phone: "",
    address: "",
    postal_code: "",
    is_24_7: true,
    regular_hours: "08:00 AM - 08:00 PM",
    upi_id: "",
    payee_name: "",
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  // Details / Edit modal
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [activeTab, setActiveTab] = useState("info"); // 'info' | 'hours' | 'images' | 'upi'
  const [editForm, setEditForm] = useState({});
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");

  // Media upload state
  const [logoFile, setLogoFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  // Quick QR preview modal
  const [qrModalData, setQrModalData] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);

  // Status toggle confirmation modal
  const [statusModalHospital, setStatusModalHospital] = useState(null);
  const [statusReason, setStatusReason] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);

  async function handleConfirmStatusChange() {
    if (!statusModalHospital) return;
    setStatusLoading(true);
    const newStatus = statusModalHospital.status === "active" ? "inactive" : "active";
    try {
      await updateHospitalStatus(token, statusModalHospital.id, newStatus, statusReason);
      setStatusModalHospital(null);
      setStatusReason("");
      await loadHospitals();
    } catch (err) {
      alert(err.message || "Failed to update hospital status");
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    loadHospitals();
  }, [token]);

  async function loadHospitals() {
    setLoading(true);
    setError("");
    try {
      const data = await getHospitals(token);
      setHospitals(data);
    } catch (err) {
      setError(err.message || "Unable to load hospitals.");
    } finally {
      setLoading(false);
    }
  }

  const filteredHospitals = useMemo(() => {
    return hospitals.filter((hospital) => {
      const matchesSearch =
        hospital.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        hospital.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (hospital.phone && hospital.phone.includes(searchQuery)) ||
        (hospital.city_name && hospital.city_name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === "all" || hospital.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [hospitals, searchQuery, statusFilter]);

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalRecords,
    paginatedItems: paginatedHospitals,
    resetPage,
  } = usePagination(filteredHospitals, 25);

  useEffect(() => {
    resetPage();
  }, [searchQuery, statusFilter, resetPage]);

  const activeCount = hospitals.filter((h) => h.status === "active").length;
  const inactiveCount = hospitals.filter((h) => h.status === "inactive").length;
  const upiCount = hospitals.filter((h) => h.upi_id).length;

  async function handleAddHospital(e) {
    e.preventDefault();
    setAddError("");
    setAddLoading(true);

    try {
      if (!addForm.name.trim() || !addForm.code.trim()) {
        throw new Error("Facility name and code are required.");
      }

      const workingHoursObj = {
        is_24_7: addForm.is_24_7,
        regular_hours: addForm.regular_hours,
      };

      await createHospital(token, {
        name: addForm.name.trim(),
        code: addForm.code.trim().toUpperCase(),
        email: addForm.email.trim() || null,
        phone: addForm.phone.trim() || null,
        address: addForm.address.trim() || null,
        postal_code: addForm.postal_code.trim() || null,
        working_hours: workingHoursObj,
        upi_id: addForm.upi_id.trim() || null,
        payee_name: addForm.payee_name.trim() || null,
      });

      setShowAddModal(false);
      setAddForm({
        name: "",
        code: "",
        email: "",
        phone: "",
        address: "",
        postal_code: "",
        is_24_7: true,
        regular_hours: "08:00 AM - 08:00 PM",
        upi_id: "",
        payee_name: "",
      });
      await loadHospitals();
    } catch (err) {
      setAddError(err.message || "Failed to create hospital facility.");
    } finally {
      setAddLoading(false);
    }
  }

  function openEditModal(hospital) {
    setSelectedHospital(hospital);
    let hoursObj = { is_24_7: true, regular_hours: "08:00 AM - 08:00 PM" };
    try {
      if (typeof hospital.working_hours === "string") {
        hoursObj = JSON.parse(hospital.working_hours);
      } else if (hospital.working_hours) {
        hoursObj = hospital.working_hours;
      }
    } catch {
      hoursObj = { is_24_7: false, regular_hours: String(hospital.working_hours) };
    }

    setEditForm({
      name: hospital.name || "",
      code: hospital.code || "",
      email: hospital.email || "",
      phone: hospital.phone || "",
      address: hospital.address || "",
      postal_code: hospital.postal_code || "",
      is_24_7: hoursObj.is_24_7 ?? true,
      regular_hours: hoursObj.regular_hours || "08:00 AM - 08:00 PM",
      upi_id: hospital.upi_id || "",
      payee_name: hospital.payee_name || hospital.name || "",
      status: hospital.status || "active",
    });
    setActiveTab("info");
    setEditError("");
    setEditSuccess("");
    setLogoFile(null);
    setBannerFile(null);
  }

  async function handleUpdateHospital(e) {
    e.preventDefault();
    if (!selectedHospital) return;
    setEditError("");
    setEditSuccess("");
    setEditLoading(true);

    try {
      const workingHoursObj = {
        is_24_7: editForm.is_24_7,
        regular_hours: editForm.regular_hours,
      };

      await updateHospital(token, selectedHospital.id, {
        name: editForm.name.trim(),
        code: editForm.code.trim().toUpperCase(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        address: editForm.address.trim() || null,
        postal_code: editForm.postal_code.trim() || null,
        working_hours: workingHoursObj,
        upi_id: editForm.upi_id.trim() || null,
        payee_name: editForm.payee_name.trim() || null,
        status: editForm.status,
      });

      setEditSuccess("Hospital details successfully updated!");
      await loadHospitals();
    } catch (err) {
      setEditError(err.message || "Failed to update hospital details.");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleUploadMedia(e) {
    e.preventDefault();
    if (!selectedHospital || (!logoFile && !bannerFile)) return;
    setUploadLoading(true);
    setEditError("");
    setEditSuccess("");

    try {
      const formData = new FormData();
      if (logoFile) formData.append("logo", logoFile);
      if (bannerFile) formData.append("image", bannerFile);

      await uploadHospitalMedia(token, selectedHospital.id, formData);
      setEditSuccess("Hospital media uploaded successfully!");
      setLogoFile(null);
      setBannerFile(null);
      await loadHospitals();
    } catch (err) {
      setEditError(err.message || "Failed to upload image media.");
    } finally {
      setUploadLoading(false);
    }
  }

  async function openQuickQr(hospital) {
    setQrModalData(hospital);
    setQrLoading(true);
    try {
      const qrRes = await getHospitalQr(token, hospital.id);
      setQrModalData((prev) => ({ ...prev, qrData: qrRes }));
    } catch (err) {
      setQrModalData((prev) => ({
        ...prev,
        qrError: err.message || "No UPI configuration found.",
      }));
    } finally {
      setQrLoading(false);
    }
  }

  return (
    <div className="w-full space-y-6">
      {/* ============================================================ */}
      {/* 1. HIGH-DENSITY ENTERPRISE KPI METRIC ROW                     */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        {/* KPI 1: Total Facilities */}
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Facilities
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? "..." : hospitals.length}
            </p>
            <span className="text-xs text-slate-500 mt-1 inline-block">
              Network health systems
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200">
            <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        </div>

        {/* KPI 2: Active Facilities */}
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Active Facilities
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? "..." : activeCount}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1"></span>
                Operational
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* KPI 3: Inactive / Pending */}
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Inactive / Pending
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? "..." : inactiveCount}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                Suspended / Setup
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center border border-slate-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
        </div>

        {/* KPI 4: UPI & QR Configured */}
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              UPI Configured
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? "..." : upiCount}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
                QR Billing Enabled
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-md bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. ENTERPRISE DATA GRID: HOSPITALS DIRECTORY                 */}
      {/* ============================================================ */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs w-full">
        {/* Table Header Toolbar */}
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white rounded-t-lg relative z-20">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
              Hospital Facilities
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Directory of licensed healthcare systems, operational schedules, and payment setups
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, code, or city..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition"
              />
              <svg
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Filter by Status */}
            <div className="w-36">
              <CustomDropdown
                value={statusFilter}
                onChange={(val) => setStatusFilter(val)}
                options={[
                  { value: "all", label: "All Statuses" },
                  { value: "active", label: "Active Only" },
                  { value: "inactive", label: "Inactive Only" },
                ]}
                placeholder="All Statuses"
              />
            </div>

            {/* Add Facility CTA Button */}
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium rounded-md shadow-xs transition"
            >
              <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              Add Hospital
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-16 text-center text-slate-500 text-xs flex flex-col items-center justify-center">
            <svg className="animate-spin h-6 w-6 text-sky-600 mb-2.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Retrieving enterprise hospital records...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="m-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs flex items-center justify-between">
            <span className="font-medium">{error}</span>
            <button
              onClick={() => {
                if (error.toLowerCase().includes("token") || error.toLowerCase().includes("authoriz")) {
                  sessionStorage.removeItem("hms_session");
                  localStorage.removeItem("hms_session");
                  window.location.reload();
                } else {
                  loadHospitals();
                }
              }}
              className="px-2.5 py-1 bg-white border border-rose-300 text-rose-800 rounded text-xs font-medium hover:bg-rose-100 transition"
            >
              {error.toLowerCase().includes("token") || error.toLowerCase().includes("authoriz") ? "Sign In Again" : "Retry"}
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredHospitals.length === 0 && (
          <div className="py-16 text-center text-slate-500 text-xs">
            No hospital facilities match your criteria. Click &quot;Add Hospital&quot; to onboard a new facility.
          </div>
        )}

        {/* Data Grid Table */}
        {!loading && !error && filteredHospitals.length > 0 && (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left">Facility Name</th>
                  <th className="px-4 py-3 text-left">Hospital Code</th>
                  <th className="px-4 py-3 text-left">Contact & Location</th>
                  <th className="px-4 py-3 text-left">Schedule</th>
                  <th className="px-4 py-3 text-left">UPI Payment</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {paginatedHospitals.map((hospital) => {
                  let hoursParsed = { is_24_7: false, regular_hours: "" };
                  try {
                    if (typeof hospital.working_hours === "string") {
                      hoursParsed = JSON.parse(hospital.working_hours);
                    } else if (hospital.working_hours) {
                      hoursParsed = hospital.working_hours;
                    }
                  } catch {
                    hoursParsed = { is_24_7: false, regular_hours: String(hospital.working_hours) };
                  }

                  const logoSrc = hospital.logo_url ? getMediaUrl(hospital.logo_url) : "";

                  return (
                    <tr
                      key={hospital.id}
                      className="hover:bg-slate-50/80 transition duration-150"
                    >
                      {/* Facility details */}
                      <td className="px-5 py-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold overflow-hidden shrink-0">
                            {logoSrc ? (
                              <img
                                src={logoSrc}
                                alt={hospital.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xs">{hospital.name.charAt(0)}</span>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-xs">
                              {hospital.name}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              ID: #{hospital.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Code */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {hospital.code}
                        </span>
                      </td>

                      {/* Contact & Location */}
                      <td className="px-4 py-3 text-xs">
                        <div className="text-slate-800 font-medium">
                          {hospital.phone || "No phone listed"}
                        </div>
                        <div className="text-slate-500 text-[11px]">
                          {hospital.email || "No email"}
                        </div>
                        {hospital.city_name && (
                          <div className="text-slate-500 text-[11px]">
                            {hospital.city_name}, {hospital.state_name || ""}
                          </div>
                        )}
                      </td>

                      {/* Hours */}
                      <td className="px-4 py-3 text-xs">
                        {hoursParsed.is_24_7 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                            24/7 Emergency
                          </span>
                        ) : (
                          <span className="text-slate-600">
                            {hoursParsed.regular_hours || "Standard Hours"}
                          </span>
                        )}
                      </td>

                      {/* UPI QR */}
                      <td className="px-4 py-3 text-xs">
                        {hospital.upi_id ? (
                          <button
                            onClick={() => openQuickQr(hospital)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-mono transition"
                            title={hospital.upi_id}
                          >
                            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                            </svg>
                            <span>View QR</span>
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Unconfigured</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => {
                            setStatusModalHospital(hospital);
                            setStatusReason("");
                          }}
                          title="Click to toggle operational status"
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium transition ${hospital.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                            : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
                            }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full mr-1.5 ${hospital.status === "active" ? "bg-emerald-500" : "bg-slate-400"
                              }`}
                          ></span>
                          <span className="capitalize">{hospital.status}</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => openEditModal(hospital)}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded border border-slate-300 shadow-xs transition"
                        >
                          Configure
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalRecords={totalRecords}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />

            {/* Table Footer Summary */}
            <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
              <span>Showing {paginatedHospitals.length} of {filteredHospitals.length} matching facilities ({hospitals.length} total)</span>
              <span>Central Governance Active</span>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 3. ADD HOSPITAL MODAL                                         */}
      {/* ============================================================ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-2xl shadow-xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Add Hospital Facility</h3>
                <p className="text-xs text-slate-500 mt-0.5">Register a new healthcare entity, operating hours, and billing settings</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddHospital} className="p-6 space-y-4">
              {addError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-md">
                  {addError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Facility Name *</label>
                  <input
                    type="text"
                    required
                    value={addForm.name}
                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    placeholder="e.g. Metro Care Multi-Specialty"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Facility Code * (Unique)</label>
                  <input
                    type="text"
                    required
                    value={addForm.code}
                    onChange={(e) => setAddForm({ ...addForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. METRO_01"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 font-mono uppercase focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    placeholder="contact@hospital.org"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={addForm.phone}
                    onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                    placeholder="+91-9876543210"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Street Address</label>
                  <input
                    type="text"
                    value={addForm.address}
                    onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                    placeholder="Street, Medical Zone, City"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Postal Code</label>
                  <input
                    type="text"
                    value={addForm.postal_code}
                    onChange={(e) => setAddForm({ ...addForm, postal_code: e.target.value })}
                    placeholder="e.g. 400001"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Operating Hours */}
              <div className="p-3.5 bg-slate-50 rounded-md border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    Operating Schedule & Emergency Services
                  </span>
                  <label className="flex items-center cursor-pointer space-x-2">
                    <input
                      type="checkbox"
                      checked={addForm.is_24_7}
                      onChange={(e) => setAddForm({ ...addForm, is_24_7: e.target.checked })}
                      className="w-4 h-4 rounded text-sky-600 border-slate-300 focus:ring-sky-500"
                    />
                    <span className="text-xs text-emerald-700 font-medium">24/7 Emergency Available</span>
                  </label>
                </div>

                {!addForm.is_24_7 && (
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Standard Operating Hours</label>
                    <input
                      type="text"
                      value={addForm.regular_hours}
                      onChange={(e) => setAddForm({ ...addForm, regular_hours: e.target.value })}
                      placeholder="e.g. Mon-Sat: 09:00 AM - 06:00 PM"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900"
                    />
                  </div>
                )}
              </div>

              {/* UPI & Payment Config */}
              <div className="p-3.5 bg-sky-50/50 rounded-md border border-sky-100 space-y-2.5">
                <span className="text-xs font-semibold text-sky-900 block">
                  UPI & Payment QR Configuration
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Hospital UPI ID (VPA)</label>
                    <input
                      type="text"
                      value={addForm.upi_id}
                      onChange={(e) => setAddForm({ ...addForm, upi_id: e.target.value })}
                      placeholder="e.g. hospitalbilling@okhdfcbank"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Payee Display Name</label>
                    <input
                      type="text"
                      value={addForm.payee_name}
                      onChange={(e) => setAddForm({ ...addForm, payee_name: e.target.value })}
                      placeholder="e.g. Metro Care Billing"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md border border-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium rounded-md shadow-xs transition"
                >
                  {addLoading ? "Creating..." : "Save Facility"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. FACILITY CONFIGURE & EDIT MODAL                            */}
      {/* ============================================================ */}
      {selectedHospital && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-3xl shadow-xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center space-x-2">
                  <span>{selectedHospital.name}</span>
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    {selectedHospital.code}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure facility profile, schedule, branding assets, and point-of-care payments
                </p>
              </div>
              <button
                onClick={() => setSelectedHospital(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none"
              >
                &times;
              </button>
            </div>

            {/* Sub-Tabs */}
            <div className="px-6 border-b border-slate-200 flex space-x-6 text-xs font-medium bg-white">
              <button
                onClick={() => setActiveTab("info")}
                className={`py-3 border-b-2 transition ${activeTab === "info"
                  ? "border-sky-600 text-sky-700 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
              >
                Profile & Contacts
              </button>
              <button
                onClick={() => setActiveTab("hours")}
                className={`py-3 border-b-2 transition ${activeTab === "hours"
                  ? "border-sky-600 text-sky-700 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
              >
                Operating Hours
              </button>
              <button
                onClick={() => setActiveTab("images")}
                className={`py-3 border-b-2 transition ${activeTab === "images"
                  ? "border-sky-600 text-sky-700 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
              >
                Branding & Media
              </button>
              <button
                onClick={() => setActiveTab("upi")}
                className={`py-3 border-b-2 transition ${activeTab === "upi"
                  ? "border-sky-600 text-sky-700 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
              >
                UPI & Payment QR
              </button>
            </div>

            <div className="p-6">
              {editError && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-md">
                  {editError}
                </div>
              )}
              {editSuccess && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-md">
                  {editSuccess}
                </div>
              )}

              {/* TAB 1: Profile & Contacts */}
              {activeTab === "info" && (
                <form onSubmit={handleUpdateHospital} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Facility Name *</label>
                      <input
                        type="text"
                        required
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Facility Code *</label>
                      <input
                        type="text"
                        required
                        value={editForm.code}
                        onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 font-mono uppercase focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                      <input
                        type="text"
                        value={editForm.phone}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
                      <input
                        type="text"
                        value={editForm.address}
                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Postal Code</label>
                      <input
                        type="text"
                        value={editForm.postal_code}
                        onChange={(e) => setEditForm({ ...editForm, postal_code: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Administrative Status</label>
                    <div className="w-56">
                      <CustomDropdown
                        value={editForm.status}
                        onChange={(val) => setEditForm({ ...editForm, status: val })}
                        options={[
                          { value: "active", label: "Active (Operational)" },
                          { value: "inactive", label: "Inactive (Suspended)" },
                        ]}
                        placeholder="Select Status"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200 flex justify-end">
                    <button
                      type="submit"
                      disabled={editLoading}
                      className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium rounded-md shadow-xs transition"
                    >
                      {editLoading ? "Saving..." : "Update Profile"}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 2: Operating Hours */}
              {activeTab === "hours" && (
                <form onSubmit={handleUpdateHospital} className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-md border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-semibold text-slate-900">Emergency Department Service</h4>
                        <p className="text-xs text-slate-500">Specify whether trauma and emergency services are active 24/7.</p>
                      </div>
                      <label className="flex items-center cursor-pointer space-x-2">
                        <input
                          type="checkbox"
                          checked={editForm.is_24_7}
                          onChange={(e) => setEditForm({ ...editForm, is_24_7: e.target.checked })}
                          className="w-4 h-4 rounded text-sky-600 border-slate-300 focus:ring-sky-500"
                        />
                        <span className="text-xs font-medium text-emerald-700">24/7 Service</span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Outpatient / Regular Operating Schedule
                      </label>
                      <input
                        type="text"
                        value={editForm.regular_hours}
                        onChange={(e) => setEditForm({ ...editForm, regular_hours: e.target.value })}
                        placeholder="e.g. Mon-Sat: 08:00 AM - 08:00 PM, Sun: Closed"
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200 flex justify-end">
                    <button
                      type="submit"
                      disabled={editLoading}
                      className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium rounded-md shadow-xs transition"
                    >
                      {editLoading ? "Saving..." : "Save Schedule"}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 3: Images & Media */}
              {activeTab === "images" && (
                <form onSubmit={handleUploadMedia} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Logo Section */}
                    <div className="p-4 bg-slate-50 rounded-md border border-slate-200 space-y-3">
                      <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider block">
                        Facility Logo
                      </span>
                      <div className="w-20 h-20 rounded-md bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
                        {logoFile ? (
                          <img
                            src={URL.createObjectURL(logoFile)}
                            alt="Logo preview"
                            className="w-full h-full object-cover"
                          />
                        ) : selectedHospital.logo_url ? (
                          <img
                            src={getMediaUrl(selectedHospital.logo_url)}
                            alt="Current logo"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">No Logo</span>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => setLogoFile(e.target.files[0] || null)}
                        className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-50 cursor-pointer"
                      />
                      <p className="text-[10px] text-slate-400">Allowed: JPEG, PNG, WebP (Max 2MB)</p>
                    </div>

                    {/* Facility Banner Section */}
                    <div className="p-4 bg-slate-50 rounded-md border border-slate-200 space-y-3">
                      <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider block">
                        Facility Banner / Showcase Image
                      </span>
                      <div className="w-full h-20 rounded-md bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
                        {bannerFile ? (
                          <img
                            src={URL.createObjectURL(bannerFile)}
                            alt="Banner preview"
                            className="w-full h-full object-cover"
                          />
                        ) : selectedHospital.image_url ? (
                          <img
                            src={getMediaUrl(selectedHospital.image_url)}
                            alt="Current banner"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">No Banner</span>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => setBannerFile(e.target.files[0] || null)}
                        className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border file:border-slate-300 file:text-xs file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-50 cursor-pointer"
                      />
                      <p className="text-[10px] text-slate-400">Allowed: JPEG, PNG, WebP (Max 2MB)</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200 flex justify-end">
                    <button
                      type="submit"
                      disabled={uploadLoading || (!logoFile && !bannerFile)}
                      className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium rounded-md shadow-xs transition"
                    >
                      {uploadLoading ? "Uploading Media..." : "Upload Selected Media"}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 4: UPI & Payment QR */}
              {activeTab === "upi" && (
                <div className="space-y-6">
                  <form onSubmit={handleUpdateHospital} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Hospital UPI ID (VPA) *</label>
                        <input
                          type="text"
                          value={editForm.upi_id}
                          onChange={(e) => setEditForm({ ...editForm, upi_id: e.target.value })}
                          placeholder="e.g. hospitalname@okhdfcbank"
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Payee Display Name</label>
                        <input
                          type="text"
                          value={editForm.payee_name}
                          onChange={(e) => setEditForm({ ...editForm, payee_name: e.target.value })}
                          placeholder="e.g. Hospital Billing Department"
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={editLoading}
                        className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium rounded-md shadow-xs transition"
                      >
                        {editLoading ? "Updating..." : "Save UPI Settings"}
                      </button>
                    </div>
                  </form>

                  {/* Generated QR Preview */}
                  <div className="p-4 bg-slate-50 rounded-md border border-slate-200 flex flex-col md:flex-row items-center gap-6">
                    <div className="w-36 h-36 bg-white p-2 rounded-md border border-slate-200 shadow-xs flex items-center justify-center shrink-0">
                      {selectedHospital.qr_code_url ? (
                        <img
                          src={getMediaUrl(selectedHospital.qr_code_url)}
                          alt="Hospital UPI QR"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-slate-400 text-center font-medium">
                          Configure UPI ID to generate QR
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-semibold uppercase tracking-wider inline-block">
                        Payment QR Code
                      </span>
                      <h4 className="text-xs font-bold text-slate-900">
                        {selectedHospital.payee_name || selectedHospital.name}
                      </h4>
                      <p className="font-mono text-sky-700 text-xs">
                        {selectedHospital.upi_id || "No UPI configured"}
                      </p>
                      <p className="text-slate-500 text-[11px] leading-relaxed">
                        Patients can scan this dynamic QR code using any UPI-compliant app (Google Pay, PhonePe, Paytm, BHIM) to settle clinic bills directly.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. QUICK QR MODAL                                            */}
      {/* ============================================================ */}
      {qrModalData && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-sm shadow-xl p-5 text-center space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                UPI Payment Code
              </span>
              <button
                onClick={() => setQrModalData(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none"
              >
                &times;
              </button>
            </div>

            <div className="w-48 h-48 bg-white p-2 rounded-lg border border-slate-200 shadow-xs mx-auto flex items-center justify-center">
              {qrLoading ? (
                <div className="text-slate-400 text-xs font-medium animate-pulse">Generating QR...</div>
              ) : qrModalData.qrData?.qr_code ? (
                <img
                  src={qrModalData.qrData.qr_code}
                  alt="UPI Payment QR"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-slate-500 text-xs p-2">
                  {qrModalData.qrError || "UPI ID not configured for this hospital"}
                </div>
              )}
            </div>

            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {qrModalData.qrData?.payee_name || qrModalData.name}
              </h3>
              <p className="font-mono text-sky-700 text-xs mt-0.5">
                {qrModalData.qrData?.upi_id || qrModalData.upi_id || "Unconfigured"}
              </p>
            </div>

            <div className="p-2.5 bg-slate-50 rounded-md border border-slate-200 text-[11px] text-slate-500 text-left">
              Scan with any UPI app: Google Pay, PhonePe, Paytm, or BHIM.
            </div>

            <button
              onClick={() => setQrModalData(null)}
              className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. STATUS CHANGE CONFIRMATION MODAL                          */}
      {/* ============================================================ */}
      {statusModalHospital && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Facility Status Management
              </span>
              <button
                onClick={() => setStatusModalHospital(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none"
              >
                &times;
              </button>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {statusModalHospital.status === "active" ? "Deactivate Hospital Facility?" : "Activate Hospital Facility?"}
              </h3>
              <p className="font-medium text-xs text-sky-700 mt-0.5">
                {statusModalHospital.name} ({statusModalHospital.code})
              </p>
            </div>

            {statusModalHospital.status === "active" ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800 leading-relaxed space-y-1">
                <p className="font-semibold text-amber-900">Warning: Access Lockout</p>
                <p>
                  Deactivating this hospital will immediately restrict access for all affiliated Hospital Admins, Doctors, and Staff. They will be blocked from authenticating.
                </p>
                <p className="text-[11px] text-amber-700">All historical clinical records and user accounts remain safely preserved.</p>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800 leading-relaxed">
                <p className="font-semibold text-emerald-900">Reactivating Facility</p>
                <p>
                  This will restore full portal login and clinical workflows for all verified medical staff affiliated with this facility.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Administrative Note (Audit Trail)
              </label>
              <textarea
                rows="2"
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="e.g. Compliance review, routine inspection, license renewal"
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
              ></textarea>
            </div>

            <div className="pt-2 flex justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => setStatusModalHospital(null)}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md border border-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={statusLoading}
                onClick={handleConfirmStatusChange}
                className={`px-4 py-1.5 text-xs font-medium rounded-md shadow-xs transition disabled:opacity-50 text-white ${statusModalHospital.status === "active"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
              >
                {statusLoading ? "Updating..." : statusModalHospital.status === "active" ? "Confirm Deactivation" : "Confirm Activation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
