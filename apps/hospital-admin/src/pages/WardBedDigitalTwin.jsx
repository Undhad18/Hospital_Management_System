import { useState, useEffect } from "react";
import { getDigitalTwinWards } from "../services/api";
import { subscribeToEvent } from "../services/socket";

export default function WardBedDigitalTwin({ session }) {
  const token = session.token;
  const [wards, setWards] = useState([]);
  const [selectedBed, setSelectedBed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadWards();
  }, [token]);

  // Real-time synchronization
  useEffect(() => {
    const unsub = subscribeToEvent(
      "digital_twin:update",
      () => loadWards(false),
      token
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [token]);

  async function loadWards(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await getDigitalTwinWards(token);
      if (res.success && res.data) {
        setWards(res.data.wards || []);
      }
    } catch (err) {
      setError("Failed to load Ward Digital Twin: " + err.message);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <h2 className="text-base font-bold text-slate-900">
              Inpatient Ward &amp; Spatial Bed Digital Twin
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time visual map of inpatient beds, occupancy telemetry, and admission tracking.
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center space-x-4 text-xs font-medium">
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500 border border-emerald-600"></span>
            <span className="text-slate-600">Available</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-amber-500 border border-amber-600"></span>
            <span className="text-slate-600">Occupied</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-slate-400 border border-slate-500"></span>
            <span className="text-slate-600">Maintenance</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold">×</button>
        </div>
      )}

      {loading && wards.length === 0 && (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-400 text-xs">
          Loading spatial ward configurations...
        </div>
      )}

      {/* Ward Cards Grid */}
      <div className="space-y-6">
        {wards.map((ward, wardIdx) => {
          const wardId = ward.wardId || ward.id || wardIdx;
          const wardName = ward.wardName || ward.name;
          const departmentName = ward.departmentName || ward.department_name;
          const totalBeds = ward.totalBeds || ward.total_beds || ward.capacity || 0;
          const availableBeds = ward.availableBeds || ward.available_beds || 0;
          const occupiedBeds = ward.occupiedBeds || ward.occupied_beds || 0;
          const maintenanceBeds = ward.maintenanceBeds || ward.maintenance_beds || 0;
          const occupancyPct = ward.occupancyPercentage ?? ward.occupancy_pct ?? 0;

          return (
            <div key={wardId} className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
              {/* Ward Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <span>{wardName}</span>
                    <span className="text-[11px] font-normal text-slate-500 font-mono">
                      ({departmentName})
                    </span>
                  </h3>
                  <div className="flex items-center space-x-3 text-xs text-slate-500 mt-1 font-mono">
                    <span>Capacity: {totalBeds} beds</span>
                    <span>•</span>
                    <span className="text-emerald-700 font-semibold">Available: {availableBeds}</span>
                    <span>•</span>
                    <span className="text-amber-700 font-semibold">Occupied: {occupiedBeds}</span>
                    <span>•</span>
                    <span className="text-slate-400">Maint: {maintenanceBeds}</span>
                  </div>
                </div>

                {/* Occupancy Badge & Bar */}
                <div className="flex items-center space-x-3">
                  <div className="w-24 bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        occupancyPct >= 85 ? "bg-rose-500" : occupancyPct >= 60 ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(occupancyPct, 100)}%` }}
                    ></div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    occupancyPct >= 85
                      ? "bg-rose-100 text-rose-800"
                      : occupancyPct >= 60
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}>
                    {occupancyPct}%
                  </span>
                </div>
              </div>

              {/* Spatial Bed Matrix */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {ward.beds && ward.beds.map((bed, bedIdx) => {
                  const bedId = bed.bedId || bed.id || bedIdx;
                  const bedNumber = bed.bedNumber || bed.bed_number;
                  const isOccupied = bed.status === "occupied";
                  const isMaintenance = bed.status === "maintenance";
                  const isAvailable = bed.status === "available";

                  return (
                    <button
                      key={bedId}
                      onClick={() => setSelectedBed({ ...bed, wardName })}
                      className={`p-3 rounded-lg border text-center transition cursor-pointer flex flex-col items-center justify-center space-y-1 ${
                        isOccupied
                          ? "bg-amber-50/70 border-amber-300 text-amber-900 hover:bg-amber-100"
                          : isMaintenance
                          ? "bg-slate-100 border-slate-300 text-slate-500 cursor-not-allowed"
                          : "bg-emerald-50/70 border-emerald-300 text-emerald-900 hover:bg-emerald-100"
                      }`}
                    >
                      <svg className={`w-5 h-5 ${
                        isOccupied ? "text-amber-600" : isMaintenance ? "text-slate-400" : "text-emerald-600"
                      }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                      <span className="font-bold text-xs">{bedNumber}</span>
                      <span className="text-[9px] uppercase font-mono tracking-wider font-semibold">
                        {bed.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ================= BED DETAILS MODAL ================= */}
      {selectedBed && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Bed #{selectedBed.bedNumber || selectedBed.bed_number} Telemetry
              </h3>
              <button
                onClick={() => setSelectedBed(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ×
              </button>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Status:</span>
                <span className={`font-bold uppercase ${
                  selectedBed.status === "occupied" ? "text-amber-600" : selectedBed.status === "maintenance" ? "text-slate-500" : "text-emerald-600"
                }`}>
                  {selectedBed.status}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Ward:</span>
                <span className="font-semibold text-slate-800">{selectedBed.wardName || selectedBed.ward_name}</span>
              </div>
              {(selectedBed.occupant?.patientName || selectedBed.patient_name) && (
                <>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Admitted Patient:</span>
                    <span className="font-semibold text-slate-800">{selectedBed.occupant?.patientName || selectedBed.patient_name}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Admission Code:</span>
                    <span className="font-mono text-slate-700">{selectedBed.occupant?.admissionCode || selectedBed.admission_code}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Admitted At:</span>
                    <span className="text-slate-700">{new Date(selectedBed.occupant?.admittedAt || selectedBed.admitted_at).toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedBed(null)}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded transition"
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
