import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  getMedicineCategories,
  createMedicineCategory,
  updateMedicineCategory,
  updateMedicineCategoryStatus,
  getSuppliers,
  createSupplier,
  updateSupplierStatus,
  getPharmacyMedicines,
  createPharmacyMedicine,
  updatePharmacyMedicine,
  updatePharmacyMedicineStatus,
  getInventoryBatches,
  receiveInventoryBatch,
  adjustBatchStock,
  getStockMovements,
  getPharmacyAlertsSummary,
  getLowStockAlerts,
  getExpiringAlerts,
  dispenseMedications,
  getDispensations,
  getDispensationDetails,
  getPendingPrescriptions,
  getStaffPrescriptions,
  getPrescriptionDetails,
  validatePrescriptionDispense,
  dispensePrescriptionDirect,
  updatePrescriptionStatus,
  createPharmacyBill,
  getPharmacyBills,
  getPharmacyBillDetails,
  recordPharmacyPayment,
  refundPharmacyPayment,
  getPharmacyInvoice,
  emailPharmacyInvoice,
  emailPharmacyReceipt,
  recordOutsidePurchase,
} from "../services/api";
import CustomDropdown from "../components/CustomDropdown";
import PharmacyReports from "./PharmacyReports";

function MedicineDropdown({ value, medicines, onChange, placeholder = "Select medicine..." }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  const selectedMed = useMemo(() => {
    return medicines.find((m) => m.id === parseInt(value, 10)) || null;
  }, [medicines, value]);

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

  const filteredMedicines = useMemo(() => {
    if (!searchTerm.trim()) return medicines;
    const q = searchTerm.toLowerCase().trim();
    return medicines.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.sku?.toLowerCase().includes(q) ||
        m.generic_name?.toLowerCase().includes(q)
    );
  }, [medicines, searchTerm]);

  return (
    <div className="relative flex-1" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          setSearchTerm("");
        }}
        className="w-full flex items-center justify-between px-3 py-1.5 border border-slate-200 rounded text-xs bg-white text-left hover:border-slate-300 focus:outline-hidden focus:border-sky-500 cursor-pointer shadow-2xs transition"
      >
        <span className="truncate font-medium text-slate-800">
          {selectedMed
            ? `${selectedMed.name} ($${parseFloat(selectedMed.active_sale_price || selectedMed.sale_price || 0).toFixed(2)})`
            : placeholder}
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
        <div className="absolute top-full left-0 right-0 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-xl z-50 overflow-hidden">


          <div className="max-h-36 overflow-y-auto divide-y divide-slate-50">
            {filteredMedicines.length === 0 ? (
              <div className="p-2.5 text-center text-xs text-slate-400">
                No matching medicines found
              </div>
            ) : (
              filteredMedicines.map((m) => {
                const isSelected = selectedMed && selectedMed.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onChange(m.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition cursor-pointer ${isSelected
                      ? "bg-sky-50 font-semibold text-sky-800"
                      : "hover:bg-sky-50 text-slate-700"
                      }`}
                  >
                    <div className="min-w-0 pr-2 truncate">
                      <span className="truncate">{m.name}</span>
                      <span className="ml-1 text-slate-500 font-mono">
                        (${parseFloat(m.active_sale_price || m.sale_price || 0).toFixed(2)})
                      </span>
                    </div>
                    {isSelected ? (
                      <span className="text-[10px] text-sky-600 font-semibold shrink-0 ml-1">
                        Selected
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 font-mono shrink-0 ml-1">
                        Stock: {m.stock_quantity || 0}
                      </span>
                    )}
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

export default function PharmacyManagement({ session, forcedSection = null, onNavigate = null }) {
  const [internalTab, setInternalTab] = useState("formulary"); // formulary | batches | alerts | ledger | masters
  const activeTab = forcedSection && forcedSection !== "pharmacy" ? forcedSection : internalTab;
  const setActiveTab = (tab) => {
    if (forcedSection && forcedSection !== "pharmacy") {
      if (onNavigate) onNavigate(tab);
    } else {
      setInternalTab(tab);
    }
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Data states
  const [medicines, setMedicines] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [movements, setMovements] = useState([]);
  const [alertsSummary, setAlertsSummary] = useState(null);
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [expiringAlerts, setExpiringAlerts] = useState([]);
  const [pendingRx, setPendingRx] = useState([]);
  const [dispensations, setDispensations] = useState([]);

  // Module 14 Billing States
  const [bills, setBills] = useState([]);
  const [billPagination, setBillPagination] = useState({ total: 0, page: 1, limit: 10, total_pages: 1 });
  const [billSearch, setBillSearch] = useState("");
  const [billStatusFilter, setBillStatusFilter] = useState("all");
  const [purchaseTypeFilter, setPurchaseTypeFilter] = useState("all");
  const [selectedBillDetails, setSelectedBillDetails] = useState(null);
  const [showBillDetailsModal, setShowBillDetailsModal] = useState(false);
  const [showCollectPaymentModal, setShowCollectPaymentModal] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    payment_method: "cash",
    transaction_reference: "",
    card_network: "Visa",
    card_last4: "",
    notes: "",
  });
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedInvoiceData, setSelectedInvoiceData] = useState(null);
  const [emailInput, setEmailInput] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [showOutsidePurchaseModal, setShowOutsidePurchaseModal] = useState(false);
  const [outsidePurchaseForm, setOutsidePurchaseForm] = useState({
    patient_id: "",
    prescription_id: "",
    external_pharmacy_name: "",
    external_bill_number: "",
    notes: "",
    items: [{ medicine_name: "", quantity: 1, unit_price: "" }],
  });

  // Prescriptions Hub states
  const [allPrescriptions, setAllPrescriptions] = useState([]);
  const [rxPagination, setRxPagination] = useState({ total: 0, page: 1, limit: 10, total_pages: 1 });
  const [rxSearch, setRxSearch] = useState("");
  const [rxStatusFilter, setRxStatusFilter] = useState("all");
  const [selectedRxDetails, setSelectedRxDetails] = useState(null);
  const [showRxModal, setShowRxModal] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [cancellingRx, setCancellingRx] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [dispenseValidation, setDispenseValidation] = useState(null);

  // Search & Filters
  const [medSearch, setMedSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [batchSearch, setBatchSearch] = useState("");
  const [pendingRxSearch, setPendingRxSearch] = useState("");
  const [pendingRxStatusFilter, setPendingRxStatusFilter] = useState("all");
  const [dispensationsSearch, setDispensationsSearch] = useState("");

  // Modals
  const [showMedicineModal, setShowMedicineModal] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedBatchForAdjust, setSelectedBatchForAdjust] = useState(null);
  const [showDispenseModal, setShowDispenseModal] = useState(false);
  const [selectedRxForDispense, setSelectedRxForDispense] = useState(null);
  const [showConfirmDispenseModal, setShowConfirmDispenseModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [dispensationReceipt, setDispensationReceipt] = useState(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);

  // Forms
  const [medicineForm, setMedicineForm] = useState({
    sku: "",
    name: "",
    generic_name: "",
    form: "Tablet",
    strength: "",
    category_id: "",
    purchase_price: "",
    sale_price: "",
    max_discount_percent: "0",
    min_stock_alert_level: "15",
    description: "",
  });

  const [batchForm, setBatchForm] = useState({
    medicine_id: "",
    supplier_id: "",
    batch_number: "",
    purchase_date: new Date().toISOString().split("T")[0],
    expiry_date: "",
    purchase_price: "",
    sale_price: "",
    quantity: "",
    notes: "",
  });

  const [adjustForm, setAdjustForm] = useState({
    adjustment_type: "deduct",
    quantity: "",
    reason: "",
  });

  const [dispenseForm, setDispenseForm] = useState({
    patient_id: "",
    prescription_id: null,
    bill_id: "",
    items: [],
    payment_method: "cash",
    notes: "",
  });

  const [categoryForm, setCategoryForm] = useState({ name: "", description: "" });
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
  });

  // Action loading state
  const [submitting, setSubmitting] = useState(false);

  // Show temporary alert toast
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
    const scrollAmount = direction === "left" ? -260 : 260;
    tabsRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    setTimeout(checkTabScroll, 320);
  };

  // Fetch data depending on active tab
  const loadData = useCallback(async () => {
    if (!session?.token) return;
    try {
      setLoading(true);
      setError(null);

      // Always load alerts summary and categories for contextual lookups
      const [sumRes, catRes] = await Promise.all([
        getPharmacyAlertsSummary(session.token).catch(() => null),
        getMedicineCategories(session.token).catch(() => []),
      ]);
      if (sumRes) setAlertsSummary(sumRes);
      if (catRes) setCategories(catRes);

      if (activeTab === "formulary") {
        const meds = await getPharmacyMedicines(session.token, {
          search: medSearch,
          category_id: selectedCategoryFilter,
          status: statusFilter === "all" ? undefined : statusFilter,
        });
        setMedicines(meds);
      } else if (activeTab === "batches") {
        const [bList, sList] = await Promise.all([
          getInventoryBatches(session.token, { search: batchSearch }),
          getSuppliers(session.token),
        ]);
        setBatches(bList);
        setSuppliers(sList);
      } else if (activeTab === "dispensing") {
        const [rxList, dispList] = await Promise.all([
          getPendingPrescriptions(session.token),
          getDispensations(session.token),
        ]);
        setPendingRx(rxList);
        setDispensations(dispList);
      } else if (activeTab === "prescriptions") {
        const rxRes = await getStaffPrescriptions(session.token, {
          search: rxSearch,
          status: rxStatusFilter === "all" ? undefined : rxStatusFilter,
          page: rxPagination.page,
          limit: rxPagination.limit,
        });
        setAllPrescriptions(rxRes.data || []);
        if (rxRes.pagination) {
          setRxPagination({
            ...rxRes.pagination,
            total_pages: rxRes.pagination.total_pages || rxRes.pagination.totalPages || 1,
            totalPages: rxRes.pagination.totalPages || rxRes.pagination.total_pages || 1,
          });
        }
      } else if (activeTab === "billing") {
        const billRes = await getPharmacyBills(session.token, {
          search: billSearch,
          status: billStatusFilter === "all" ? undefined : billStatusFilter,
          purchase_type: purchaseTypeFilter === "all" ? undefined : purchaseTypeFilter,
          page: billPagination.page,
          limit: billPagination.limit,
        });
        setBills(billRes.data || []);
        if (billRes.pagination) {
          setBillPagination({
            ...billRes.pagination,
            total_pages: billRes.pagination.total_pages || billRes.pagination.totalPages || 1,
            totalPages: billRes.pagination.totalPages || billRes.pagination.total_pages || 1,
          });
        }
      } else if (activeTab === "alerts") {
        const [lowList, expList] = await Promise.all([
          getLowStockAlerts(session.token),
          getExpiringAlerts(session.token, { days: 60 }),
        ]);
        setLowStockAlerts(lowList);
        setExpiringAlerts(expList);
      } else if (activeTab === "ledger") {
        const movList = await getStockMovements(session.token, { limit: 100 });
        setMovements(movList);
      } else if (activeTab === "masters") {
        const supList = await getSuppliers(session.token);
        setSuppliers(supList);
      }
    } catch (err) {
      console.error("Error loading pharmacy data:", err);
      setError(err.message || "Unable to load pharmacy records.");
    } finally {
      setLoading(false);
    }
  }, [session?.token, activeTab, medSearch, selectedCategoryFilter, statusFilter, batchSearch, rxSearch, rxStatusFilter, rxPagination.page, rxPagination.limit, billSearch, billStatusFilter, purchaseTypeFilter, billPagination.page, billPagination.limit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Medicine Create / Edit
  async function handleSaveMedicine(e) {
    e.preventDefault();
    if (!medicineForm.name.trim()) return alert("Medicine name is required");
    try {
      setSubmitting(true);
      if (editingMedicine) {
        await updatePharmacyMedicine(session.token, editingMedicine.id, medicineForm);
        triggerSuccess(`Medicine '${medicineForm.name}' updated successfully.`);
      } else {
        await createPharmacyMedicine(session.token, medicineForm);
        triggerSuccess(`Medicine '${medicineForm.name}' added to formulary.`);
      }
      setShowMedicineModal(false);
      setEditingMedicine(null);
      loadData();
    } catch (err) {
      alert(err.message || "Failed to save medicine");
    } finally {
      setSubmitting(false);
    }
  }

  // Handle Medicine Status Toggle
  async function handleToggleMedicineStatus(med) {
    const nextStatus = med.status === "active" ? "inactive" : "active";
    if (!window.confirm(`Are you sure you want to ${nextStatus === "active" ? "activate" : "deactivate"} '${med.name}'?`)) return;
    try {
      await updatePharmacyMedicineStatus(session.token, med.id, nextStatus);
      triggerSuccess(`Medicine '${med.name}' is now ${nextStatus}.`);
      loadData();
    } catch (err) {
      alert(err.message || "Failed to change medicine status");
    }
  }

  // Handle Batch Receipt
  async function handleReceiveBatch(e) {
    e.preventDefault();
    if (!batchForm.medicine_id) return alert("Select a medicine");
    if (!batchForm.batch_number.trim()) return alert("Batch lot number is required");
    if (!batchForm.expiry_date) return alert("Expiry date is required");
    if (!batchForm.quantity || parseInt(batchForm.quantity, 10) <= 0) return alert("Quantity must be greater than zero");

    try {
      setSubmitting(true);
      await receiveInventoryBatch(session.token, batchForm);
      triggerSuccess(`Batch '${batchForm.batch_number}' received into inventory.`);
      setShowBatchModal(false);
      setBatchForm({
        medicine_id: "",
        supplier_id: "",
        batch_number: "",
        purchase_date: new Date().toISOString().split("T")[0],
        expiry_date: "",
        purchase_price: "",
        sale_price: "",
        quantity: "",
        notes: "",
      });
      loadData();
    } catch (err) {
      alert(err.message || "Failed to receive batch");
    } finally {
      setSubmitting(false);
    }
  }

  // Handle Stock Adjustment
  async function handleAdjustStock(e) {
    e.preventDefault();
    if (!adjustForm.quantity || parseInt(adjustForm.quantity, 10) <= 0) return alert("Quantity must be positive integer");
    if (!adjustForm.reason.trim() || adjustForm.reason.trim().length < 5) return alert("Provide a valid justification reason (at least 5 characters)");

    try {
      setSubmitting(true);
      await adjustBatchStock(session.token, selectedBatchForAdjust.id, adjustForm);
      triggerSuccess(`Stock adjusted successfully for Batch #${selectedBatchForAdjust.batch_number}.`);
      setShowAdjustModal(false);
      setSelectedBatchForAdjust(null);
      setAdjustForm({ adjustment_type: "deduct", quantity: "", reason: "" });
      loadData();
    } catch (err) {
      alert(err.message || "Failed to adjust stock");
    } finally {
      setSubmitting(false);
    }
  }

  // Start Dispensing from Prescription with Pre-validation (Module 15)
  async function startPrescriptionDispense(rx) {
    try {
      setSubmitting(true);
      const validation = await validatePrescriptionDispense(session.token, rx.id);
      setDispenseValidation(validation);
      setSelectedRxForDispense(rx);

      // Pre-populate items with remaining unfulfilled quantities and batch diagnostics
      const itemsToDispense = (validation.items || [])
        .filter((it) => it.remaining_quantity > 0)
        .map((it) => ({
          id: it.id,
          prescription_item_id: it.id,
          item_id: it.id,
          medicine_id: it.medicine_id,
          name: it.medicine_name,
          form: it.form || "Tablet",
          strength: it.strength || "",
          prescribed_quantity: it.prescribed_quantity || it.quantity,
          dispensed_quantity: it.dispensed_quantity || 0,
          remaining_quantity: it.remaining_quantity,
          requested_quantity: it.available_stock > 0 ? Math.min(it.remaining_quantity, it.available_stock) : it.remaining_quantity,
          max_allowed: it.remaining_quantity,
          available_stock: it.available_stock || 0,
          batches: it.batches || [],
          discount_percent: 0,
        }));

      if (itemsToDispense.length === 0) {
        const issues = validation.validation_issues || [];
        alert(
          issues.length > 0
            ? `Cannot dispense Prescription #${rx.prescription_number}:\n• ${issues.join("\n• ")}`
            : `Prescription #${rx.prescription_number} has no remaining unfulfilled items to dispense.`
        );
        return;
      }

      // Default bill selection: first active linked bill if available (Lesson 15.2)
      const defaultBillId = (validation.linked_bills && validation.linked_bills.length > 0)
        ? String(validation.linked_bills[0].id)
        : "";

      setDispenseForm({
        patient_id: rx.patient_id,
        prescription_id: rx.id,
        bill_id: defaultBillId,
        items: itemsToDispense,
        payment_method: "cash",
        notes: `Fulfillment of Rx #${rx.prescription_number}`,
      });
      setShowDispenseModal(true);
    } catch (err) {
      alert(err.message || "Could not validate prescription for dispensing");
    } finally {
      setSubmitting(false);
    }
  }

  // Pre-submission Review & Authorization (Lesson 15.4)
  function handleReviewDispense(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!dispenseForm.patient_id) return alert("Patient ID is required");
    const activeItems = (dispenseForm.items || []).filter((it) => (parseInt(it.requested_quantity, 10) || 0) > 0);
    if (activeItems.length === 0) {
      return alert("At least one medicine item must have a dispensing quantity greater than 0");
    }

    for (const it of activeItems) {
      const qty = parseInt(it.requested_quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        return alert(`Quantity for '${it.name || "item"}' must be a positive integer.`);
      }
      if (it.max_allowed !== undefined && qty > it.max_allowed) {
        return alert(`Dispense quantity for '${it.name}' (${qty}) exceeds remaining prescribed quantity (${it.max_allowed}).`);
      }
      if (it.available_stock !== undefined && qty > it.available_stock) {
        return alert(`Dispense quantity for '${it.name}' (${qty}) exceeds available non-expired stock (${it.available_stock}).`);
      }
    }

    setShowConfirmDispenseModal(true);
  }

  // Execute FEFO Dispense with Idempotency Key & Safe Transactions (Lesson 15.7 - 15.10)
  async function handleExecuteDispense() {
    try {
      setSubmitting(true);
      const idempotencyKey = `disp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      let receiptData;

      if (dispenseForm.prescription_id) {
        const payload = {
          bill_id: dispenseForm.bill_id ? parseInt(dispenseForm.bill_id, 10) : null,
          idempotency_key: idempotencyKey,
          items: dispenseForm.items
            .filter((it) => (parseInt(it.requested_quantity, 10) || 0) > 0)
            .map((it) => ({
              item_id: it.item_id || it.prescription_item_id || it.id,
              prescription_item_id: it.prescription_item_id || it.item_id || it.id,
              medicine_id: it.medicine_id,
              quantity_to_dispense: parseInt(it.requested_quantity, 10),
              discount_percent: it.discount_percent || 0,
            })),
          payment_method: dispenseForm.payment_method,
          notes: dispenseForm.notes,
        };
        const res = await dispensePrescriptionDirect(session.token, dispenseForm.prescription_id, payload);
        receiptData = res.data?.dispensation || res.data;
      } else {
        const payload = {
          ...dispenseForm,
          idempotency_key: idempotencyKey,
        };
        const res = await dispenseMedications(session.token, payload);
        receiptData = res.data;
      }

      setDispensationReceipt(receiptData);
      setShowConfirmDispenseModal(false);
      setShowDispenseModal(false);
      setShowReceiptModal(true);
      triggerSuccess(`Medications dispensed successfully. Receipt #${receiptData.dispensation_number}`);
      loadData();
    } catch (err) {
      alert(err.message || "Dispensing transaction failed");
    } finally {
      setSubmitting(false);
    }
  }

  // View Dispensation Receipt details
  async function handleViewDispensation(id) {
    try {
      setDetailsLoading(true);
      const data = await getDispensationDetails(session.token, id);
      setDispensationReceipt(data);
      setShowReceiptModal(true);
    } catch (err) {
      alert(err.message || "Failed to load dispensation receipt");
    } finally {
      setDetailsLoading(false);
    }
  }

  // View Prescription Details & Lifecycle Audit Trail
  async function handleViewRxDetails(id) {
    try {
      setDetailsLoading(true);
      setShowRxModal(true);
      const data = await getPrescriptionDetails(session.token, id);
      setSelectedRxDetails(data);
    } catch (err) {
      alert(err.message || "Failed to load prescription details");
      setShowRxModal(false);
    } finally {
      setDetailsLoading(false);
    }
  }

  // Open Cancel Modal
  function handleOpenCancelModal(rx) {
    setCancellingRx(rx);
    setCancelReason("");
    setShowCancelModal(true);
  }

  // Confirm Cancellation
  async function handleConfirmCancel(e) {
    e.preventDefault();
    if (!cancellingRx) return;
    if (!cancelReason || cancelReason.trim().length < 3) {
      return alert("A valid reason of at least 3 characters is required to cancel a prescription.");
    }

    try {
      setSubmitting(true);
      await updatePrescriptionStatus(session.token, cancellingRx.id, "cancelled", cancelReason.trim());
      triggerSuccess(`Prescription #${cancellingRx.prescription_number} cancelled successfully.`);
      setShowCancelModal(false);
      setCancellingRx(null);
      if (showRxModal && selectedRxDetails?.id === cancellingRx.id) {
        handleViewRxDetails(cancellingRx.id);
      }
      loadData();
    } catch (err) {
      alert(err.message || "Failed to cancel prescription");
    } finally {
      setSubmitting(false);
    }
  }

  // =========================================================================
  // MODULE 14: PHARMACY BILLING HANDLERS
  // =========================================================================
  async function handleGenerateBillFromRx(rx) {
    if (!window.confirm(`Generate official 12% GST pharmacy bill for Prescription #${rx.prescription_number}?`)) return;
    try {
      setSubmitting(true);
      const validation = await validatePrescriptionDispense(session.token, rx.id);
      const billableItems = (validation.items || [])
        .filter((it) => it.remaining_quantity > 0)
        .map((it) => ({
          prescription_item_id: it.prescription_item_id,
          medicine_id: it.medicine_id,
          quantity: it.remaining_quantity,
          discount_percent: 0,
        }));

      if (billableItems.length === 0) {
        alert("This prescription has already been fully billed / dispensed.");
        return;
      }

      const billRes = await createPharmacyBill(session.token, {
        prescription_id: rx.id,
        patient_id: rx.patient_id,
        items: billableItems,
        notes: `Bill generated from Prescription #${rx.prescription_number}`,
      });

      triggerSuccess(`Bill #${billRes.bill_number} generated successfully with 12% statutory GST!`);
      if (onNavigate) {
        onNavigate("billing");
      } else {
        setActiveTab("billing");
      }
      loadData();
    } catch (err) {
      alert(err.message || "Failed to generate pharmacy bill");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleViewBillDetails(billId) {
    try {
      setDetailsLoading(true);
      const data = await getPharmacyBillDetails(session.token, billId);
      setSelectedBillDetails(data);
      setShowBillDetailsModal(true);
    } catch (err) {
      alert(err.message || "Failed to load bill details");
    } finally {
      setDetailsLoading(false);
    }
  }

  function handleOpenCollectPayment(bill) {
    setSelectedBillForPayment(bill);
    setPaymentForm({
      amount: bill.balance_due || "",
      payment_method: "cash",
      transaction_reference: "",
      card_network: "Visa",
      card_last4: "",
      notes: "",
    });
    setShowCollectPaymentModal(true);
  }

  async function handleConfirmPayment(e) {
    e.preventDefault();
    if (!selectedBillForPayment) return;
    const payAmt = parseFloat(paymentForm.amount);
    if (isNaN(payAmt) || payAmt <= 0) return alert("Enter a valid payment amount > 0");

    try {
      setSubmitting(true);
      const payload = {
        amount: payAmt,
        payment_method: paymentForm.payment_method,
        payment_status: "completed",
        transaction_reference: paymentForm.transaction_reference.trim() || undefined,
        card_network: paymentForm.payment_method === "card" ? paymentForm.card_network : undefined,
        card_last4: paymentForm.payment_method === "card" && paymentForm.card_last4 ? paymentForm.card_last4.trim() : undefined,
        notes: paymentForm.notes.trim() || undefined,
      };

      const result = await recordPharmacyPayment(session.token, selectedBillForPayment.id, payload);
      triggerSuccess(`Payment of ₹${payAmt.toFixed(2)} recorded! Receipt #${result.receipt_number}.`);
      setShowCollectPaymentModal(false);
      setSelectedBillForPayment(null);
      if (showBillDetailsModal && selectedBillDetails?.id === selectedBillForPayment.id) {
        handleViewBillDetails(selectedBillForPayment.id);
      }
      loadData();
    } catch (err) {
      alert(err.message || "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefundPayment(paymentId) {
    const reason = window.prompt("Enter mandatory audit justification reason for refund:");
    if (!reason || !reason.trim()) return;

    try {
      setSubmitting(true);
      const res = await refundPharmacyPayment(session.token, paymentId, { reason: reason.trim() });
      triggerSuccess(`Refund #${res.refund_number} processed successfully for ₹${res.refund_amount}!`);
      if (selectedBillDetails) {
        handleViewBillDetails(selectedBillDetails.id);
      }
      loadData();
    } catch (err) {
      alert(err.message || "Failed to process refund");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOpenInvoiceModal(billId) {
    try {
      setDetailsLoading(true);
      const inv = await getPharmacyInvoice(session.token, billId);
      setSelectedInvoiceData({ ...inv, bill_id: inv.bill_id || billId });
      setEmailInput(inv.patient?.email || "");
      setShowInvoiceModal(true);
    } catch (err) {
      alert(err.message || "Failed to generate invoice preview");
    } finally {
      setDetailsLoading(false);
    }
  }

  async function handleSendInvoiceEmail() {
    if (!selectedInvoiceData) return;
    if (!emailInput || !emailInput.includes("@")) return alert("Enter a valid email address");

    try {
      setEmailSending(true);
      const targetId = selectedInvoiceData.bill_id || selectedInvoiceData.id || selectedBillDetails?.id || selectedInvoiceData.invoice_number;
      await emailPharmacyInvoice(session.token, targetId, emailInput);
      triggerSuccess(`Invoice sent to ${emailInput}!`);
    } catch (err) {
      alert(err.message || "Failed to send invoice email");
    } finally {
      setEmailSending(false);
    }
  }

  async function handleSaveOutsidePurchase(e) {
    e.preventDefault();
    if (!outsidePurchaseForm.external_pharmacy_name.trim()) return alert("Pharmacy / store name is required");
    if (!outsidePurchaseForm.patient_id) return alert("Select or enter a patient ID");

    try {
      setSubmitting(true);
      const res = await recordOutsidePurchase(session.token, {
        patient_id: parseInt(outsidePurchaseForm.patient_id, 10),
        prescription_id: outsidePurchaseForm.prescription_id ? parseInt(outsidePurchaseForm.prescription_id, 10) : undefined,
        external_pharmacy_name: outsidePurchaseForm.external_pharmacy_name.trim(),
        external_bill_number: outsidePurchaseForm.external_bill_number.trim() || undefined,
        notes: outsidePurchaseForm.notes.trim() || undefined,
        items: outsidePurchaseForm.items.map((it) => ({
          medicine_name: it.medicine_name.trim(),
          quantity: parseInt(it.quantity, 10),
          unit_price: parseFloat(it.unit_price || 0),
        })),
      });

      triggerSuccess(`Outside purchase recorded: #${res.bill_number}. Zero hospital inventory deducted.`);
      setShowOutsidePurchaseModal(false);
      setOutsidePurchaseForm({
        patient_id: "",
        prescription_id: "",
        external_pharmacy_name: "",
        external_bill_number: "",
        notes: "",
        items: [{ medicine_name: "", quantity: 1, unit_price: "" }],
      });
      loadData();
    } catch (err) {
      alert(err.message || "Failed to record outside purchase");
    } finally {
      setSubmitting(false);
    }
  }

  // Save Category
  async function handleSaveCategory(e) {
    e.preventDefault();
    if (!categoryForm.name.trim()) return alert("Category name is required");
    try {
      setSubmitting(true);
      await createMedicineCategory(session.token, categoryForm);
      triggerSuccess(`Category '${categoryForm.name}' created successfully.`);
      setShowCategoryModal(false);
      setCategoryForm({ name: "", description: "" });
      loadData();
    } catch (err) {
      alert(err.message || "Failed to create category");
    } finally {
      setSubmitting(false);
    }
  }

  // Save Supplier
  async function handleSaveSupplier(e) {
    e.preventDefault();
    if (!supplierForm.name.trim()) return alert("Supplier name is required");
    try {
      setSubmitting(true);
      await createSupplier(session.token, supplierForm);
      triggerSuccess(`Supplier '${supplierForm.name}' created successfully.`);
      setShowSupplierModal(false);
      setSupplierForm({ name: "", contact_person: "", phone: "", email: "", address: "" });
      loadData();
    } catch (err) {
      alert(err.message || "Failed to create supplier");
    } finally {
      setSubmitting(false);
    }
  }

  // Filtered lists for Dispensing Dashboard (Lesson 15.1 Search & Filtering)
  const filteredPendingRx = pendingRx.filter((rx) => {
    const term = pendingRxSearch.toLowerCase().trim();
    const matchesSearch = !term ||
      (rx.prescription_number && rx.prescription_number.toLowerCase().includes(term)) ||
      (rx.patient_name && rx.patient_name.toLowerCase().includes(term)) ||
      (rx.doctor_name && rx.doctor_name.toLowerCase().includes(term));
    const matchesStatus = pendingRxStatusFilter === "all" || rx.status === pendingRxStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredDispensations = dispensations.filter((d) => {
    const term = dispensationsSearch.toLowerCase().trim();
    if (!term) return true;
    return (
      (d.dispensation_number && d.dispensation_number.toLowerCase().includes(term)) ||
      (d.prescription_number && d.prescription_number.toLowerCase().includes(term)) ||
      (d.bill_number && d.bill_number.toLowerCase().includes(term)) ||
      (d.patient_name && d.patient_name.toLowerCase().includes(term)) ||
      (d.dispensed_by_name && d.dispensed_by_name.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Alert Banners */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-lg text-white flex items-center justify-center font-bold text-lg shadow-sm ${activeTab === "dispensing"
              ? "bg-sky-600"
              : activeTab === "prescriptions"
                ? "bg-indigo-600"
                : activeTab === "billing"
                  ? "bg-emerald-600"
                  : "bg-teal-600"
              }`}>
              {activeTab === "dispensing" ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              ) : activeTab === "prescriptions" ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ) : activeTab === "billing" ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">
                {activeTab === "dispensing"
                  ? "Prescriptions & Dispensing (FEFO POS)"
                  : activeTab === "prescriptions"
                    ? "Prescription Registry & History"
                    : activeTab === "billing"
                      ? "Pharmacy Billing & Invoices (12% Statutory GST)"
                      : "Pharmacy & Inventory Management"}
              </h1>
              <p className="text-xs text-slate-500 font-mono">
                {activeTab === "dispensing"
                  ? "Module 13 • Earliest Expiring Lot Allocation, Doctor Instructions & Real-time Dispensing Desk"
                  : activeTab === "prescriptions"
                    ? "Module 13 • Clinical Prescriptions, Doctor Advice, Verification & Status Lifecycle"
                    : activeTab === "billing"
                      ? "Module 14 • Itemized Tax Invoices, Multi-channel Payments (Cash/UPI/Card) & Receipts"
                      : "Module 12 • Medicine Formularies, Batches, Stock Health & Movement Ledger"}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center space-x-2">
          {activeTab === "billing" && (
            <button
              onClick={() => {
                setOutsidePurchaseForm({
                  patient_id: "",
                  prescription_id: "",
                  external_pharmacy_name: "",
                  external_bill_number: "",
                  notes: "",
                  items: [{ medicine_name: "", quantity: 1, unit_price: "" }],
                });
                setShowOutsidePurchaseModal(true);
              }}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1.5 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>+ Record Outside Purchase</span>
            </button>
          )}

          {(activeTab === "dispensing" || (!forcedSection || forcedSection === "pharmacy")) && (
            <button
              onClick={() => {
                setSelectedRxForDispense(null);
                setDispenseForm({
                  patient_id: "51", // Default to genuine patient
                  prescription_id: null,
                  items: [{ medicine_id: medicines[0]?.id || 1, requested_quantity: 1, discount_percent: 0 }],
                  payment_method: "cash",
                  notes: "Direct Over-the-Counter Dispense",
                });
                setShowDispenseModal(true);
              }}
              className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1.5 cursor-pointer"
            >
              <span>Dispense (POS)</span>
            </button>
          )}

          {(!forcedSection || forcedSection === "pharmacy") && (
            <>
              <button
                onClick={() => {
                  setEditingMedicine(null);
                  setMedicineForm({
                    sku: "",
                    name: "",
                    generic_name: "",
                    form: "Tablet",
                    strength: "",
                    category_id: categories[0]?.id || "",
                    purchase_price: "",
                    sale_price: "",
                    max_discount_percent: "0",
                    min_stock_alert_level: "15",
                    description: "",
                  });
                  setShowMedicineModal(true);
                }}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1.5 cursor-pointer"
              >
                <span>+ Add Medicine</span>
              </button>

              <button
                onClick={() => setShowBatchModal(true)}
                className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-xs font-semibold shadow-xs flex items-center space-x-1.5 cursor-pointer"
              >
                <span>+ Receive Stock Lot</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Success Banner */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-emerald-600 font-bold">✔</span>
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800">✕</button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-rose-800 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-rose-600 font-bold">⚠</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800">✕</button>
        </div>
      )}

      {/* KPI Metric Cards — Only displayed in Pharmacy & Inventory module */}
      {(!forcedSection || forcedSection === "pharmacy") && alertsSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider block">Low Stock Alerts</span>
            <div className="mt-1 flex items-baseline space-x-2">
              <span className={`text-2xl font-bold ${alertsSummary.low_stock_count > 0 ? "text-amber-600" : "text-slate-800"}`}>
                {alertsSummary.low_stock_count}
              </span>
              <span className="text-[10px] text-slate-500">below threshold</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider block">Out of Stock</span>
            <div className="mt-1 flex items-baseline space-x-2">
              <span className={`text-2xl font-bold ${alertsSummary.out_of_stock_count > 0 ? "text-rose-600" : "text-slate-800"}`}>
                {alertsSummary.out_of_stock_count}
              </span>
              <span className="text-[10px] text-slate-500">depleted items</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider block">Expiring in 60 Days</span>
            <div className="mt-1 flex items-baseline space-x-2">
              <span className={`text-2xl font-bold ${alertsSummary.expiring_soon_count > 0 ? "text-amber-500" : "text-slate-800"}`}>
                {alertsSummary.expiring_soon_count}
              </span>
              <span className="text-[10px] text-slate-500">batch lots</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider block">Expired Stock</span>
            <div className="mt-1 flex items-baseline space-x-2">
              <span className={`text-2xl font-bold ${alertsSummary.expired_count > 0 ? "text-rose-700" : "text-emerald-600"}`}>
                {alertsSummary.expired_count}
              </span>
              <span className="text-[10px] text-slate-500">{alertsSummary.expired_count > 0 ? "quarantine needed" : "healthy shelf"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Sub-Tabs — Preserving the 5 core inventory tabs */}
      {(!forcedSection || forcedSection === "pharmacy") && (
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
            className="flex space-x-1 overflow-x-auto no-scrollbar scroll-smooth text-xs font-semibold py-0.5"
          >
            {[
              { key: "formulary", label: "Medication Formulary" },
              { key: "batches", label: "Inventory Batches & Expiry" },
              {
                key: "alerts",
                label: "Stock Health & Alerts",
                badge: alertsSummary
                  ? ((alertsSummary.low_stock_count || 0) + (alertsSummary.expiring_count || 0) + (alertsSummary.expired_count || 0)) || null
                  : null,
              },
              { key: "ledger", label: "Stock Movement Ledger" },
              { key: "masters", label: "Categories & Suppliers" },
              { key: "reports", label: "Transaction History & Reports" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={(e) => {
                  setActiveTab(tab.key);
                  e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                }}
                className={`px-4 py-2.5 border-b-2 font-medium transition cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${activeTab === tab.key
                  ? "border-teal-600 text-teal-700 bg-teal-50/50 rounded-t-md"
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
      )}

      {/* TAB 1: FORMULARY */}
      {activeTab === "formulary" && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 relative z-20">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <input
                type="text"
                placeholder="Search by drug name, generic, or SKU..."
                value={medSearch}
                onChange={(e) => setMedSearch(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-md text-xs w-64 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />

              <div className="w-52">
                <CustomDropdown
                  value={selectedCategoryFilter}
                  onChange={(val) => setSelectedCategoryFilter(val)}
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

            <span className="text-xs text-slate-500 font-mono">
              Showing {medicines.length} medicine(s)
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-2.5">SKU</th>
                  <th className="px-3 py-2.5">Medicine Name</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Strength / Form</th>
                  <th className="px-3 py-2.5">Sale Price</th>
                  <th className="px-3 py-2.5">Available Stock</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {medicines.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-8 text-center text-slate-400">
                      No medicines found matching the filters.
                    </td>
                  </tr>
                ) : (
                  medicines.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-3 py-2 font-mono text-[11px] font-bold text-slate-700">{m.sku}</td>
                      <td className="px-3 py-2">
                        <span className="font-semibold text-slate-900 block">{m.name}</span>
                        {m.generic_name && (
                          <span className="text-[10px] text-slate-500 block italic">{m.generic_name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{m.category_title || m.category_name || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 font-mono text-[11px]">
                        {m.strength ? `${m.strength} • ` : ""}{m.form}
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-800">
                        ${parseFloat(m.active_sale_price || m.sale_price).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${m.current_stock === 0
                            ? "bg-rose-100 text-rose-800"
                            : m.current_stock <= (m.active_min_stock || m.min_stock_alert_level)
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                            }`}
                        >
                          {m.current_stock} units
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${m.status === "active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600"
                            }`}
                        >
                          {m.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setEditingMedicine(m);
                            setMedicineForm({
                              sku: m.sku || "",
                              name: m.name,
                              generic_name: m.generic_name || "",
                              form: m.form || "Tablet",
                              strength: m.strength || "",
                              category_id: m.category_id || "",
                              purchase_price: m.purchase_price || "",
                              sale_price: m.sale_price || "",
                              max_discount_percent: m.max_discount_percent || "0",
                              min_stock_alert_level: m.min_stock_alert_level || "15",
                              description: m.description || "",
                            });
                            setShowMedicineModal(true);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleMedicineStatus(m)}
                          className={`px-2 py-1 rounded text-[11px] font-medium ${m.status === "active"
                            ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            }`}
                        >
                          {m.status === "active" ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: INVENTORY BATCHES & LOT TRACKING */}
      {activeTab === "batches" && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <input
              type="text"
              placeholder="Search by lot/batch number or medicine name..."
              value={batchSearch}
              onChange={(e) => setBatchSearch(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-md text-xs w-72 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <span className="text-xs text-slate-500 font-mono">
              {batches.length} batch lot(s) tracked
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-2.5">Batch / Lot #</th>
                  <th className="px-3 py-2.5">Medicine</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5">Purchase Date</th>
                  <th className="px-3 py-2.5">Expiry Date</th>
                  <th className="px-3 py-2.5">Remaining Stock</th>
                  <th className="px-3 py-2.5">Shelf Status</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-8 text-center text-slate-400">
                      No stock batches found. Use "+ Receive Stock Lot" to register inventory.
                    </td>
                  </tr>
                ) : (
                  batches.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-3 py-2 font-mono font-bold text-slate-800">{b.batch_number}</td>
                      <td className="px-3 py-2">
                        <span className="font-semibold text-slate-900 block">{b.medicine_name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{b.medicine_sku}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{b.supplier_name || "Direct / Internal"}</td>
                      <td className="px-3 py-2 font-mono text-slate-600">{b.purchase_date}</td>
                      <td className="px-3 py-2 font-mono">
                        <span
                          className={`font-semibold ${b.days_until_expiry < 0
                            ? "text-rose-700"
                            : b.days_until_expiry <= 60
                              ? "text-amber-700 font-bold"
                              : "text-slate-800"
                            }`}
                        >
                          {b.expiry_date}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {b.days_until_expiry < 0
                            ? `Expired ${Math.abs(b.days_until_expiry)}d ago`
                            : `${b.days_until_expiry} days remaining`}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono">
                        <span className="font-bold text-slate-900">{b.current_quantity}</span>
                        <span className="text-slate-400 text-[10px]"> / {b.initial_quantity}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${b.dynamic_stock_status === "expired"
                            ? "bg-rose-100 text-rose-800"
                            : b.dynamic_stock_status === "depleted"
                              ? "bg-slate-100 text-slate-600"
                              : b.dynamic_stock_status === "expiring_soon"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                        >
                          {b.dynamic_stock_status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => {
                            setSelectedBatchForAdjust(b);
                            setAdjustForm({ adjustment_type: "deduct", quantity: "", reason: "" });
                            setShowAdjustModal(true);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium"
                        >
                          Adjust
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DISPENSING (FEFO POS) */}
      {activeTab === "dispensing" && (
        <div className="space-y-6">
          {/* Pending Prescriptions Queue */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Pending Outpatient Prescriptions</h3>
                <p className="text-xs text-slate-500">Unfulfilled prescriptions eligible for automated FEFO pharmacy dispensing</p>
              </div>
              <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-2.5 py-0.5 rounded font-mono font-semibold self-start sm:self-center">
                {filteredPendingRx.length} of {pendingRx.length} eligible
              </span>
            </div>

            {/* Lesson 15.1 Search & Filter Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <input
                    type="text"
                    placeholder="Search Rx #, patient, or doctor..."
                    value={pendingRxSearch}
                    onChange={(e) => setPendingRxSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                  />
                  <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <select
                  value={pendingRxStatusFilter}
                  onChange={(e) => setPendingRxStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs text-slate-700 focus:ring-1 focus:ring-sky-500"
                >
                  <option value="all">All Statuses (Active &amp; Partial)</option>
                  <option value="active">Active Only</option>
                  <option value="partially_dispensed">Partially Dispensed Only</option>
                </select>
                {(pendingRxSearch || pendingRxStatusFilter !== "all") && (
                  <button
                    onClick={() => {
                      setPendingRxSearch("");
                      setPendingRxStatusFilter("all");
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-800 font-medium underline cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-3 py-2">Rx Number</th>
                    <th className="px-3 py-2">Patient</th>
                    <th className="px-3 py-2">Prescribing Doctor</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Items</th>
                    <th className="px-3 py-2">Created At</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPendingRx.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-4 py-6 text-center text-slate-400">
                        {pendingRx.length === 0 ? "No pending unfulfilled prescriptions found." : "No prescriptions match the filter criteria."}
                      </td>
                    </tr>
                  ) : (
                    filteredPendingRx.map((rx) => (
                      <tr key={rx.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono font-bold text-sky-700">{rx.prescription_number}</td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{rx.patient_name}</td>
                        <td className="px-3 py-2 text-slate-600">{rx.doctor_name}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${rx.status === "partially_dispensed"
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              }`}
                          >
                            {rx.status?.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono">{rx.item_count} items</td>
                        <td className="px-3 py-2 text-slate-500 text-[11px]">{new Date(rx.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() => handleViewRxDetails(rx.id)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium cursor-pointer"
                          >
                            Details
                          </button>
                          <button
                            onClick={() => startPrescriptionDispense(rx)}
                            className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-[11px] font-semibold cursor-pointer shadow-2xs"
                          >
                            Dispense (FEFO)
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Completed Dispensations History */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Completed Dispensations &amp; Billing History</h3>
                <p className="text-xs text-slate-500">Persisted dispensing audit trail with linked prescriptions, bills, and stock deductions</p>
              </div>
              <span className="text-xs bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded font-mono font-semibold self-start sm:self-center">
                {filteredDispensations.length} records
              </span>
            </div>

            {/* Lesson 15.1 & 15.10 Dispensation Search Toolbar */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <input
                  type="text"
                  placeholder="Search receipt #, Rx #, bill #, patient, staff..."
                  value={dispensationsSearch}
                  onChange={(e) => setDispensationsSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              {dispensationsSearch && (
                <button
                  onClick={() => setDispensationsSearch("")}
                  className="text-[11px] text-slate-500 hover:text-slate-800 font-medium underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-3 py-2">Receipt #</th>
                    <th className="px-3 py-2">Rx #</th>
                    <th className="px-3 py-2">Bill #</th>
                    <th className="px-3 py-2">Patient</th>
                    <th className="px-3 py-2">Dispensed By</th>
                    <th className="px-3 py-2 text-center">Items</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDispensations.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="px-4 py-6 text-center text-slate-400">
                        {dispensations.length === 0 ? "No dispensation history records yet." : "No dispensations match the search criteria."}
                      </td>
                    </tr>
                  ) : (
                    filteredDispensations.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono font-bold text-slate-800">{d.dispensation_number}</td>
                        <td className="px-3 py-2 font-mono text-teal-700 font-semibold">{d.prescription_number || "—"}</td>
                        <td className="px-3 py-2">
                          {d.bill_number ? (
                            <span className="font-mono text-slate-700 font-medium flex items-center space-x-1">
                              <span>{d.bill_number}</span>
                              {d.bill_status && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${d.bill_status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                  d.bill_status === 'partially_paid' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                    'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}>
                                  {d.bill_status}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{d.patient_name}</td>
                        <td className="px-3 py-2 text-slate-600">{d.dispensed_by_name}</td>
                        <td className="px-3 py-2 text-center font-mono">{d.total_items ?? "—"}</td>
                        <td className="px-3 py-2 font-mono font-bold text-emerald-700 text-right">${parseFloat(d.total_amount).toFixed(2)}</td>
                        <td className="px-3 py-2 uppercase font-mono text-[10px] text-slate-500">{d.payment_method}</td>
                        <td className="px-3 py-2 text-slate-500 text-[11px]">{new Date(d.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleViewDispensation(d.id)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-semibold text-[10px] cursor-pointer"
                          >
                            Receipt
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: PRESCRIPTIONS REGISTRY & HISTORY */}
      {activeTab === "prescriptions" && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 relative z-20">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <input
                type="text"
                placeholder="Search Rx #, patient, doctor, or drug..."
                value={rxSearch}
                onChange={(e) => {
                  setRxSearch(e.target.value);
                  setRxPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className="px-3 py-1.5 border border-slate-300 rounded-md text-xs w-72 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />

              <div className="w-44">
                <CustomDropdown
                  value={rxStatusFilter}
                  onChange={(val) => {
                    setRxStatusFilter(val);
                    setRxPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  options={[
                    { value: "all", label: "All Statuses" },
                    { value: "active", label: "Active" },
                    { value: "partially_dispensed", label: "Partially Dispensed" },
                    { value: "dispensed", label: "Fully Dispensed" },
                    { value: "draft", label: "Draft" },
                    { value: "cancelled", label: "Cancelled" },
                  ]}
                  placeholder="All Statuses"
                />
              </div>
            </div>

            <span className="text-xs text-slate-500 font-mono">
              Total {rxPagination.total} prescription(s)
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="px-3 py-2.5">Rx Number</th>
                  <th className="px-3 py-2.5">Patient</th>
                  <th className="px-3 py-2.5">Prescribing Doctor</th>
                  <th className="px-3 py-2.5">Department</th>
                  <th className="px-3 py-2.5">Items</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allPrescriptions.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-8 text-center text-slate-400">
                      No prescriptions found matching the search criteria.
                    </td>
                  </tr>
                ) : (
                  allPrescriptions.map((rx) => {
                    const statusBadges = {
                      active: "bg-emerald-100 text-emerald-800 border-emerald-200",
                      partially_dispensed: "bg-amber-100 text-amber-800 border-amber-200",
                      dispensed: "bg-sky-100 text-sky-800 border-sky-200",
                      cancelled: "bg-rose-100 text-rose-800 border-rose-200",
                      draft: "bg-slate-100 text-slate-700 border-slate-200",
                    };

                    const canDispense = rx.status === "active" || rx.status === "partially_dispensed";
                    const canCancel = rx.status === "active" || rx.status === "partially_dispensed";

                    return (
                      <tr key={rx.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-mono font-bold text-teal-700">
                          {rx.prescription_number}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-900">
                          {rx.patient_name}
                          {rx.patient_email && (
                            <span className="text-[10px] text-slate-400 block font-normal font-mono">
                              {rx.patient_email}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          Dr. {rx.doctor_name}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 font-mono text-[11px]">
                          {rx.department_name || "General Medicine"}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-800">
                          {rx.item_count || 0} drugs
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${statusBadges[rx.status] || "bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                          >
                            {rx.status?.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 font-mono text-[11px]">
                          {new Date(rx.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() => handleViewRxDetails(rx.id)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-[11px] font-semibold cursor-pointer"
                          >
                            Audit &amp; Details
                          </button>
                          {canDispense && (
                            <button
                              onClick={() => handleGenerateBillFromRx(rx)}
                              className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded text-[11px] font-semibold cursor-pointer shadow-2xs"
                              title="Generate Official Pharmacy Bill with 12% GST"
                            >
                              Generate Bill
                            </button>
                          )}
                          {canDispense && (
                            <button
                              onClick={() => startPrescriptionDispense(rx)}
                              className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-[11px] font-semibold cursor-pointer shadow-2xs"
                            >
                              Dispense (FEFO)
                            </button>
                          )}
                          {canCancel && (
                            <button
                              onClick={() => handleOpenCancelModal(rx)}
                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[11px] font-semibold cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {rxPagination.total_pages > 1 && (
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-xs">
              <span className="text-slate-500 font-mono">
                Page {rxPagination.page} of {rxPagination.total_pages} ({rxPagination.total} total)
              </span>
              <div className="flex space-x-1">
                <button
                  disabled={rxPagination.page <= 1}
                  onClick={() => setRxPagination((p) => ({ ...p, page: p.page - 1 }))}
                  className="px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  Previous
                </button>
                <button
                  disabled={rxPagination.page >= rxPagination.total_pages}
                  onClick={() => setRxPagination((p) => ({ ...p, page: p.page + 1 }))}
                  className="px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODULE 14: TAB - PHARMACY BILLING, PAYMENTS & 12% GST INVOICES */}
      {/* ========================================================================= */}
      {activeTab === "billing" && (
        <div className="space-y-4">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Invoiced</span>
              <div className="text-xl font-bold font-mono text-slate-900">
                ₹{bills.reduce((sum, b) => sum + parseFloat(b.grand_total || 0), 0).toFixed(2)}
              </div>
              <p className="text-[11px] text-slate-400 font-mono">{bills.length} bills in current view</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs space-y-1">
              <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Total Collected</span>
              <div className="text-xl font-bold font-mono text-emerald-700">
                ₹{bills.reduce((sum, b) => sum + parseFloat(b.paid_amount || 0), 0).toFixed(2)}
              </div>
              <p className="text-[11px] text-emerald-600 font-medium">Cleared via Cash, UPI &amp; Card</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs space-y-1">
              <span className="text-[10px] uppercase font-bold text-rose-600 tracking-wider">Outstanding Balance</span>
              <div className="text-xl font-bold font-mono text-rose-700">
                ₹{bills.reduce((sum, b) => sum + parseFloat(b.balance_due || 0), 0).toFixed(2)}
              </div>
              <p className="text-[11px] text-rose-500">Unsettled patient dues</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs space-y-1">
              <span className="text-[10px] uppercase font-bold text-sky-600 tracking-wider">Statutory 12% GST</span>
              <div className="text-xl font-bold font-mono text-sky-700">
                ₹{bills.reduce((sum, b) => sum + parseFloat(b.gst_amount || 0), 0).toFixed(2)}
              </div>
              <p className="text-[11px] text-sky-600 font-medium">HSN 3004 / 3002 tax ledger</p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <input
                  type="text"
                  placeholder="Search Bill #, Patient, Rx #, Chemist..."
                  value={billSearch}
                  onChange={(e) => {
                    setBillSearch(e.target.value);
                    setBillPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-xs w-64 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />

                <div className="w-40">
                  <CustomDropdown
                    value={billStatusFilter}
                    onChange={(val) => {
                      setBillStatusFilter(val);
                      setBillPagination((prev) => ({ ...prev, page: 1 }));
                    }}
                    options={[
                      { value: "all", label: "All Statuses" },
                      { value: "pending", label: "Pending" },
                      { value: "partially_paid", label: "Partially Paid" },
                      { value: "paid", label: "Paid" },
                      { value: "refunded", label: "Refunded" },
                      { value: "cancelled", label: "Cancelled" },
                    ]}
                    placeholder="All Statuses"
                  />
                </div>

                <div className="w-48">
                  <CustomDropdown
                    value={purchaseTypeFilter}
                    onChange={(val) => {
                      setPurchaseTypeFilter(val);
                      setBillPagination((prev) => ({ ...prev, page: 1 }));
                    }}
                    options={[
                      { value: "all", label: "All Purchase Types" },
                      { value: "hospital", label: "Hospital Pharmacy" },
                      { value: "outside", label: "Outside Chemist" },
                    ]}
                    placeholder="All Purchase Types"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowOutsidePurchaseModal(true)}
                  className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 rounded text-xs font-semibold shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Record Outside Purchase</span>
                </button>
              </div>
            </div>
          </div>

          {/* Bills Data Table */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ent-table">
                <thead>
                  <tr>
                    <th>Bill Number</th>
                    <th>Type</th>
                    <th>Patient</th>
                    <th>Prescription Ref</th>
                    <th>Subtotal</th>
                    <th>GST (12%)</th>
                    <th>Grand Total</th>
                    <th>Paid / Balance</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="px-4 py-8 text-center text-slate-400 text-xs">
                        No pharmacy bills found matching your current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    bills.map((b) => {
                      const isOutside = b.purchase_type === "outside";
                      const statusBadges = {
                        paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
                        partially_paid: "bg-indigo-100 text-indigo-800 border-indigo-200",
                        pending: "bg-amber-100 text-amber-800 border-amber-200",
                        refunded: "bg-purple-100 text-purple-800 border-purple-200",
                        cancelled: "bg-rose-100 text-rose-800 border-rose-200",
                      };

                      return (
                        <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                          <td className="font-mono text-xs font-bold text-slate-900">
                            {b.bill_number}
                            <span className="block text-[10px] text-slate-400 font-normal">
                              {new Date(b.created_at).toLocaleDateString()}
                            </span>
                          </td>
                          <td>
                            {isOutside ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-block">
                                Outside: {b.external_pharmacy_name || "Chemist"}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200 inline-block">
                                Hospital Formulary
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="font-semibold text-xs text-slate-900 block">{b.patient_name}</span>
                            <span className="text-[10px] text-slate-400 font-mono block">{b.patient_phone || b.patient_email || "--"}</span>
                          </td>
                          <td>
                            {b.prescription_number ? (
                              <span className="font-mono text-xs text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                                {b.prescription_number}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">Direct OTC / Non-Rx</span>
                            )}
                          </td>
                          <td className="font-mono text-xs text-slate-700">₹{parseFloat(b.subtotal).toFixed(2)}</td>
                          <td className="font-mono text-xs text-sky-800 font-semibold">+₹{parseFloat(b.gst_amount).toFixed(2)}</td>
                          <td className="font-mono text-xs font-bold text-slate-900">₹{parseFloat(b.grand_total).toFixed(2)}</td>
                          <td className="font-mono text-xs">
                            <span className="text-emerald-700 font-semibold">₹{parseFloat(b.paid_amount).toFixed(2)}</span>
                            {parseFloat(b.balance_due) > 0 ? (
                              <span className="block text-rose-600 font-bold text-[10px]">Due: ₹{parseFloat(b.balance_due).toFixed(2)}</span>
                            ) : (
                              <span className="block text-slate-400 text-[10px]">Settled</span>
                            )}
                          </td>
                          <td>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${statusBadges[b.status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                              {b.status?.replace("_", " ")}
                            </span>
                          </td>
                          <td className="text-right space-x-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleOpenInvoiceModal(b.id)}
                              className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded text-[11px] font-semibold cursor-pointer shadow-2xs"
                              title="Preview and Print Tax Invoice"
                            >
                              Invoice &amp; Print
                            </button>
                            {parseFloat(b.balance_due) > 0 && !isOutside && b.status !== "cancelled" && (
                              <button
                                type="button"
                                onClick={() => handleOpenCollectPayment(b)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold cursor-pointer shadow-2xs"
                              >
                                Collect Pay
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleViewBillDetails(b.id)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-[11px] font-semibold cursor-pointer"
                            >
                              Audit
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {billPagination.total_pages > 1 && (
              <div className="flex items-center justify-between p-3 border-t border-slate-200 text-xs">
                <span className="text-slate-500 font-mono">
                  Page {billPagination.page} of {billPagination.total_pages} ({billPagination.total} total)
                </span>
                <div className="flex space-x-1">
                  <button
                    disabled={billPagination.page <= 1}
                    onClick={() => setBillPagination((p) => ({ ...p, page: p.page - 1 }))}
                    className="px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    Previous
                  </button>
                  <button
                    disabled={billPagination.page >= billPagination.total_pages}
                    onClick={() => setBillPagination((p) => ({ ...p, page: p.page + 1 }))}
                    className="px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: ALERTS & STOCK HEALTH */}
      {activeTab === "alerts" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Low / Out of Stock Table */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span>Minimum Stock Reorder Alerts</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-500">{lowStockAlerts.length} item(s)</span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-3 py-2">Medicine</th>
                    <th className="px-3 py-2">Available</th>
                    <th className="px-3 py-2">Threshold</th>
                    <th className="px-3 py-2">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowStockAlerts.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-4 py-6 text-center text-emerald-600 font-medium">
                        ✔ All medicines are currently above minimum threshold.
                      </td>
                    </tr>
                  ) : (
                    lowStockAlerts.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          {a.name}
                          <span className="text-[10px] font-mono text-slate-500 block">{a.sku}</span>
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-800">{a.usable_stock} units</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{a.min_threshold} units</td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${a.alert_severity === "OUT_OF_STOCK"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                              }`}
                          >
                            {a.alert_severity}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Expiry Alerts Table */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                <span>Batches Expiring Within 60 Days</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-500">{expiringAlerts.length} batch(es)</span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-3 py-2">Batch #</th>
                    <th className="px-3 py-2">Medicine</th>
                    <th className="px-3 py-2">Units</th>
                    <th className="px-3 py-2">Expiry Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expiringAlerts.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-4 py-6 text-center text-emerald-600 font-medium">
                        ✔ No batches expiring within the next 60 days.
                      </td>
                    </tr>
                  ) : (
                    expiringAlerts.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono font-bold text-slate-800">{e.batch_number}</td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{e.medicine_name}</td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-800">{e.current_quantity}</td>
                        <td className="px-3 py-2 font-mono text-rose-700 font-bold">
                          {e.expiry_date}
                          <span className="text-[10px] text-slate-500 block font-normal">
                            {e.days_until_expiry < 0 ? "Expired" : `In ${e.days_until_expiry} days`}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: STOCK MOVEMENT LEDGER */}
      {activeTab === "ledger" && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Stock Movement Audit Trail</h3>
              <p className="text-xs text-slate-500">Immutable transaction log of all receipts, FEFO dispensations, adjustments, and write-offs</p>
            </div>
            <span className="text-xs font-mono text-slate-500">{movements.length} log entries</span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-2">Timestamp</th>
                  <th className="px-3 py-2">Medicine / SKU</th>
                  <th className="px-3 py-2">Batch #</th>
                  <th className="px-3 py-2">Movement Type</th>
                  <th className="px-3 py-2">Qty Change</th>
                  <th className="px-3 py-2">Remaining Lot Bal</th>
                  <th className="px-3 py-2">Authorized Staff</th>
                  <th className="px-3 py-2">Reason / Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-8 text-center text-slate-400">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
                        {new Date(m.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {m.medicine_name}
                        <span className="text-[10px] text-slate-500 block font-mono">{m.medicine_sku}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-700">{m.batch_number}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${m.movement_type.includes("receipt") || m.movement_type === "purchase" || m.movement_type === "adjustment_add"
                            ? "bg-emerald-100 text-emerald-800"
                            : m.movement_type === "dispense"
                              ? "bg-sky-100 text-sky-800"
                              : "bg-rose-100 text-rose-800"
                            }`}
                        >
                          {m.movement_type.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono font-bold">
                        <span className={m.quantity_change > 0 ? "text-emerald-600" : "text-rose-600"}>
                          {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-800 font-semibold">{m.remaining_batch_quantity}</td>
                      <td className="px-3 py-2 text-slate-700">{m.performed_by_name}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-xs truncate" title={m.reason}>
                        {m.reason || m.reference_id || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: CATEGORIES & SUPPLIERS */}
      {activeTab === "masters" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Categories Section */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Medicine Categories</h3>
                <p className="text-xs text-slate-500">Therapeutic drug classifications</p>
              </div>
              <button
                onClick={() => setShowCategoryModal(true)}
                className="px-2.5 py-1 bg-slate-900 text-white rounded text-xs font-semibold cursor-pointer"
              >
                + Add Category
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px]">
                  <tr>
                    <th className="px-3 py-2">Category Name</th>
                    <th className="px-3 py-2">Medicines</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{c.name}</td>
                      <td className="px-3 py-2 font-mono">{c.medicine_count || 0}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${c.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                            }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={async () => {
                            const next = c.status === "active" ? "inactive" : "active";
                            await updateMedicineCategoryStatus(session.token, c.id, next);
                            triggerSuccess(`Category '${c.name}' is now ${next}.`);
                            loadData();
                          }}
                          className="text-[11px] text-teal-600 hover:text-teal-800 font-medium cursor-pointer"
                        >
                          {c.status === "active" ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Suppliers Section */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Pharmaceutical Suppliers</h3>
                <p className="text-xs text-slate-500">Authorized medical distributors</p>
              </div>
              <button
                onClick={() => setShowSupplierModal(true)}
                className="px-2.5 py-1 bg-slate-900 text-white rounded text-xs font-semibold cursor-pointer"
              >
                + Add Supplier
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px]">
                  <tr>
                    <th className="px-3 py-2">Supplier Name</th>
                    <th className="px-3 py-2">Contact Person</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {suppliers.map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{s.name}</td>
                      <td className="px-3 py-2 text-slate-600">{s.contact_person || s.phone || "—"}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${s.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
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
                          className="text-[11px] text-teal-600 hover:text-teal-800 font-medium cursor-pointer"
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
        </div>
      )}

      {/* TAB 6: TRANSACTION HISTORY & REPORTS (Module 17) */}
      {activeTab === "reports" && (
        <PharmacyReports session={session} />
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE / EDIT MEDICINE FORM */}
      {/* ========================================================================= */}
      {showMedicineModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full max-h-[88vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                {editingMedicine ? `Edit Medicine #${editingMedicine.sku}` : "Register New Medicine Formulation"}
              </h3>
              <button onClick={() => setShowMedicineModal(false)} className="text-slate-400 hover:text-slate-600 text-base">✕</button>
            </div>

            <form onSubmit={handleSaveMedicine} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">SKU Code (Optional auto-gen)</label>
                  <input
                    type="text"
                    value={medicineForm.sku}
                    onChange={(e) => setMedicineForm({ ...medicineForm, sku: e.target.value })}
                    placeholder="e.g. MED-PARA-500"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Brand / Display Name *</label>
                  <input
                    type="text"
                    required
                    value={medicineForm.name}
                    onChange={(e) => setMedicineForm({ ...medicineForm, name: e.target.value })}
                    placeholder="e.g. Paracetamol 650"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Category</label>
                  <CustomDropdown
                    value={medicineForm.category_id}
                    onChange={(val) => setMedicineForm({ ...medicineForm, category_id: val })}
                    options={[
                      { value: "", label: "None / Unassigned" },
                      ...categories.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                    placeholder="Select Category"
                    align="left"
                    menuClassName="w-full"
                    maxHeight="max-h-48"
                    searchable={false}
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Strength</label>
                  <input
                    type="text"
                    value={medicineForm.strength}
                    onChange={(e) => setMedicineForm({ ...medicineForm, strength: e.target.value })}
                    placeholder="e.g. 650 mg"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Dosage Form</label>
                  <CustomDropdown
                    value={medicineForm.form}
                    onChange={(val) => setMedicineForm({ ...medicineForm, form: val })}
                    options={[
                      { value: "Tablet", label: "Tablet" },
                      { value: "Capsule", label: "Capsule" },
                      { value: "Syrup", label: "Syrup" },
                      { value: "Injection", label: "Injection" },
                      { value: "Inhaler", label: "Inhaler" },
                      { value: "Ointment", label: "Ointment" },
                      { value: "Powder", label: "Powder" },
                      { value: "Drops", label: "Drops" },
                    ]}
                    placeholder="Select Form"
                    align="right"
                    menuClassName="w-full min-w-[170px]"
                    maxHeight="max-h-48"
                    searchable={false}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Generic / Active Salt</label>
                  <input
                    type="text"
                    value={medicineForm.generic_name}
                    onChange={(e) => setMedicineForm({ ...medicineForm, generic_name: e.target.value })}
                    placeholder="e.g. Acetaminophen"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Purchase Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={medicineForm.purchase_price}
                    onChange={(e) => setMedicineForm({ ...medicineForm, purchase_price: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Sale Price ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={medicineForm.sale_price}
                    onChange={(e) => setMedicineForm({ ...medicineForm, sale_price: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Max Permitted Discount (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={medicineForm.max_discount_percent}
                    onChange={(e) => setMedicineForm({ ...medicineForm, max_discount_percent: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Low-Stock Alert Level</label>
                  <input
                    type="number"
                    min="0"
                    value={medicineForm.min_stock_alert_level}
                    onChange={(e) => setMedicineForm({ ...medicineForm, min_stock_alert_level: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowMedicineModal(false)}
                  className="px-3 py-2 border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save Medicine"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: RECEIVE STOCK BATCH */}
      {/* ========================================================================= */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[88vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Receive New Inventory Batch Lot</h3>
              <button onClick={() => setShowBatchModal(false)} className="text-slate-400 hover:text-slate-600 text-base">✕</button>
            </div>

            <form onSubmit={handleReceiveBatch} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Formulary Medicine *</label>
                <MedicineDropdown
                  value={batchForm.medicine_id}
                  medicines={medicines}
                  onChange={(medId) => {
                    const chosenMed = medicines.find((m) => m.id === medId);
                    setBatchForm({
                      ...batchForm,
                      medicine_id: String(medId),
                      purchase_price: chosenMed?.purchase_price || "",
                      sale_price: chosenMed?.sale_price || "",
                    });
                  }}
                  placeholder="Select a medicine to receive..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Batch / Lot Number *</label>
                  <input
                    type="text"
                    required
                    value={batchForm.batch_number}
                    onChange={(e) => setBatchForm({ ...batchForm, batch_number: e.target.value })}
                    placeholder="e.g. LOT-2026-X99"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Supplier</label>
                  <CustomDropdown
                    value={batchForm.supplier_id}
                    onChange={(val) => setBatchForm({ ...batchForm, supplier_id: val })}
                    options={[
                      { value: "", label: "Direct / None" },
                      ...suppliers.map((s) => ({ value: s.id, label: s.name })),
                    ]}
                    placeholder="Select Supplier"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Purchase Date *</label>
                  <input
                    type="date"
                    required
                    value={batchForm.purchase_date}
                    onChange={(e) => setBatchForm({ ...batchForm, purchase_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={batchForm.expiry_date}
                    onChange={(e) => setBatchForm({ ...batchForm, expiry_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Received Units *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={batchForm.quantity}
                    onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })}
                    placeholder="100"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Cost Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={batchForm.purchase_price}
                    onChange={(e) => setBatchForm({ ...batchForm, purchase_price: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Sale Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={batchForm.sale_price}
                    onChange={(e) => setBatchForm({ ...batchForm, sale_price: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Notes / Invoice Ref</label>
                <input
                  type="text"
                  value={batchForm.notes}
                  onChange={(e) => setBatchForm({ ...batchForm, notes: e.target.value })}
                  placeholder="e.g. Purchase order PO-2026-88"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="px-3 py-2 border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Receiving..." : "Receive Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: MANUAL STOCK ADJUSTMENT */}
      {/* ========================================================================= */}
      {showAdjustModal && selectedBatchForAdjust && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[88vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Adjust Batch #{selectedBatchForAdjust.batch_number}</h3>
                <p className="text-xs text-slate-500">{selectedBatchForAdjust.medicine_name} • Current Balance: {selectedBatchForAdjust.current_quantity} units</p>
              </div>
              <button onClick={() => setShowAdjustModal(false)} className="text-slate-400 hover:text-slate-600 text-base">✕</button>
            </div>

            <form onSubmit={handleAdjustStock} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Adjustment Action</label>
                <CustomDropdown
                  value={adjustForm.adjustment_type}
                  onChange={(val) => setAdjustForm({ ...adjustForm, adjustment_type: val })}
                  options={[
                    { value: "deduct", label: "Manual Deduction (Shortage / Correction)" },
                    { value: "add", label: "Manual Addition (Surplus / Re-stock)" },
                    { value: "write_off_expired", label: "Write-off Expired Units" },
                    { value: "write_off_damaged", label: "Write-off Damaged / Broken Units" },
                  ]}
                  placeholder="Select Adjustment Action"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Quantity *</label>
                <input
                  type="number"
                  min="1"
                  max={adjustForm.adjustment_type !== "add" ? selectedBatchForAdjust.current_quantity : undefined}
                  required
                  value={adjustForm.quantity}
                  onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                  placeholder="Number of units"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Mandatory Justification Reason *</label>
                <textarea
                  required
                  rows="3"
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  placeholder="Provide audit justification reason (e.g. Quality check sample destruction, inventory audit reconciliation)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-3 py-2 border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-md cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Applying..." : "Confirm Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: DISPENSE MEDICATIONS (FEFO) */}
      {/* ========================================================================= */}
      {showDispenseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col p-6 overflow-hidden">
            {/* Pinned Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {selectedRxForDispense ? `Prescription Fulfillment & Dispensing` : `Pharmacy Dispensing & FEFO POS`}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedRxForDispense
                    ? `Fulfilling Rx #${selectedRxForDispense.prescription_number} • Patient: ${selectedRxForDispense.patient_name || selectedRxForDispense.patient_id}`
                    : `Earliest expiring eligible lots will be atomically allocated`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDispenseModal(false);
                  setSelectedRxForDispense(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Form with Scrollable Body and Pinned Footer */}
            <form onSubmit={handleReviewDispense} className="flex flex-col flex-1 min-h-0 text-xs">
              <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1">
                {/* Prescription Context Banner */}
                {selectedRxForDispense ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-slate-700">
                      <div>
                        <span className="text-[10px] uppercase text-slate-400 font-semibold block">Patient</span>
                        <span className="font-bold text-slate-900">{selectedRxForDispense.patient_name || `ID #${selectedRxForDispense.patient_id}`}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-slate-400 font-semibold block">Prescription</span>
                        <span className="font-mono font-bold text-teal-700">#{selectedRxForDispense.prescription_number}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-slate-400 font-semibold block">Doctor</span>
                        <span className="font-semibold text-slate-800">{selectedRxForDispense.doctor_name || "Staff Clinician"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-slate-400 font-semibold block">Status</span>
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                          {selectedRxForDispense.status?.replace("_", " ") || "Active"}
                        </span>
                      </div>
                    </div>

                    {/* Linked Bill Selection (Lesson 15.2) */}
                    <div className="pt-2 border-t border-slate-200/80">
                      <label className="block text-slate-700 font-semibold mb-1">
                        Linked Pharmacy Bill (Lesson 15.2 Verification)
                      </label>
                      {dispenseValidation?.linked_bills && dispenseValidation.linked_bills.length > 0 ? (
                        <div className="flex items-center space-x-2">
                          <select
                            value={dispenseForm.bill_id || ""}
                            onChange={(e) => setDispenseForm({ ...dispenseForm, bill_id: e.target.value })}
                            className="flex-1 px-3 py-1.5 border border-slate-300 rounded-md bg-white text-xs focus:ring-1 focus:ring-teal-500"
                          >
                            <option value="">Direct Clinical Dispensing (No Linked Bill)</option>
                            {dispenseValidation.linked_bills.map((b) => (
                              <option key={b.id} value={b.id}>
                                Bill #{b.bill_number} — Status: {b.status.toUpperCase()} (${parseFloat(b.grand_total || b.total_amount || 0).toFixed(2)})
                              </option>
                            ))}
                          </select>
                          {dispenseForm.bill_id && (
                            <span className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold uppercase">
                              Linked
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded px-2.5 py-1.5 flex items-center justify-between">
                          <span>No linked billing invoice recorded. Proceeding with clinical dispensation.</span>
                          <span className="text-slate-400 font-mono text-[10px]">Clinical Only</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Patient User ID *</label>
                      <input
                        type="number"
                        required
                        value={dispenseForm.patient_id}
                        onChange={(e) => setDispenseForm({ ...dispenseForm, patient_id: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Payment Method</label>
                      <CustomDropdown
                        value={dispenseForm.payment_method}
                        onChange={(val) => setDispenseForm({ ...dispenseForm, payment_method: val })}
                        options={[
                          { value: "cash", label: "Cash" },
                          { value: "card", label: "Card" },
                          { value: "upi", label: "UPI / Mobile" },
                          { value: "insurance", label: "Insurance Claim" },
                        ]}
                        placeholder="Select Payment Method"
                      />
                    </div>
                  </div>
                )}

                {/* Items List Box */}
                <div className="border border-slate-200 rounded-md p-3 bg-slate-50/50 space-y-2 relative z-30">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                    <span className="font-semibold text-slate-700">
                      {selectedRxForDispense ? "Prescribed Medicines to Dispense" : `Dispensation Items (${dispenseForm.items.length})`}
                    </span>
                    {!selectedRxForDispense && (
                      <button
                        type="button"
                        onClick={() => {
                          if (medicines.length === 0) return alert("No medicines available");
                          const nextIndex = dispenseForm.items.length % medicines.length;
                          const nextMed = medicines[nextIndex] || medicines[0];
                          setDispenseForm({
                            ...dispenseForm,
                            items: [
                              ...dispenseForm.items,
                              { medicine_id: nextMed.id, requested_quantity: 1, discount_percent: 0 },
                            ],
                          });
                        }}
                        className="text-[11px] text-teal-600 hover:text-teal-800 font-bold cursor-pointer"
                      >
                        + Add Drug
                      </button>
                    )}
                  </div>

                  {dispenseForm.items.length === 0 ? (
                    <div className="py-6 text-center text-slate-400 text-xs">
                      No medication items to dispense.
                    </div>
                  ) : selectedRxForDispense ? (
                    /* Detailed Prescription Items Table with Batch Diagnostics */
                    <div className="space-y-3">
                      {dispenseForm.items.map((item, idx) => (
                        <div key={idx} className="bg-white p-3 rounded border border-slate-200 shadow-2xs space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <div>
                              <span className="font-bold text-slate-900 text-sm">{item.name}</span>
                              <span className="text-[10px] text-slate-500 ml-2 font-mono">
                                {item.form} {item.strength ? `• ${item.strength}` : ""}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-[11px] text-slate-600">
                                Rx: <strong className="font-mono">{item.prescribed_quantity}</strong> |
                                Dispensed: <strong className="font-mono">{item.dispensed_quantity}</strong> |
                                Remaining: <strong className="font-mono text-teal-700">{item.max_allowed}</strong>
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                            <div className="flex items-center space-x-2">
                              <span className="text-[10px] text-slate-500 font-semibold uppercase">Stock Available:</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${item.available_stock >= item.max_allowed
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : item.available_stock > 0
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-rose-50 text-rose-700 border border-rose-200"
                                }`}>
                                {item.available_stock} units
                              </span>
                            </div>

                            <div className="flex items-center space-x-2">
                              <label className="text-[11px] font-semibold text-slate-700">Dispense Qty:</label>
                              <input
                                type="number"
                                min="0"
                                max={item.max_allowed}
                                value={item.requested_quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  const updated = [...dispenseForm.items];
                                  updated[idx].requested_quantity = isNaN(val) ? 0 : Math.min(Math.max(0, val), item.max_allowed);
                                  setDispenseForm({ ...dispenseForm, items: updated });
                                }}
                                className="w-20 px-2 py-1 border border-slate-300 rounded font-mono font-bold text-xs text-center focus:ring-1 focus:ring-teal-500"
                              />
                              <span className="text-[10px] text-slate-400">/ {item.max_allowed} max</span>
                            </div>
                          </div>

                          {/* FEFO Batch Preview (Lesson 15.3) */}
                          {item.batches && item.batches.length > 0 && (
                            <div className="pt-1.5 border-t border-slate-100 text-[10px] text-slate-500">
                              <span className="font-semibold text-slate-600 block mb-1">FEFO Batch Allocation Queue:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {item.batches.map((b, bIdx) => (
                                  <span key={bIdx} className="px-2 py-0.5 bg-slate-50 border border-slate-200 rounded font-mono text-[9px] text-slate-600">
                                    Lot #{b.batch_number} • Exp: {String(b.expiry_date).slice(0, 10)} • Stock: {b.current_quantity}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Standard POS Item List */
                    <div className="space-y-2">
                      {dispenseForm.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="relative flex items-center space-x-2 bg-white p-2 rounded border border-slate-200 shadow-2xs"
                          style={{ zIndex: Math.max(1, 40 - idx) }}
                        >
                          <MedicineDropdown
                            value={item.medicine_id}
                            medicines={medicines}
                            onChange={(medId) => {
                              const updated = [...dispenseForm.items];
                              updated[idx].medicine_id = medId;
                              setDispenseForm({ ...dispenseForm, items: updated });
                            }}
                          />

                          <div className="flex flex-col">
                            <input
                              type="number"
                              min="1"
                              title="Requested Quantity"
                              placeholder="Qty"
                              value={item.requested_quantity}
                              onChange={(e) => {
                                const updated = [...dispenseForm.items];
                                updated[idx].requested_quantity = parseInt(e.target.value, 10) || 1;
                                setDispenseForm({ ...dispenseForm, items: updated });
                              }}
                              className="w-16 px-2 py-1.5 border border-slate-300 rounded text-xs text-center"
                            />
                          </div>

                          <div className="flex flex-col">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              title="Discount %"
                              placeholder="Disc %"
                              value={item.discount_percent}
                              onChange={(e) => {
                                const updated = [...dispenseForm.items];
                                updated[idx].discount_percent = parseFloat(e.target.value) || 0;
                                setDispenseForm({ ...dispenseForm, items: updated });
                              }}
                              className="w-16 px-2 py-1.5 border border-slate-300 rounded text-xs text-center"
                            />
                          </div>

                          <button
                            type="button"
                            title="Remove drug item"
                            onClick={() => {
                              const updated = dispenseForm.items.filter((_, i) => i !== idx);
                              setDispenseForm({ ...dispenseForm, items: updated });
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1 font-bold cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Dispensing Notes / Special Instructions</label>
                  <input
                    type="text"
                    value={dispenseForm.notes}
                    onChange={(e) => setDispenseForm({ ...dispenseForm, notes: e.target.value })}
                    placeholder="e.g. Dispensed with patient counseling"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Pinned Sticky Action Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200 shrink-0">
                <div className="text-xs text-slate-500 font-mono">
                  {dispenseForm.items.reduce((sum, it) => sum + (parseInt(it.requested_quantity, 10) || 0), 0)} unit(s) selected
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDispenseModal(false);
                      setSelectedRxForDispense(null);
                    }}
                    className="px-3 py-2 border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || dispenseForm.items.length === 0}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    Review &amp; Authorize Dispense
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4B: DISPENSE CONFIRMATION DIALOG (LESSON 15.4) */}
      {/* ========================================================================= */}
      {showConfirmDispenseModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 font-bold text-lg shrink-0">
                ✓
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Authorize Medicine Dispensation</h3>
                <p className="text-slate-500 text-[11px]">Lesson 15.4 Confirmation &amp; Inventory Authorization</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-amber-800 text-[11px] leading-relaxed">
              <strong>Notice:</strong> This action will atomically deduct inventory from eligible non-expired batches using
              FEFO rules, update the prescription status, and log the transaction in the stock movement ledger.
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Patient:</span>
                <span className="font-bold text-slate-800">{selectedRxForDispense?.patient_name || `ID #${dispenseForm.patient_id}`}</span>
              </div>
              {selectedRxForDispense && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Prescription:</span>
                  <span className="font-bold text-teal-700">#{selectedRxForDispense.prescription_number}</span>
                </div>
              )}
              {dispenseForm.bill_id ? (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Linked Bill:</span>
                  <span className="font-bold text-slate-800">
                    {dispenseValidation?.linked_bills?.find((b) => String(b.id) === String(dispenseForm.bill_id))?.bill_number || `Bill #${dispenseForm.bill_id}`}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Linked Bill:</span>
                  <span className="text-slate-400 italic">None (Clinical Dispense)</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-1.5">
                <span className="text-slate-500 font-sans block mb-1">Medications to Deduct:</span>
                {dispenseForm.items
                  .filter((it) => (parseInt(it.requested_quantity, 10) || 0) > 0)
                  .map((it, idx) => (
                    <div key={idx} className="flex justify-between text-slate-900 py-0.5">
                      <span>• {it.name}:</span>
                      <span className="font-bold">{it.requested_quantity} unit(s)</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowConfirmDispenseModal(false)}
                className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer font-medium"
              >
                Back to Edit
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleExecuteDispense}
                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {submitting ? "Allocating Stock..." : "Confirm & Dispense"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: DISPENSATION RECEIPT VIEW (LESSON 15.10) */}
      {/* ========================================================================= */}
      {showReceiptModal && dispensationReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="text-center border-b border-slate-200 pb-3">
              <span className="text-emerald-600 font-bold text-2xl block">✔</span>
              <h3 className="font-bold text-slate-900 text-base">Pharmacy Dispensing Receipt</h3>
              <p className="text-xs font-mono text-slate-500">#{dispensationReceipt.dispensation_number}</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Patient</span>
                <span className="font-bold text-slate-900">{dispensationReceipt.patient_name || `ID #${dispenseForm.patient_id}`}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Dispensed By</span>
                <span className="font-semibold text-slate-800">{dispensationReceipt.dispensed_by_name || session?.user?.name || "Pharmacy Staff"}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Prescription</span>
                <span className="font-mono font-bold text-teal-700">
                  {dispensationReceipt.prescription_number ? `#${dispensationReceipt.prescription_number}` : (selectedRxForDispense?.prescription_number ? `#${selectedRxForDispense.prescription_number}` : "Direct POS")}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Linked Bill</span>
                <span className="font-mono text-slate-700">
                  {dispensationReceipt.bill_number ? `#${dispensationReceipt.bill_number}` : "Clinical Direct"}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {dispensationReceipt.items?.map((item, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 block">{item.medicine_name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {item.batch_number ? `Batch #${item.batch_number}` : `Batch #${item.batch_id}`} • {item.quantity} unit(s) @ ${parseFloat(item.unit_sale_price).toFixed(2)}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-900">${parseFloat(item.total_price).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 pt-2 space-y-1 text-right font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span>${parseFloat(dispensationReceipt.subtotal || dispensationReceipt.total_amount || 0).toFixed(2)}</span>
                </div>
                {parseFloat(dispensationReceipt.discount_amount) > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount Applied:</span>
                    <span>-${parseFloat(dispensationReceipt.discount_amount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-slate-900 border-t border-slate-200 pt-1">
                  <span>Total Dispensed Value:</span>
                  <span>${parseFloat(dispensationReceipt.total_amount || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 font-medium text-xs cursor-pointer flex items-center space-x-1"
              >
                <span>🖨 Print Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-md text-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: CREATE CATEGORY */}
      {/* ========================================================================= */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Add Medicine Category</h3>
              <button onClick={() => setShowCategoryModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  placeholder="e.g. Anticonvulsants"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Description</label>
                <textarea
                  rows="3"
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  placeholder="Therapeutic classification details..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-slate-900 text-white font-semibold rounded cursor-pointer disabled:opacity-50"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: CREATE SUPPLIER */}
      {/* ========================================================================= */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Add Pharmaceutical Supplier</h3>
              <button onClick={() => setShowSupplierModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Supplier / Firm Name *</label>
                <input
                  type="text"
                  required
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  placeholder="e.g. Cardinal Health Distribution"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Contact Person</label>
                <input
                  type="text"
                  value={supplierForm.contact_person}
                  onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
                  placeholder="e.g. Jane Doe"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Phone</label>
                  <input
                    type="text"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    placeholder="+1-555-0199"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Email</label>
                  <input
                    type="email"
                    value={supplierForm.email}
                    onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                    placeholder="orders@supplier.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Address</label>
                <input
                  type="text"
                  value={supplierForm.address}
                  onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  placeholder="Warehouse location..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-teal-500"
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
                  className="px-4 py-1.5 bg-slate-900 text-white font-semibold rounded cursor-pointer disabled:opacity-50"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 8: PRESCRIPTION DETAILS & AUDIT TRAIL */}
      {/* ========================================================================= */}
      {showRxModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Prescription Details &amp; Lifecycle Audit
                </h3>
                {selectedRxDetails && (
                  <span className="text-[11px] font-mono text-teal-700">
                    Rx #{selectedRxDetails.prescription_number}
                  </span>
                )}
              </div>
              <button onClick={() => setShowRxModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            {detailsLoading || !selectedRxDetails ? (
              <div className="py-12 text-center text-slate-400">Loading prescription audit trail...</div>
            ) : (
              <div className="space-y-4">
                {/* Prescription Meta */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-md border border-slate-200 text-slate-700">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Patient</span>
                    <strong className="text-slate-900">{selectedRxDetails.patient_name}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Prescribing Doctor</span>
                    <strong className="text-slate-900">Dr. {selectedRxDetails.doctor_name}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Consultation Date</span>
                    <span className="font-mono">{new Date(selectedRxDetails.consultation_date || selectedRxDetails.created_at).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Status</span>
                    <span className="font-bold uppercase text-teal-800">{selectedRxDetails.status}</span>
                  </div>
                </div>

                {/* Medication Items */}
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-900 text-xs">Prescribed Medication Line Items</h4>
                  <div className="border border-slate-200 rounded-md overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase">
                        <tr>
                          <th className="px-3 py-2">Medicine</th>
                          <th className="px-3 py-2">Dosage / Freq</th>
                          <th className="px-3 py-2">Timing</th>
                          <th className="px-3 py-2">Prescribed</th>
                          <th className="px-3 py-2">Dispensed</th>
                          <th className="px-3 py-2 text-right">Remaining</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedRxDetails.items?.map((it) => (
                          <tr key={it.id}>
                            <td className="px-3 py-2 font-semibold text-slate-900">
                              {it.medicine_name}
                              {it.instructions && (
                                <span className="text-[10px] text-slate-400 block font-normal italic">{it.instructions}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-600">
                              {it.dosage} &bull; {it.frequency}
                            </td>
                            <td className="px-3 py-2 capitalize">{it.timing?.replace("_", " ")}</td>
                            <td className="px-3 py-2 font-mono font-bold text-slate-800">{it.quantity}</td>
                            <td className="px-3 py-2 font-mono text-emerald-700 font-bold">{it.dispensed_quantity || 0}</td>
                            <td className="px-3 py-2 font-mono text-right font-bold text-slate-700">
                              {Math.max(0, (it.quantity || 0) - (it.dispensed_quantity || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Status Audit Trail Timeline */}
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-900 text-xs">Status Transition History &amp; Audit Trail</h4>
                  <div className="border border-slate-200 rounded-md overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase">
                        <tr>
                          <th className="px-3 py-2">Timestamp</th>
                          <th className="px-3 py-2">Action / Transition</th>
                          <th className="px-3 py-2">Authorized User</th>
                          <th className="px-3 py-2">Audit Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {!selectedRxDetails.status_history || selectedRxDetails.status_history.length === 0 ? (
                          <tr>
                            <td colSpan="4" className="px-3 py-3 text-center text-slate-400">
                              No previous status transitions recorded.
                            </td>
                          </tr>
                        ) : (
                          selectedRxDetails.status_history.map((h) => (
                            <tr key={h.id}>
                              <td className="px-3 py-2 text-slate-500">{new Date(h.created_at).toLocaleString()}</td>
                              <td className="px-3 py-2">
                                <span className="font-bold text-slate-700">{h.from_status || "origin"}</span>
                                <span className="mx-1 text-slate-400">&rarr;</span>
                                <span className="font-bold text-teal-700">{h.to_status}</span>
                              </td>
                              <td className="px-3 py-2 text-slate-800">{h.changed_by_name} ({h.changed_by_role})</td>
                              <td className="px-3 py-2 text-slate-600 font-sans italic">{h.reason || "—"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Linked Pharmacy Dispensations */}
                {selectedRxDetails.dispensations && selectedRxDetails.dispensations.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-900 text-xs">Linked Pharmacy Dispensation Receipts</h4>
                    <div className="border border-slate-200 rounded-md overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase">
                          <tr>
                            <th className="px-3 py-2">Receipt #</th>
                            <th className="px-3 py-2">Dispensed By</th>
                            <th className="px-3 py-2">Payment</th>
                            <th className="px-3 py-2">Total Amount</th>
                            <th className="px-3 py-2 text-right">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedRxDetails.dispensations.map((d) => (
                            <tr key={d.id}>
                              <td className="px-3 py-2 font-mono font-bold text-teal-700">{d.dispensation_number}</td>
                              <td className="px-3 py-2">{d.dispensed_by_name}</td>
                              <td className="px-3 py-2 uppercase font-mono text-[10px]">{d.payment_method}</td>
                              <td className="px-3 py-2 font-mono font-bold text-emerald-700">${parseFloat(d.total_amount).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right text-slate-500 font-mono text-[11px]">{new Date(d.created_at).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowRxModal(false)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold cursor-pointer"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 9: CANCEL PRESCRIPTION */}
      {/* ========================================================================= */}
      {showCancelModal && cancellingRx && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-rose-800 text-sm">Cancel Prescription</h3>
              <button onClick={() => setShowCancelModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <p className="text-slate-600 leading-relaxed">
              Are you sure you want to cancel Prescription <strong>#{cancellingRx.prescription_number}</strong>?
              This action will prevent any further pharmacy dispensing and log an immutable audit event.
            </p>

            <form onSubmit={handleConfirmCancel} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Mandatory Audit Justification Reason *
                </label>
                <textarea
                  required
                  rows="3"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Incompatible medication dosage flagged during pharmacy review; replacement requested."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                >
                  Keep Active
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-rose-600 text-white font-semibold rounded cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODULE 14 MODAL: COLLECT PAYMENT */}
      {/* ========================================================================= */}
      {showCollectPaymentModal && selectedBillForPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Collect Bill Payment</h3>
                <span className="font-mono text-teal-700 text-[11px]">Bill #{selectedBillForPayment.bill_number}</span>
              </div>
              <button onClick={() => setShowCollectPaymentModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded space-y-1 font-mono">
              <div className="flex justify-between text-slate-600">
                <span>Grand Total:</span>
                <strong>₹{parseFloat(selectedBillForPayment.grand_total).toFixed(2)}</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Already Paid:</span>
                <span className="text-emerald-700 font-semibold">₹{parseFloat(selectedBillForPayment.paid_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-1">
                <span>Balance Due:</span>
                <span>₹{parseFloat(selectedBillForPayment.balance_due).toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handleConfirmPayment} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Payment Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={selectedBillForPayment.balance_due}
                  required
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-xs focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Payment Mode *</label>
                <div className="grid grid-cols-3 gap-2">
                  {["cash", "upi", "card"].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentForm({ ...paymentForm, payment_method: mode })}
                      className={`py-1.5 rounded font-bold uppercase tracking-wider text-[11px] border cursor-pointer transition ${paymentForm.payment_method === mode
                        ? "bg-teal-600 text-white border-teal-600 shadow-xs"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                        }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {paymentForm.payment_method === "upi" && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">UPI Transaction Ref / UTR *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 123456789012"
                    value={paymentForm.transaction_reference}
                    onChange={(e) => setPaymentForm({ ...paymentForm, transaction_reference: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-xs focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              )}

              {paymentForm.payment_method === "card" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Card Network</label>
                      <select
                        value={paymentForm.card_network}
                        onChange={(e) => setPaymentForm({ ...paymentForm, card_network: e.target.value })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                      >
                        <option value="Visa">Visa</option>
                        <option value="Mastercard">Mastercard</option>
                        <option value="RuPay">RuPay</option>
                        <option value="Amex">American Express</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Last 4 Digits *</label>
                      <input
                        type="text"
                        maxLength="4"
                        pattern="\d{4}"
                        required
                        placeholder="e.g. 4242"
                        value={paymentForm.card_last4}
                        onChange={(e) => setPaymentForm({ ...paymentForm, card_last4: e.target.value })}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    🔒 PCI-DSS Compliant: Never enter or record CVVs, PINs, or full card numbers.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Optional Notes</label>
                <input
                  type="text"
                  placeholder="Receipt note or comment..."
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCollectPaymentModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {submitting ? "Processing..." : `Record ₹${parseFloat(paymentForm.amount || 0).toFixed(2)} Payment`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODULE 14 MODAL: TAX INVOICE PREVIEW & PRINTABLE VIEW */}
      {/* ========================================================================= */}
      {showInvoiceModal && selectedInvoiceData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto no-scrollbar">
          <div className="bg-white border border-slate-200 rounded-lg shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col font-sans overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header Toolbar */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-xs font-mono">
                  TAX
                </div>
                <div>
                  <h3 className="text-sm font-bold font-mono text-slate-900 tracking-tight">
                    Official Tax Invoice #{selectedInvoiceData.invoice_number}
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Statutory 12% GST Applied • {new Date(selectedInvoiceData.invoice_date).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Print Invoice</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  className="text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 p-1.5 rounded transition cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Invoice Printable Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs no-scrollbar bg-white">
              {/* Hospital & Patient Details Grid */}
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{selectedInvoiceData.hospital?.name}</h4>
                  <p className="text-slate-500 text-[11px] mt-0.5">{selectedInvoiceData.hospital?.address || "Hospital Pharmacy Dispensing Unit"}</p>
                  <p className="text-slate-500 text-[11px] font-mono">Contact: {selectedInvoiceData.hospital?.phone || "--"}</p>
                  <p className="text-slate-500 text-[11px]">Email: {selectedInvoiceData.hospital?.email || "--"}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Billed To (Patient)</span>
                  <strong className="text-slate-900 text-sm block">{selectedInvoiceData.patient?.name}</strong>
                  <span className="text-slate-500 font-mono text-[11px] block">{selectedInvoiceData.patient?.phone || "--"}</span>
                  <span className="text-slate-500 font-mono text-[11px] block">{selectedInvoiceData.patient?.email || "--"}</span>
                  <span className="text-[10px] text-teal-700 font-mono mt-1 inline-block">
                    Ref: {selectedInvoiceData.prescription?.number}
                  </span>
                </div>
              </div>

              {/* Prescribed Medicine Items Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="ent-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Medicine &amp; Spec</th>
                      <th className="text-center">Qty</th>
                      <th className="text-right">Unit Price</th>
                      <th className="text-right">Discount</th>
                      <th className="text-right">Taxable</th>
                      <th className="text-right">GST (12%)</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoiceData.items?.map((it, idx) => (
                      <tr key={idx}>
                        <td className="font-mono text-slate-400 text-center">{idx + 1}</td>
                        <td className="font-semibold text-slate-900">
                          {it.name}
                          {it.dosage_form && (
                            <span className="ml-1.5 px-1 py-0.2 rounded text-[10px] bg-slate-100 text-slate-600 font-normal">
                              {it.dosage_form}
                            </span>
                          )}
                        </td>
                        <td className="text-center font-mono font-bold text-slate-800">{it.quantity}</td>
                        <td className="text-right font-mono">₹{parseFloat(it.unit_price).toFixed(2)}</td>
                        <td className="text-right font-mono text-emerald-600">-₹{parseFloat(it.discount_amount || 0).toFixed(2)}</td>
                        <td className="text-right font-mono font-medium">₹{parseFloat(it.taxable_amount).toFixed(2)}</td>
                        <td className="text-right font-mono text-sky-700">+₹{parseFloat(it.gst_amount).toFixed(2)}</td>
                        <td className="text-right font-mono font-bold text-slate-900">₹{parseFloat(it.line_total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Calculation Breakdown Box */}
              <div className="flex justify-end">
                <div className="w-72 bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Gross Subtotal:</span>
                    <span>₹{parseFloat(selectedInvoiceData.financials?.subtotal || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount:</span>
                    <span>-₹{parseFloat(selectedInvoiceData.financials?.discount_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-700 font-semibold border-t border-slate-200 pt-1">
                    <span>Taxable Base:</span>
                    <span>₹{parseFloat(selectedInvoiceData.financials?.taxable_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sky-700 font-bold">
                    <span>Statutory 12% GST:</span>
                    <span>+₹{parseFloat(selectedInvoiceData.financials?.gst_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-bold text-sm border-t-2 border-slate-300 pt-1.5 font-sans">
                    <span>Grand Total:</span>
                    <span className="font-mono">₹{parseFloat(selectedInvoiceData.financials?.grand_total || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-semibold pt-1 border-t border-slate-200">
                    <span>Amount Cleared:</span>
                    <span>₹{parseFloat(selectedInvoiceData.financials?.paid_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-rose-600 font-bold">
                    <span>Balance Due:</span>
                    <span>₹{parseFloat(selectedInvoiceData.financials?.balance_due || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Payments & Receipts Audit */}
              {selectedInvoiceData.payments && selectedInvoiceData.payments.length > 0 && (
                <div className="space-y-1.5">
                  <h5 className="font-bold text-slate-900 text-[11px] uppercase tracking-wider">Settlement Transactions</h5>
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <table className="ent-table text-[11px]">
                      <thead>
                        <tr>
                          <th>Receipt #</th>
                          <th>Method</th>
                          <th>Status</th>
                          <th className="text-right">Amount</th>
                          <th className="text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedInvoiceData.payments.map((p, i) => (
                          <tr key={i}>
                            <td className="font-mono font-bold text-teal-700">{p.receipt_number}</td>
                            <td className="uppercase font-mono">{p.payment_method}</td>
                            <td className="uppercase font-bold text-emerald-700">{p.payment_status}</td>
                            <td className="text-right font-mono font-bold">₹{parseFloat(p.amount).toFixed(2)}</td>
                            <td className="text-right font-mono text-slate-500">{new Date(p.created_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Email Action Bar */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="email"
                    placeholder="Recipient email address..."
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded text-xs w-64 focus:ring-1 focus:ring-teal-500"
                  />
                  <button
                    type="button"
                    disabled={emailSending}
                    onClick={handleSendInvoiceEmail}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded font-semibold cursor-pointer disabled:opacity-50 shadow-2xs"
                  >
                    {emailSending ? "Sending..." : "Email Invoice"}
                  </button>
                </div>
                <span className="text-[11px] text-slate-400">
                  Dispensed by {selectedInvoiceData.pharmacist_name || "Licensed Pharmacist"}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowInvoiceModal(false)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODULE 14 MODAL: RECORD OUTSIDE PHARMACY PURCHASE */}
      {/* ========================================================================= */}
      {showOutsidePurchaseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-scrollbar">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4 text-xs font-sans">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Record Outside Pharmacy Purchase</h3>
                <span className="text-[11px] text-slate-500">Zero hospital stock deduction • External chemist purchase tracking</span>
              </div>
              <button onClick={() => setShowOutsidePurchaseModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveOutsidePurchase} className="space-y-3">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-slate-700 font-semibold">Patient User ID *</label>
                  <span className="text-[10px] text-slate-400">Must be a registered patient user</span>
                </div>
                <input
                  type="number"
                  required
                  placeholder="e.g. 430"
                  value={outsidePurchaseForm.patient_id}
                  onChange={(e) => setOutsidePurchaseForm({ ...outsidePurchaseForm, patient_id: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-xs focus:ring-1 focus:ring-teal-500"
                />
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-500">Quick Select:</span>
                  <button
                    type="button"
                    onClick={() => setOutsidePurchaseForm({ ...outsidePurchaseForm, patient_id: "430" })}
                    className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[10px] hover:bg-sky-100 font-mono"
                  >
                    #430 (Undhad Harshil)
                  </button>
                  {allPrescriptions && allPrescriptions[0]?.patient_id && allPrescriptions[0].patient_id !== 430 && (
                    <button
                      type="button"
                      onClick={() => setOutsidePurchaseForm({ ...outsidePurchaseForm, patient_id: String(allPrescriptions[0].patient_id) })}
                      className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] hover:bg-slate-200 font-mono"
                    >
                      #{allPrescriptions[0].patient_id} ({allPrescriptions[0].patient_name || "Patient"})
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">External Pharmacy / Chemist *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apollo Pharmacy #12"
                    value={outsidePurchaseForm.external_pharmacy_name}
                    onChange={(e) => setOutsidePurchaseForm({ ...outsidePurchaseForm, external_pharmacy_name: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">External Bill / Receipt #</label>
                  <input
                    type="text"
                    placeholder="e.g. APL-99212"
                    value={outsidePurchaseForm.external_bill_number}
                    onChange={(e) => setOutsidePurchaseForm({ ...outsidePurchaseForm, external_bill_number: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-xs"
                  />
                </div>
              </div>

              {/* Items Dynamic List */}
              <div className="space-y-2 border-t border-slate-100 pt-2">
                <div className="flex justify-between items-center">
                  <label className="block text-slate-700 font-semibold">Purchased Medications</label>
                  <button
                    type="button"
                    onClick={() => setOutsidePurchaseForm({
                      ...outsidePurchaseForm,
                      items: [...outsidePurchaseForm.items, { medicine_name: "", quantity: 1, unit_price: "" }],
                    })}
                    className="text-sky-600 hover:text-sky-800 font-semibold cursor-pointer"
                  >
                    + Add Drug
                  </button>
                </div>

                {outsidePurchaseForm.items.map((it, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      required
                      placeholder="Medicine name..."
                      value={it.medicine_name}
                      onChange={(e) => {
                        const newItems = [...outsidePurchaseForm.items];
                        newItems[idx].medicine_name = e.target.value;
                        setOutsidePurchaseForm({ ...outsidePurchaseForm, items: newItems });
                      }}
                      className="flex-2 px-2 py-1.5 border border-slate-300 rounded text-xs"
                    />
                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="Qty"
                      value={it.quantity}
                      onChange={(e) => {
                        const newItems = [...outsidePurchaseForm.items];
                        newItems[idx].quantity = e.target.value;
                        setOutsidePurchaseForm({ ...outsidePurchaseForm, items: newItems });
                      }}
                      className="w-16 px-2 py-1.5 border border-slate-300 rounded text-center font-mono text-xs"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Price (₹)"
                      value={it.unit_price}
                      onChange={(e) => {
                        const newItems = [...outsidePurchaseForm.items];
                        newItems[idx].unit_price = e.target.value;
                        setOutsidePurchaseForm({ ...outsidePurchaseForm, items: newItems });
                      }}
                      className="w-24 px-2 py-1.5 border border-slate-300 rounded text-right font-mono text-xs"
                    />
                    {outsidePurchaseForm.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newItems = outsidePurchaseForm.items.filter((_, i) => i !== idx);
                          setOutsidePurchaseForm({ ...outsidePurchaseForm, items: newItems });
                        }}
                        className="text-rose-500 hover:text-rose-700 font-bold p-1"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Purchased outside hospital during late-night hours"
                  value={outsidePurchaseForm.notes}
                  onChange={(e) => setOutsidePurchaseForm({ ...outsidePurchaseForm, notes: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowOutsidePurchaseModal(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save External Purchase"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODULE 14 MODAL: BILL DETAILS & AUDIT VIEW */}
      {/* ========================================================================= */}
      {showBillDetailsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 text-xs no-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Pharmacy Bill Audit &amp; Settlements</h3>
                {selectedBillDetails && (
                  <span className="font-mono text-teal-700 text-[11px]">Bill #{selectedBillDetails.bill_number}</span>
                )}
              </div>
              <button onClick={() => setShowBillDetailsModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            {detailsLoading || !selectedBillDetails ? (
              <div className="py-12 text-center text-slate-400">Loading bill audit data...</div>
            ) : (
              <div className="space-y-4">
                {/* Meta details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-md border border-slate-200 text-slate-700">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Patient</span>
                    <strong className="text-slate-900">{selectedBillDetails.patient_name}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Rx Number</span>
                    <span className="font-mono">{selectedBillDetails.prescription_number || "Direct OTC"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Bill Date</span>
                    <span className="font-mono">{new Date(selectedBillDetails.created_at).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Status</span>
                    <span className="font-bold uppercase text-teal-800">{selectedBillDetails.status}</span>
                  </div>
                </div>

                {/* Line Items */}
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-900 text-xs">Billed Medication Line Items</h4>
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <table className="ent-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th className="text-center">Qty</th>
                          <th className="text-right">Unit Price</th>
                          <th className="text-right">Taxable</th>
                          <th className="text-right">GST (12%)</th>
                          <th className="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedBillDetails.items?.map((it) => (
                          <tr key={it.id}>
                            <td className="font-semibold text-slate-900">{it.medicine_name}</td>
                            <td className="text-center font-mono font-bold text-slate-800">{it.quantity}</td>
                            <td className="text-right font-mono">₹{parseFloat(it.unit_price).toFixed(2)}</td>
                            <td className="text-right font-mono">₹{parseFloat(it.taxable_amount).toFixed(2)}</td>
                            <td className="text-right font-mono text-sky-700">+₹{parseFloat(it.gst_amount).toFixed(2)}</td>
                            <td className="text-right font-mono font-bold text-slate-900">₹{parseFloat(it.line_total).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Payments */}
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-900 text-xs">Payment Receipts</h4>
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <table className="ent-table">
                      <thead>
                        <tr>
                          <th>Receipt #</th>
                          <th>Method</th>
                          <th>Status</th>
                          <th className="text-right">Amount</th>
                          <th className="text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!selectedBillDetails.payments || selectedBillDetails.payments.length === 0 ? (
                          <tr>
                            <td colSpan="5" className="p-4 text-center text-slate-400">No payment receipts recorded yet.</td>
                          </tr>
                        ) : (
                          selectedBillDetails.payments.map((p) => (
                            <tr key={p.id}>
                              <td className="font-mono font-bold text-teal-700">{p.receipt_number}</td>
                              <td className="uppercase font-mono">{p.payment_method}</td>
                              <td className="uppercase font-bold text-emerald-700">{p.payment_status}</td>
                              <td className="text-right font-mono font-bold">₹{parseFloat(p.amount).toFixed(2)}</td>
                              <td className="text-right">
                                {p.payment_status === "completed" && (
                                  <button
                                    type="button"
                                    onClick={() => handleRefundPayment(p.id)}
                                    className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[10px] font-semibold hover:bg-rose-100 cursor-pointer"
                                  >
                                    Refund
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Refunds */}
                {selectedBillDetails.refunds && selectedBillDetails.refunds.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="font-bold text-rose-800 text-xs">Refund History</h4>
                    <div className="border border-rose-200 bg-rose-50/30 rounded overflow-hidden">
                      <table className="ent-table">
                        <thead>
                          <tr>
                            <th>Refund #</th>
                            <th>Reason</th>
                            <th className="text-right">Refund Amount</th>
                            <th className="text-right">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedBillDetails.refunds.map((r) => (
                            <tr key={r.id}>
                              <td className="font-mono font-bold text-rose-700">{r.refund_number}</td>
                              <td>{r.reason}</td>
                              <td className="text-right font-mono font-bold text-rose-700">₹{parseFloat(r.refund_amount).toFixed(2)}</td>
                              <td className="text-right font-mono text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowBillDetailsModal(false)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold cursor-pointer"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
