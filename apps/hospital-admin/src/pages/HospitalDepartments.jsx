import { useEffect, useState, useMemo, useRef } from "react";
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  getDesignations,
  createDesignation,
  updateDesignation,
  getMasterDepartments,
  assignMasterDepartment,
} from "../services/api";
import { subscribeToEvent } from "../services/socket";
import Pagination, { usePagination } from "../components/Pagination";

function SpecialtyDropdown({
  value,
  departments = [],
  onChange,
  placeholder = "-- Select a Clinical Specialty --",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  const selectedDept = useMemo(() => {
    if (!value) return null;
    return departments.find((d) => String(d.id) === String(value)) || null;
  }, [departments, value]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return departments;
    const q = searchTerm.toLowerCase().trim();
    return departments.filter(
      (d) =>
        d.name?.toLowerCase().includes(q) ||
        d.code?.toLowerCase().includes(q)
    );
  }, [departments, searchTerm]);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          setSearchTerm("");
        }}
        className="w-full flex items-center justify-between px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer shadow-2xs text-left"
      >
        <span className="truncate font-medium">
          {selectedDept ? (
            <span>
              {selectedDept.name} <span className="font-mono text-slate-500">[{selectedDept.code}]</span>
            </span>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 ml-1.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""
            }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[280px] bg-white border border-slate-200 rounded-md shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-slate-100 bg-slate-50/50">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search clinical specialty..."
              className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500"
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>

          <div className="max-h-36 overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="p-2.5 text-center text-xs text-slate-400">
                No matching specialties found
              </div>
            ) : (
              filtered.map((m) => {
                const isDisabled = m.is_assigned || m.status !== "active";
                const isSelected = selectedDept && String(selectedDept.id) === String(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      if (isDisabled) return;
                      onChange(m.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition ${isDisabled
                      ? "opacity-50 bg-slate-50 cursor-not-allowed text-slate-400"
                      : isSelected
                        ? "bg-sky-50 font-semibold text-sky-800 cursor-pointer"
                        : "hover:bg-sky-50/70 text-slate-700 cursor-pointer"
                      }`}
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-medium text-slate-900">{m.name}</span>
                      <span className="ml-1.5 text-[10px] font-mono text-slate-500">[{m.code}]</span>
                    </div>
                    {m.is_assigned ? (
                      <span className="text-[10px] text-amber-600 font-mono shrink-0">Already Assigned</span>
                    ) : m.status !== "active" ? (
                      <span className="text-[10px] text-rose-500 font-mono shrink-0">Inactive</span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HospitalDepartments({ token, hospitalId, hospitalName }) {
  const [activeTab, setActiveTab] = useState("departments"); // 'departments' | 'designations'

  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [masterDepartments, setMasterDepartments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Custom Department Modal
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: "", description: "" });
  const [selectedDept, setSelectedDept] = useState(null);

  // Assign Master Department Modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedMasterId, setSelectedMasterId] = useState("");
  const [customMasterDesc, setCustomMasterDesc] = useState("");
  const [loadingMaster, setLoadingMaster] = useState(false);

  // Designation Modal
  const [showDesigModal, setShowDesigModal] = useState(false);
  const [desigForm, setDesigForm] = useState({ name: "", description: "" });
  const [selectedDesig, setSelectedDesig] = useState(null);

  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  useEffect(() => {
    loadHospitalData();
  }, [token]);

  // Real-time synchronization for departments
  useEffect(() => {
    if (!token) return;

    const unsub = subscribeToEvent("departments:updated", () => {
      loadHospitalData();
    }, token);

    return () => {
      unsub();
    };
  }, [token]);

  async function loadHospitalData() {
    setLoading(true);
    setError("");
    try {
      const [deptData, desigData] = await Promise.all([
        getDepartments(token),
        getDesignations(token),
      ]);
      setDepartments(deptData);
      setDesignations(desigData);
    } catch (err) {
      setError(err.message || "Failed to load facility departments.");
    } finally {
      setLoading(false);
    }
  }

  async function openAssignMasterModal() {
    setActionError("");
    setActionSuccess("");
    setShowAssignModal(true);
    setLoadingMaster(true);
    setSelectedMasterId("");
    setCustomMasterDesc("");

    try {
      const masterData = await getMasterDepartments(token, { hospital_id: hospitalId });
      setMasterDepartments(masterData);
      // Auto-select first unassigned master department if any
      const firstUnassigned = masterData.find((m) => !m.is_assigned && m.status === "active");
      if (firstUnassigned) {
        setSelectedMasterId(String(firstUnassigned.id));
        setCustomMasterDesc(firstUnassigned.description || "");
      }
    } catch (err) {
      setActionError(err.message || "Failed to load master departments catalog.");
    } finally {
      setLoadingMaster(false);
    }
  }

  function handleMasterSelectChange(e) {
    const id = e.target.value;
    setSelectedMasterId(id);
    const chosen = masterDepartments.find((m) => String(m.id) === String(id));
    if (chosen) {
      setCustomMasterDesc(chosen.description || "");
    }
  }

  async function handleAssignMasterSubmit(e) {
    e.preventDefault();
    if (!selectedMasterId) {
      setActionError("Please select a master department to assign.");
      return;
    }

    setSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      const res = await assignMasterDepartment(token, {
        master_department_id: Number(selectedMasterId),
        custom_description: customMasterDesc.trim() || undefined,
      });
      setActionSuccess(res.message || "Master department successfully assigned!");
      setShowAssignModal(false);
      await loadHospitalData();
    } catch (err) {
      setActionError(err.message || "Failed to assign master department.");
    } finally {
      setSaving(false);
    }
  }

  const filteredDepartments = useMemo(() => {
    return departments.filter(
      (d) =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        (d.description && d.description.toLowerCase().includes(search.toLowerCase())) ||
        (d.master_department_code && d.master_department_code.toLowerCase().includes(search.toLowerCase()))
    );
  }, [departments, search]);

  const filteredDesignations = useMemo(() => {
    return designations.filter(
      (d) =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        (d.description && d.description.toLowerCase().includes(search.toLowerCase()))
    );
  }, [designations, search]);

  const {
    currentPage: deptPage,
    setCurrentPage: setDeptPage,
    pageSize: deptPageSize,
    setPageSize: setDeptPageSize,
    totalPages: deptTotalPages,
    totalRecords: deptTotalRecords,
    paginatedItems: paginatedDepartments,
    resetPage: resetDeptPage,
  } = usePagination(filteredDepartments, 25);

  const {
    currentPage: desigPage,
    setCurrentPage: setDesigPage,
    pageSize: desigPageSize,
    setPageSize: setDesigPageSize,
    totalPages: desigTotalPages,
    totalRecords: desigTotalRecords,
    paginatedItems: paginatedDesignations,
    resetPage: resetDesigPage,
  } = usePagination(filteredDesignations, 25);

  useEffect(() => {
    resetDeptPage();
    resetDesigPage();
  }, [search, activeTab, resetDeptPage, resetDesigPage]);

  async function handleDeptSubmit(e) {
    e.preventDefault();
    if (!deptForm.name.trim()) return;
    setSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      if (selectedDept) {
        await updateDepartment(token, selectedDept.id, {
          name: deptForm.name.trim(),
          description: deptForm.description ? deptForm.description.trim() : null,
        });
        setActionSuccess("Department specification updated!");
      } else {
        await createDepartment(token, {
          name: deptForm.name.trim(),
          description: deptForm.description ? deptForm.description.trim() : null,
        });
        setActionSuccess("Hospital custom department initialized!");
      }
      setShowDeptModal(false);
      setSelectedDept(null);
      await loadHospitalData();
    } catch (err) {
      setActionError(err.message || "Failed to save department.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDesigSubmit(e) {
    e.preventDefault();
    if (!desigForm.name.trim()) return;
    setSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      if (selectedDesig) {
        await updateDesignation(token, selectedDesig.id, {
          name: desigForm.name.trim(),
          description: desigForm.description ? desigForm.description.trim() : null,
        });
        setActionSuccess("Designation updated successfully!");
      } else {
        await createDesignation(token, {
          name: desigForm.name.trim(),
          description: desigForm.description ? desigForm.description.trim() : null,
        });
        setActionSuccess("Hospital designation created!");
      }
      setShowDesigModal(false);
      setSelectedDesig(null);
      await loadHospitalData();
    } catch (err) {
      setActionError(err.message || "Failed to save designation.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDeptStatus(dept) {
    const newStatus = dept.status === "active" ? "inactive" : "active";
    try {
      await updateDepartment(token, dept.id, { status: newStatus });
      await loadHospitalData();
    } catch (err) {
      setActionError(err.message || "Failed to update department status.");
    }
  }

  async function toggleDesigStatus(desig) {
    if (desig.hospital_id === null) {
      setActionError("Global system designations cannot be modified by facility admins.");
      return;
    }
    const newStatus = desig.status === "active" ? "inactive" : "active";
    try {
      await updateDesignation(token, desig.id, { status: newStatus });
      await loadHospitalData();
    } catch (err) {
      setActionError(err.message || "Failed to update designation status.");
    }
  }

  return (
    <div className="w-full space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Assigned Departments
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? "..." : departments.length}
            </p>
            <span className="text-xs text-slate-500 mt-1 inline-block">
              Clinical units &amp; medical wards
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200">
            <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Master Catalog Linked
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? "..." : departments.filter((d) => d.master_department_id).length}
            </p>
            <span className="text-xs text-slate-500 mt-1 inline-block">
              Standardized specialties
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Clinical Designations
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? "..." : designations.length}
            </p>
            <span className="text-xs text-slate-500 mt-1 inline-block">
              Global &amp; facility titles
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs w-full">
        {/* Card Header: Title & Action Buttons */}
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-t-lg">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
              Hospital Departments &amp; Clinical Roles
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Assign standard master specialties, manage custom wards, and configure job designations
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeTab === "departments" ? (
              <>
                <button
                  type="button"
                  onClick={openAssignMasterModal}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Assign Master Dept</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedDept(null);
                    setDeptForm({ name: "", description: "" });
                    setShowDeptModal(true);
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-md shadow-xs transition cursor-pointer"
                >
                  + Custom Dept
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSelectedDesig(null);
                  setDesigForm({ name: "", description: "" });
                  setShowDesigModal(true);
                }}
                className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-md shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v16m8-8H4" />
                </svg>
                <span>Add Designation</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Selector */}
        <div className="px-5 border-b border-slate-200 flex space-x-6 text-xs font-medium bg-white">
          <button
            onClick={() => setActiveTab("departments")}
            className={`py-3 border-b-2 transition cursor-pointer ${activeTab === "departments"
              ? "border-sky-600 text-sky-700 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
          >
            Hospital Departments ({departments.length})
          </button>
          <button
            onClick={() => setActiveTab("designations")}
            className={`py-3 border-b-2 transition cursor-pointer ${activeTab === "designations"
              ? "border-sky-600 text-sky-700 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
          >
            Job Designations ({designations.length})
          </button>
        </div>

        {/* Dedicated Filter & Search Sub-toolbar */}
        <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={activeTab === "departments" ? "Search departments..." : "Search designations..."}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 transition"
              />
              <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-xs text-sky-600 hover:text-sky-800 font-medium px-1.5 py-1 cursor-pointer"
              >
                Reset Search
              </button>
            )}
          </div>

          <div className="text-xs text-slate-500 font-medium">
            {activeTab === "departments"
              ? `${filteredDepartments.length} of ${departments.length} departments`
              : `${filteredDesignations.length} of ${designations.length} designations`}
          </div>
        </div>

        {/* Notifications */}
        {actionError && (
          <div className="m-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-md flex justify-between items-center">
            <span>{actionError}</span>
            <button onClick={() => setActionError("")} className="text-rose-500 font-bold">&times;</button>
          </div>
        )}
        {actionSuccess && (
          <div className="m-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-md flex justify-between items-center">
            <span>{actionSuccess}</span>
            <button onClick={() => setActionSuccess("")} className="text-emerald-500 font-bold">&times;</button>
          </div>
        )}

        {/* --- 1. DEPARTMENTS TABLE --- */}
        {activeTab === "departments" && (
          <div className="w-full overflow-x-auto rounded-b-lg">
            <table className="w-full text-left text-xs text-slate-700 border-collapse rounded-b-lg">
              <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left">Department Name</th>
                  <th className="px-4 py-3 text-left">Classification</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-left">Assigned Staff</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white rounded-b-lg">
                {filteredDepartments.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-5 py-8 text-center text-slate-400 rounded-b-lg">
                      No departments assigned yet. Click <strong>"Assign Master Dept"</strong> to pick clinical specialties.
                    </td>
                  </tr>
                ) : (
                  paginatedDepartments.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/80 transition [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg">
                      <td className="px-5 py-3 font-semibold text-slate-900">{d.name}</td>
                      <td className="px-4 py-3">
                        {d.master_department_id ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-mono font-semibold">
                            Master: {d.master_department_code || "STD"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-mono">
                            Custom Facility
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-sm truncate">
                        {d.description || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] border border-slate-200 font-mono">
                          {d.member_count || 0} members
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleDeptStatus(d)}
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${d.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                            : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
                            }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full mr-1 ${d.status === "active" ? "bg-emerald-500" : "bg-slate-400"}`}></span>
                          {d.status === "active" ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDept(d);
                            setDeptForm({
                              name: d.name,
                              description: d.description || "",
                            });
                            setShowDeptModal(true);
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 text-xs font-medium rounded border border-slate-300 text-slate-700 transition shadow-xs"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <Pagination
              currentPage={deptPage}
              totalPages={deptTotalPages}
              totalRecords={deptTotalRecords}
              pageSize={deptPageSize}
              onPageChange={setDeptPage}
              onPageSizeChange={setDeptPageSize}
            />
          </div>
        )}

        {/* --- 2. DESIGNATIONS TABLE --- */}
        {activeTab === "designations" && (
          <div className="w-full overflow-x-auto rounded-b-lg">
            <table className="w-full text-left text-xs text-slate-700 border-collapse rounded-b-lg">
              <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left">Designation Title</th>
                  <th className="px-4 py-3 text-left">Scope</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white rounded-b-lg">
                {paginatedDesignations.map((desig) => (
                  <tr key={desig.id} className="hover:bg-slate-50/80 transition [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg">
                    <td className="px-5 py-3 font-semibold text-slate-900">{desig.name}</td>
                    <td className="px-4 py-3">
                      {desig.hospital_id === null ? (
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-[11px] font-medium">
                          Global Standard
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 text-[11px] border border-sky-200 font-medium">
                          Facility Role
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-sm truncate">
                      {desig.description || "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleDesigStatus(desig)}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium transition ${desig.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                      >
                        {desig.status}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {desig.hospital_id !== null ? (
                        <button
                          onClick={() => {
                            setSelectedDesig(desig);
                            setDesigForm({
                              name: desig.name,
                              description: desig.description || "",
                            });
                            setShowDesigModal(true);
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 text-xs font-medium rounded border border-slate-300 text-slate-700 transition shadow-xs"
                        >
                          Edit
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Global Standard</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <Pagination
              currentPage={desigPage}
              totalPages={desigTotalPages}
              totalRecords={desigTotalRecords}
              pageSize={desigPageSize}
              onPageChange={setDesigPage}
              onPageSizeChange={setDesigPageSize}
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* --- LESSON 4.1: ASSIGN MASTER DEPARTMENT MODAL --- */}
      {/* ========================================================================= */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-lg shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Assign Master Department to Facility
                </h3>
                <p className="text-xs text-slate-500">
                  Select a standardized clinical specialty from the global healthcare catalog
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {loadingMaster ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Loading master catalog...
              </div>
            ) : (
              <form onSubmit={handleAssignMasterSubmit} className="space-y-4">
                <div className="relative" style={{ zIndex: 30 }}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Select Master Department *
                  </label>
                  <SpecialtyDropdown
                    value={selectedMasterId}
                    departments={masterDepartments}
                    onChange={(mId) => {
                      setSelectedMasterId(mId);
                      const chosen = masterDepartments.find((m) => String(m.id) === String(mId));
                      if (chosen && chosen.description) {
                        setCustomMasterDesc(chosen.description);
                      }
                    }}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Departments already assigned to this hospital are disabled to prevent duplicate entries.
                  </p>
                </div>

                {selectedMasterId && (
                  <div className="p-3 bg-slate-50 rounded-md border border-slate-200 text-xs">
                    <span className="font-semibold text-slate-800">Master Catalog Overview:</span>
                    <p className="text-slate-600 mt-1">
                      {masterDepartments.find((m) => String(m.id) === String(selectedMasterId))?.description || "No description provided."}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Customized Ward/Facility Description (Optional)
                  </label>
                  <textarea
                    rows="3"
                    value={customMasterDesc}
                    onChange={(e) => setCustomMasterDesc(e.target.value)}
                    placeholder="Provide specific notes for this hospital's department branch..."
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  ></textarea>
                </div>

                <div className="flex justify-end space-x-2.5 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowAssignModal(false)}
                    className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md border border-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !selectedMasterId}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-md shadow-xs transition"
                  >
                    {saving ? "Assigning..." : "Assign to Hospital"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* --- CUSTOM DEPARTMENT MODAL --- */}
      {showDeptModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md shadow-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              {selectedDept ? "Edit Department" : "Create Custom Hospital Department"}
            </h3>
            <form onSubmit={handleDeptSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Department Name *</label>
                <input
                  type="text"
                  required
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  placeholder="e.g. VIP Wellness Suite, Occupational Health"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  rows="3"
                  value={deptForm.description}
                  onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                  placeholder="Clinical functions and ward scope"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                ></textarea>
              </div>
              <div className="flex justify-end space-x-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md border border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium rounded-md shadow-xs"
                >
                  {saving ? "Saving..." : "Save Department"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- DESIGNATION MODAL --- */}
      {showDesigModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md shadow-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              {selectedDesig ? "Edit Designation" : "Create Clinical Designation"}
            </h3>
            <form onSubmit={handleDesigSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Designation Title *</label>
                <input
                  type="text"
                  required
                  value={desigForm.name}
                  onChange={(e) => setDesigForm({ ...desigForm, name: e.target.value })}
                  placeholder="e.g. Senior Medical Officer, Floor Incharge"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Role Description</label>
                <textarea
                  rows="3"
                  value={desigForm.description}
                  onChange={(e) => setDesigForm({ ...desigForm, description: e.target.value })}
                  placeholder="Role duties and responsibilities"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                ></textarea>
              </div>
              <div className="flex justify-end space-x-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowDesigModal(false)}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md border border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium rounded-md shadow-xs"
                >
                  {saving ? "Saving..." : "Save Designation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
