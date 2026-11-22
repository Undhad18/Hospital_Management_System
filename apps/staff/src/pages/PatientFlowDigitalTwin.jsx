import { useState, useEffect } from "react";
import { getDigitalTwinPatientFlow } from "../services/api";
import { subscribeToEvent } from "../services/socket";

const STAGES = [
  { id: "appointment", label: "1. Appointment", desc: "Booked in advance" },
  { id: "checked_in", label: "2. Check-In", desc: "Arrived at facility" },
  { id: "waiting", label: "3. Waiting Room", desc: "Awaiting consultation" },
  { id: "in_consultation", label: "4. Consultation", desc: "With attending physician" },
  { id: "laboratory", label: "5. Laboratory", desc: "Diagnostics in progress" },
  { id: "prescription", label: "6. Prescription", desc: "Medication ordered" },
  { id: "billing", label: "7. Invoicing", desc: "Consultation / tests billed" },
  { id: "pharmacy", label: "8. Pharmacy Queue", desc: "Awaiting dispensary" },
  { id: "dispensing", label: "9. Dispensation", desc: "Medication packaging" },
  { id: "completed", label: "10. Discharged", desc: "Completed visit" },
];

export default function PatientFlowDigitalTwin({ session }) {
  const token = session.token;
  const [flowData, setFlowData] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadFlow();
  }, [token]);

  // Real-time synchronization
  useEffect(() => {
    const unsub = subscribeToEvent(
      "digital_twin:update",
      () => loadFlow(false),
      token
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [token]);

  async function loadFlow(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await getDigitalTwinPatientFlow(token);
      if (res.success && res.data) {
        setFlowData(res.data);
      }
    } catch (err) {
      setError("Failed to load Patient Flow Digital Twin: " + err.message);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  const activePatients = (flowData?.active_patients || []).filter((p) => {
    const matchesSearch = searchTerm
      ? (p.patient_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.appointment_number || "").toLowerCase().includes(searchTerm.toLowerCase())
      : true;
    const matchesStage = selectedStage ? p.stage === selectedStage : true;
    return matchesSearch && matchesStage;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
            <h2 className="text-base font-bold text-slate-900">
              10-Stage Patient Flow Operational Pipeline
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time operational tracking of patients traversing outpatient intake, consultation, diagnostics, pharmacy, and discharge.
          </p>
        </div>

        <button
          onClick={() => loadFlow(true)}
          className="self-start md:self-auto px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition"
        >
          Refresh Flow
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold">×</button>
        </div>
      )}

      {/* 10-Stage Visual Pipeline Ribbon */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">
          Operational Stage Velocity
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {STAGES.map((s, idx) => {
            const count = flowData?.stages?.[s.id] || 0;
            const isSelected = selectedStage === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedStage(isSelected ? null : s.id)}
                className={`p-3 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? "bg-sky-50 border-sky-400 ring-2 ring-sky-300"
                    : count > 0
                    ? "bg-slate-50 border-slate-200 hover:bg-slate-100"
                    : "bg-white border-slate-200 opacity-70"
                }`}
              >
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block truncate">{s.label}</span>
                  <span className="text-lg font-bold text-slate-900 block mt-1">{count}</span>
                </div>
                <span className="text-[9px] text-slate-400 block truncate mt-1">{s.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Patients Tracker Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
          <div className="flex items-center space-x-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Active Patient Operational Roster
            </h3>
            {selectedStage && (
              <span className="text-[10px] font-semibold bg-sky-100 text-sky-800 px-2 py-0.5 rounded">
                Filtered: {STAGES.find((s) => s.id === selectedStage)?.label}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Search by patient name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-sky-500"
            />
            {selectedStage && (
              <button
                onClick={() => setSelectedStage(null)}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium px-2 py-1"
              >
                Clear Filter
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {activePatients.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">
              No active patients found matching current filters.
            </p>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3">Patient Name</th>
                  <th className="p-3">Appt Number</th>
                  <th className="p-3">Current Stage</th>
                  <th className="p-3">Attending Physician</th>
                  <th className="p-3">Department</th>
                  <th className="p-3 text-right">Elapsed Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activePatients.map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-semibold text-slate-900">{p.patient_name}</td>
                    <td className="p-3 font-mono text-slate-500">{p.appointment_number}</td>
                    <td className="p-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 uppercase">
                        {p.stage}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700">{p.doctor_name || "Triage / General"}</td>
                    <td className="p-3 text-slate-500">{p.department_name}</td>
                    <td className="p-3 text-right font-mono font-medium text-slate-600">
                      {p.duration_mins ? `~${p.duration_mins} mins` : "< 15 mins"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
