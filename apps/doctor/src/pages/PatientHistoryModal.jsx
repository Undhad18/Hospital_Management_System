import { useState, useEffect } from "react";
import { getPatientConsultationHistory } from "../services/api";

export default function PatientHistoryModal({ patientId, patientName, token, onClose }) {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [patientDetails, setPatientDetails] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!patientId || !token) return;
    setLoading(true);
    setError("");
    getPatientConsultationHistory(token, patientId)
      .then((res) => {
        setHistory(res.data || []);
        setPatientDetails(res.patient || null);
      })
      .catch((err) => {
        setError(err.message || "Failed to load patient history.");
      })
      .finally(() => setLoading(false));
  }, [patientId, token]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col font-sans overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Electronic Health Record &amp; Consultation History
            </h2>
            <p className="text-xs text-slate-500">
              Patient: <strong className="text-slate-800">{patientName || patientDetails?.full_name}</strong>
              {patientDetails?.blood_group && (
                <span className="ml-2 font-semibold text-rose-600">
                  (Blood: {patientDetails.blood_group})
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-10 text-xs text-slate-400">Loading historical clinical records...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400">
              No historical clinical records found for this patient.
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((rec) => (
                <div key={rec.id} className="border border-slate-200 rounded-lg p-4 bg-white shadow-xs space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2 text-xs">
                    <div className="space-x-2">
                      <span className="font-bold text-slate-900">{rec.formatted_started_at || rec.started_at}</span>
                      <span className="font-mono text-slate-500">{rec.appointment_number}</span>
                      <span className="text-teal-700 font-semibold">• Dr. {rec.doctor_name}</span>
                      <span className="text-slate-400">({rec.hospital_name})</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase">
                      {rec.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-slate-500 font-semibold">Chief Complaint:</p>
                      <p className="text-slate-800">{rec.chief_complaint || "--"}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-semibold">Working Diagnosis:</p>
                      <p className="text-slate-900 font-medium">{rec.diagnosis || "--"}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-semibold">Examination Findings:</p>
                      <p className="text-slate-800">{rec.examination_findings || "--"}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-semibold">Treatment Plan &amp; Advice:</p>
                      <p className="text-slate-800">{rec.treatment_plan || rec.advice || "--"}</p>
                    </div>
                  </div>

                  {rec.vitals && (
                    <div className="p-2 bg-slate-50 rounded border border-slate-100 text-[11px] font-mono flex flex-wrap gap-x-4 gap-y-1">
                      {rec.vitals.systolic_bp && (
                        <span>BP: {rec.vitals.systolic_bp}/{rec.vitals.diastolic_bp} mmHg</span>
                      )}
                      {rec.vitals.pulse_rate && <span>Pulse: {rec.vitals.pulse_rate} bpm</span>}
                      {rec.vitals.temperature && <span>Temp: {rec.vitals.temperature}°F</span>}
                      {rec.vitals.oxygen_saturation && <span>SpO2: {rec.vitals.oxygen_saturation}%</span>}
                      {rec.vitals.bmi && <span>BMI: {rec.vitals.bmi}</span>}
                    </div>
                  )}

                  {rec.investigations?.length > 0 && (
                    <div className="text-xs pt-1">
                      <span className="font-semibold text-slate-700">Lab &amp; Diagnostic Orders: </span>
                      <span className="text-slate-800">
                        {rec.investigations.map((inv) => `${inv.test_name} (${inv.priority})`).join(", ")}
                      </span>
                    </div>
                  )}

                  {rec.prescription?.items?.length > 0 && (
                    <div className="text-xs pt-1 border-t border-slate-100">
                      <span className="font-semibold text-slate-700">Medications: </span>
                      <span className="text-slate-800">
                        {rec.prescription.items.map((i) => `${i.medicine_name} ${i.dosage} [${i.frequency}] for ${i.duration}`).join("; ")}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
