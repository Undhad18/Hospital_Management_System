import { useEffect, useState, useMemo, useCallback } from "react";
import {
  getHospitalLabTests,
  getUnassignedMasterLabTests,
  assignHospitalLabTests,
  toggleHospitalLabTestStatus,
  updateHospitalLabTestPrice,
  removeHospitalLabTest,
} from "../services/api";
import CustomDropdown from "../components/CustomDropdown";
import Pagination, { usePagination } from "../components/Pagination";

const CATEGORIES = [
  "Hematology",
  "Biochemistry",
  "Clinical Pathology",
  "Microbiology",
  "Radiology & Imaging",
  "Cardiology Diagnostics",
  "Cardiology Biomarkers",
  "Endocrinology",
  "Immunology",
  "Histopathology",
  "Other Diagnostics",
];

export default function HospitalLabTests({ session }) {
  const token = session?.token;
  const hospitalId = session?.user?.hospitalId;

  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Assignment Modal State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [unassignedList, setUnassignedList] = useState([]);
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [selectedMasterIds, setSelectedMasterIds] = useState([]);
  const [defaultPrice, setDefaultPrice] = useState("250.00");
  const [assignError, setAssignError] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Price Edit Modal State (Lesson 11.3)
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [editingPriceItem, setEditingPriceItem] = useState(null);
  const [newPriceInput, setNewPriceInput] = useState("");
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceError, setPriceError] = useState("");

  // Flash Feedback
  const [flashMessage, setFlashMessage] = useState(null);

  const loadHospitalTests = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const response = await getHospitalLabTests(token, {
        hospital_id: hospitalId,
        status: "all",
        limit: 200,
      });
      setTests(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load hospital laboratory tests.");
    } finally {
      setLoading(false);
    }
  }, [token, hospitalId]);

  useEffect(() => {
    loadHospitalTests();
  }, [loadHospitalTests]);

  // Load unassigned master tests when assignment modal opens
  async function handleOpenAssignModal() {
    setShowAssignModal(true);
    setLoadingUnassigned(true);
    setAssignError("");
    setSelectedMasterIds([]);
    try {
      const list = await getUnassignedMasterLabTests(token, {
        hospital_id: hospitalId,
      });
      setUnassignedList(list);
    } catch (err) {
      setAssignError(err.message || "Failed to load available catalog tests.");
    } finally {
      setLoadingUnassigned(false);
    }
  }

  const filteredUnassigned = useMemo(() => {
    return unassignedList.filter((item) => {
      const q = assignSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        item.test_name.toLowerCase().includes(q) ||
        (item.test_code && item.test_code.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q))
      );
    });
  }, [unassignedList, assignSearch]);

  const toggleSelectMaster = (id) => {
    setSelectedMasterIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAllUnassigned = () => {
    if (selectedMasterIds.length === filteredUnassigned.length) {
      setSelectedMasterIds([]);
    } else {
      setSelectedMasterIds(filteredUnassigned.map((t) => t.id));
    }
  };

  async function handleConfirmAssignment(e) {
    e.preventDefault();
    if (selectedMasterIds.length === 0) {
      setAssignError("Please select at least one test to assign to this hospital.");
      return;
    }

    const numericPrice = parseFloat(defaultPrice);
    if (isNaN(numericPrice) || numericPrice < 0) {
      setAssignError("Please specify a valid non-negative price.");
      return;
    }

    setAssigning(true);
    setAssignError("");

    try {
      const res = await assignHospitalLabTests(token, {
        hospital_id: hospitalId,
        master_test_ids: selectedMasterIds,
        price: numericPrice,
        status: "active",
      });

      setFlashMessage(res.message || "Laboratory test(s) successfully assigned.");
      setShowAssignModal(false);
      await loadHospitalTests();
    } catch (err) {
      setAssignError(err.message || "Failed to assign tests.");
    } finally {
      setAssigning(false);
    }
  }

  function handleOpenPriceModal(item) {
    setEditingPriceItem(item);
    setNewPriceInput(parseFloat(item.price || 0).toFixed(2));
    setPriceError("");
    setShowPriceModal(true);
  }

  async function handleSavePrice(e) {
    e.preventDefault();
    const numericPrice = parseFloat(newPriceInput);
    if (isNaN(numericPrice) || numericPrice < 0) {
      setPriceError("Please enter a valid non-negative price.");
      return;
    }

    setPriceSaving(true);
    setPriceError("");
    try {
      await updateHospitalLabTestPrice(token, editingPriceItem.id, numericPrice);
      setFlashMessage(
        `Rate for '${editingPriceItem.test_name}' updated to ₹${numericPrice.toFixed(2)}.`
      );
      setTests((prev) =>
        prev.map((t) =>
          t.id === editingPriceItem.id ? { ...t, price: numericPrice } : t
        )
      );
      setShowPriceModal(false);
    } catch (err) {
      setPriceError(err.message || "Failed to update price.");
    } finally {
      setPriceSaving(false);
    }
  }

  async function handleToggleStatus(testItem) {
    const newStatus = testItem.status === "active" ? "inactive" : "active";
    try {
      await toggleHospitalLabTestStatus(token, testItem.id, newStatus);
      setFlashMessage(
        `Test offering '${testItem.test_name}' is now ${newStatus.toUpperCase()} for this hospital.`
      );
      setTests((prev) =>
        prev.map((t) => (t.id === testItem.id ? { ...t, status: newStatus } : t))
      );
    } catch (err) {
      alert(err.message || "Failed to update test offering status");
    }
  }

  async function handleRemove(testItem) {
    if (
      !window.confirm(
        `Are you sure you want to remove '${testItem.test_name}' (${testItem.test_code}) from this hospital?\n\nIf clinical orders have been placed for this test, the system will prevent removal and ask you to deactivate it instead.`
      )
    ) {
      return;
    }

    try {
      await removeHospitalLabTest(token, testItem.id);
      setFlashMessage(`Test '${testItem.test_name}' removed from hospital offerings.`);
      setTests((prev) => prev.filter((t) => t.id !== testItem.id));
    } catch (err) {
      alert(err.message || "Cannot remove test offering with historical clinical orders.");
    }
  }

  const filteredTests = useMemo(() => {
    return tests.filter((t) => {
      const matchesSearch =
        search.trim() === "" ||
        t.test_name.toLowerCase().includes(search.toLowerCase()) ||
        (t.test_code && t.test_code.toLowerCase().includes(search.toLowerCase())) ||
        (t.category && t.category.toLowerCase().includes(search.toLowerCase())) ||
        (t.sample_type && t.sample_type.toLowerCase().includes(search.toLowerCase()));

      const matchesCategory =
        categoryFilter === "all" || t.category === categoryFilter;

      const matchesStatus =
        statusFilter === "all" || t.status === statusFilter;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [tests, search, categoryFilter, statusFilter]);

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalRecords,
    paginatedItems: paginatedTests,
    resetPage,
  } = usePagination(filteredTests, 25);

  useEffect(() => {
    resetPage();
  }, [search, categoryFilter, statusFilter, resetPage]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <svg
              className="w-6 h-6 text-sky-600 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
              />
            </svg>
            <span>Hospital Laboratory Test Offerings</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage diagnostic investigations and laboratory tests currently available at this hospital facility.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAssignModal}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-md shadow-xs transition cursor-pointer self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>Assign Tests from Master Catalog</span>
        </button>
      </div>

      {/* Flash Toast */}
      {flashMessage && (
        <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">{flashMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setFlashMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {error}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Offered Tests</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{tests.length}</p>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Active for Ordering</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">
            {tests.filter((t) => t.status === "active").length}
          </p>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Temporarily Inactive</p>
          <p className="text-xl font-bold text-slate-400 mt-1">
            {tests.filter((t) => t.status === "inactive").length}
          </p>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Categories Available</p>
          <p className="text-xl font-bold text-sky-600 mt-1">
            {new Set(tests.map((t) => t.category)).size}
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between relative z-20">
        <div className="w-full md:w-80 relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search offered tests, codes, sample..."
            className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-hidden focus:bg-white focus:border-sky-500"
          />
          <svg
            className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Category Filter */}
          <div className="w-48">
            <CustomDropdown
              value={categoryFilter}
              onChange={(val) => setCategoryFilter(val)}
              options={[
                { value: "all", label: "All Categories" },
                ...CATEGORIES.map((cat) => ({ value: cat, label: cat })),
              ]}
              placeholder="All Categories"
            />
          </div>

          {/* Status Filter */}
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

          {(search || categoryFilter !== "all" || statusFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setCategoryFilter("all");
                setStatusFilter("all");
              }}
              className="text-xs text-slate-500 hover:text-slate-800 underline px-2 py-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Assigned Tests Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <svg
              className="animate-spin h-6 w-6 text-sky-600 mx-auto mb-2"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              ></path>
            </svg>
            Loading hospital test offerings...
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-xs">
            {tests.length === 0
              ? "No laboratory tests have been assigned to this hospital yet. Click 'Assign Tests from Master Catalog' above to offer tests to your doctors and patients."
              : "No tests found matching the current search criteria."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                  <th className="py-3 px-4">Test Code</th>
                  <th className="py-3 px-4">Test Name &amp; Clinical Details</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Sample Type</th>
                  <th className="py-3 px-4">Standard Rate (₹)</th>
                  <th className="py-3 px-4">Turnaround</th>
                  <th className="py-3 px-4">Offering Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTests.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {item.test_code || "—"}
                    </td>

                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-semibold text-slate-900">{item.test_name}</div>
                      {item.description && (
                        <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                          {item.description}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {item.category}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      {item.sample_type ? (
                        <span className="text-slate-700">{item.sample_type}</span>
                      ) : (
                        <span className="text-slate-400 italic">None / Diagnostic</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-slate-900">
                          ₹{parseFloat(item.price || 0).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenPriceModal(item)}
                          className="p-1 text-slate-400 hover:text-sky-600 rounded hover:bg-slate-100 transition cursor-pointer"
                          title="Edit Rate"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-600">
                      {item.standard_turnaround_hours}h
                    </td>

                    <td className="py-3 px-4">
                      {item.status === "active" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                          Inactive
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5 flex-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(item)}
                          className={`h-7 px-2.5 text-[11px] font-semibold rounded-md border transition cursor-pointer whitespace-nowrap shadow-2xs ${
                            item.status === "active"
                              ? "text-amber-700 bg-amber-50/60 hover:bg-amber-100 border-amber-200"
                              : "text-emerald-700 bg-emerald-50/60 hover:bg-emerald-100 border-emerald-200"
                          }`}
                        >
                          {item.status === "active" ? "Deactivate" : "Activate"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemove(item)}
                          className="h-7 px-2.5 text-[11px] font-semibold text-rose-700 bg-rose-50/60 hover:bg-rose-100 rounded-md border border-rose-200 transition cursor-pointer whitespace-nowrap shadow-2xs"
                          title="Remove assignment if no orders exist"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
          </div>
        )}
      </div>

      {/* Assignment Modal from Master Catalog */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-2xl w-full overflow-hidden animate-scale-up flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Assign Tests from Master Catalog
                </h2>
                <p className="text-[11px] text-slate-500">
                  Select available laboratory tests to offer at this hospital.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmAssignment} className="p-5 flex flex-col flex-1 overflow-hidden space-y-4 text-xs">
              {assignError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded shrink-0">
                  {assignError}
                </div>
              )}

              {/* Price Setup */}
              <div className="p-3 bg-sky-50/60 border border-sky-100 rounded-md shrink-0 flex items-center justify-between gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-800">
                    Initial Hospital Rate (₹)
                  </label>
                  <p className="text-[10px] text-slate-500">
                    Will apply to newly assigned tests (customizable anytime in Lesson 11.3).
                  </p>
                </div>
                <div className="w-36">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={defaultPrice}
                    onChange={(e) => setDefaultPrice(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded focus:border-sky-500 font-mono text-xs bg-white"
                  />
                </div>
              </div>

              {/* Search & Select All in Modal */}
              <div className="flex items-center justify-between gap-3 shrink-0">
                <input
                  type="text"
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  placeholder="Filter available master tests..."
                  className="w-full text-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={selectAllUnassigned}
                  className="shrink-0 px-2.5 py-1.5 text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100 font-medium"
                >
                  {selectedMasterIds.length === filteredUnassigned.length && filteredUnassigned.length > 0
                    ? "Deselect All"
                    : "Select All Filtered"}
                </button>
              </div>

              {/* Scrollable Test Picker List */}
              <div className="flex-1 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
                {loadingUnassigned ? (
                  <div className="p-6 text-center text-slate-400">Loading catalog tests...</div>
                ) : filteredUnassigned.length === 0 ? (
                  <div className="p-6 text-center text-slate-400">
                    No unassigned tests available matching your filter.
                  </div>
                ) : (
                  filteredUnassigned.map((test) => {
                    const isSelected = selectedMasterIds.includes(test.id);
                    return (
                      <div
                        key={test.id}
                        onClick={() => toggleSelectMaster(test.id)}
                        className={`p-3 flex items-start gap-3 cursor-pointer transition select-none ${
                          isSelected ? "bg-sky-50/80" : "hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // Controlled by row click
                          className="mt-0.5 rounded text-sky-600 focus:ring-sky-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{test.test_name}</span>
                            <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                              {test.test_code}
                            </span>
                            <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                              {test.category}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-3">
                            <span>Sample: {test.sample_type || "None"}</span>
                            <span>•</span>
                            <span>Turnaround: {test.standard_turnaround_hours}h</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between shrink-0">
                <span className="text-[11px] text-slate-500">
                  {selectedMasterIds.length} test(s) selected
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAssignModal(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 rounded border border-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={assigning || selectedMasterIds.length === 0}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {assigning ? "Assigning..." : `Assign ${selectedMasterIds.length} Test(s)`}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Hospital Rate Modal (Lesson 11.3) */}
      {showPriceModal && editingPriceItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full overflow-hidden animate-scale-up">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Update Hospital Rate</h2>
                <p className="text-[11px] text-slate-500">
                  {editingPriceItem.test_name} ({editingPriceItem.test_code})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPriceModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePrice} className="p-5 space-y-4 text-xs">
              {priceError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded text-xs">
                  {priceError}
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Hospital Rate (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newPriceInput}
                    onChange={(e) => setNewPriceInput(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded focus:outline-hidden focus:border-sky-500 font-mono text-sm bg-white"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Updating this rate will apply to future clinical orders. Past orders retain their locked historical price snapshot.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowPriceModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 rounded border border-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={priceSaving}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {priceSaving ? "Saving..." : "Save Rate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
