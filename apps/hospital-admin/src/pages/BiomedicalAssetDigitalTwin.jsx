import { useState, useEffect } from "react";
import {
  getDigitalTwinBiomedicalAssets,
  relocateDigitalTwinBiomedicalAsset,
  updateDigitalTwinBiomedicalAssetMaintenance,
} from "../services/api";
import { subscribeToEvent } from "../services/socket";

export default function BiomedicalAssetDigitalTwin({ session }) {
  const token = session?.token;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedFloor, setSelectedFloor] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeViewTab, setActiveViewTab] = useState("fleet"); // "fleet" | "logs"

  // Modals
  const [relocateModal, setRelocateModal] = useState(null); // asset object
  const [relocateForm, setRelocateForm] = useState({
    to_location: "",
    floor_level: 1,
    assigned_patient_name: "",
    assigned_doctor_name: "",
    notes: "",
  });

  const [maintModal, setMaintModal] = useState(null); // asset object
  const [maintForm, setMaintForm] = useState({
    action: "sanitized",
    notes: "",
  });

  useEffect(() => {
    loadAssetsTwin();
  }, [token]);

  // Real-time Socket.IO synchronization
  useEffect(() => {
    const unsub = subscribeToEvent(
      "digital_twin:update",
      () => {
        loadAssetsTwin(false);
      },
      token
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [token]);

  async function loadAssetsTwin(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const result = await getDigitalTwinBiomedicalAssets(token);
      setData(result);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError("Failed to load Biomedical Assets: " + err.message);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function handleRelocateSubmit(e) {
    e.preventDefault();
    if (!relocateModal?.id || !relocateForm.to_location) return;
    setActionLoading(true);
    try {
      await relocateDigitalTwinBiomedicalAsset(token, {
        assetId: relocateModal.id,
        to_location: relocateForm.to_location,
        floor_level: Number(relocateForm.floor_level),
        assigned_patient_name: relocateForm.assigned_patient_name || null,
        assigned_doctor_name: relocateForm.assigned_doctor_name || null,
        performed_by: session?.user?.name || "Biomedical Specialist",
        notes: relocateForm.notes,
      });
      setRelocateModal(null);
      await loadAssetsTwin(false);
    } catch (err) {
      alert("Relocation failed: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleMaintSubmit(e) {
    e.preventDefault();
    if (!maintModal?.id || !maintForm.action) return;
    setActionLoading(true);
    try {
      await updateDigitalTwinBiomedicalAssetMaintenance(token, {
        assetId: maintModal.id,
        action: maintForm.action,
        notes: maintForm.notes,
        performed_by: session?.user?.name || "Biomedical Engineer",
      });
      setMaintModal(null);
      await loadAssetsTwin(false);
    } catch (err) {
      alert("Maintenance update failed: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  const overview = data?.overview || {};
  const assets = data?.assets || [];
  const logs = data?.recent_logs || [];
  const categories = overview.categories || {};

  // Filtered Assets
  const filteredAssets = assets.filter((a) => {
    if (selectedCategory !== "all" && a.category !== selectedCategory) return false;
    if (selectedFloor !== "all" && String(a.floor_level) !== String(selectedFloor)) return false;
    if (selectedStatus !== "all" && a.status !== selectedStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTag = a.asset_tag?.toLowerCase().includes(q);
      const matchName = a.name?.toLowerCase().includes(q);
      const matchLoc = a.current_location_zone?.toLowerCase().includes(q);
      const matchPat = a.assigned_patient_name?.toLowerCase().includes(q);
      if (!matchTag && !matchName && !matchLoc && !matchPat) return false;
    }
    return true;
  });

  function getStatusBadge(status) {
    switch (status) {
      case "in_use":
        return { label: "IN ACTIVE USE", bg: "bg-purple-100 text-purple-800 border-purple-300", pulse: true };
      case "available_standby":
        return { label: "READY / STANDBY", bg: "bg-emerald-100 text-emerald-800 border-emerald-300", pulse: false };
      case "maintenance_due":
        return { label: "CALIBRATION DUE", bg: "bg-amber-100 text-amber-800 border-amber-300", pulse: false };
      case "sanitization_required":
        return { label: "SANITATION NEEDED", bg: "bg-rose-100 text-rose-800 border-rose-300", pulse: true };
      default:
        return { label: status?.toUpperCase() || "FAULT", bg: "bg-slate-100 text-slate-700 border-slate-300", pulse: false };
    }
  }

  function getBatteryColor(pct) {
    if (pct > 50) return "bg-emerald-500";
    if (pct > 20) return "bg-amber-500";
    return "bg-rose-500";
  }

  function getCategoryLabel(cat) {
    switch (cat) {
      case "mechanical_ventilator": return "Ventilator";
      case "defibrillator": return "Defibrillator";
      case "infusion_pump": return "Infusion / Syringe";
      case "portable_imaging": return "Portable Imaging";
      case "crash_cart": return "Crash Cart";
      case "dialysis_machine": return "Dialysis / CRRT";
      default: return cat?.replace(/_/g, " ");
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Card */}
      <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5 mb-1">
              <span className="relative flex h-3.5 w-3.5">
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
                BIOMEDICAL ASSET TWIN
              </span>
              <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                IoT Telemetry &amp; Location Tracking
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">
              Hospital Biomedical Equipment &amp; Asset Tracking Twin
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1">
              Real-time BLE/RFID spatial location tracking, battery charge telemetry, preventive calibration, and clinical dispatch.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => loadAssetsTwin(true)}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition flex items-center space-x-1.5"
            >
              <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh Fleet</span>
            </button>
            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
              Sync: {lastUpdated || "Live"}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Top Executive Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Monitored Fleet</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">
            {overview.total_assets || 0} <span className="text-xs text-slate-400 font-normal">Devices</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">100% BLE Tagged</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">In Active Clinical Use</div>
          <div className="text-2xl font-bold text-purple-600 mt-1">
            {overview.in_use || 0}
          </div>
          <div className="text-[11px] text-purple-600 font-medium mt-0.5">
            {overview.fleet_utilization_rate || 0}% Fleet Utilization
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Emergency Standby Ready</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {overview.available_standby || 0}
          </div>
          <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Calibrated &amp; Stationed</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Maintenance / Calibration Due</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">
            {overview.maintenance_due || 0}
          </div>
          <div className="text-[11px] text-amber-600 font-medium mt-0.5">Scheduled Inspection</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm col-span-2 md:col-span-1">
          <div className="text-xs text-slate-500 font-medium">Sanitization / Battery Alerts</div>
          <div className="text-2xl font-bold text-rose-600 mt-1">
            {(overview.sanitization_required || 0) + (overview.low_battery_count || 0)}
          </div>
          <div className="text-[11px] text-rose-600 font-medium mt-0.5">Terminal Wipe &amp; Charge</div>
        </div>
      </div>

      {/* 3. Category Readiness Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
          Critical Life-Support Asset Availability
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
            <div className="text-[11px] font-semibold text-slate-600">Ventilators</div>
            <div className="text-lg font-bold text-slate-900 mt-1">
              {categories.ventilators?.available || 0} / {categories.ventilators?.total || 0}
            </div>
            <div className="text-[10px] text-emerald-600 font-medium">Ready for Intake</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
            <div className="text-[11px] font-semibold text-slate-600">Defibrillators</div>
            <div className="text-lg font-bold text-slate-900 mt-1">
              {categories.defibrillators?.available || 0} / {categories.defibrillators?.total || 0}
            </div>
            <div className="text-[10px] text-emerald-600 font-medium">Biphasic Verified</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
            <div className="text-[11px] font-semibold text-slate-600">Infusion / Syringe</div>
            <div className="text-lg font-bold text-slate-900 mt-1">
              {categories.infusion_pumps?.available || 0} / {categories.infusion_pumps?.total || 0}
            </div>
            <div className="text-[10px] text-slate-500">Channels Free</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
            <div className="text-[11px] font-semibold text-slate-600">Portable Imaging</div>
            <div className="text-lg font-bold text-slate-900 mt-1">
              {categories.portable_imaging?.available || 0} / {categories.portable_imaging?.total || 0}
            </div>
            <div className="text-[10px] text-slate-500">X-Ray &amp; POCUS</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
            <div className="text-[11px] font-semibold text-slate-600">Crash Carts</div>
            <div className="text-lg font-bold text-slate-900 mt-1">
              {categories.crash_carts?.available || 0} / {categories.crash_carts?.total || 0}
            </div>
            <div className="text-[10px] text-emerald-600 font-medium">Sealed &amp; Stocked</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
            <div className="text-[11px] font-semibold text-slate-600">Dialysis / CRRT</div>
            <div className="text-lg font-bold text-slate-900 mt-1">
              {categories.dialysis?.available || 0} / {categories.dialysis?.total || 0}
            </div>
            <div className="text-[10px] text-slate-500">Prismaflex Units</div>
          </div>
        </div>
      </div>

      {/* 4. Filter & View Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex border border-slate-200 rounded-lg overflow-hidden mr-2">
            <button
              onClick={() => setActiveViewTab("fleet")}
              className={`px-3 py-1.5 font-semibold transition ${
                activeViewTab === "fleet" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Device Roster ({filteredAssets.length})
            </button>
            <button
              onClick={() => setActiveViewTab("logs")}
              className={`px-3 py-1.5 font-semibold transition ${
                activeViewTab === "logs" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Dispatch Logs ({logs.length})
            </button>
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-emerald-500 focus:border-emerald-500"
          >
            <option value="all">All Equipment Categories</option>
            <option value="mechanical_ventilator">Mechanical Ventilators</option>
            <option value="defibrillator">Defibrillators</option>
            <option value="infusion_pump">Infusion &amp; Syringe Pumps</option>
            <option value="portable_imaging">Portable Imaging (X-Ray/USG)</option>
            <option value="crash_cart">Crash Carts</option>
            <option value="dialysis_machine">Dialysis / CRRT</option>
          </select>

          <select
            value={selectedFloor}
            onChange={(e) => setSelectedFloor(e.target.value)}
            className="border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-emerald-500 focus:border-emerald-500"
          >
            <option value="all">All Floors</option>
            <option value="0">Level 0 (OPD / ER / Rad)</option>
            <option value="1">Level 1 (ICU / Wards)</option>
            <option value="2">Level 2 (OT Suite)</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-emerald-500 focus:border-emerald-500"
          >
            <option value="all">All Statuses</option>
            <option value="in_use">In Use</option>
            <option value="available_standby">Available / Standby</option>
            <option value="maintenance_due">Maintenance Due</option>
            <option value="sanitization_required">Sanitization Required</option>
          </select>

          {(selectedCategory !== "all" || selectedFloor !== "all" || selectedStatus !== "all" || searchQuery) && (
            <button
              onClick={() => {
                setSelectedCategory("all");
                setSelectedFloor("all");
                setSelectedStatus("all");
                setSearchQuery("");
              }}
              className="text-emerald-600 hover:text-emerald-800 font-semibold px-2"
            >
              Reset
            </button>
          )}
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search tag, name, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 w-full md:w-64 focus:ring-emerald-500 focus:border-emerald-500"
          />
          <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* 5. CONTENT: FLEET ROSTER */}
      {activeViewTab === "fleet" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssets.length > 0 ? (
            filteredAssets.map((asset) => {
              const badge = getStatusBadge(asset.status);
              return (
                <div
                  key={asset.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition flex flex-col justify-between space-y-4"
                >
                  {/* Top: Tag, Category, Status */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold bg-slate-900 text-white px-2 py-0.5 rounded">
                          {asset.asset_tag}
                        </span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                          {asset.rfid_beacon_id}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${badge.bg}`}>
                        {badge.label}
                      </span>
                    </div>

                    <h4 className="font-bold text-slate-900 text-sm">{asset.name}</h4>
                    <div className="text-[11px] text-slate-500 font-medium">
                      {asset.model_number} • S/N: {asset.serial_number}
                    </div>
                  </div>

                  {/* Middle: Location, Floor, Battery, Patient */}
                  <div className="p-3 bg-slate-50 rounded-lg space-y-2 border border-slate-100 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Current Location:</span>
                      <span className="font-semibold text-slate-900 truncate max-w-[170px]" title={asset.current_location_zone}>
                        {asset.current_location_zone}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Floor Level:</span>
                      <span className="font-semibold text-slate-800">
                        Level {asset.floor_level} {asset.floor_level === 0 ? "(OPD/ER)" : asset.floor_level === 1 ? "(ICU/Wards)" : "(OT Suite)"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                      <span className="text-slate-500 font-medium">Battery Charge:</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${getBatteryColor(asset.battery_percentage)}`}
                            style={{ width: `${asset.battery_percentage}%` }}
                          ></div>
                        </div>
                        <span className="font-mono font-bold text-[11px] text-slate-700">
                          {asset.battery_percentage}%
                        </span>
                      </div>
                    </div>

                    {asset.assigned_patient_name && (
                      <div className="pt-1 border-t border-slate-200/60">
                        <div className="text-[10px] uppercase font-bold text-purple-700">Patient Deployment</div>
                        <div className="font-semibold text-slate-900 text-xs">{asset.assigned_patient_name}</div>
                        {asset.assigned_doctor_name && (
                          <div className="text-[10px] text-slate-500">Order by {asset.assigned_doctor_name}</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Notes / Clinical State */}
                  {asset.notes && (
                    <div className="text-[11px] text-slate-600 italic bg-amber-50/60 p-2 rounded border border-amber-100">
                      &ldquo;{asset.notes}&rdquo;
                    </div>
                  )}

                  {/* Bottom Action Buttons */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end space-x-2">
                    <button
                      onClick={() => {
                        setMaintModal(asset);
                        setMaintForm({ action: "sanitized", notes: "" });
                      }}
                      className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                    >
                      Service &amp; Sanitization
                    </button>

                    <button
                      onClick={() => {
                        setRelocateModal(asset);
                        setRelocateForm({
                          to_location: asset.current_location_zone,
                          floor_level: asset.floor_level,
                          assigned_patient_name: asset.assigned_patient_name || "",
                          assigned_doctor_name: asset.assigned_doctor_name || "",
                          notes: "",
                        });
                      }}
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition shadow-sm"
                    >
                      Dispatch / Relocate &rarr;
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-12 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
              No biomedical assets match the selected filters.
            </div>
          )}
        </div>
      )}

      {/* 5B. CONTENT: DISPATCH LOGS */}
      {activeViewTab === "logs" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Recent Equipment Dispatch &amp; Relocation Audit Log</h3>
            <span className="text-xs text-slate-500">Real-time BLE/RFID beacon movement logs</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Device Tag</th>
                  <th className="py-2.5 px-3">Device Name</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">From Location</th>
                  <th className="py-2.5 px-3">To Location</th>
                  <th className="py-2.5 px-3">Dispatched By</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.length > 0 ? (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{log.asset_tag}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">{log.asset_name}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{log.from_location}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{log.to_location}</td>
                      <td className="py-2.5 px-3 text-slate-700">{log.performed_by}</td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-slate-400">
                      Zero historical dispatch logs recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. MODAL: RELOCATE / DISPATCH ASSET */}
      {relocateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Dispatch / Relocate Equipment</h3>
                <p className="text-xs text-slate-300">
                  {relocateModal.asset_tag} — {relocateModal.name}
                </p>
              </div>
              <button onClick={() => setRelocateModal(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleRelocateSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Destination Zone</label>
                <input
                  type="text"
                  value={relocateForm.to_location}
                  onChange={(e) => setRelocateForm({ ...relocateForm, to_location: e.target.value })}
                  placeholder="e.g. CCU Bed 102, OT Suite 1, Emergency Trauma Bay"
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Floor Level</label>
                <select
                  value={relocateForm.floor_level}
                  onChange={(e) => setRelocateForm({ ...relocateForm, floor_level: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5"
                >
                  <option value={0}>Ground Floor (Level 0 - OPD, ER, Radiology)</option>
                  <option value={1}>1st Floor (Level 1 - ICU, CCU, Inpatient Wards)</option>
                  <option value={2}>2nd Floor (Level 2 - Operation Theaters, Dialysis)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Assigned Inpatient (Optional)</label>
                <input
                  type="text"
                  value={relocateForm.assigned_patient_name}
                  onChange={(e) => setRelocateForm({ ...relocateForm, assigned_patient_name: e.target.value })}
                  placeholder="e.g. Vikram Verma (Leave blank if returning to standby depot)"
                  className="w-full border border-slate-300 rounded-lg p-2.5"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ordering Physician (Optional)</label>
                <input
                  type="text"
                  value={relocateForm.assigned_doctor_name}
                  onChange={(e) => setRelocateForm({ ...relocateForm, assigned_doctor_name: e.target.value })}
                  placeholder="e.g. Dr. Sarah Jenkins"
                  className="w-full border border-slate-300 rounded-lg p-2.5"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Dispatch Notes</label>
                <textarea
                  rows="2"
                  value={relocateForm.notes}
                  onChange={(e) => setRelocateForm({ ...relocateForm, notes: e.target.value })}
                  placeholder="e.g. Transferred for emergency mechanical ventilation support."
                  className="w-full border border-slate-300 rounded-lg p-2.5"
                ></textarea>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRelocateModal(null)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-900/30"
                >
                  {actionLoading ? "Dispatching..." : "Confirm Relocation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL: MAINTENANCE & SANITIZATION */}
      {maintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Service &amp; Sanitization</h3>
                <p className="text-xs text-slate-300">
                  {maintModal.asset_tag} — {maintModal.name}
                </p>
              </div>
              <button onClick={() => setMaintModal(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleMaintSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Action Type</label>
                <select
                  value={maintForm.action}
                  onChange={(e) => setMaintForm({ ...maintForm, action: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-emerald-500 focus:border-emerald-500 font-medium"
                >
                  <option value="sanitized">Terminal Sanitization &amp; Battery Full Charge (Returns to Ready)</option>
                  <option value="maintenance_completed">Preventive Calibration Completed (Extends 6 Months)</option>
                  <option value="sent_to_sanitization">Mark as Sanitization Required (Terminal UV Wipe)</option>
                  <option value="reported_fault">Report Mechanical / Electrical Fault</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Maintenance / Inspection Notes</label>
                <textarea
                  rows="3"
                  value={maintForm.notes}
                  onChange={(e) => setMaintForm({ ...maintForm, notes: e.target.value })}
                  placeholder="e.g. Replaced O2 sensor; flow sensor zero-calibrated successfully."
                  className="w-full border border-slate-300 rounded-lg p-2.5"
                ></textarea>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMaintModal(null)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-900/30"
                >
                  {actionLoading ? "Updating..." : "Record Action"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
