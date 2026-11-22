import { useEffect, useState, useMemo, useRef } from "react";
import {
  getPharmacyMedicines,
  getMedicineCategories,
  createMedicineCategory,
  updateMedicineCategory,
  getSuppliers,
  createSupplier,
  updateSupplier,
  createPharmacyMedicine,
  updatePharmacyMedicine,
  updatePharmacyMedicineStatus,
} from "../services/api";
import CustomDropdown from "../components/CustomDropdown";
import Pagination, { usePagination } from "../components/Pagination";

const FORMS = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Suspension",
  "Injection",
  "Ointment",
  "Cream",
  "Gel",
  "Drops",
  "Inhaler",
  "Patch",
  "Suppository",
  "IV Infusion",
];

const CustomSelectDropdown = CustomDropdown;

export default function MasterMedicineCatalog({ token }) {
  const [activeTab, setActiveTab] = useState("medicines"); // 'medicines' | 'categories' | 'suppliers'
  const [medicines, setMedicines] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flashMessage, setFlashMessage] = useState(null);

  // Search & Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Medicine Modal
  const [showMedModal, setShowMedModal] = useState(false);
  const [isEditingMed, setIsEditingMed] = useState(false);
  const [selectedMedId, setSelectedMedId] = useState(null);
  const [medForm, setMedForm] = useState({
    sku: "",
    name: "",
    generic_name: "",
    dosage: "",
    form: "Tablet",
    category_id: "",
    purchase_price: "",
    sale_price: "",
    max_discount_percent: 0,
    min_stock_alert_level: 10,
    description: "",
    status: "active",
  });
  const [medFormError, setMedFormError] = useState("");
  const [savingMed, setSavingMed] = useState(false);

  // Category Modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [isEditingCat, setIsEditingCat] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [catForm, setCatForm] = useState({
    name: "",
    description: "",
    status: "active",
  });
  const [catFormError, setCatFormError] = useState("");
  const [savingCat, setSavingCat] = useState(false);

  // Supplier Modal
  const [showSupModal, setShowSupModal] = useState(false);
  const [isEditingSup, setIsEditingSup] = useState(false);
  const [selectedSupId, setSelectedSupId] = useState(null);
  const [supForm, setSupForm] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    status: "active",
  });
  const [supFormError, setSupFormError] = useState("");
  const [savingSup, setSavingSup] = useState(false);

  useEffect(() => {
    loadAllData();
  }, [token]);

  async function loadAllData() {
    setLoading(true);
    setError("");
    try {
      const [medsRes, catsRes, supsRes] = await Promise.all([
        getPharmacyMedicines(token, { status: "all" }),
        getMedicineCategories(token),
        getSuppliers(token),
      ]);
      setMedicines(medsRes || []);
      setCategories(catsRes || []);
      setSuppliers(supsRes || []);
    } catch (err) {
      setError(err.message || "Failed to load pharmaceutical master data.");
    } finally {
      setLoading(false);
    }
  }

  // Filtered Medicines
  const filteredMedicines = useMemo(() => {
    return medicines.filter((m) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        q === "" ||
        (m.name && m.name.toLowerCase().includes(q)) ||
        (m.generic_name && m.generic_name.toLowerCase().includes(q)) ||
        (m.sku && m.sku.toLowerCase().includes(q)) ||
        (m.category_name && m.category_name.toLowerCase().includes(q));

      const matchesCat =
        categoryFilter === "all" ||
        String(m.category_id) === String(categoryFilter);

      const matchesStatus =
        statusFilter === "all" || m.status === statusFilter;

      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [medicines, search, categoryFilter, statusFilter]);

  // Filtered Categories
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        q === "" ||
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === "all" || c.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [categories, search, statusFilter]);

  // Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        q === "" ||
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === "all" || s.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [suppliers, search, statusFilter]);

  const {
    currentPage: medPage,
    setCurrentPage: setMedPage,
    pageSize: medPageSize,
    setPageSize: setMedPageSize,
    totalPages: medTotalPages,
    totalRecords: medTotalRecords,
    paginatedItems: paginatedMedicines,
    resetPage: resetMedPage,
  } = usePagination(filteredMedicines, 25);

  const {
    currentPage: catPage,
    setCurrentPage: setCatPage,
    pageSize: catPageSize,
    setPageSize: setCatPageSize,
    totalPages: catTotalPages,
    totalRecords: catTotalRecords,
    paginatedItems: paginatedCategories,
    resetPage: resetCatPage,
  } = usePagination(filteredCategories, 25);

  const {
    currentPage: supPage,
    setCurrentPage: setSupPage,
    pageSize: supPageSize,
    setPageSize: setSupPageSize,
    totalPages: supTotalPages,
    totalRecords: supTotalRecords,
    paginatedItems: paginatedSuppliers,
    resetPage: resetSupPage,
  } = usePagination(filteredSuppliers, 25);

  useEffect(() => {
    resetMedPage();
    resetCatPage();
    resetSupPage();
  }, [search, categoryFilter, statusFilter, activeTab, resetMedPage, resetCatPage, resetSupPage]);

  // Medicine Actions
  function handleOpenCreateMed() {
    setIsEditingMed(false);
    setSelectedMedId(null);
    setMedForm({
      sku: `MED-${Date.now().toString().slice(-6)}`,
      name: "",
      generic_name: "",
      dosage: "",
      form: "Tablet",
      category_id: categories.length > 0 ? categories[0].id : "",
      purchase_price: "",
      sale_price: "",
      max_discount_percent: 0,
      min_stock_alert_level: 10,
      description: "",
      status: "active",
    });
    setMedFormError("");
    setShowMedModal(true);
  }

  function handleOpenEditMed(med) {
    setIsEditingMed(true);
    setSelectedMedId(med.id);
    setMedForm({
      sku: med.sku || "",
      name: med.name || "",
      generic_name: med.generic_name || "",
      dosage: med.dosage || "",
      form: med.form || "Tablet",
      category_id: med.category_id || "",
      purchase_price: med.purchase_price || "",
      sale_price: med.sale_price || "",
      max_discount_percent: med.max_discount_percent || 0,
      min_stock_alert_level: med.min_stock_alert_level || 10,
      description: med.description || "",
      status: med.status || "active",
    });
    setMedFormError("");
    setShowMedModal(true);
  }

  async function handleSaveMed(e) {
    e.preventDefault();
    if (!medForm.name.trim()) {
      setMedFormError("Medicine name is required.");
      return;
    }
    if (!medForm.generic_name.trim()) {
      setMedFormError("Generic name is required.");
      return;
    }
    if (!medForm.sku.trim()) {
      setMedFormError("SKU code is required.");
      return;
    }
    if (!medForm.dosage.trim()) {
      setMedFormError("Dosage/Strength is required (e.g. 500mg, 10ml).");
      return;
    }
    if (!medForm.category_id) {
      setMedFormError("Please select a valid therapeutic category.");
      return;
    }
    if (Number(medForm.purchase_price) < 0 || Number(medForm.sale_price) < 0) {
      setMedFormError("Prices must be non-negative numbers.");
      return;
    }

    setSavingMed(true);
    setMedFormError("");
    try {
      const payload = {
        ...medForm,
        category_id: Number(medForm.category_id),
        purchase_price: Number(medForm.purchase_price || 0),
        sale_price: Number(medForm.sale_price || 0),
        max_discount_percent: Number(medForm.max_discount_percent || 0),
        min_stock_alert_level: Number(medForm.min_stock_alert_level || 10),
      };

      if (isEditingMed) {
        await updatePharmacyMedicine(token, selectedMedId, payload);
        setFlashMessage("Master medicine record updated successfully.");
      } else {
        await createPharmacyMedicine(token, payload);
        setFlashMessage("New master medicine created and published successfully.");
      }
      setShowMedModal(false);
      loadAllData();
    } catch (err) {
      setMedFormError(err.message || "Failed to save medicine record.");
    } finally {
      setSavingMed(false);
    }
  }

  async function handleToggleMedStatus(med) {
    const nextStatus = med.status === "active" ? "inactive" : "active";
    try {
      await updatePharmacyMedicineStatus(token, med.id, nextStatus);
      setFlashMessage(
        `Medicine "${med.name}" status changed to ${nextStatus}.`
      );
      loadAllData();
    } catch (err) {
      setError(err.message || "Failed to update medicine status.");
    }
  }

  // Category Actions
  function handleOpenCreateCat() {
    setIsEditingCat(false);
    setSelectedCatId(null);
    setCatForm({ name: "", description: "", status: "active" });
    setCatFormError("");
    setShowCatModal(true);
  }

  function handleOpenEditCat(cat) {
    setIsEditingCat(true);
    setSelectedCatId(cat.id);
    setCatForm({
      name: cat.name || "",
      description: cat.description || "",
      status: cat.status || "active",
    });
    setCatFormError("");
    setShowCatModal(true);
  }

  async function handleSaveCat(e) {
    e.preventDefault();
    if (!catForm.name.trim()) {
      setCatFormError("Category name is required.");
      return;
    }

    setSavingCat(true);
    setCatFormError("");
    try {
      if (isEditingCat) {
        await updateMedicineCategory(token, selectedCatId, catForm);
        setFlashMessage("Medicine category updated successfully.");
      } else {
        await createMedicineCategory(token, catForm);
        setFlashMessage("New medicine category created successfully.");
      }
      setShowCatModal(false);
      loadAllData();
    } catch (err) {
      setCatFormError(err.message || "Failed to save category.");
    } finally {
      setSavingCat(false);
    }
  }

  async function handleToggleCatStatus(cat) {
    const nextStatus = cat.status === "active" ? "inactive" : "active";
    try {
      await updateMedicineCategory(token, cat.id, {
        name: cat.name,
        description: cat.description,
        status: nextStatus,
      });
      setFlashMessage(`Category "${cat.name}" is now ${nextStatus}.`);
      loadAllData();
    } catch (err) {
      setError(err.message || "Failed to update category status.");
    }
  }

  // Supplier Actions
  function handleOpenCreateSup() {
    setIsEditingSup(false);
    setSelectedSupId(null);
    setSupForm({
      name: "",
      contact_person: "",
      phone: "",
      email: "",
      address: "",
      status: "active",
    });
    setSupFormError("");
    setShowSupModal(true);
  }

  function handleOpenEditSup(sup) {
    setIsEditingSup(true);
    setSelectedSupId(sup.id);
    setSupForm({
      name: sup.name || "",
      contact_person: sup.contact_person || "",
      phone: sup.phone || "",
      email: sup.email || "",
      address: sup.address || "",
      status: sup.status || "active",
    });
    setSupFormError("");
    setShowSupModal(true);
  }

  async function handleSaveSup(e) {
    e.preventDefault();
    if (!supForm.name.trim()) {
      setSupFormError("Supplier name is required.");
      return;
    }

    setSavingSup(true);
    setSupFormError("");
    try {
      if (isEditingSup) {
        await updateSupplier(token, selectedSupId, supForm);
        setFlashMessage("Pharmaceutical supplier updated successfully.");
      } else {
        await createSupplier(token, supForm);
        setFlashMessage("New pharmaceutical supplier added successfully.");
      }
      setShowSupModal(false);
      loadAllData();
    } catch (err) {
      setSupFormError(err.message || "Failed to save supplier.");
    } finally {
      setSavingSup(false);
    }
  }

  async function handleToggleSupStatus(sup) {
    const nextStatus = sup.status === "active" ? "inactive" : "active";
    try {
      await updateSupplier(token, sup.id, {
        name: sup.name,
        contact_person: sup.contact_person,
        phone: sup.phone,
        email: sup.email,
        address: sup.address,
        status: nextStatus,
      });
      setFlashMessage(`Supplier "${sup.name}" is now ${nextStatus}.`);
      loadAllData();
    } catch (err) {
      setError(err.message || "Failed to update supplier status.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Master Medicine Catalog &amp; Pharmacy Governance
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Central repository for pharmaceutical drugs, categories, SKU standardization, and authorized vendors (Module 12)
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          {activeTab === "medicines" && (
            <button
              onClick={handleOpenCreateMed}
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v16m8-8H4" />
              </svg>
              <span>New Master Medicine</span>
            </button>
          )}

          {activeTab === "categories" && (
            <button
              onClick={handleOpenCreateCat}
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Category</span>
            </button>
          )}

          {activeTab === "suppliers" && (
            <button
              onClick={handleOpenCreateSup}
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Register Supplier</span>
            </button>
          )}
        </div>
      </div>

      {/* Global Alerts / Flash */}
      {flashMessage && (
        <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
            <span>{flashMessage}</span>
          </div>
          <button
            onClick={() => setFlashMessage(null)}
            className="text-emerald-500 hover:text-emerald-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-rose-600"></span>
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError("")}
            className="text-rose-500 hover:text-rose-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Primary Tab Navigation */}
      <div className="border-b border-slate-200 flex space-x-6 text-xs font-medium">
        <button
          onClick={() => {
            setActiveTab("medicines");
            setSearch("");
          }}
          className={`pb-3 border-b-2 flex items-center space-x-2 transition ${
            activeTab === "medicines"
              ? "border-sky-600 text-sky-700 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Master Medicines</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700">
            {medicines.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab("categories");
            setSearch("");
          }}
          className={`pb-3 border-b-2 flex items-center space-x-2 transition ${
            activeTab === "categories"
              ? "border-sky-600 text-sky-700 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Medicine Categories</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700">
            {categories.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab("suppliers");
            setSearch("");
          }}
          className={`pb-3 border-b-2 flex items-center space-x-2 transition ${
            activeTab === "suppliers"
              ? "border-sky-600 text-sky-700 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Pharmaceutical Suppliers</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700">
            {suppliers.length}
          </span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-3.5 rounded-md border border-slate-200 shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:border-sky-500"
          />
          <svg
            className="w-4 h-4 text-slate-400 absolute left-2.5 top-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex items-center space-x-2.5 w-full sm:w-auto">
          {activeTab === "medicines" && (
            <div className="w-44 min-w-[150px]">
              <CustomDropdown
                value={categoryFilter}
                options={[{ value: "all", label: "All Categories" }, ...categories]}
                onChange={(val) => setCategoryFilter(val)}
                placeholder="All Categories"
                buttonClassName="py-1.5"
              />
            </div>
          )}

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

          <button
            onClick={loadAllData}
            title="Refresh Catalog"
            className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content Areas */}
      {loading ? (
        <div className="bg-white rounded-md border border-slate-200 p-12 text-center text-xs text-slate-400">
          <div className="inline-block w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mb-2"></div>
          <p>Loading catalog data...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: MASTER MEDICINES */}
          {activeTab === "medicines" && (
            <div className="bg-white rounded-md border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">SKU &amp; Identifiers</th>
                      <th className="py-3 px-4">Medicine &amp; Generic Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Dosage / Form</th>
                      <th className="py-3 px-4 text-right">Purchase Price</th>
                      <th className="py-3 px-4 text-right">Sale Price</th>
                      <th className="py-3 px-4 text-center">Max Disc.</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredMedicines.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="py-8 text-center text-slate-400">
                          No master medicines found matching current filters.
                        </td>
                      </tr>
                    ) : (
                      paginatedMedicines.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4 font-mono font-medium text-slate-900">
                            {m.sku || `MED-${m.id}`}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-slate-900 block">
                              {m.name}
                            </span>
                            <span className="text-[11px] text-slate-500 block">
                              {m.generic_name}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-block px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 text-[11px]">
                              {m.category_name || "Uncategorized"}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-slate-800 font-medium block">
                              {m.dosage}
                            </span>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                              {m.form}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-600">
                            ₹{Number(m.purchase_price || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700">
                            ₹{Number(m.sale_price || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-slate-600">
                            {Number(m.max_discount_percent || 0)}%
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleToggleMedStatus(m)}
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold transition cursor-pointer ${
                                m.status === "active"
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                                  : "bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full mr-1 ${
                                  m.status === "active" ? "bg-emerald-600" : "bg-rose-600"
                                }`}
                              ></span>
                              {m.status === "active" ? "Active" : "Inactive"}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleOpenEditMed(m)}
                              className="px-2.5 py-1 text-slate-600 hover:text-sky-700 hover:bg-sky-50 rounded border border-slate-200 font-medium transition cursor-pointer"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <Pagination
                currentPage={medPage}
                totalPages={medTotalPages}
                totalRecords={medTotalRecords}
                pageSize={medPageSize}
                onPageChange={setMedPage}
                onPageSizeChange={setMedPageSize}
              />
            </div>
          )}

          {/* TAB 2: MEDICINE CATEGORIES */}
          {activeTab === "categories" && (
            <div className="bg-white rounded-md border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Category ID</th>
                      <th className="py-3 px-4">Category Name</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4 text-center">Associated Drugs</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredCategories.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="py-8 text-center text-slate-400">
                          No categories found matching filters.
                        </td>
                      </tr>
                    ) : (
                      paginatedCategories.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4 font-mono font-medium text-slate-500">
                            #{c.id}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {c.name}
                          </td>
                          <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                            {c.description || "—"}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                              {c.medicine_count || 0} medicines
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleToggleCatStatus(c)}
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold transition cursor-pointer ${
                                c.status === "active"
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                                  : "bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full mr-1 ${
                                  c.status === "active" ? "bg-emerald-600" : "bg-rose-600"
                                }`}
                              ></span>
                              {c.status === "active" ? "Active" : "Inactive"}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleOpenEditCat(c)}
                              className="px-2.5 py-1 text-slate-600 hover:text-sky-700 hover:bg-sky-50 rounded border border-slate-200 font-medium transition cursor-pointer"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <Pagination
                currentPage={catPage}
                totalPages={catTotalPages}
                totalRecords={catTotalRecords}
                pageSize={catPageSize}
                onPageChange={setCatPage}
                onPageSizeChange={setCatPageSize}
              />
            </div>
          )}

          {/* TAB 3: PHARMACEUTICAL SUPPLIERS */}
          {activeTab === "suppliers" && (
            <div className="bg-white rounded-md border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Supplier Name</th>
                      <th className="py-3 px-4">Contact Person</th>
                      <th className="py-3 px-4">Phone / Email</th>
                      <th className="py-3 px-4">Facility Address</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredSuppliers.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="py-8 text-center text-slate-400">
                          No suppliers found matching filters.
                        </td>
                      </tr>
                    ) : (
                      paginatedSuppliers.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {s.name}
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            {s.contact_person || "—"}
                          </td>
                          <td className="py-3 px-4">
                            <span className="block font-mono text-slate-800">{s.phone || "—"}</span>
                            <span className="block text-[11px] text-slate-500">{s.email || "—"}</span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                            {s.address || "—"}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleToggleSupStatus(s)}
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold transition cursor-pointer ${
                                s.status === "active"
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                                  : "bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full mr-1 ${
                                  s.status === "active" ? "bg-emerald-600" : "bg-rose-600"
                                }`}
                              ></span>
                              {s.status === "active" ? "Active" : "Inactive"}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleOpenEditSup(s)}
                              className="px-2.5 py-1 text-slate-600 hover:text-sky-700 hover:bg-sky-50 rounded border border-slate-200 font-medium transition cursor-pointer"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <Pagination
                currentPage={supPage}
                totalPages={supTotalPages}
                totalRecords={supTotalRecords}
                pageSize={supPageSize}
                onPageChange={setSupPage}
                onPageSizeChange={setSupPageSize}
              />
            </div>
          )}
        </>
      )}

      {/* ======================= MODAL: MEDICINE ADD/EDIT ======================= */}
      {showMedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                {isEditingMed ? "Edit Master Medicine" : "Register Master Medicine"}
              </h2>
              <button
                onClick={() => setShowMedModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMed} className="p-6 space-y-4">
              {medFormError && (
                <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  {medFormError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    SKU / Stock Identifier *
                  </label>
                  <input
                    type="text"
                    value={medForm.sku}
                    onChange={(e) => setMedForm({ ...medForm, sku: e.target.value })}
                    placeholder="e.g. MED-PCM500"
                    required
                    className="w-full text-xs px-3 py-2 rounded border border-slate-200 font-mono focus:outline-hidden focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Medicine Display Name *
                  </label>
                  <input
                    type="text"
                    value={medForm.name}
                    onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
                    placeholder="e.g. Paracetamol 500mg"
                    required
                    className="w-full text-xs px-3 py-2 rounded border border-slate-200 focus:outline-hidden focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Generic Name (Active Ingredient) *
                  </label>
                  <input
                    type="text"
                    value={medForm.generic_name}
                    onChange={(e) => setMedForm({ ...medForm, generic_name: e.target.value })}
                    placeholder="e.g. Acetaminophen"
                    required
                    className="w-full text-xs px-3 py-2 rounded border border-slate-200 focus:outline-hidden focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dosage / Strength *
                  </label>
                  <input
                    type="text"
                    value={medForm.dosage}
                    onChange={(e) => setMedForm({ ...medForm, dosage: e.target.value })}
                    placeholder="e.g. 500mg, 10ml, 250mg/5ml"
                    required
                    className="w-full text-xs px-3 py-2 rounded border border-slate-200 focus:outline-hidden focus:border-sky-500"
                  />
                </div>

                <div className="relative" style={{ zIndex: 30 }}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pharmaceutical Form
                  </label>
                  <CustomSelectDropdown
                    value={medForm.form}
                    options={FORMS}
                    onChange={(formVal) => setMedForm({ ...medForm, form: formVal })}
                    placeholder="Select Form"
                  />
                </div>

                <div className="relative" style={{ zIndex: 30 }}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Therapeutic Category *
                  </label>
                  <CustomSelectDropdown
                    value={medForm.category_id}
                    options={categories}
                    onChange={(catId) => setMedForm({ ...medForm, category_id: catId })}
                    placeholder="Select Category"
                    searchable={true}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Base Purchase Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={medForm.purchase_price}
                    onChange={(e) => setMedForm({ ...medForm, purchase_price: e.target.value })}
                    placeholder="0.00"
                    className="w-full text-xs px-3 py-2 rounded border border-slate-200 font-mono focus:outline-hidden focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Base Sale Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={medForm.sale_price}
                    onChange={(e) => setMedForm({ ...medForm, sale_price: e.target.value })}
                    placeholder="0.00"
                    required
                    className="w-full text-xs px-3 py-2 rounded border border-slate-200 font-mono focus:outline-hidden focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Max Permitted Discount (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={medForm.max_discount_percent}
                    onChange={(e) => setMedForm({ ...medForm, max_discount_percent: e.target.value })}
                    className="w-full text-xs px-3 py-2 rounded border border-slate-200 font-mono focus:outline-hidden focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Min Stock Alert Threshold (Units)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={medForm.min_stock_alert_level}
                    onChange={(e) => setMedForm({ ...medForm, min_stock_alert_level: e.target.value })}
                    className="w-full text-xs px-3 py-2 rounded border border-slate-200 font-mono focus:outline-hidden focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description / Therapeutic Indications
                </label>
                <textarea
                  rows="2"
                  value={medForm.description}
                  onChange={(e) => setMedForm({ ...medForm, description: e.target.value })}
                  placeholder="Usage instructions, precautions, or contraindications..."
                  className="w-full text-xs px-3 py-2 rounded border border-slate-200 focus:outline-hidden focus:border-sky-500"
                ></textarea>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowMedModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMed}
                  className="px-4 py-2 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 shadow-xs"
                >
                  {savingMed ? "Saving..." : isEditingMed ? "Save Changes" : "Create Master Medicine"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================= MODAL: CATEGORY ADD/EDIT ======================= */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                {isEditingCat ? "Edit Medicine Category" : "Add Medicine Category"}
              </h2>
              <button
                onClick={() => setShowCatModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCat} className="p-6 space-y-4">
              {catFormError && (
                <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  {catFormError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  placeholder="e.g. Analgesics & Antipyretics"
                  required
                  className="w-full text-xs px-3 py-2 rounded border border-slate-200 focus:outline-hidden focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows="3"
                  value={catForm.description}
                  onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                  placeholder="Scope or clinical therapeutic classification..."
                  className="w-full text-xs px-3 py-2 rounded border border-slate-200 focus:outline-hidden focus:border-sky-500"
                ></textarea>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Status
                </label>
                <CustomDropdown
                  value={catForm.status}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                  onChange={(val) => setCatForm({ ...catForm, status: val })}
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCatModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCat}
                  className="px-4 py-2 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 shadow-xs"
                >
                  {savingCat ? "Saving..." : isEditingCat ? "Save Changes" : "Create Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================= MODAL: SUPPLIER ADD/EDIT ======================= */}
      {showSupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                {isEditingSup ? "Edit Pharmaceutical Supplier" : "Register Pharmaceutical Supplier"}
              </h2>
              <button
                onClick={() => setShowSupModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSup} className="p-6 space-y-4">
              {supFormError && (
                <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  {supFormError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Supplier / Vendor Name *
                </label>
                <input
                  type="text"
                  value={supForm.name}
                  onChange={(e) => setSupForm({ ...supForm, name: e.target.value })}
                  placeholder="e.g. Apex Pharma Distributors Ltd"
                  required
                  className="w-full text-xs px-3 py-2 rounded border border-slate-200 focus:outline-hidden focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Person
                </label>
                <input
                  type="text"
                  value={supForm.contact_person}
                  onChange={(e) => setSupForm({ ...supForm, contact_person: e.target.value })}
                  placeholder="e.g. Dr. Rajesh Sharma"
                  className="w-full text-xs px-3 py-2 rounded border border-slate-200 focus:outline-hidden focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={supForm.phone}
                    onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="w-full text-xs px-3 py-2 rounded border border-slate-200 font-mono focus:outline-hidden focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={supForm.email}
                    onChange={(e) => setSupForm({ ...supForm, email: e.target.value })}
                    placeholder="sales@apexpharma.com"
                    className="w-full text-xs px-3 py-2 rounded border border-slate-200 focus:outline-hidden focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Facility Address
                </label>
                <textarea
                  rows="2"
                  value={supForm.address}
                  onChange={(e) => setSupForm({ ...supForm, address: e.target.value })}
                  placeholder="Warehouse or registered office address..."
                  className="w-full text-xs px-3 py-2 rounded border border-slate-200 focus:outline-hidden focus:border-sky-500"
                ></textarea>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowSupModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSup}
                  className="px-4 py-2 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 shadow-xs"
                >
                  {savingSup ? "Saving..." : isEditingSup ? "Save Changes" : "Register Supplier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
