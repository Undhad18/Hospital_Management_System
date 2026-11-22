import { useEffect, useState, useCallback, useRef } from "react";
import {
  getPharmacyMedicines,
  getMedicineCategories,
  getSuppliers,
  createSupplier,
  updateSupplierStatus,
  getInventoryBatches,
  getPharmacyAlertsSummary,
  getLowStockAlerts,
  getExpiringAlerts,
  updatePharmacyMedicineStatus,
} from "../services/api";
import CustomDropdown from "../components/CustomDropdown";

export default function HospitalPharmacy({ session }) {
  const [activeTab, setActiveTab] = useState("formulary"); // formulary | suppliers | batches | alerts
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [medicines, setMedicines] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [alertsSummary, setAlertsSummary] = useState(null);
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [expiringAlerts, setExpiringAlerts] = useState([]);

  // Search & Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Supplier Modal
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const triggerSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  // Tab scroll navigation
  const tabsRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkTabScroll = useCallback(() => {
    if (!tabsRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    checkTabScroll();
    const handleResize = () => checkTabScroll();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [checkTabScroll]);

  const handleScrollTabs = (direction) => {
    if (!tabsRef.current) return;
    const scrollAmount = direction === "left" ? -240 : 240;
    tabsRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    setTimeout(checkTabScroll, 320);
  };

  const loadData = useCallback(async () => {
    if (!session?.token) return;
    try {
      setLoading(true);
      setError(null);

      const [sumRes, catRes] = await Promise.all([
        getPharmacyAlertsSummary(session.token).catch(() => null),
        getMedicineCategories(session.token).catch(() => []),
      ]);
      if (sumRes) setAlertsSummary(sumRes);
      if (catRes) setCategories(catRes);

      if (activeTab === "formulary") {
        const meds = await getPharmacyMedicines(session.token, {
          search,
          category_id: categoryFilter,
          status: statusFilter === "all" ? undefined : statusFilter,
        });
        setMedicines(meds);
      } else if (activeTab === "suppliers") {
        const supList = await getSuppliers(session.token, { search });
        setSuppliers(supList);
      } else if (activeTab === "batches") {
        const bList = await getInventoryBatches(session.token, { search });
        setBatches(bList);
      } else if (activeTab === "alerts") {
        const [lowList, expList] = await Promise.all([
          getLowStockAlerts(session.token),
          getExpiringAlerts(session.token, { days: 60 }),
        ]);
        setLowStockAlerts(lowList);
        setExpiringAlerts(expList);
      }
    } catch (err) {
      console.error("Error loading pharmacy data:", err);
      setError(err.message || "Failed to load hospital pharmacy data.");
    } finally {
      setLoading(false);
    }
  }, [session?.token, activeTab, search, categoryFilter, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Toggle Medicine Status
  async function handleToggleStatus(med) {
    const nextStatus = med.status === "active" ? "inactive" : "active";
    if (!window.confirm(`Are you sure you want to ${nextStatus === "active" ? "activate" : "deactivate"} '${med.name}'?`)) return;
    try {
      await updatePharmacyMedicineStatus(session.token, med.id, nextStatus);
      triggerSuccess(`Medicine '${med.name}' ${nextStatus === "active" ? "activated" : "deactivated"} successfully.`);
      loadData();
    } catch (err) {
      alert(err.message || "Failed to update medicine status");
    }
  }

  // Create Supplier
  async function handleSaveSupplier(e) {
    e.preventDefault();
    if (!supplierForm.name.trim()) return alert("Supplier name is required");
    try {
      setSubmitting(true);
      await createSupplier(session.token, supplierForm);
      triggerSuccess(`Supplier '${supplierForm.name}' added successfully.`);
      setShowSupplierModal(false);
      setSupplierForm({ name: "", contact_person: "", phone: "", email: "", address: "" });
      loadData();
    } catch (err) {
      alert(err.message || "Failed to create supplier");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-sky-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">Hospital Pharmacy &amp; Inventory Governance</h1>
              <p className="text-xs text-slate-500 font-mono">Formulary Pricing, Reorder Levels, Verified Suppliers &amp; Stock Surveillance</p>
            </div>
          </div>
        </div>

        {activeTab === "suppliers" && (
          <button
            onClick={() => setShowSupplierModal(true)}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold shadow-xs cursor-pointer"
          >
            + Add Hospital Supplier
          </button>
        )}
      </div>

      {/* Success / Error Alerts */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-xs font-medium flex items-center justify-between">
          <span>✔ {successMsg}</span>
          <button onClick={() => setSuccessMsg(null)}>✕</button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-rose-800 text-xs font-medium flex items-center justify-between">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Metric Cards */}
      {alertsSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider block">Low Stock Threshold</span>
            <span className="text-2xl font-bold text-amber-600 block mt-1">{alertsSummary.low_stock_count}</span>
            <span className="text-[10px] text-slate-500">medicines below safety stock</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider block">Out of Stock</span>
            <span className="text-2xl font-bold text-rose-600 block mt-1">{alertsSummary.out_of_stock_count}</span>
            <span className="text-[10px] text-slate-500">depleted formulary items</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider block">Batches Expiring (60d)</span>
            <span className="text-2xl font-bold text-amber-500 block mt-1">{alertsSummary.expiring_soon_count}</span>
            <span className="text-[10px] text-slate-500">lots requiring dispatch</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider block">Expired Stock</span>
            <span className="text-2xl font-bold text-rose-700 block mt-1">{alertsSummary.expired_count}</span>
            <span className="text-[10px] text-slate-500">quarantined units</span>
          </div>
        </div>
      )}

      {/* Navigation Sub-Tabs with Hidden Scrollbar and Smooth Scroll Controls */}
      <div className="relative border-b border-slate-200">
        {/* Left scroll chevron */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center bg-gradient-to-r from-white via-white/95 to-transparent pr-4 pointer-events-none">
            <button
              type="button"
              onClick={() => handleScrollTabs("left")}
              className="p-1 rounded-full bg-white shadow-md border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer pointer-events-auto"
              title="Scroll left"
              aria-label="Scroll left"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        )}

        {/* Tab List */}
        <div
          ref={tabsRef}
          onScroll={checkTabScroll}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          className="flex space-x-2 overflow-x-auto no-scrollbar scroll-smooth text-xs font-semibold py-0.5"
        >
          {[
            { key: "formulary", label: "Hospital Formulary & Pricing" },
            { key: "suppliers", label: "Registered Suppliers" },
            { key: "batches", label: "Stock Lots & Batches" },
            {
              key: "alerts",
              label: "Stock Health & Alerts",
              badge: alertsSummary
                ? ((alertsSummary.low_stock_count || 0) + (alertsSummary.expiring_count || 0) + (alertsSummary.expired_count || 0)) || null
                : null,
            },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={(e) => {
                setActiveTab(tab.key);
                e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
              }}
              className={`px-4 py-2.5 border-b-2 font-medium transition cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                activeTab === tab.key
                  ? "border-sky-600 text-sky-700 bg-sky-50/50 rounded-t-md"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-md"
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge ? (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700 animate-pulse">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Right scroll chevron */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center bg-gradient-to-l from-white via-white/95 to-transparent pl-4 pointer-events-none">
            <button
              type="button"
              onClick={() => handleScrollTabs("right")}
              className="p-1 rounded-full bg-white shadow-md border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer pointer-events-auto"
              title="Scroll right"
              aria-label="Scroll right"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: FORMULARY */}
      {activeTab === "formulary" && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center gap-2 relative z-20">
            <input
              type="text"
              placeholder="Filter by drug, salt or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-md text-xs w-64 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <div className="w-52">
              <CustomDropdown
                value={categoryFilter}
                onChange={(val) => setCategoryFilter(val)}
                options={[
                  { value: "", label: "All Categories" },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
                placeholder="All Categories"
              />
            </div>
            <div className="w-36">
              <CustomDropdown
                value={statusFilter}
                onChange={(val) => setStatusFilter(val)}
                options={[
                  { value: "all", label: "All Statuses" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
                placeholder="All Statuses"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="px-3 py-2.5">SKU</th>
                  <th className="px-3 py-2.5">Medicine Name</th>
                  <th className="px-3 py-2.5">Form / Strength</th>
                  <th className="px-3 py-2.5">Purchase Cost</th>
                  <th className="px-3 py-2.5">Hospital Sale Price</th>
                  <th className="px-3 py-2.5">Available Stock</th>
                  <th className="px-3 py-2.5">Reorder Level</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {medicines.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono font-bold text-slate-700">{m.sku}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">
                      {m.name}
                      {m.generic_name && <span className="text-[10px] text-slate-500 block italic">{m.generic_name}</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600 font-mono text-[11px]">
                      {m.strength ? `${m.strength} • ` : ""}{m.form}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600">${parseFloat(m.purchase_price).toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-800">
                      ${parseFloat(m.active_sale_price || m.sale_price).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                          m.current_stock === 0
                            ? "bg-rose-100 text-rose-800"
                            : m.current_stock <= (m.active_min_stock || m.min_stock_alert_level)
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {m.current_stock} units
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-500">{m.active_min_stock || m.min_stock_alert_level} units</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          m.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleToggleStatus(m)}
                        className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                          m.status === "active"
                            ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {m.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SUPPLIERS */}
      {activeTab === "suppliers" && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="px-3 py-2.5">Supplier Name</th>
                  <th className="px-3 py-2.5">Contact Person</th>
                  <th className="px-3 py-2.5">Phone</th>
                  <th className="px-3 py-2.5">Email</th>
                  <th className="px-3 py-2.5">Total Batches</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold text-slate-900">{s.name}</td>
                    <td className="px-3 py-2 text-slate-700">{s.contact_person || "—"}</td>
                    <td className="px-3 py-2 font-mono text-slate-600">{s.phone || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{s.email || "—"}</td>
                    <td className="px-3 py-2 font-mono">{s.total_batches_supplied || 0}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          s.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={async () => {
                          const next = s.status === "active" ? "inactive" : "active";
                          await updateSupplierStatus(session.token, s.id, next);
                          triggerSuccess(`Supplier '${s.name}' is now ${next}.`);
                          loadData();
                        }}
                        className="text-[11px] text-sky-600 hover:text-sky-800 font-medium cursor-pointer"
                      >
                        {s.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: BATCHES */}
      {activeTab === "batches" && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="px-3 py-2.5">Batch #</th>
                  <th className="px-3 py-2.5">Medicine</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5">Expiry Date</th>
                  <th className="px-3 py-2.5">Available Balance</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono font-bold text-slate-800">{b.batch_number}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{b.medicine_name}</td>
                    <td className="px-3 py-2 text-slate-600">{b.supplier_name || "Direct"}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800">{b.expiry_date}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-900">{b.current_quantity} units</td>
                    <td className="px-3 py-2 uppercase font-mono text-[10px] text-slate-600">{b.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: ALERTS */}
      {activeTab === "alerts" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Minimum Stock Reorder Alerts</h3>
            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px]">
                  <tr>
                    <th className="px-3 py-2">Medicine</th>
                    <th className="px-3 py-2">Available</th>
                    <th className="px-3 py-2">Threshold</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowStockAlerts.map((a) => (
                    <tr key={a.id}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{a.name}</td>
                      <td className="px-3 py-2 font-mono font-bold">{a.usable_stock} units</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{a.min_threshold} units</td>
                      <td className="px-3 py-2 font-bold text-rose-700">{a.alert_severity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Batches Expiring in 60 Days</h3>
            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px]">
                  <tr>
                    <th className="px-3 py-2">Batch #</th>
                    <th className="px-3 py-2">Medicine</th>
                    <th className="px-3 py-2">Units</th>
                    <th className="px-3 py-2">Expiry Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expiringAlerts.map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2 font-mono font-bold">{e.batch_number}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{e.medicine_name}</td>
                      <td className="px-3 py-2 font-mono font-bold">{e.current_quantity}</td>
                      <td className="px-3 py-2 font-mono text-rose-700 font-bold">{e.expiry_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CREATE SUPPLIER MODAL */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Add Verified Hospital Supplier</h3>
              <button onClick={() => setShowSupplierModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Contact Person</label>
                <input
                  type="text"
                  value={supplierForm.contact_person}
                  onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Phone</label>
                  <input
                    type="text"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Email</label>
                  <input
                    type="email"
                    value={supplierForm.email}
                    onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Address</label>
                <input
                  type="text"
                  value={supplierForm.address}
                  onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-sky-600 text-white font-semibold rounded cursor-pointer disabled:opacity-50"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

