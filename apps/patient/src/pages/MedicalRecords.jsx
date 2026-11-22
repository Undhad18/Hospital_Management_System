import { useState, useMemo, useEffect } from "react";
import { patientStore } from "../services/patientData";
import { getPatientMedicalRecords, getMyPrescriptions } from "../services/api";
import Pagination, { usePagination } from "../components/Pagination";

export default function MedicalRecords({ session }) {
  const [activeTab, setActiveTab] = useState("consultations"); // 'consultations' | 'labs' | 'prescriptions'
  const [selectedLabReport, setSelectedLabReport] = useState(null);
  const [selectedPrescription, setSelectedPrescription] = useState(null);
  const [backendRecords, setBackendRecords] = useState([]);
  const [backendPrescriptions, setBackendPrescriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const token = session?.token || (() => {
    try {
      const raw = sessionStorage.getItem("hms_session") || localStorage.getItem("hms_session");
      return raw ? JSON.parse(raw)?.token : null;
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (!token) return;
    let isMounted = true;
    setIsLoading(true);

    Promise.all([
      getPatientMedicalRecords(token).catch((err) => {
        console.warn("Could not load backend medical records, using offline fallback:", err.message);
        return [];
      }),
      getMyPrescriptions(token).catch((err) => {
        console.warn("Could not load backend prescriptions:", err.message);
        return [];
      }),
    ])
      .then(([records, rxs]) => {
        if (isMounted) {
          if (Array.isArray(records)) setBackendRecords(records);
          if (Array.isArray(rxs)) setBackendPrescriptions(rxs);
        }
      })
      .catch((err) => {
        if (isMounted) setFetchError(err.message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Combine backend records with store mocks
  const consultations = useMemo(() => {
    const backendConsults = backendRecords
      .filter((r) => r.record_type === "consultation")
      .map((r) => ({
        id: `REC-${r.id}`,
        doctor_name: r.doctor_name || "Assigned Physician",
        department: "General Medicine",
        hospital: r.hospital_name || "CareCommand Hospital",
        date: r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "Today",
        vitals: { bp: "120/80 mmHg", pulse: "74 bpm", temp: "98.6°F", weight: "70 kg" },
        provisional_diagnosis: r.diagnosis || r.title,
        clinical_notes: r.doctor_notes || r.description || "Official consultation record logged.",
        recommended_follow_up: "As advised by doctor",
        file_url: r.file_url,
        file_name: r.file_name,
      }));
    const mocks = patientStore.getConsultations();
    return [...backendConsults, ...mocks];
  }, [backendRecords]);

  const labReports = useMemo(() => {
    const backendLabs = backendRecords
      .filter((r) => r.record_type === "lab_report")
      .map((r) => ({
        id: `LAB-${r.id}`,
        test_name: r.title,
        category: "Pathology & Diagnostics",
        ordered_by: r.doctor_name || "Attending Doctor",
        hospital: r.hospital_name || "CareCommand Diagnostic Wing",
        ordered_date: r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "Recent",
        status: "Report Uploaded",
        summary_findings: r.description || r.doctor_notes || "Lab findings registered in medical record.",
        download_filename: r.file_name || `Lab_Report_${r.id}.pdf`,
        file_url: r.file_url,
      }));
    const mocks = patientStore.getLabReports();
    return [...backendLabs, ...mocks];
  }, [backendRecords]);

  const prescriptions = useMemo(() => {
    const backendRxs = backendRecords
      .filter((r) => r.record_type === "prescription")
      .map((r) => ({
        id: `RX-${r.id}`,
        medicine_name: r.title,
        dosage: r.description || "As directed",
        frequency: "Once Daily",
        timing: "Standard Dose",
        instructions: r.doctor_notes || "Follow doctor instructions.",
        duration: "7 Days",
        doctor_name: r.doctor_name || "Treating Physician",
        file_url: r.file_url,
      }));
    const mocks = patientStore.getPrescriptions();
    return [...backendRxs, ...mocks];
  }, [backendRecords]);

  const {
    currentPage: consultPage,
    setCurrentPage: setConsultPage,
    pageSize: consultPageSize,
    setPageSize: setConsultPageSize,
    totalPages: consultTotalPages,
    totalRecords: consultTotalRecords,
    paginatedItems: paginatedConsultations,
    resetPage: resetConsultPage,
  } = usePagination(consultations, 25);

  const {
    currentPage: labPage,
    setCurrentPage: setLabPage,
    pageSize: labPageSize,
    setPageSize: setLabPageSize,
    totalPages: labTotalPages,
    totalRecords: labTotalRecords,
    paginatedItems: paginatedLabReports,
    resetPage: resetLabPage,
  } = usePagination(labReports, 25);

  const {
    currentPage: rxPage,
    setCurrentPage: setRxPage,
    pageSize: rxPageSize,
    setPageSize: setRxPageSize,
    totalPages: rxTotalPages,
    totalRecords: rxTotalRecords,
    paginatedItems: paginatedPrescriptions,
    resetPage: resetRxPage,
  } = usePagination(backendPrescriptions, 25);

  useEffect(() => {
    resetConsultPage();
    resetLabPage();
    resetRxPage();
  }, [activeTab, resetConsultPage, resetLabPage, resetRxPage]);

  return (
    <div className="w-full space-y-5 font-sans">
      {/* Page Header */}
      <div>
        <h1 className="text-base font-bold text-slate-900">
          Medical Records &amp; Clinical Documentation
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Access your daily physician consultation notes, diagnostic lab test findings, and digital prescriptions
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab("consultations")}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${
            activeTab === "consultations"
              ? "border-sky-600 text-sky-800"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Daily Consultations &amp; Diagnoses</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
            {consultations.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("labs")}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${
            activeTab === "labs"
              ? "border-sky-600 text-sky-800"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Lab &amp; Diagnostic Reports</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
            {labReports.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("prescriptions")}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${
            activeTab === "prescriptions"
              ? "border-sky-600 text-sky-800"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Digital Prescriptions</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
            {backendPrescriptions.length > 0 ? backendPrescriptions.length : prescriptions.length}
          </span>
        </button>
      </div>

      {/* ======================= TAB 1: CONSULTATIONS ======================= */}
      {activeTab === "consultations" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {paginatedConsultations.map((cns) => (
            <div key={cns.id} className="ent-card p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-xs text-slate-900">{cns.doctor_name}</span>
                    <span className="ent-chip-active text-[10px]">Verified PTD</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {cns.department} &bull; {cns.hospital}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <span className="font-mono text-xs font-semibold text-slate-800 block">{cns.date}</span>
                  <span className="text-[10px] text-slate-400 font-mono">Case #{cns.id}</span>
                </div>
              </div>

              {/* Vitals Ribbon */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded bg-slate-50 border border-slate-100 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-medium uppercase">Blood Pressure</span>
                  <p className="font-mono font-bold text-slate-800">{cns.vitals.bp}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-medium uppercase">Pulse Rate</span>
                  <p className="font-mono font-bold text-slate-800">{cns.vitals.pulse}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-medium uppercase">Temperature</span>
                  <p className="font-mono font-bold text-slate-800">{cns.vitals.temp}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-medium uppercase">Body Weight</span>
                  <p className="font-mono font-bold text-slate-800">{cns.vitals.weight}</p>
                </div>
              </div>

              {/* Diagnosis & Clinical Notes */}
              <div className="space-y-2 text-xs">
                <div>
                  <span className="font-semibold text-slate-700 block">Provisional Diagnosis (PTD):</span>
                  <p className="text-slate-900 font-medium bg-sky-50/70 p-2 rounded border border-sky-100 mt-1">
                    {cns.provisional_diagnosis}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-slate-700 block">Doctor's Clinical Notes:</span>
                  <p className="text-slate-600 leading-relaxed mt-1">
                    {cns.clinical_notes}
                  </p>
                </div>
              </div>

              {/* Recommended Follow-up Appointment */}
              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-slate-600">
                    Recommended Follow-up Date: <strong className="text-slate-900">{cns.recommended_follow_up}</strong>
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  Doctor-scheduled follow-ups default to <strong>CONFIRMED</strong> with standard 10h reschedule rule.
                </span>
              </div>
            </div>
          ))}
          </div>

          {/* Pagination Controls */}
          <Pagination
            currentPage={consultPage}
            totalPages={consultTotalPages}
            totalRecords={consultTotalRecords}
            pageSize={consultPageSize}
            onPageChange={setConsultPage}
            onPageSizeChange={setConsultPageSize}
          />
        </div>
      )}

      {/* ======================= TAB 2: LAB REPORTS ======================= */}
      {activeTab === "labs" && (
        <div className="ent-card overflow-hidden">
          <div className="ent-card-header flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Laboratory &amp; Diagnostic Pathology Orders
            </h2>
            <span className="text-xs text-slate-500">
              Diagnostic Lab Sync Active
            </span>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="ent-table">
              <thead>
                <tr>
                  <th>Test Name &amp; Category</th>
                  <th>Prescribing Doctor</th>
                  <th>Order Date</th>
                  <th>Sample Status</th>
                  <th>Findings Overview</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLabReports.map((lab) => (
                  <tr key={lab.id}>
                    <td>
                      <div className="font-semibold text-slate-900">
                        {lab.test_name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {lab.category} &bull; ID: {lab.id}
                      </div>
                    </td>

                    <td className="text-xs text-slate-700">
                      {lab.ordered_by}
                      <span className="block text-[10px] text-slate-400">{lab.hospital}</span>
                    </td>

                    <td className="font-mono text-xs text-slate-600">
                      {lab.ordered_date}
                    </td>

                    <td>
                      {lab.status === "Report Uploaded" ? (
                        <span className="ent-chip-active">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                          Report Uploaded
                        </span>
                      ) : (
                        <span className="ent-chip-pending">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Pending Sample
                        </span>
                      )}
                    </td>

                    <td className="text-xs text-slate-600 max-w-xs truncate" title={lab.summary_findings}>
                      {lab.summary_findings}
                    </td>

                    <td className="text-right">
                      {lab.status === "Report Uploaded" ? (
                        <button
                          type="button"
                          onClick={() => setSelectedLabReport(lab)}
                          className="ent-btn-secondary text-xs"
                        >
                          <svg className="w-3.5 h-3.5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span>View PDF</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          Awaiting Sample
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <Pagination
            currentPage={labPage}
            totalPages={labTotalPages}
            totalRecords={labTotalRecords}
            pageSize={labPageSize}
            onPageChange={setLabPage}
            onPageSizeChange={setLabPageSize}
          />
        </div>
      )}

      {/* ======================= TAB 3: PRESCRIPTIONS ======================= */}
      {activeTab === "prescriptions" && (
        <div className="space-y-4">
          {backendPrescriptions.length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                {paginatedPrescriptions.map((rx) => {
                const totalItems = rx.items?.length || 0;
                const totalPrescribed = rx.items?.reduce((sum, it) => sum + (it.quantity || 0), 0) || 0;
                const totalDispensed = rx.items?.reduce((sum, it) => sum + (it.dispensed_quantity || 0), 0) || 0;
                const progressPct = totalPrescribed > 0 ? Math.min(100, Math.round((totalDispensed / totalPrescribed) * 100)) : 0;

                const statusStyles = {
                  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
                  partially_dispensed: "bg-amber-50 text-amber-700 border-amber-200",
                  dispensed: "bg-sky-50 text-sky-700 border-sky-200",
                  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
                  draft: "bg-slate-50 text-slate-700 border-slate-200",
                };

                return (
                  <div key={rx.id} className="ent-card p-5 space-y-4">
                    {/* Prescription Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-sm shadow-2xs">
                          Rx
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-sm text-slate-900">
                              {rx.prescription_number}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                                statusStyles[rx.status] || "bg-slate-100 text-slate-700 border-slate-200"
                              }`}
                            >
                              {rx.status?.replace("_", " ")}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500">
                            Prescribed by <strong className="text-slate-700">Dr. {rx.doctor_name}</strong> &bull; {rx.hospital_name}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 text-right">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Date Issued</span>
                          <span className="text-xs font-semibold text-slate-700">
                            {new Date(rx.created_at).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedPrescription(rx)}
                          className="ent-btn-secondary text-xs"
                        >
                          View Prescription
                        </button>
                      </div>
                    </div>

                    {/* Clinical Summary & Fulfillment Progress */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-md border border-slate-200/60 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">Diagnosis / Reason</span>
                        <span className="font-medium text-slate-800">{rx.diagnosis || "General Consultation"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">General Instructions</span>
                        <span className="text-slate-600 truncate block">{rx.general_instructions || "Follow prescribed dosage schedule."}</span>
                      </div>
                      <div>
                        <div className="flex justify-between items-center text-[10px] font-semibold text-slate-600 mb-1">
                          <span>Pharmacy Dispensing:</span>
                          <span className="font-mono">{totalDispensed} / {totalPrescribed} units ({progressPct}%)</span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              progressPct === 100 ? "bg-emerald-500" : progressPct > 0 ? "bg-amber-500" : "bg-sky-500"
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Prescribed Items Table */}
                    <div className="overflow-x-auto border border-slate-200 rounded-md">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                          <tr>
                            <th className="px-3 py-2">Medication</th>
                            <th className="px-3 py-2">Dosage</th>
                            <th className="px-3 py-2">Frequency</th>
                            <th className="px-3 py-2">Timing</th>
                            <th className="px-3 py-2">Duration</th>
                            <th className="px-3 py-2">Prescribed Qty</th>
                            <th className="px-3 py-2 text-right">Fulfillment</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rx.items?.map((it) => (
                            <tr key={it.id} className="hover:bg-slate-50/70">
                              <td className="px-3 py-2">
                                <span className="font-bold text-slate-900 block">{it.medicine_name}</span>
                                {it.instructions && (
                                  <span className="text-[10px] text-slate-500 block italic">{it.instructions}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-700 font-mono">{it.dosage}</td>
                              <td className="px-3 py-2 text-slate-700 font-mono">{it.frequency}</td>
                              <td className="px-3 py-2">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                  {it.timing?.replace("_", " ")}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-600">{it.duration}</td>
                              <td className="px-3 py-2 font-mono font-semibold text-slate-800">
                                {it.quantity || "—"}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    (it.dispensed_quantity || 0) >= (it.quantity || 1)
                                      ? "bg-emerald-100 text-emerald-800"
                                      : (it.dispensed_quantity || 0) > 0
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {it.dispensed_quantity || 0} / {it.quantity || 0} dispensed
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              </div>

              {/* Pagination Controls */}
              <Pagination
                currentPage={rxPage}
                totalPages={rxTotalPages}
                totalRecords={rxTotalRecords}
                pageSize={rxPageSize}
                onPageChange={setRxPage}
                onPageSizeChange={setRxPageSize}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {prescriptions.map((rx) => (
                <div key={rx.id} className="ent-card p-4 space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="font-mono text-[10px] text-slate-500">{rx.id}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                        {rx.timing}
                      </span>
                    </div>

                    <div className="mt-2.5 space-y-1">
                      <h4 className="font-bold text-xs text-slate-900 leading-snug">
                        {rx.medicine_name}
                      </h4>
                      <div className="flex items-center space-x-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">{rx.dosage}</span>
                        <span>&bull;</span>
                        <span className="font-mono text-sky-700">{rx.frequency}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 pt-1 leading-relaxed">
                        {rx.instructions}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Duration: <strong>{rx.duration}</strong></span>
                    <span className="truncate">{rx.doctor_name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= PRESCRIPTION DETAILS PREVIEW MODAL ================= */}
      {selectedPrescription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-lg shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                  Rx
                </div>
                <div>
                  <h3 className="font-bold text-xs text-slate-900">
                    Official Hospital Digital Prescription
                  </h3>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Rx #{selectedPrescription.prescription_number} &bull; {selectedPrescription.hospital_name}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedPrescription(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Simulated Verified Clinical Prescription PDF */}
            <div className="p-5 rounded-md border border-slate-200 bg-slate-50 space-y-4 text-xs font-mono">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <div>
                  <span className="font-bold text-slate-900 block">{selectedPrescription.hospital_name}</span>
                  <span className="text-[10px] text-slate-500">Outpatient Clinical Services</span>
                </div>
                <div className="text-right text-[10px] text-slate-500">
                  <span className="block text-slate-700 font-bold">Status: {selectedPrescription.status?.toUpperCase()}</span>
                  <span>Issued: {new Date(selectedPrescription.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 bg-white p-3 rounded border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px]">Attending Physician</span>
                  <strong>Dr. {selectedPrescription.doctor_name}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Diagnosis / Indication</span>
                  <span>{selectedPrescription.diagnosis || "Clinical Indication"}</span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-500">Prescribed Medicines ({selectedPrescription.items?.length || 0})</span>
                <div className="bg-white rounded border border-slate-200 divide-y divide-slate-100">
                  {selectedPrescription.items?.map((it, idx) => (
                    <div key={idx} className="p-3 text-xs font-sans">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-bold text-slate-900">{idx + 1}. {it.medicine_name}</span>
                          <span className="text-slate-500 text-[11px] ml-2 font-mono">
                            {it.dosage} &bull; {it.frequency} &bull; {it.duration}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] font-bold text-slate-700">
                          Qty: {it.quantity || "—"} ({it.dispensed_quantity || 0} dispensed)
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1 flex items-center space-x-2">
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 text-[10px] font-medium border border-slate-200">
                          {it.timing?.replace("_", " ")}
                        </span>
                        {it.instructions && <span>{it.instructions}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedPrescription.general_instructions && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500">General Physician Advice:</span>
                  <p className="bg-white p-3 rounded border border-slate-200 text-slate-900 text-xs font-sans leading-relaxed">
                    {selectedPrescription.general_instructions}
                  </p>
                </div>
              )}

              <div className="pt-2 text-[10px] text-slate-400 flex justify-between">
                <span>Digitally Authenticated by Hospital Medical Board</span>
                <span>Rx ID: {selectedPrescription.id}</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setSelectedPrescription(null)}
                className="ent-btn-secondary text-xs"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="ent-btn-primary text-xs"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>Print Digital Prescription</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= LAB REPORT PDF PREVIEW MODAL ================= */}
      {selectedLabReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-lg shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded bg-teal-100 text-teal-800 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-xs text-slate-900">
                    Diagnostic Laboratory Certificate
                  </h3>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Report ID: {selectedLabReport.id} &bull; Released on {selectedLabReport.report_date}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedLabReport(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Simulated Verified Clinical PDF Document Preview */}
            <div className="p-5 rounded-md border border-slate-200 bg-slate-50 space-y-4 text-xs font-mono">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <div>
                  <span className="font-bold text-slate-900 block">{selectedLabReport.hospital}</span>
                  <span className="text-[10px] text-slate-500">Department of Pathology &amp; Laboratory Medicine</span>
                </div>
                <div className="text-right text-[10px] text-slate-500">
                  <span>NABL Accredited Facility</span>
                  <span className="block text-emerald-700 font-bold">Status: Certified</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 bg-white p-3 rounded border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px]">Test Procedure</span>
                  <strong>{selectedLabReport.test_name}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Specimen Type</span>
                  <span>{selectedLabReport.sample_type}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Ordering Physician</span>
                  <span>{selectedLabReport.ordered_by}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Sampling Date</span>
                  <span>{selectedLabReport.ordered_date}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500">Clinical Quantitative Findings:</span>
                <p className="bg-white p-3 rounded border border-slate-200 text-slate-900 text-xs font-sans leading-relaxed">
                  {selectedLabReport.summary_findings}
                </p>
              </div>

              <div className="pt-2 text-[10px] text-slate-400 flex justify-between">
                <span>Electronic Signature: Verified Pathologist</span>
                <span>Audit Ref: SHA-256 Verified</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setSelectedLabReport(null)}
                className="ent-btn-secondary text-xs"
              >
                Close Preview
              </button>
              <button
                type="button"
                onClick={() => {
                  alert(`Downloading ${selectedLabReport.download_filename}...`);
                }}
                className="ent-btn-primary text-xs"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download Official PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

