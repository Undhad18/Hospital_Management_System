import { useEffect, useState, useMemo } from "react";
import {
  getMasterLabTests,
  createMasterLabTest,
  updateMasterLabTest,
  toggleMasterLabTestStatus,
  deleteMasterLabTest,
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

export default function MasterLabCatalog({ token }) {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState(null);
  const [formData, setFormData] = useState({
    test_code: "",
    test_name: "",
    category: "Hematology",
    sample_type: "",
    standard_turnaround_hours: 24,
    description: "",
    instructions: "",
    status: "active",
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [flashMessage, setFlashMessage] = useState(null);

  useEffect(() => {
    loadTests();
  }, [token]);

  async function loadTests() {
    setLoading(true);
    setError("");
    try {
      const response = await getMasterLabTests(token, {
        status: "all",
        limit: 200,
      });
      setTests(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load master laboratory tests.");
    } finally {
      setLoading(false);
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

  function handleOpenCreate() {
    setIsEditing(false);
    setSelectedTestId(null);
    setFormData({
      test_code: "",
      test_name: "",
      category: "Hematology",
      sample_type: "",
      standard_turnaround_hours: 24,
      description: "",
      instructions: "",
      status: "active",
    });
    setFormError("");
    setShowModal(true);
  }

  function handleOpenEdit(test) {
    setIsEditing(true);
    setSelectedTestId(test.id);
    setFormData({
      test_code: test.test_code || "",
      test_name: test.test_name || "",
      category: test.category || "Hematology",
      sample_type: test.sample_type || "",
      standard_turnaround_hours: test.standard_turnaround_hours || 24,
      description: test.description || "",
      instructions: test.instructions || "",
      status: test.status || "active",
    });
    setFormError("");
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    setSaving(true);

    try {
      if (isEditing) {
        await updateMasterLabTest(token, selectedTestId, formData);
        setFlashMessage("Master laboratory test updated successfully.");
      } else {
        await createMasterLabTest(token, formData);
        setFlashMessage("New master laboratory test created successfully.");
      }
      setShowModal(false);
      await loadTests();
    } catch (err) {
      setFormError(err.message || "An error occurred while saving.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(test) {
    const newStatus = test.status === "active" ? "inactive" : "active";
    try {
      await toggleMasterLabTestStatus(token, test.id, newStatus);
      setFlashMessage(
        `Test '${test.test_name}' is now ${newStatus.toUpperCase()}.`
      );
      setTests((prev) =>
        prev.map((t) => (t.id === test.id ? { ...t, status: newStatus } : t))
      );
    } catch (err) {
      alert(err.message || "Failed to update status");
    }
  }

  async function handleDelete(test) {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete '${test.test_name}' (${test.test_code})?\n\nIf this test has ever been assigned or ordered, the system will prevent deletion to preserve clinical records.`
      )
    ) {
      return;
    }

    try {
      await deleteMasterLabTest(token, test.id);
      setFlashMessage(`Test '${test.test_name}' deleted successfully.`);
      setTests((prev) => prev.filter((t) => t.id !== test.id));
    } catch (err) {
      alert(err.message || "Deletion prevented to preserve clinical history.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
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
            <span>Master Laboratory Test Catalog</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Centralized dictionary of clinical pathology, biochemistry, imaging, and diagnostic investigations available across hospitals.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-md shadow-xs transition cursor-pointer self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>Add Master Test</span>
        </button>
      </div>

      {/* Flash Message */}
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

      {/* Global Error */}
      {error && (
        <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {error}
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Tests</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{tests.length}</p>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Active Offerings</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">
            {tests.filter((t) => t.status === "active").length}
          </p>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Inactive / Retired</p>
          <p className="text-xl font-bold text-slate-400 mt-1">
            {tests.filter((t) => t.status === "inactive").length}
          </p>
        </div>
        <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Categories</p>
          <p className="text-xl font-bold text-sky-600 mt-1">
            {new Set(tests.map((t) => t.category)).size}
          </p>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="w-full md:w-80 relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by test name, code, sample..."
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
          <div className="w-44 min-w-[150px]">
            <CustomDropdown
              value={categoryFilter}
              options={[{ value: "all", label: "All Categories" }, ...CATEGORIES]}
              onChange={(val) => setCategoryFilter(val)}
              placeholder="All Categories"
              buttonClassName="py-1.5"
            />
          </div>

          {/* Status Filter */}
          <div className="w-36 min-w-[130px]">
            <CustomDropdown
              value={statusFilter}
              options={[
                { value: "all", label: "All Statuses" },
                { value: "active", label: "Active Only" },
                { value: "inactive", label: "Inactive Only" },
              ]}
              onChange={(val) => setStatusFilter(val)}
              placeholder="All Statuses"
              buttonClassName="py-1.5"
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

      {/* Tests Table */}
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
            Loading laboratory test catalog...
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-xs">
            No master laboratory tests found matching current criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                  <th className="py-3 px-4">Test Code</th>
                  <th className="py-3 px-4">Test Name &amp; Description</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Sample / Specimen</th>
                  <th className="py-3 px-4">Turnaround</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTests.map((test) => (
                  <tr key={test.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {test.test_code || "—"}
                    </td>

                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-semibold text-slate-900">{test.test_name}</div>
                      {test.description && (
                        <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                          {test.description}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {test.category}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      {test.sample_type ? (
                        <span className="text-slate-700">{test.sample_type}</span>
                      ) : (
                        <span className="text-slate-400 italic">None / Diagnostic</span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono">
                      {test.standard_turnaround_hours} hrs
                    </td>

                    <td className="py-3 px-4">
                      {test.status === "active" ? (
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
                      <div className="inline-flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(test)}
                          className="px-2 py-1 text-[11px] font-medium text-slate-700 hover:text-sky-700 hover:bg-sky-50 rounded border border-slate-200 transition cursor-pointer"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleStatus(test)}
                          className={`px-2 py-1 text-[11px] font-medium rounded border transition cursor-pointer ${test.status === "active"
                            ? "text-amber-700 hover:bg-amber-50 border-amber-200"
                            : "text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                            }`}
                        >
                          {test.status === "active" ? "Deactivate" : "Activate"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(test)}
                          className="px-2 py-1 text-[11px] font-medium text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded border border-rose-200 transition cursor-pointer"
                          title="Delete unreferenced test"
                        >
                          Delete
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

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-scale-up">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-bold text-slate-900">
                {isEditing ? "Edit Master Laboratory Test" : "Add Master Laboratory Test"}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Test Code */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Test Code <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.test_code}
                    onChange={(e) =>
                      setFormData({ ...formData, test_code: e.target.value.toUpperCase() })
                    }
                    placeholder="e.g. CBC-001"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded focus:border-sky-500 font-mono text-xs uppercase"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Unique system code</p>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Category <span className="text-rose-600">*</span>
                  </label>
                  <CustomDropdown
                    value={formData.category}
                    options={CATEGORIES}
                    onChange={(val) =>
                      setFormData({ ...formData, category: val })
                    }
                    placeholder="Select Category"
                  />
                </div>
              </div>

              {/* Test Name */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Test Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.test_name}
                  onChange={(e) =>
                    setFormData({ ...formData, test_name: e.target.value })
                  }
                  placeholder="e.g. Complete Blood Count (CBC) with Differential"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded focus:border-sky-500 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Sample Type */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Sample / Specimen Type
                  </label>
                  <input
                    type="text"
                    value={formData.sample_type}
                    onChange={(e) =>
                      setFormData({ ...formData, sample_type: e.target.value })
                    }
                    placeholder="e.g. Whole Blood (EDTA), Serum, Urine"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded focus:border-sky-500 text-xs"
                  />
                </div>

                {/* Turnaround Time */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Standard Turnaround (Hours)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="720"
                    value={formData.standard_turnaround_hours}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        standard_turnaround_hours: parseInt(e.target.value, 10) || 24,
                      })
                    }
                    className="w-full px-3 py-1.5 border border-slate-200 rounded focus:border-sky-500 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Clinical Description
                </label>
                <textarea
                  rows="2"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Clinical purpose, indication or target analytes..."
                  className="w-full px-3 py-1.5 border border-slate-200 rounded focus:border-sky-500 text-xs"
                ></textarea>
              </div>

              {/* Patient Preparation & Instructions */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Patient Preparation / Collection Instructions
                </label>
                <textarea
                  rows="2"
                  value={formData.instructions}
                  onChange={(e) =>
                    setFormData({ ...formData, instructions: e.target.value })
                  }
                  placeholder="e.g. 10-12 hours overnight fasting required..."
                  className="w-full px-3 py-1.5 border border-slate-200 rounded focus:border-sky-500 text-xs"
                ></textarea>
              </div>

              {/* Status */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Catalog Status
                </label>
                <div className="flex items-center space-x-4">
                  <label className="inline-flex items-center text-xs text-slate-700">
                    <input
                      type="radio"
                      name="status"
                      value="active"
                      checked={formData.status === "active"}
                      onChange={() => setFormData({ ...formData, status: "active" })}
                      className="mr-1.5 text-sky-600"
                    />
                    Active
                  </label>
                  <label className="inline-flex items-center text-xs text-slate-700">
                    <input
                      type="radio"
                      name="status"
                      value="inactive"
                      checked={formData.status === "inactive"}
                      onChange={() => setFormData({ ...formData, status: "inactive" })}
                      className="mr-1.5 text-slate-400"
                    />
                    Inactive
                  </label>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 rounded border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded shadow-xs disabled:opacity-50"
                >
                  {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Master Test"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
