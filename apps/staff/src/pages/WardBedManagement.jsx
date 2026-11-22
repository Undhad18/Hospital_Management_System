import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getWards,
  getWardById,
  createWard,
  updateWard,
  updateWardStatus,
  getBeds,
  getBedById,
  createBed,
  updateBed,
  assignBed,
  releaseBed,
  updateBedMaintenance,
  getBedHistory,
  getAdmissionHospitals,
  getAdmissionDepartments,
  getAdmissions,
} from "../services/api";
import { subscribeToEvent } from "../services/socket";
import CustomDropdown from "../components/CustomDropdown";
import Pagination, { usePagination } from "../components/Pagination";

export default function WardBedManagement({ session }) {
  const token = session?.token;
  const user = session?.user;

  // Primary data state
  const [wards, setWards] = useState([]);
  const [beds, setBeds] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Filtering & View state
  const [selectedDeptId, setSelectedDeptId] = useState("all");
  const [selectedWardId, setSelectedWardId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeViewMode, setActiveViewMode] = useState("overview"); // 'overview' | 'wards' | 'beds'

  // Modals state
  const [showWardModal, setShowWardModal] = useState(false);
  const [editingWard, setEditingWard] = useState(null);
  const [showBedModal, setShowBedModal] = useState(false);
  const [editingBed, setEditingBed] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedBedForAssign, setSelectedBedForAssign] = useState(null);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [selectedBedForRelease, setSelectedBedForRelease] = useState(null);
  const [showMaintModal, setShowMaintModal] = useState(false);
  const [selectedBedForMaint, setSelectedBedForMaint] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyBed, setHistoryBed] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Form states
  const [wardForm, setWardForm] = useState({
    hospital_id: user?.hospitalId || "",
    department_id: "",
    name: "",
    ward_type: "general",
    capacity: 10,
    status: "active",
  });
  const [wardSubmitting, setWardSubmitting] = useState(false);
  const [wardFormError, setWardFormError] = useState("");

  const [bedForm, setBedForm] = useState({
    ward_id: "",
    bed_number: "",
    bed_type: "standard",
    daily_rate: 0,
  });
  const [bedSubmitting, setBedSubmitting] = useState(false);
  const [bedFormError, setBedFormError] = useState("");

  // Bed assignment form state
  const [eligibleAdmissions, setEligibleAdmissions] = useState([]);
  const [loadingAdmissions, setLoadingAdmissions] = useState(false);
  const [selectedAdmissionId, setSelectedAdmissionId] = useState("");
  const [assignmentNotes, setAssignmentNotes] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState("");

  // Release form state
  const [releaseReason, setReleaseReason] = useState("");
  const [releaseSubmitting, setReleaseSubmitting] = useState(false);
  const [releaseError, setReleaseError] = useState("");

  // Maintenance form state
  const [maintAction, setMaintAction] = useState("place"); // 'place' | 'return'
  const [maintReason, setMaintReason] = useState("");
  const [maintSubmitting, setMaintSubmitting] = useState(false);
  const [maintError, setMaintError] = useState("");

  // Auto-dismiss notification
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(""), 4000);
      return () => clearInterval(timer);
    }
  }, [successMsg]);

  // Load departments
  useEffect(() => {
    if (!token || !user?.hospitalId) return;
    getAdmissionDepartments(token, user.hospitalId)
      .then((data) => setDepartments(data))
      .catch((err) => console.error("Failed to load departments:", err));
  }, [token, user?.hospitalId]);

  // Load Wards & Beds
  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const wardFilters = {};
      if (user?.hospitalId) wardFilters.hospital_id = user.hospitalId;
      if (selectedDeptId !== "all") wardFilters.department_id = selectedDeptId;

      const [wardList, bedList] = await Promise.all([
        getWards(token, wardFilters),
        getBeds(token, {
          hospital_id: user?.hospitalId,
          department_id: selectedDeptId !== "all" ? selectedDeptId : undefined,
          ward_id: selectedWardId !== "all" ? selectedWardId : undefined,
        }),
      ]);

      setWards(wardList);
      setBeds(bedList);
    } catch (err) {
      setError(err.message || "Failed to load ward and bed data");
    } finally {
      setLoading(false);
    }
  }, [token, user?.hospitalId, selectedDeptId, selectedWardId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time synchronization for beds and wards
  useEffect(() => {
    if (!token) return;

    const unsubBeds = subscribeToEvent("beds:updated", () => {
      loadData();
    }, token);

    const unsubWards = subscribeToEvent("wards:updated", () => {
      loadData();
    }, token);

    return () => {
      unsubBeds();
      unsubWards();
    };
  }, [token, loadData]);

  // Capacity and Occupancy Metrics Calculation (Lesson 10.3)
  const metrics = useMemo(() => {
    const totalWards = wards.length;
    const configuredCapacity = wards.reduce((sum, w) => sum + (Number(w.configured_capacity) || 0), 0);
    const totalRegisteredBeds = beds.length;
    const availableBeds = beds.filter((b) => b.status === "available").length;
    const occupiedBeds = beds.filter((b) => b.status === "occupied").length;
    const maintenanceBeds = beds.filter((b) => b.status === "maintenance").length;
    const occupancyRate = totalRegisteredBeds > 0 ? Math.round((occupiedBeds / totalRegisteredBeds) * 100) : 0;

    return {
      totalWards,
      configuredCapacity,
      totalRegisteredBeds,
      availableBeds,
      occupiedBeds,
      maintenanceBeds,
      occupancyRate,
    };
  }, [wards, beds]);

  // Filtered beds list
  const filteredBeds = useMemo(() => {
    return beds.filter((b) => {
      if (filterStatus !== "all" && b.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const numMatch = b.bed_number?.toLowerCase().includes(q);
        const wardMatch = b.ward_name?.toLowerCase().includes(q);
        const patMatch = b.patient_name?.toLowerCase().includes(q);
        const admMatch = b.admission_number?.toLowerCase().includes(q);
        if (!numMatch && !wardMatch && !patMatch && !admMatch) return false;
      }
      return true;
    });
  }, [beds, filterStatus, searchQuery]);

  const {
    currentPage: bedPage,
    setCurrentPage: setBedPage,
    pageSize: bedPageSize,
    setPageSize: setBedPageSize,
    totalPages: bedTotalPages,
    totalRecords: bedTotalRecords,
    paginatedItems: paginatedBeds,
    resetPage: resetBedPage,
  } = usePagination(filteredBeds, 25);

  useEffect(() => {
    resetBedPage();
  }, [filterStatus, searchQuery, selectedWardId, selectedDeptId, resetBedPage]);

  // Open Ward Creation/Edit Modal
  function handleOpenWardModal(ward = null) {
    setEditingWard(ward);
    setWardFormError("");
    if (ward) {
      setWardForm({
        hospital_id: ward.hospital_id,
        department_id: ward.department_id,
        name: ward.name,
        ward_type: ward.ward_type,
        capacity: ward.configured_capacity || 10,
        status: ward.status,
      });
    } else {
      setWardForm({
        hospital_id: user?.hospitalId || "",
        department_id: departments[0]?.id || "",
        name: "",
        ward_type: "general",
        capacity: 10,
        status: "active",
      });
    }
    setShowWardModal(true);
  }

  // Save Ward (Create or Update)
  async function handleSaveWard(e) {
    e.preventDefault();
    setWardSubmitting(true);
    setWardFormError("");
    try {
      if (editingWard) {
        await updateWard(token, editingWard.id, {
          name: wardForm.name,
          ward_type: wardForm.ward_type,
          capacity: Number(wardForm.capacity),
        });
        setSuccessMsg(`Ward '${wardForm.name}' updated successfully.`);
      } else {
        await createWard(token, {
          hospital_id: user?.hospitalId || wardForm.hospital_id,
          department_id: Number(wardForm.department_id),
          name: wardForm.name,
          ward_type: wardForm.ward_type,
          capacity: Number(wardForm.capacity),
          status: wardForm.status,
        });
        setSuccessMsg(`Ward '${wardForm.name}' created successfully.`);
      }
      setShowWardModal(false);
      loadData();
    } catch (err) {
      setWardFormError(err.message || "Failed to save ward.");
    } finally {
      setWardSubmitting(false);
    }
  }

  // Toggle Ward Status
  async function handleToggleWardStatus(ward) {
    const newStatus = ward.status === "active" ? "inactive" : "active";
    if (
      !window.confirm(
        `Are you sure you want to change status of ward '${ward.name}' to ${newStatus}?`
      )
    ) {
      return;
    }
    try {
      await updateWardStatus(token, ward.id, newStatus);
      setSuccessMsg(`Ward status changed to ${newStatus}.`);
      loadData();
    } catch (err) {
      setError(err.message || "Failed to update ward status.");
    }
  }

  // Open Bed Creation/Edit Modal
  function handleOpenBedModal(bed = null, defaultWardId = null) {
    setEditingBed(bed);
    setBedFormError("");
    if (bed) {
      setBedForm({
        ward_id: bed.ward_id,
        bed_number: bed.bed_number,
        bed_type: bed.bed_type,
        daily_rate: bed.daily_rate,
      });
    } else {
      setBedForm({
        ward_id: defaultWardId || wards[0]?.id || "",
        bed_number: "",
        bed_type: "standard",
        daily_rate: 0,
      });
    }
    setShowBedModal(true);
  }

  // Save Bed (Create or Edit)
  async function handleSaveBed(e) {
    e.preventDefault();
    setBedSubmitting(true);
    setBedFormError("");
    try {
      if (editingBed) {
        await updateBed(token, editingBed.id, {
          bed_number: bedForm.bed_number,
          bed_type: bedForm.bed_type,
          daily_rate: Number(bedForm.daily_rate),
        });
        setSuccessMsg(`Bed '${bedForm.bed_number}' updated successfully.`);
      } else {
        await createBed(token, {
          ward_id: Number(bedForm.ward_id),
          bed_number: bedForm.bed_number,
          bed_type: bedForm.bed_type,
          daily_rate: Number(bedForm.daily_rate),
        });
        setSuccessMsg(`Bed '${bedForm.bed_number}' registered successfully.`);
      }
      setShowBedModal(false);
      loadData();
    } catch (err) {
      setBedFormError(err.message || "Failed to save bed.");
    } finally {
      setBedSubmitting(false);
    }
  }

  // Open Bed Assignment Modal (Lessons 10.5 & 10.9)
  async function handleOpenAssignModal(bed) {
    setSelectedBedForAssign(bed);
    setAssignError("");
    setSelectedAdmissionId("");
    setAssignmentNotes("");
    setShowAssignModal(true);
    setLoadingAdmissions(true);
    try {
      // Load active admissions for this hospital that do NOT already have a bed
      const adms = await getAdmissions(token, { status: "active" });
      setEligibleAdmissions(adms);
    } catch (err) {
      setAssignError(err.message || "Failed to load active admissions.");
    } finally {
      setLoadingAdmissions(false);
    }
  }

  // Submit Bed Assignment
  async function handleAssignBed(e) {
    e.preventDefault();
    if (!selectedAdmissionId) {
      setAssignError("Please select an active patient admission to assign.");
      return;
    }
    setAssignSubmitting(true);
    setAssignError("");
    try {
      await assignBed(token, {
        bed_id: selectedBedForAssign.id,
        admission_id: Number(selectedAdmissionId),
        notes: assignmentNotes,
      });
      setSuccessMsg(`Bed '${selectedBedForAssign.bed_number}' assigned successfully.`);
      setShowAssignModal(false);
      loadData();
    } catch (err) {
      setAssignError(err.message || "Failed to assign bed.");
    } finally {
      setAssignSubmitting(false);
    }
  }

  // Open Release Bed Modal
  function handleOpenReleaseModal(bed) {
    setSelectedBedForRelease(bed);
    setReleaseReason("");
    setReleaseError("");
    setShowReleaseModal(true);
  }

  // Submit Release Bed
  async function handleReleaseBed(e) {
    e.preventDefault();
    setReleaseSubmitting(true);
    setReleaseError("");
    try {
      await releaseBed(token, {
        bed_id: selectedBedForRelease.id,
        reason: releaseReason || "Manual release by clinical administrator",
      });
      setSuccessMsg(`Bed '${selectedBedForRelease.bed_number}' successfully released and marked available.`);
      setShowReleaseModal(false);
      loadData();
    } catch (err) {
      setReleaseError(err.message || "Failed to release bed.");
    } finally {
      setReleaseSubmitting(false);
    }
  }

  // Open Maintenance Modal
  function handleOpenMaintModal(bed, action = "place") {
    setSelectedBedForMaint(bed);
    setMaintAction(action);
    setMaintReason(bed.maintenance_reason || "");
    setMaintError("");
    setShowMaintModal(true);
  }

  // Submit Maintenance Action
  async function handleSaveMaintenance(e) {
    e.preventDefault();
    setMaintSubmitting(true);
    setMaintError("");
    try {
      await updateBedMaintenance(token, selectedBedForMaint.id, {
        action: maintAction,
        reason: maintReason || "Scheduled servicing",
      });
      setSuccessMsg(
        maintAction === "place"
          ? `Bed '${selectedBedForMaint.bed_number}' placed in maintenance.`
          : `Bed '${selectedBedForMaint.bed_number}' returned to active service.`
      );
      setShowMaintModal(false);
      loadData();
    } catch (err) {
      setMaintError(err.message || "Failed to update maintenance state.");
    } finally {
      setMaintSubmitting(false);
    }
  }

  // Open Bed History Modal (Lesson 10.8)
  async function handleOpenHistoryModal(bed) {
    setHistoryBed(bed);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    try {
      const data = await getBedHistory(token, bed.id);
      setHistoryData(data);
    } catch (err) {
      console.error("Failed to load bed history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast Flash Messages */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg("")} className="text-emerald-700 hover:text-emerald-900 font-bold">×</button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-rose-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
          <button onClick={() => setError("")} className="text-rose-700 hover:text-rose-900 font-bold">×</button>
        </div>
      )}

      {/* Top Header & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Ward &amp; Bed Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Department-wise inpatient wards, capacity configuration, real-time bed allocation, and occupancy tracking.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => handleOpenWardModal()}
            className="inline-flex items-center space-x-2 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-xs transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Create Ward</span>
          </button>

          <button
            onClick={() => handleOpenBedModal()}
            disabled={wards.length === 0}
            className="inline-flex items-center space-x-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Add Bed</span>
          </button>
        </div>
      </div>

      {/* Analytics & Capacity Metrics Overview (Lessons 10.1 & 10.3) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Wards</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{metrics.totalWards}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Organized by Unit</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Capacity</p>
          <p className="text-2xl font-bold text-sky-600 mt-1">{metrics.configuredCapacity}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{metrics.totalRegisteredBeds} beds registered</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Available Beds</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{metrics.availableBeds}</p>
          <p className="text-[11px] text-emerald-600 mt-0.5">Ready for admission</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">Occupied Beds</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{metrics.occupiedBeds}</p>
          <p className="text-[11px] text-amber-600 mt-0.5">Currently assigned</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Maintenance</p>
          <p className="text-2xl font-bold text-slate-700 mt-1">{metrics.maintenanceBeds}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Service / sanitizing</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Occupancy Rate</p>
          <div className="flex items-baseline space-x-1.5 mt-1">
            <span className="text-2xl font-bold text-slate-900">{metrics.occupancyRate}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                metrics.occupancyRate > 85
                  ? "bg-rose-500"
                  : metrics.occupancyRate > 60
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(metrics.occupancyRate, 100)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Filter and Tab Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3.5 relative z-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* View Mode Switcher */}
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg self-start">
            <button
              onClick={() => setActiveViewMode("overview")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                activeViewMode === "overview"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span>Wards &amp; Capacity</span>
            </button>
            <button
              onClick={() => setActiveViewMode("beds")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                activeViewMode === "beds"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span>Live Bed Grid</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeViewMode === "beds" ? "bg-sky-100 text-sky-800" : "bg-slate-200 text-slate-600"
              }`}>
                {filteredBeds.length}
              </span>
            </button>
          </div>

          {/* Quick Search Input */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search beds, patients, wards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-slate-50/80 hover:bg-white focus:bg-white border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-2xs transition"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Filter Strip with Dropdowns */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mr-1">
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
            </span>

            {/* Department Filter */}
            <div className="w-48">
              <CustomDropdown
                value={selectedDeptId}
                onChange={(val) => setSelectedDeptId(val)}
                options={[
                  { value: "all", label: "All Departments" },
                  ...departments.map((d) => ({ value: d.id, label: d.name })),
                ]}
                placeholder="All Departments"
              />
            </div>

            {/* Ward Filter (if viewing beds) */}
            {activeViewMode === "beds" && (
              <div className="w-56">
                <CustomDropdown
                  value={selectedWardId}
                  onChange={(val) => setSelectedWardId(val)}
                  options={[
                    { value: "all", label: "All Wards" },
                    ...wards.map((w) => ({
                      value: w.id,
                      label: `${w.name} (${w.department_name})`,
                    })),
                  ]}
                  placeholder="All Wards"
                />
              </div>
            )}

            {/* Status Filter */}
            <div className="w-40">
              <CustomDropdown
                value={filterStatus}
                onChange={(val) => setFilterStatus(val)}
                options={[
                  { value: "all", label: "All Statuses" },
                  { value: "available", label: "Available Only" },
                  { value: "occupied", label: "Occupied Only" },
                  { value: "maintenance", label: "Maintenance Only" },
                ]}
                placeholder="All Statuses"
              />
            </div>

            {/* Reset Filter Button */}
            {(selectedDeptId !== "all" || selectedWardId !== "all" || filterStatus !== "all" || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDeptId("all");
                  setSelectedWardId("all");
                  setFilterStatus("all");
                  setSearchQuery("");
                }}
                className="px-2.5 py-1 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md font-semibold transition cursor-pointer flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Reset Filters</span>
              </button>
            )}
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Active Records: <span className="font-bold text-slate-800">{activeViewMode === "beds" ? filteredBeds.length : wards.length}</span>
          </div>
        </div>
      </div>

      {/* Main View Area */}
      {loading ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
          <div className="inline-block animate-spin w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full mb-3"></div>
          <p className="text-xs font-semibold text-slate-600">Loading wards and bed allocations...</p>
        </div>
      ) : activeViewMode === "overview" ? (
        /* ======================== WARDS & CAPACITY VIEW ======================== */
        <div className="space-y-4">
          {wards.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-dashed border-slate-300 text-center">
              <div className="w-12 h-12 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-slate-900">No Wards Configured</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No inpatient wards have been set up for this department. Click "Create Ward" to configure clinical ward space.
              </p>
              <button
                onClick={() => handleOpenWardModal()}
                className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-xs"
              >
                Create First Ward
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {wards.map((ward) => {
                const wardBeds = beds.filter((b) => b.ward_id === ward.id);
                const regCount = ward.total_registered_beds || wardBeds.length;
                const occCount = ward.occupied_beds || wardBeds.filter((b) => b.status === "occupied").length;
                const availCount = ward.available_beds || wardBeds.filter((b) => b.status === "available").length;
                const maintCount = ward.maintenance_beds || wardBeds.filter((b) => b.status === "maintenance").length;
                const cap = ward.configured_capacity || 10;
                const pct = cap > 0 ? Math.round((occCount / cap) * 100) : 0;

                return (
                  <div
                    key={ward.id}
                    className={`bg-white rounded-xl border transition shadow-xs flex flex-col justify-between ${
                      ward.status === "inactive"
                        ? "border-slate-300 opacity-75 bg-slate-50/50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-bold text-slate-900 text-base">{ward.name}</h3>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                ward.status === "active"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-slate-100 text-slate-600 border border-slate-200"
                              }`}
                            >
                              {ward.status}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-slate-500 mt-1 flex items-center space-x-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                            <span>{ward.department_name}</span>
                            <span className="text-slate-300">•</span>
                            <span className="capitalize">{ward.ward_type?.replace("_", " ")} Ward</span>
                          </p>
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleOpenWardModal(ward)}
                            title="Edit Ward Details"
                            className="p-1.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Capacity & Occupancy Progress */}
                      <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                          <span>Ward Occupancy</span>
                          <span>
                            {occCount} / {cap} beds ({pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2 mt-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              pct > 90 ? "bg-rose-500" : pct > 60 ? "bg-amber-500" : "bg-sky-600"
                            }`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          ></div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-200/60 text-center">
                          <div>
                            <span className="block text-xs font-bold text-emerald-600">{availCount}</span>
                            <span className="text-[10px] text-slate-400">Available</span>
                          </div>
                          <div>
                            <span className="block text-xs font-bold text-amber-600">{occCount}</span>
                            <span className="text-[10px] text-slate-400">Occupied</span>
                          </div>
                          <div>
                            <span className="block text-xs font-bold text-slate-600">{maintCount}</span>
                            <span className="text-[10px] text-slate-400">Maint.</span>
                          </div>
                        </div>
                      </div>

                      {/* Mini Bed Status Bubbles */}
                      <div className="mt-3.5">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                          Registered Beds ({regCount}/{cap})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {wardBeds.map((bed) => (
                            <button
                              key={bed.id}
                              onClick={() => {
                                setSelectedWardId(ward.id);
                                setActiveViewMode("beds");
                              }}
                              className={`px-2 py-1 rounded text-[11px] font-mono font-semibold transition cursor-pointer flex items-center space-x-1 border ${
                                bed.status === "available"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                  : bed.status === "occupied"
                                  ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                                  : "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200"
                              }`}
                            >
                              <span>{bed.bed_number}</span>
                            </button>
                          ))}
                          {regCount < cap && (
                            <button
                              onClick={() => handleOpenBedModal(null, ward.id)}
                              className="px-2 py-1 rounded text-[11px] font-medium text-slate-500 border border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 transition"
                            >
                              + Add Bed
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ward Footer Controls */}
                    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 rounded-b-xl flex items-center justify-between text-xs">
                      <button
                        onClick={() => handleToggleWardStatus(ward)}
                        className={`text-[11px] font-medium ${
                          ward.status === "active"
                            ? "text-rose-600 hover:text-rose-800"
                            : "text-emerald-600 hover:text-emerald-800"
                        }`}
                      >
                        {ward.status === "active" ? "Deactivate Ward" : "Activate Ward"}
                      </button>

                      <button
                        onClick={() => {
                          setSelectedWardId(ward.id);
                          setActiveViewMode("beds");
                        }}
                        className="text-sky-600 hover:text-sky-800 font-semibold inline-flex items-center space-x-1"
                      >
                        <span>Manage Beds</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ======================== LIVE BED GRID VIEW ======================== */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 tracking-tight">
              Showing {filteredBeds.length} Beds
              {selectedWardId !== "all" && ` in ${wards.find((w) => w.id === Number(selectedWardId))?.name || "Selected Ward"}`}
            </h2>
            <div className="flex items-center space-x-3 text-xs">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-slate-600">Available</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span className="text-slate-600">Occupied</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                <span className="text-slate-600">Maintenance</span>
              </span>
            </div>
          </div>

          {filteredBeds.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-dashed border-slate-300 text-center">
              <p className="text-sm font-semibold text-slate-700">No beds match current filters.</p>
              <p className="text-xs text-slate-400 mt-1">Try resetting the department, ward or status filters.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {paginatedBeds.map((bed) => (
                <div
                  key={bed.id}
                  className={`bg-white rounded-xl border p-4 shadow-2xs hover:shadow-xs transition flex flex-col justify-between h-full min-h-[320px] ${
                    bed.status === "available"
                      ? "border-emerald-200 hover:border-emerald-300"
                      : bed.status === "occupied"
                      ? "border-amber-200 hover:border-amber-300"
                      : "border-slate-300 bg-slate-50/50"
                  }`}
                >
                  <div>
                    {/* Header: Bed Number & Status */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono font-bold text-base text-slate-900">{bed.bed_number}</span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              bed.status === "available"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : bed.status === "occupied"
                                ? "bg-amber-50 text-amber-800 border border-amber-200"
                                : "bg-slate-100 text-slate-600 border border-slate-300"
                            }`}
                          >
                            {bed.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 font-medium">{bed.ward_name}</p>
                      </div>

                      <button
                        onClick={() => handleOpenHistoryModal(bed)}
                        title="View Occupancy History"
                        className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    </div>

                    {/* Bed Specifications */}
                    <div className="mt-3 p-2.5 bg-slate-50/70 border border-slate-100 rounded-lg text-xs space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-medium">Department:</span>
                        <span className="font-semibold text-slate-800 truncate max-w-[130px]">{bed.department_name}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-medium">Bed Type:</span>
                        <span className="font-semibold text-slate-800 capitalize">{bed.bed_type?.replace("_", " ")}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-medium">Daily Charge:</span>
                        <span className="font-bold text-slate-900">₹{Number(bed.daily_rate).toFixed(2)}/day</span>
                      </div>
                    </div>

                    {/* Occupant Card / Maintenance / Available Status Banner (Uniform min-height) */}
                    {bed.status === "available" && (
                      <div className="mt-3 p-2.5 bg-emerald-50/70 border border-emerald-200/60 rounded-lg text-xs flex items-center gap-2.5 min-h-[76px]">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Ready for Admission</p>
                          <p className="text-[11px] text-emerald-600 mt-0.5 truncate font-medium">Sanitized &amp; available</p>
                        </div>
                      </div>
                    )}

                    {bed.status === "occupied" && (
                      <div className="mt-3 p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-lg text-xs min-h-[76px] flex flex-col justify-center">
                        <p className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">Current Patient</p>
                        <p className="font-bold text-slate-900 mt-0.5 truncate">{bed.patient_name || "Admitted Patient"}</p>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                          <span className="font-mono text-amber-800 font-semibold">{bed.admission_number}</span>
                          <span>Since: {bed.assigned_at_formatted}</span>
                        </div>
                      </div>
                    )}

                    {bed.status === "maintenance" && (
                      <div className="mt-3 p-2.5 bg-slate-100/90 border border-slate-200 rounded-lg text-xs min-h-[76px] flex flex-col justify-center">
                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Maintenance Note</p>
                        <p className="text-xs text-slate-700 mt-0.5 italic truncate">{bed.maintenance_reason || "Scheduled servicing"}</p>
                      </div>
                    )}
                  </div>

                  {/* Bed Action Buttons (Strict h-8 with icons & whitespace-nowrap) */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    {bed.status === "available" && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenAssignModal(bed)}
                          className="flex-1 h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                          </svg>
                          <span>Assign Patient</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenMaintModal(bed, "place")}
                          className="h-8 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                          title="Place under maintenance"
                        >
                          <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>Service</span>
                        </button>
                      </>
                    )}

                    {bed.status === "occupied" && (
                      <button
                        type="button"
                        onClick={() => handleOpenReleaseModal(bed)}
                        className="w-full h-8 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span>Release / Discharge Bed</span>
                      </button>
                    )}

                    {bed.status === "maintenance" && (
                      <button
                        type="button"
                        onClick={() => handleOpenMaintModal(bed, "return")}
                        className="w-full h-8 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Return to Active Service</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

              {/* Pagination Controls */}
              <Pagination
                currentPage={bedPage}
                totalPages={bedTotalPages}
                totalRecords={bedTotalRecords}
                pageSize={bedPageSize}
                onPageChange={setBedPage}
                onPageSizeChange={setBedPageSize}
              />
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE / EDIT WARD */}
      {/* ========================================================================= */}
      {showWardModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm">
                {editingWard ? `Edit Ward: ${editingWard.name}` : "Create Clinical Inpatient Ward"}
              </h3>
              <button
                onClick={() => setShowWardModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveWard} className="p-6 space-y-4">
              {wardFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg">
                  {wardFormError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinical Department <span className="text-rose-500">*</span>
                </label>
                <CustomDropdown
                  disabled={Boolean(editingWard)}
                  value={wardForm.department_id}
                  onChange={(val) => setWardForm({ ...wardForm, department_id: val })}
                  options={[
                    { value: "", label: "Select Department" },
                    ...departments.map((d) => ({ value: d.id, label: d.name })),
                  ]}
                  placeholder="Select Department"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ward Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Intensive Coronary Care Unit (ICCU)"
                  value={wardForm.name}
                  onChange={(e) => setWardForm({ ...wardForm, name: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ward Type <span className="text-rose-500">*</span>
                  </label>
                  <CustomDropdown
                    value={wardForm.ward_type}
                    onChange={(val) => setWardForm({ ...wardForm, ward_type: val })}
                    options={[
                      { value: "general", label: "General" },
                      { value: "semi_private", label: "Semi-Private" },
                      { value: "private", label: "Private" },
                      { value: "icu", label: "ICU" },
                      { value: "emergency", label: "Emergency" },
                      { value: "maternity", label: "Maternity" },
                      { value: "pediatric", label: "Pediatric" },
                      { value: "surgical", label: "Surgical" },
                    ]}
                    placeholder="Select Ward Type"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bed Capacity Limit <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={wardForm.capacity}
                    onChange={(e) => setWardForm({ ...wardForm, capacity: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Configured maximum bed limit.</p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowWardModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={wardSubmitting}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  {wardSubmitting ? "Saving..." : editingWard ? "Save Changes" : "Create Ward"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: REGISTER / EDIT BED */}
      {/* ========================================================================= */}
      {showBedModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm">
                {editingBed ? `Edit Bed: ${editingBed.bed_number}` : "Register New Bed"}
              </h3>
              <button
                onClick={() => setShowBedModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBed} className="p-6 space-y-4">
              {bedFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg">
                  {bedFormError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Ward <span className="text-rose-500">*</span>
                </label>
                <CustomDropdown
                  disabled={Boolean(editingBed)}
                  value={bedForm.ward_id}
                  onChange={(val) => setBedForm({ ...bedForm, ward_id: val })}
                  options={[
                    { value: "", label: "Select Ward" },
                    ...wards.map((w) => ({
                      value: w.id,
                      label: `${w.name} (${w.department_name}) — Cap: ${w.configured_capacity}`,
                    })),
                  ]}
                  placeholder="Select Ward"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bed Identifier / Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. ICU-01, B-102"
                  value={bedForm.bed_number}
                  onChange={(e) => setBedForm({ ...bedForm, bed_number: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bed Type <span className="text-rose-500">*</span>
                  </label>
                  <CustomDropdown
                    value={bedForm.bed_type}
                    onChange={(val) => setBedForm({ ...bedForm, bed_type: val })}
                    options={[
                      { value: "standard", label: "Standard" },
                      { value: "icu", label: "ICU Bed" },
                      { value: "pediatric", label: "Pediatric" },
                      { value: "bariatric", label: "Bariatric" },
                      { value: "electric", label: "Electric Motorized" },
                      { value: "ventilator_enabled", label: "Ventilator Enabled" },
                    ]}
                    placeholder="Select Bed Type"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Daily Rate (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={bedForm.daily_rate}
                    onChange={(e) => setBedForm({ ...bedForm, daily_rate: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowBedModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bedSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  {bedSubmitting ? "Saving..." : editingBed ? "Save Changes" : "Create Bed"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ASSIGN BED TO ADMITTED PATIENT (Lessons 10.5 & 10.9) */}
      {/* ========================================================================= */}
      {showAssignModal && selectedBedForAssign && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Assign Bed to Patient Admission</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Allocating <span className="font-mono font-bold text-emerald-700">{selectedBedForAssign.bed_number}</span> in {selectedBedForAssign.ward_name}
                </p>
              </div>
              <button
                onClick={() => setShowAssignModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAssignBed} className="p-6 space-y-4">
              {assignError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg">
                  {assignError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Eligible Patient Admission <span className="text-rose-500">*</span>
                </label>
                {loadingAdmissions ? (
                  <div className="text-xs text-slate-500 py-3">Loading active admissions...</div>
                ) : eligibleAdmissions.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg">
                    No active admissions found in this hospital without a bed. Please create an admission first.
                  </div>
                ) : (
                  <CustomDropdown
                    value={selectedAdmissionId}
                    onChange={(val) => setSelectedAdmissionId(val)}
                    options={[
                      { value: "", label: "-- Choose Patient Admission --" },
                      ...eligibleAdmissions.map((adm) => ({
                        value: adm.id,
                        label: `${adm.admission_number} — ${adm.patient_name} (${adm.department_name}, Dr. ${adm.doctor_name})`,
                      })),
                    ]}
                    placeholder="-- Choose Patient Admission --"
                  />
                )}
              </div>

              {selectedAdmissionId && (
                <div className="p-3 bg-sky-50 border border-sky-100 rounded-lg text-xs space-y-1">
                  {(() => {
                    const chosen = eligibleAdmissions.find((a) => a.id === Number(selectedAdmissionId));
                    if (!chosen) return null;
                    return (
                      <>
                        <div className="flex justify-between font-semibold text-sky-900">
                          <span>{chosen.patient_name}</span>
                          <span>{chosen.admission_number}</span>
                        </div>
                        <p className="text-slate-600">Reason: {chosen.reason}</p>
                        <p className="text-slate-500">Admitted on: {chosen.admission_date_formatted}</p>
                      </>
                    );
                  })()}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinical / Allocation Notes (Optional)
                </label>
                <textarea
                  rows="2"
                  placeholder="e.g. Oxygen support required, pre-op cardiac telemetry."
                  value={assignmentNotes}
                  onChange={(e) => setAssignmentNotes(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
                ></textarea>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignSubmitting || eligibleAdmissions.length === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  {assignSubmitting ? "Allocating Bed..." : "Confirm Bed Assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: RELEASE / DISCHARGE BED (Lesson 10.6) */}
      {/* ========================================================================= */}
      {showReleaseModal && selectedBedForRelease && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-amber-50">
              <h3 className="font-bold text-amber-900 text-sm">Release Bed &amp; Close Assignment</h3>
              <button
                onClick={() => setShowReleaseModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReleaseBed} className="p-6 space-y-4">
              {releaseError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg">
                  {releaseError}
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1">
                <p className="text-slate-500">Bed: <span className="font-mono font-bold text-slate-800">{selectedBedForRelease.bed_number}</span></p>
                <p className="text-slate-500">Current Occupant: <span className="font-bold text-slate-800">{selectedBedForRelease.patient_name || "Patient"}</span></p>
                <p className="text-slate-500">Admission: <span className="font-mono text-slate-700">{selectedBedForRelease.admission_number}</span></p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Release / Discharge Notes
                </label>
                <textarea
                  rows="3"
                  placeholder="e.g. Patient discharged from inpatient care / transferred."
                  value={releaseReason}
                  onChange={(e) => setReleaseReason(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                ></textarea>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowReleaseModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={releaseSubmitting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  {releaseSubmitting ? "Releasing..." : "Confirm Bed Release"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: BED MAINTENANCE (Lesson 10.7) */}
      {/* ========================================================================= */}
      {showMaintModal && selectedBedForMaint && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm">
                {maintAction === "place" ? `Place Bed ${selectedBedForMaint.bed_number} into Maintenance` : `Return Bed ${selectedBedForMaint.bed_number} to Service`}
              </h3>
              <button
                onClick={() => setShowMaintModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMaintenance} className="p-6 space-y-4">
              {maintError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg">
                  {maintError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Maintenance Reason / Notes <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows="3"
                  placeholder={
                    maintAction === "place"
                      ? "e.g. Ventilator calibration, mattress sanitization, electrical repair."
                      : "e.g. Inspection passed, sanitized and ready for patient intake."
                  }
                  value={maintReason}
                  onChange={(e) => setMaintReason(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                ></textarea>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowMaintModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={maintSubmitting}
                  className={`px-4 py-2 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs ${
                    maintAction === "place" ? "bg-slate-700 hover:bg-slate-800" : "bg-sky-600 hover:bg-sky-700"
                  }`}
                >
                  {maintSubmitting ? "Processing..." : maintAction === "place" ? "Put in Maintenance" : "Return to Service"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: BED OCCUPANCY HISTORY TIMELINE (Lesson 10.8) */}
      {/* ========================================================================= */}
      {showHistoryModal && historyBed && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-slate-200 max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Occupancy &amp; Maintenance History: <span className="font-mono text-sky-700">{historyBed.bed_number}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{historyBed.ward_name}</p>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {historyLoading ? (
                <div className="text-center py-10">
                  <div className="inline-block animate-spin w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full mb-2"></div>
                  <p className="text-xs text-slate-500">Loading history logs...</p>
                </div>
              ) : (
                <>
                  {/* Patient Assignments Section */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                      Patient Assignment Timeline ({historyData?.assignments?.length || 0})
                    </h4>
                    {!historyData?.assignments || historyData.assignments.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No historical patient assignments recorded for this bed.</p>
                    ) : (
                      <div className="space-y-3">
                        {historyData.assignments.map((item) => (
                          <div
                            key={item.id}
                            className={`p-3.5 rounded-lg border text-xs ${
                              item.status === "active"
                                ? "bg-amber-50/60 border-amber-200"
                                : "bg-slate-50 border-slate-200"
                            }`}
                          >
                            <div className="flex items-center justify-between font-semibold">
                              <span className="text-slate-900 text-sm">{item.patient_name}</span>
                              <span
                                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                  item.status === "active"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-slate-200 text-slate-700"
                                }`}
                              >
                                {item.status}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2 text-slate-600">
                              <div>
                                <span className="text-slate-400">Admission:</span> <span className="font-mono">{item.admission_number}</span>
                              </div>
                              <div>
                                <span className="text-slate-400">Assigned By:</span> {item.assigned_by_name}
                              </div>
                              <div>
                                <span className="text-slate-400">Assigned At:</span> {item.assigned_at_formatted}
                              </div>
                              <div>
                                <span className="text-slate-400">Released At:</span> {item.released_at_formatted || "Currently Inpatient"}
                              </div>
                            </div>
                            {item.notes && (
                              <p className="mt-2 text-slate-500 italic bg-white/70 p-2 rounded border border-slate-200/50">
                                {item.notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Maintenance Logs Section */}
                  <div className="pt-4 border-t border-slate-200">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                      Maintenance Actions ({historyData?.maintenance_logs?.length || 0})
                    </h4>
                    {!historyData?.maintenance_logs || historyData.maintenance_logs.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No maintenance actions logged.</p>
                    ) : (
                      <div className="space-y-2">
                        {historyData.maintenance_logs.map((log) => (
                          <div key={log.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs">
                            <div className="flex items-center justify-between text-slate-700 font-medium">
                              <span className="capitalize">{log.action?.replace(/_/g, " ")}</span>
                              <span className="text-[10px] text-slate-400">{log.created_at_formatted}</span>
                            </div>
                            <p className="text-slate-600 mt-1">{log.reason}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">By: {log.performed_by_name}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
