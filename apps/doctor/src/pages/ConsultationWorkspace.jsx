import { useState, useEffect, useCallback, useMemo } from "react";
import CustomDropdown from "../components/CustomDropdown";
import {
  getConsultationByAppointment,
  saveConsultationDraft,
  submitAndCompleteConsultation,
  startConsultationWorkflow,
  getMasterMedicines,
  getMasterLabTests,
  getPatientConsultationHistory,
  getDoctorAvailableSlots,
  scheduleFollowUpAppointment,
  getEligibleMedicines,
  createOrUpdatePrescription,
  updatePrescriptionStatus,
} from "../services/api";

export default function ConsultationWorkspace({ appointmentId, session, onBack, onCompleted }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [activeTab, setActiveTab] = useState("clinical"); // clinical | vitals | labs | rx | followup | history | admission
  const [lastSaved, setLastSaved] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [validationErrors, setValidationErrors] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Master Catalogs & Inventory Formularies
  const [masterMedicines, setMasterMedicines] = useState([]);
  const [eligibleMedicines, setEligibleMedicines] = useState([]);
  const [masterLabTests, setMasterLabTests] = useState([]);
  const [patientHistory, setPatientHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Prescription Specific States
  const [prescriptionStatus, setPrescriptionStatus] = useState("draft");
  const [prescriptionNumber, setPrescriptionNumber] = useState(null);
  const [prescriptionId, setPrescriptionId] = useState(null);
  const [selectedEligibleMed, setSelectedEligibleMed] = useState(null);
  const [savingRx, setSavingRx] = useState(false);

  // Core Data
  const [appointment, setAppointment] = useState(null);
  const [consultationId, setConsultationId] = useState(null);
  const [consultationStatus, setConsultationStatus] = useState("draft");

  // Form States - Clinical
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [examinationFindings, setExaminationFindings] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [patientCondition, setPatientCondition] = useState("stable");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [advice, setAdvice] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");

  // Form States - Vitals
  const [systolicBp, setSystolicBp] = useState("");
  const [diastolicBp, setDiastolicBp] = useState("");
  const [pulseRate, setPulseRate] = useState("");
  const [temperature, setTemperature] = useState("");
  const [respiratoryRate, setRespiratoryRate] = useState("");
  const [oxygenSaturation, setOxygenSaturation] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");

  // Form States - Lab Requests
  const [investigations, setInvestigations] = useState([]);
  const [newTestName, setNewTestName] = useState("");
  const [selectedMasterTest, setSelectedMasterTest] = useState(null);
  const [newTestCategory, setNewTestCategory] = useState("Hematology");
  const [newTestPriority, setNewTestPriority] = useState("routine");
  const [newTestNotes, setNewTestNotes] = useState("");

  // Form States - Prescriptions
  const [generalInstructions, setGeneralInstructions] = useState("");
  const [prescriptionItems, setPrescriptionItems] = useState([]);
  const [newMedName, setNewMedName] = useState("");
  const [newMedDosage, setNewMedDosage] = useState("500 mg");
  const [newMedForm, setNewMedForm] = useState("Tablet");
  const [newMedFrequency, setNewMedFrequency] = useState("1-0-1");
  const [newMedDuration, setNewMedDuration] = useState("5 Days");
  const [newMedTiming, setNewMedTiming] = useState("after_food");
  const [newMedQuantity, setNewMedQuantity] = useState("10");
  const [newMedInstructions, setNewMedInstructions] = useState("");

  // Form States - Admission Handoff
  const [admissionRecommended, setAdmissionRecommended] = useState(false);
  const [admissionNotes, setAdmissionNotes] = useState("");

  // Form States - Follow-up
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [followUpReason, setFollowUpReason] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [followUpSuccess, setFollowUpSuccess] = useState(null);

  // Live Consultation Elapsed Timer
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Calculated BMI
  const computedBmi = useMemo(() => {
    if (!heightCm || !weightKg) return null;
    const hM = Number(heightCm) / 100;
    const wKg = Number(weightKg);
    if (hM <= 0 || wKg <= 0) return null;
    return (wKg / (hM * hM)).toFixed(1);
  }, [heightCm, weightKg]);

  const bmiCategory = useMemo(() => {
    if (!computedBmi) return null;
    const val = Number(computedBmi);
    if (val < 18.5) return { label: "Underweight", color: "text-amber-700 bg-amber-50 border-amber-200" };
    if (val <= 24.9) return { label: "Normal weight", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    if (val <= 29.9) return { label: "Overweight", color: "text-orange-700 bg-orange-50 border-orange-200" };
    return { label: "Obese", color: "text-rose-700 bg-rose-50 border-rose-200" };
  }, [computedBmi]);

  // Load Consultation & Master Data
  const loadConsultationData = useCallback(async () => {
    if (!session?.token || !appointmentId) return;
    setLoading(true);
    setErrorMessage("");
    try {
      // 1. Fetch consultation data for this appointment
      const data = await getConsultationByAppointment(session.token, appointmentId);
      setAppointment(data.appointment);

      if (data.consultation) {
        setConsultationId(data.consultation.id);
        setConsultationStatus(data.consultation.status || "draft");
        setChiefComplaint(data.consultation.chief_complaint || data.appointment?.reason || "");
        setSymptoms(data.consultation.symptoms || "");
        setExaminationFindings(data.consultation.examination_findings || "");
        setDiagnosis(data.consultation.diagnosis || "");
        setPatientCondition(data.consultation.patient_condition || "stable");
        setTreatmentPlan(data.consultation.treatment_plan || "");
        setAdvice(data.consultation.advice || "");
        setClinicalNotes(data.consultation.clinical_notes || "");
        setAdmissionRecommended(Boolean(data.consultation.admission_recommended));
        setAdmissionNotes(data.consultation.admission_notes || "");
      } else {
        // Automatically start/initialize draft consultation if none was created yet
        const startRes = await startConsultationWorkflow(session.token, appointmentId);
        const newCons = startRes?.data || startRes;
        if (newCons?.id) {
          setConsultationId(newCons.id);
          setConsultationStatus(newCons.status || "draft");
          setChiefComplaint(newCons.chief_complaint || data.appointment?.reason || "");
        }
      }

      if (data.vitals) {
        setSystolicBp(data.vitals.systolic_bp ?? "");
        setDiastolicBp(data.vitals.diastolic_bp ?? "");
        setPulseRate(data.vitals.pulse_rate ?? "");
        setTemperature(data.vitals.temperature ?? "");
        setRespiratoryRate(data.vitals.respiratory_rate ?? "");
        setOxygenSaturation(data.vitals.oxygen_saturation ?? "");
        setHeightCm(data.vitals.height_cm ?? "");
        setWeightKg(data.vitals.weight_kg ?? "");
      }

      if (Array.isArray(data.investigations)) {
        setInvestigations(data.investigations);
      }

      if (data.prescription) {
        setPrescriptionId(data.prescription.id);
        setPrescriptionNumber(data.prescription.prescription_number);
        setPrescriptionStatus(data.prescription.status || "draft");
        setGeneralInstructions(data.prescription.general_instructions || "");
        if (Array.isArray(data.prescription.items)) {
          setPrescriptionItems(data.prescription.items);
        }
      }

      // 2. Fetch master catalogs and facility eligible inventory medicines in background
      const targetHospitalId = data.appointment?.hospital_id || session?.user?.hospitalId;
      getMasterMedicines(session.token).then(setMasterMedicines).catch(console.warn);
      getEligibleMedicines(session.token, { hospital_id: targetHospitalId }).then(setEligibleMedicines).catch(console.warn);
      getMasterLabTests(session.token, targetHospitalId).then(setMasterLabTests).catch(console.warn);

      // 3. Fetch patient history if patient_id present
      if (data.appointment?.patient_id) {
        setLoadingHistory(true);
        getPatientConsultationHistory(session.token, data.appointment.patient_id)
          .then((res) => setPatientHistory(res.data || []))
          .catch(console.warn)
          .finally(() => setLoadingHistory(false));
      }
    } catch (err) {
      console.error("Failed to load consultation workspace:", err);
      setErrorMessage(err.message || "Failed to load consultation data.");
    } finally {
      setLoading(false);
    }
  }, [appointmentId, session]);

  useEffect(() => {
    loadConsultationData();
  }, [loadConsultationData]);

  // Load available follow-up slots when date changes
  useEffect(() => {
    const docId = appointment?.doctor_id || session?.user?.id;
    if (!followUpDate || !session?.token || !docId) return;
    setLoadingSlots(true);
    getDoctorAvailableSlots(session.token, docId, followUpDate)
      .then((res) => {
        const slots =
          res?.available_slots ||
          res?.data?.available_slots ||
          (Array.isArray(res?.data) ? res.data : []) ||
          [];
        setAvailableSlots(slots);
      })
      .catch((err) => {
        console.warn("Could not load available follow-up slots:", err.message);
        setAvailableSlots([]);
      })
      .finally(() => setLoadingSlots(false));
  }, [followUpDate, session, appointment]);

  // Construct Payload for Saving
  const buildPayload = useCallback(() => {
    return {
      chief_complaint: chiefComplaint,
      symptoms,
      examination_findings: examinationFindings,
      diagnosis,
      patient_condition: patientCondition,
      treatment_plan: treatmentPlan,
      advice,
      clinical_notes: clinicalNotes,
      admission_recommended: admissionRecommended,
      admission_notes: admissionNotes,
      vitals: {
        systolic_bp: systolicBp,
        diastolic_bp: diastolicBp,
        pulse_rate: pulseRate,
        temperature,
        respiratory_rate: respiratoryRate,
        oxygen_saturation: oxygenSaturation,
        height_cm: heightCm,
        weight_kg: weightKg,
      },
      investigations,
      prescription: {
        general_instructions: generalInstructions,
        items: prescriptionItems,
      },
    };
  }, [
    chiefComplaint,
    symptoms,
    examinationFindings,
    diagnosis,
    patientCondition,
    treatmentPlan,
    advice,
    clinicalNotes,
    admissionRecommended,
    admissionNotes,
    systolicBp,
    diastolicBp,
    pulseRate,
    temperature,
    respiratoryRate,
    oxygenSaturation,
    heightCm,
    weightKg,
    investigations,
    generalInstructions,
    prescriptionItems,
  ]);

  // Save Draft Action (Saves whatever is entered, without requiring mandatory fields)
  const handleSaveDraft = async () => {
    if (!session?.token) {
      setErrorMessage("Authentication session required. Please sign in again.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    setValidationErrors([]);
    try {
      let activeId = consultationId;
      if (!activeId) {
        const startRes = await startConsultationWorkflow(session.token, appointmentId);
        const newCons = startRes?.data || startRes;
        activeId = newCons?.id;
        if (activeId) {
          setConsultationId(activeId);
        }
      }
      if (!activeId) {
        throw new Error("Unable to establish consultation record for saving.");
      }
      const payload = buildPayload();
      await saveConsultationDraft(session.token, activeId, payload);
      setLastSaved(new Date().toLocaleTimeString());
      setSuccessMessage("Consultation draft successfully saved.");
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err) {
      setErrorMessage(err.message || "Failed to save consultation draft.");
      if (err.errors) setValidationErrors(err.errors);
    } finally {
      setSaving(false);
    }
  };

  // Pre-validate before opening confirmation modal
  const handleOpenSubmitConfirm = () => {
    setErrorMessage("");
    setValidationErrors([]);

    const missing = [];
    if (!chiefComplaint || chiefComplaint.trim().length < 3) {
      missing.push("Chief Reason / Presenting Complaint (minimum 3 characters)");
    }
    if (!examinationFindings || examinationFindings.trim().length < 3) {
      missing.push("Clinical Examination Findings (minimum 3 characters)");
    }
    if (!diagnosis || diagnosis.trim().length < 2) {
      missing.push("Working / Recorded Diagnosis (minimum 2 characters)");
    }
    if (!treatmentPlan || treatmentPlan.trim().length < 3) {
      missing.push("Treatment Plan & Immediate Management (minimum 3 characters)");
    }

    if (missing.length > 0) {
      setActiveTab("clinical");
      setValidationErrors(missing);
      setErrorMessage(
        "Cannot complete visit yet: Please fill all 4 required clinical fields marked with red asterisks (*)."
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setShowConfirmModal(true);
  };

  // Submit and Complete Action
  const handleSubmitAndComplete = async () => {
    if (!session?.token) {
      setErrorMessage("Authentication session required.");
      return;
    }
    setCompleting(true);
    setErrorMessage("");
    setSuccessMessage("");
    setValidationErrors([]);
    try {
      let activeId = consultationId;
      if (!activeId) {
        const startRes = await startConsultationWorkflow(session.token, appointmentId);
        const newCons = startRes?.data || startRes;
        activeId = newCons?.id;
        if (activeId) {
          setConsultationId(activeId);
        }
      }
      if (!activeId) {
        throw new Error("Unable to initialize consultation record for completion.");
      }
      const payload = buildPayload();
      await submitAndCompleteConsultation(session.token, activeId, payload);
      setShowConfirmModal(false);
      setConsultationStatus("submitted");
      setSuccessMessage("Consultation finalized and appointment completed successfully.");
      if (onCompleted) {
        setTimeout(onCompleted, 1500);
      }
    } catch (err) {
      setShowConfirmModal(false);
      setErrorMessage(err.message || "Failed to submit and complete consultation.");
      if (err.errors) setValidationErrors(err.errors);
    } finally {
      setCompleting(false);
    }
  };

  // Total Estimated Lab Cost (Lesson 11.4)
  const totalEstimatedLabCost = useMemo(() => {
    return investigations.reduce((sum, inv) => sum + (parseFloat(inv.price) || 0), 0);
  }, [investigations]);

  // Add Investigation Request
  const handleAddInvestigation = () => {
    if (!newTestName.trim() && !selectedMasterTest) return;

    const matched =
      selectedMasterTest ||
      masterLabTests.find(
        (t) =>
          t.test_name.toLowerCase() === newTestName.trim().toLowerCase() ||
          (t.test_code && t.test_code.toLowerCase() === newTestName.trim().toLowerCase())
      );

    const testName = matched ? matched.test_name : newTestName.trim();
    const masterId = matched ? (matched.master_test_id || matched.id) : null;

    // Duplicate check
    const isDuplicate = investigations.some(
      (inv) =>
        (masterId && inv.master_test_id === masterId) ||
        inv.test_name.toLowerCase() === testName.toLowerCase()
    );

    if (isDuplicate) {
      alert(`The test '${testName}' has already been added to this consultation order list.`);
      return;
    }

    const newInv = {
      master_test_id: masterId,
      test_code: matched?.test_code || null,
      test_name: testName,
      test_category: matched?.category || newTestCategory || "General",
      sample_type: matched?.sample_type || null,
      standard_turnaround_hours: matched?.standard_turnaround_hours || null,
      price: matched?.price !== undefined ? parseFloat(matched.price) : 0.0,
      priority: newTestPriority,
      clinical_notes: newTestNotes.trim(),
      status: "requested",
      payment_status: "unpaid",
    };

    setInvestigations([...investigations, newInv]);
    setNewTestName("");
    setSelectedMasterTest(null);
    setNewTestNotes("");
    setNewTestPriority("routine");
  };

  const handleRemoveInvestigation = (index) => {
    setInvestigations(investigations.filter((_, i) => i !== index));
  };

  // Add Prescription Item with Validation & Duplicate Prevention
  const handleAddPrescriptionItem = () => {
    setErrorMessage("");
    const trimmedName = newMedName.trim();
    if (!trimmedName) {
      setErrorMessage("Please select or specify a medication name.");
      return;
    }

    // Duplicate check
    const lowerName = trimmedName.toLowerCase();
    if (prescriptionItems.some((it) => (it.medicine_name || "").trim().toLowerCase() === lowerName)) {
      setErrorMessage(`'${trimmedName}' is already included in this prescription. Please adjust the existing line.`);
      return;
    }

    const qty = parseInt(newMedQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setErrorMessage("Prescribed quantity must be a positive number (minimum 1 unit).");
      return;
    }

    const newItem = {
      medicine_id: selectedEligibleMed?.id || null,
      medicine_name: trimmedName,
      dosage: newMedDosage.trim() || "As directed",
      form: newMedForm,
      frequency: newMedFrequency,
      duration: newMedDuration.trim() || "5 Days",
      timing: newMedTiming,
      quantity: qty,
      instructions: newMedInstructions.trim(),
      stock_snapshot: selectedEligibleMed?.available_non_expired_stock ?? null,
    };

    setPrescriptionItems([...prescriptionItems, newItem]);
    setNewMedName("");
    setSelectedEligibleMed(null);
    setNewMedInstructions("");
  };

  const handleRemovePrescriptionItem = (index) => {
    setPrescriptionItems(prescriptionItems.filter((_, i) => i !== index));
  };

  // Standalone Prescription Save / Finalization Controls
  const handleSaveRxDraft = async () => {
    if (!consultationId) {
      setErrorMessage("Consultation must be initialized before saving prescription.");
      return;
    }
    setSavingRx(true);
    setErrorMessage("");
    try {
      const res = await createOrUpdatePrescription(session.token, {
        consultation_id: consultationId,
        general_instructions: generalInstructions,
        items: prescriptionItems,
        status: "draft",
      });
      setPrescriptionId(res.id);
      setPrescriptionNumber(res.prescription_number);
      setPrescriptionStatus("draft");
      setSuccessMessage(`Prescription #${res.prescription_number} saved as draft.`);
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err) {
      setErrorMessage(err.message || "Failed to save prescription draft.");
    } finally {
      setSavingRx(false);
    }
  };

  const handleActivateRx = async () => {
    if (!consultationId) {
      setErrorMessage("Consultation must be initialized before activating prescription.");
      return;
    }
    if (prescriptionItems.length === 0) {
      setErrorMessage("Please add at least one medication item before activating the prescription.");
      return;
    }
    setSavingRx(true);
    setErrorMessage("");
    try {
      const res = await createOrUpdatePrescription(session.token, {
        consultation_id: consultationId,
        general_instructions: generalInstructions,
        items: prescriptionItems,
        status: "active",
      });
      setPrescriptionId(res.id);
      setPrescriptionNumber(res.prescription_number);
      setPrescriptionStatus("active");
      setSuccessMessage(`Prescription #${res.prescription_number} activated! Ready for pharmacy dispensing.`);
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err) {
      setErrorMessage(err.message || "Failed to activate prescription.");
    } finally {
      setSavingRx(false);
    }
  };

  const handleCancelRx = async () => {
    if (!prescriptionId) return;
    const reason = window.prompt("Please state the clinical reason for cancelling this prescription:");
    if (!reason || reason.trim().length < 3) {
      if (reason !== null) alert("A cancellation reason of at least 3 characters is required.");
      return;
    }
    setSavingRx(true);
    try {
      await updatePrescriptionStatus(session.token, prescriptionId, "cancelled", reason.trim());
      setPrescriptionStatus("cancelled");
      setSuccessMessage("Prescription has been cancelled.");
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err) {
      setErrorMessage(err.message || "Failed to cancel prescription.");
    } finally {
      setSavingRx(false);
    }
  };

  // Schedule Follow-up
  const handleScheduleFollowUp = async () => {
    if (!followUpDate || !followUpTime || !session?.token) {
      setErrorMessage("Please select a follow-up date and time slot.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    try {
      const res = await scheduleFollowUpAppointment(session.token, {
        previous_appointment_id: appointment.id,
        appointment_date: followUpDate,
        appointment_time: followUpTime,
        reason: followUpReason.trim() || `Follow-up to appointment ${appointment.appointment_number}`,
      });
      setFollowUpSuccess(res.data);
      setSuccessMessage(`Follow-up appointment scheduled for ${followUpDate} at ${followUpTime}.`);
    } catch (err) {
      setErrorMessage(err.message || "Failed to schedule follow-up appointment.");
    } finally {
      setSaving(false);
    }
  };

  const isSubmitted = consultationStatus === "submitted";

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500 font-sans space-y-3">
        <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-medium">Loading clinical consultation workstation...</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 font-sans pb-16">
      {/* =========================================================================
          PATIENT CLINICAL HEADER & LIVE TIMER BANNER
          ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Patient Details */}
          <div className="flex items-start space-x-3.5 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-base shrink-0 border border-teal-200">
              {appointment?.patient_name
                ? appointment.patient_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)
                : "PT"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 truncate">{appointment?.patient_name}</h1>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                  {appointment?.appointment_number}
                </span>
                {appointment?.queue_number && (
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 whitespace-nowrap">
                    Token {appointment.queue_number}
                  </span>
                )}
                {isSubmitted ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                    ✓ Finalized &amp; Submitted
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                    ● Draft Consultation
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 mt-1.5">
                <span className="whitespace-nowrap">
                  <strong className="text-slate-700">Gender:</strong>{" "}
                  <span className="capitalize">{appointment?.gender || "Not specified"}</span>
                </span>
                <span className="whitespace-nowrap">
                  <strong className="text-slate-700">Blood Group:</strong>{" "}
                  <span className="font-semibold text-rose-700">{appointment?.blood_group || "Unknown"}</span>
                </span>
                <span className="whitespace-nowrap">
                  <strong className="text-slate-700">Phone:</strong> {appointment?.patient_phone || "--"}
                </span>
                <span className="truncate max-w-md">
                  <strong className="text-slate-700">Reason:</strong> {appointment?.reason || "Routine Outpatient"}
                </span>
              </div>

              {/* Clinical Alerts / Allergies */}
              {(appointment?.allergies || appointment?.chronic_conditions) && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {appointment.allergies && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-rose-50 text-rose-800 rounded border border-rose-200 whitespace-nowrap">
                      <strong>Allergy:</strong> {appointment.allergies}
                    </span>
                  )}
                  {appointment.chronic_conditions && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-purple-50 text-purple-800 rounded border border-purple-200 whitespace-nowrap">
                      <strong>Chronic:</strong> {appointment.chronic_conditions}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Bar & Live Timer */}
          <div className="flex items-center flex-wrap sm:flex-nowrap gap-2 shrink-0">
            {/* Live Timer Pill */}
            <div className="inline-flex items-center space-x-1.5 h-9 bg-slate-50 text-slate-700 px-3 rounded-md border border-slate-200 font-mono text-xs whitespace-nowrap shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
              <span className="text-slate-400 font-sans text-[11px]">Duration:</span>
              <span className="font-bold text-slate-800">{formatTimer(elapsedSeconds)}</span>
            </div>

            {/* Back to Queue Button */}
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center justify-center h-9 px-3.5 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 border border-slate-300 rounded-md text-xs font-semibold whitespace-nowrap shadow-2xs transition cursor-pointer"
            >
              ← Back to Queue
            </button>

            {!isSubmitted && (
              <>
                {/* Save Draft Button */}
                <button
                  type="button"
                  disabled={saving || completing}
                  onClick={handleSaveDraft}
                  className="inline-flex items-center justify-center h-9 px-4 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 disabled:opacity-50 text-white rounded-md text-xs font-semibold whitespace-nowrap shadow-2xs transition cursor-pointer"
                >
                  {saving ? "Saving Draft..." : "Save Draft"}
                </button>

                {/* Submit & Complete Visit Button */}
                <button
                  type="button"
                  disabled={saving || completing}
                  onClick={handleOpenSubmitConfirm}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white rounded-md text-xs font-semibold whitespace-nowrap shadow-xs transition cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Submit &amp; Complete Visit</span>
                </button>
              </>
            )}
          </div>
        </div>

        {lastSaved && (
          <p className="text-[11px] text-slate-400 mt-2 text-right">Last draft saved at {lastSaved}</p>
        )}
      </div>

      {/* =========================================================================
          FEEDBACK ALERTS
          ========================================================================= */}
      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs flex items-center justify-between">
          <span className="font-medium">{successMessage}</span>
          <button onClick={() => setSuccessMessage("")} className="font-bold text-emerald-900">✕</button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs flex items-center justify-between">
          <span className="font-medium">{errorMessage}</span>
          <button onClick={() => setErrorMessage("")} className="font-bold text-rose-900">✕</button>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-md text-xs space-y-1">
          <p className="font-semibold text-amber-900">Please correct the following mandatory clinical entries:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* =========================================================================
          TAB NAVIGATION (CLINICAL SUB-MODULES)
          ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-lg p-1.5 shadow-xs flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("clinical")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            activeTab === "clinical"
              ? "bg-sky-50 text-sky-700 border border-sky-200 shadow-xs"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span>1. Clinical Notes &amp; Assessment</span>
          <span className="text-[10px] text-rose-500 font-bold">*</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("vitals")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            activeTab === "vitals"
              ? "bg-sky-50 text-sky-700 border border-sky-200 shadow-xs"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span>2. Vital Signs</span>
          {computedBmi && (
            <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1 rounded">
              BMI {computedBmi}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("labs")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            activeTab === "labs"
              ? "bg-sky-50 text-sky-700 border border-sky-200 shadow-xs"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span>3. Investigations ({investigations.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("rx")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            activeTab === "rx"
              ? "bg-sky-50 text-sky-700 border border-sky-200 shadow-xs"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span>4. Prescriptions ({prescriptionItems.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("followup")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            activeTab === "followup"
              ? "bg-sky-50 text-sky-700 border border-sky-200 shadow-xs"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span>5. Follow-up Visit</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("admission")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            activeTab === "admission"
              ? "bg-purple-50 text-purple-700 border border-purple-200 shadow-xs"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span>6. Inpatient Handoff</span>
          {admissionRecommended && (
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ml-auto ${
            activeTab === "history"
              ? "bg-slate-100 text-slate-900 border border-slate-300 shadow-xs"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span>Patient EHR History ({patientHistory.length})</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: CLINICAL DETAILS & NOTES (LESSONS 8.2 & 8.6)
          ========================================================================= */}
      {activeTab === "clinical" && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-2">
            <h2 className="text-sm font-bold text-slate-900">Clinical Evaluation &amp; Documentation</h2>
            <p className="text-xs text-slate-500">Record chief complaint, clinical examination, diagnosis, and treatment plan.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Chief Complaint */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                <span>Presenting Complaint / Chief Reason</span>
                <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={3}
                disabled={isSubmitted}
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                placeholder="e.g. Acute retrosternal chest pain radiating to left shoulder since morning..."
                className={`ent-input text-xs ${
                  validationErrors.length > 0 && (!chiefComplaint || chiefComplaint.trim().length < 3)
                    ? "border-rose-400 bg-rose-50/20 ring-1 ring-rose-400"
                    : ""
                }`}
              />
              <p className="text-[11px] text-slate-400">Primary reason patient sought medical consultation.</p>
            </div>

            {/* Symptoms / History */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800">
                Symptoms &amp; Clinical History
              </label>
              <textarea
                rows={3}
                disabled={isSubmitted}
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="Associated symptoms (e.g. diaphoresis, nausea, exertion-induced dyspnea)..."
                className="ent-input text-xs"
              />
              <p className="text-[11px] text-slate-400">Duration, progression, and aggravating/relieving factors.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Examination Findings */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                <span>Clinical Examination Findings</span>
                <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={3}
                disabled={isSubmitted}
                value={examinationFindings}
                onChange={(e) => setExaminationFindings(e.target.value)}
                placeholder="Systemic physical exam findings (CVS, RS, PA, CNS)..."
                className={`ent-input text-xs ${
                  validationErrors.length > 0 && (!examinationFindings || examinationFindings.trim().length < 3)
                    ? "border-rose-400 bg-rose-50/20 ring-1 ring-rose-400"
                    : ""
                }`}
              />
              <p className="text-[11px] text-slate-400">Objective clinician-observed physical findings.</p>
            </div>

            {/* Diagnosis & Condition */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                  <span>Working / Recorded Diagnosis</span>
                  <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  disabled={isSubmitted}
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="e.g. Acute Coronary Syndrome (Rule Out), Essential Hypertension"
                  className={`ent-input text-xs font-semibold ${
                    validationErrors.length > 0 && (!diagnosis || diagnosis.trim().length < 2)
                      ? "border-rose-400 bg-rose-50/20 ring-1 ring-rose-400"
                      : ""
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-800">
                  Patient Condition at Consultation
                </label>
                <CustomDropdown
                  disabled={isSubmitted}
                  value={patientCondition}
                  onChange={(val) => setPatientCondition(val)}
                  options={[
                    { value: "stable", label: "Stable — Normal vitals, ambulatory, no acute distress" },
                    { value: "improving", label: "Improving — Positive response to ongoing therapy" },
                    { value: "fair", label: "Fair — Mild symptoms, requiring symptomatic care" },
                    { value: "guarded", label: "Guarded — Unstable symptoms, close observation needed" },
                    { value: "critical", label: "Critical — Immediate acute resuscitation / emergency" },
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Treatment Plan */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                <span>Treatment Plan &amp; Immediate Management</span>
                <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={3}
                disabled={isSubmitted}
                value={treatmentPlan}
                onChange={(e) => setTreatmentPlan(e.target.value)}
                placeholder="Immediate therapeutic measures, medication regimen, nursing interventions..."
                className={`ent-input text-xs ${
                  validationErrors.length > 0 && (!treatmentPlan || treatmentPlan.trim().length < 3)
                    ? "border-rose-400 bg-rose-50/20 ring-1 ring-rose-400"
                    : ""
                }`}
              />
            </div>

            {/* General Advice */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800">
                Patient Advice &amp; Lifestyle Guidance
              </label>
              <textarea
                rows={3}
                disabled={isSubmitted}
                value={advice}
                onChange={(e) => setAdvice(e.target.value)}
                placeholder="Dietary instructions, physical activity limitations, hydration, warning signs..."
                className="ent-input text-xs"
              />
            </div>
          </div>

          {/* Confidential Doctor's Clinical Notes */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-800">
              Confidential Doctor's Notes (Internal Clinical Record)
            </label>
            <textarea
              rows={2}
              disabled={isSubmitted}
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              placeholder="Internal clinician remarks, differential diagnoses, or specialist follow-up context..."
              className="ent-input text-xs font-mono"
            />
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: VITAL SIGNS (LESSON 8.3)
          ========================================================================= */}
      {activeTab === "vitals" && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-5">
          <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Patient Physiological Observations &amp; Vital Signs</h2>
              <p className="text-xs text-slate-500">Record standard clinical vital signs with verified units and range validations.</p>
            </div>
            {computedBmi && (
              <div className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${bmiCategory?.color}`}>
                BMI: {computedBmi} kg/m² ({bmiCategory?.label})
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Systolic BP */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800">Systolic BP (mmHg)</label>
              <input
                type="number"
                disabled={isSubmitted}
                min={50}
                max={260}
                value={systolicBp}
                onChange={(e) => setSystolicBp(e.target.value)}
                placeholder="e.g. 120"
                className="ent-input text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400 block">Normal: 90 - 120 mmHg</span>
            </div>

            {/* Diastolic BP */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800">Diastolic BP (mmHg)</label>
              <input
                type="number"
                disabled={isSubmitted}
                min={30}
                max={160}
                value={diastolicBp}
                onChange={(e) => setDiastolicBp(e.target.value)}
                placeholder="e.g. 80"
                className="ent-input text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400 block">Normal: 60 - 80 mmHg</span>
            </div>

            {/* Pulse Rate */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800">Pulse / Heart Rate (bpm)</label>
              <input
                type="number"
                disabled={isSubmitted}
                min={30}
                max={250}
                value={pulseRate}
                onChange={(e) => setPulseRate(e.target.value)}
                placeholder="e.g. 72"
                className="ent-input text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400 block">Normal: 60 - 100 bpm</span>
            </div>

            {/* Temperature */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800">Body Temperature (°F)</label>
              <input
                type="number"
                step="0.1"
                disabled={isSubmitted}
                min={85}
                max={110}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                placeholder="e.g. 98.6"
                className="ent-input text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400 block">Normal: 97.7°F - 99.5°F</span>
            </div>

            {/* Respiratory Rate */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800">Respiratory Rate (breaths/min)</label>
              <input
                type="number"
                disabled={isSubmitted}
                min={5}
                max={60}
                value={respiratoryRate}
                onChange={(e) => setRespiratoryRate(e.target.value)}
                placeholder="e.g. 16"
                className="ent-input text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400 block">Normal: 12 - 20 bpm</span>
            </div>

            {/* Oxygen Saturation */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800">Oxygen Saturation (SpO2 %)</label>
              <input
                type="number"
                disabled={isSubmitted}
                min={50}
                max={100}
                value={oxygenSaturation}
                onChange={(e) => setOxygenSaturation(e.target.value)}
                placeholder="e.g. 98"
                className="ent-input text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400 block">Normal: 95% - 100%</span>
            </div>

            {/* Height */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800">Height (cm)</label>
              <input
                type="number"
                step="0.5"
                disabled={isSubmitted}
                min={30}
                max={250}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="e.g. 170"
                className="ent-input text-xs font-mono"
              />
            </div>

            {/* Weight */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800">Weight (kg)</label>
              <input
                type="number"
                step="0.5"
                disabled={isSubmitted}
                min={1}
                max={400}
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="e.g. 70"
                className="ent-input text-xs font-mono"
              />
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: INVESTIGATIONS & LAB REQUESTS (LESSON 8.4 & 11.4)
          ========================================================================= */}
      {activeTab === "labs" && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Diagnostic Investigations &amp; Laboratory Requests</h2>
              <p className="text-xs text-slate-500">Order pathology, biochemistry, and radiological examinations from this hospital's active offerings catalog.</p>
            </div>
            {investigations.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2.5 py-1 bg-sky-50 text-sky-800 rounded-md border border-sky-200">
                  {investigations.length} Test{investigations.length !== 1 ? "s" : ""} Ordered
                </span>
                <span className="text-xs font-mono font-bold px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-md border border-emerald-200">
                  Total Est: ₹{totalEstimatedLabCost.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* New Request Form */}
          {!isSubmitted && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-800">Add New Investigation Order</p>
                <span className="text-[11px] text-slate-500">
                  Showing active tests for this hospital facility
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Test / Investigation Name</label>
                  <input
                    type="text"
                    list="lab-tests-catalog"
                    value={newTestName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewTestName(val);
                      const match = masterLabTests.find(
                        (t) => t.test_name === val || t.test_code === val
                      );
                      if (match) {
                        setSelectedMasterTest(match);
                        setNewTestCategory(match.category);
                      } else {
                        setSelectedMasterTest(null);
                      }
                    }}
                    placeholder="Search tests by name or code (e.g. CBC, FBS, ECG)..."
                    className="ent-input text-xs"
                  />
                  <datalist id="lab-tests-catalog">
                    {masterLabTests.map((t) => (
                      <option key={t.id || t.master_test_id} value={t.test_name}>
                        {t.test_code ? `[${t.test_code}] ` : ""}{t.category} — ₹{parseFloat(t.price || 0).toFixed(2)} ({t.sample_type || "Diagnostic"})
                      </option>
                    ))}
                  </datalist>

                  {/* Selected Test Offering Badge */}
                  {selectedMasterTest && (
                    <div className="mt-1 p-2 bg-sky-50 border border-sky-200 rounded text-[11px] flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-sky-900 bg-white px-1.5 py-0.5 rounded border border-sky-300">
                          {selectedMasterTest.test_code || "TEST"}
                        </span>
                        <span className="font-semibold text-sky-900">{selectedMasterTest.test_name}</span>
                        <span className="text-slate-500">({selectedMasterTest.sample_type || "Diagnostic"})</span>
                      </div>
                      <div className="font-mono font-bold text-slate-900">
                        Hospital Rate: ₹{parseFloat(selectedMasterTest.price || 0).toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Category</label>
                  <CustomDropdown
                    value={newTestCategory}
                    onChange={(val) => setNewTestCategory(val)}
                    options={[
                      { value: "Hematology", label: "Hematology" },
                      { value: "Biochemistry", label: "Biochemistry" },
                      { value: "Clinical Pathology", label: "Clinical Pathology" },
                      { value: "Radiology & Imaging", label: "Radiology & Imaging" },
                      { value: "Cardiology Diagnostics", label: "Cardiology Diagnostics" },
                      { value: "Microbiology", label: "Microbiology" },
                      { value: "General", label: "General" },
                    ]}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Clinical Priority</label>
                  <CustomDropdown
                    value={newTestPriority}
                    onChange={(val) => setNewTestPriority(val)}
                    options={[
                      { value: "routine", label: "Routine (Standard Turnaround)" },
                      { value: "urgent", label: "Urgent (Expedited)" },
                      { value: "stat", label: "STAT (Immediate Emergency)" },
                    ]}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Clinical Indication / Reason</label>
                  <input
                    type="text"
                    value={newTestNotes}
                    onChange={(e) => setNewTestNotes(e.target.value)}
                    placeholder="Reason for requesting test (e.g. Check fasting glucose, rule out infection)..."
                    className="ent-input text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddInvestigation}
                  className="mt-5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  + Add Test
                </button>
              </div>
            </div>
          )}

          {/* Requests Table */}
          <div className="overflow-x-auto">
            <table className="ent-table">
              <thead>
                <tr>
                  <th>Test Code &amp; Name</th>
                  <th>Category</th>
                  <th>Sample Type</th>
                  <th>Hospital Rate (₹)</th>
                  <th>Turnaround</th>
                  <th>Priority</th>
                  <th>Clinical Indication</th>
                  <th>Order Status</th>
                  {!isSubmitted && <th className="text-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {investigations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-6 text-slate-400 text-xs">
                      No investigations ordered for this consultation visit.
                    </td>
                  </tr>
                ) : (
                  investigations.map((inv, idx) => (
                    <tr key={idx}>
                      <td className="font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          {inv.test_code && (
                            <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1 py-0.5 rounded border border-slate-200">
                              {inv.test_code}
                            </span>
                          )}
                          <span>{inv.test_name}</span>
                        </div>
                        {inv.order_number && (
                          <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                            {inv.order_number}
                          </div>
                        )}
                      </td>
                      <td className="text-xs text-slate-600">{inv.test_category}</td>
                      <td className="text-xs text-slate-600">{inv.sample_type || "—"}</td>
                      <td className="font-mono font-bold text-slate-900 text-xs">
                        ₹{parseFloat(inv.price || 0).toFixed(2)}
                      </td>
                      <td className="font-mono text-xs text-slate-600">
                        {inv.standard_turnaround_hours ? `${inv.standard_turnaround_hours}h` : "—"}
                      </td>
                      <td>
                        {inv.priority === "stat" && (
                          <span className="font-bold text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded uppercase">
                            STAT
                          </span>
                        )}
                        {inv.priority === "urgent" && (
                          <span className="font-semibold text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded uppercase">
                            Urgent
                          </span>
                        )}
                        {inv.priority === "routine" && (
                          <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded uppercase">
                            Routine
                          </span>
                        )}
                      </td>
                      <td className="text-xs text-slate-600 max-w-xs">{inv.clinical_notes || "--"}</td>
                      <td>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-800 border border-blue-200 capitalize">
                          {inv.status || "requested"}
                        </span>
                      </td>
                      {!isSubmitted && (
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveInvestigation(idx)}
                            className="text-xs text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: PRESCRIPTION BUILDER (MODULE 13: LESSONS 13.1 - 13.5)
          ========================================================================= */}
      {activeTab === "rx" && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-5">
          {/* Prescription Lifecycle Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">Physician Outpatient Prescription</h2>
                {prescriptionNumber && (
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                    {prescriptionNumber}
                  </span>
                )}
                {/* Status Badge */}
                {prescriptionStatus === "draft" && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                    ● Draft (Not Dispensed)
                  </span>
                )}
                {prescriptionStatus === "active" && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                    ✓ Active (Ready for Pharmacy)
                  </span>
                )}
                {prescriptionStatus === "partially_dispensed" && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                    ◐ Partially Dispensed
                  </span>
                )}
                {prescriptionStatus === "dispensed" && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    ✔ Fully Dispensed
                  </span>
                )}
                {prescriptionStatus === "cancelled" && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                    ✕ Cancelled
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Formulate outpatient medication orders verified against active hospital formulary and inventory batches.
              </p>
            </div>

            {/* Quick Prescription Action Controls */}
            {!isSubmitted && prescriptionStatus !== "dispensed" && prescriptionStatus !== "cancelled" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={savingRx}
                  onClick={handleSaveRxDraft}
                  className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold shadow-2xs transition cursor-pointer"
                >
                  Save Rx Draft
                </button>
                <button
                  type="button"
                  disabled={savingRx || prescriptionItems.length === 0}
                  onClick={handleActivateRx}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  ✓ Activate Prescription
                </button>
                {prescriptionId && (
                  <button
                    type="button"
                    disabled={savingRx}
                    onClick={handleCancelRx}
                    className="px-2.5 py-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded text-xs font-semibold shadow-2xs transition cursor-pointer"
                  >
                    Cancel Rx
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Add Medicine Form */}
          {!isSubmitted && prescriptionStatus !== "cancelled" && prescriptionStatus !== "dispensed" && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-800">Add Medicine Item from Hospital Inventory</p>
                <span className="text-[11px] text-slate-500">
                  Select drug to verify active non-expired facility batch stock
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Medicine Name / Catalog</label>
                  <input
                    type="text"
                    list="eligible-medicines-catalog"
                    value={newMedName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewMedName(val);
                      const match = (eligibleMedicines.length > 0 ? eligibleMedicines : masterMedicines).find(
                        (m) => m.name.toLowerCase() === val.toLowerCase() || m.sku === val
                      );
                      if (match) {
                        setSelectedEligibleMed(match);
                        if (match.form) setNewMedForm(match.form);
                        if (match.strength) setNewMedDosage(match.strength);
                      } else {
                        setSelectedEligibleMed(null);
                      }
                    }}
                    placeholder="Search by drug name or SKU (e.g. Paracetamol, Amoxicillin)..."
                    className="ent-input text-xs"
                  />
                  <datalist id="eligible-medicines-catalog">
                    {(eligibleMedicines.length > 0 ? eligibleMedicines : masterMedicines).map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.form} - {m.strength} [{m.sku || `MED-${m.id}`}] — Stock: {m.available_non_expired_stock ?? "Available"}
                      </option>
                    ))}
                  </datalist>

                  {/* Selected Medicine Stock & Formulation Badge */}
                  {selectedEligibleMed && (
                    <div className="mt-1.5 p-2 bg-sky-50 border border-sky-200 rounded text-[11px] flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-sky-900 bg-white px-1.5 py-0.5 rounded border border-sky-300">
                          {selectedEligibleMed.sku || "MED"}
                        </span>
                        <span className="font-semibold text-sky-900">{selectedEligibleMed.name}</span>
                        <span className="text-slate-500">({selectedEligibleMed.form} - {selectedEligibleMed.strength})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {Number(selectedEligibleMed.available_non_expired_stock) > 20 ? (
                          <span className="font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                            In Stock: {selectedEligibleMed.available_non_expired_stock} units
                          </span>
                        ) : Number(selectedEligibleMed.available_non_expired_stock) > 0 ? (
                          <span className="font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                            Low Stock: {selectedEligibleMed.available_non_expired_stock} units
                          </span>
                        ) : (
                          <span className="font-semibold text-rose-800 bg-rose-100 px-2 py-0.5 rounded">
                            Out of Stock (Procurement Needed)
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Dosage Strength</label>
                  <input
                    type="text"
                    value={newMedDosage}
                    onChange={(e) => setNewMedDosage(e.target.value)}
                    placeholder="e.g. 500 mg, 10 ml"
                    className="ent-input text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Form</label>
                  <CustomDropdown
                    value={newMedForm}
                    onChange={(val) => setNewMedForm(val)}
                    options={[
                      { value: "Tablet", label: "Tablet" },
                      { value: "Capsule", label: "Capsule" },
                      { value: "Syrup", label: "Syrup" },
                      { value: "Injection", label: "Injection" },
                      { value: "Inhaler", label: "Inhaler" },
                      { value: "Drops", label: "Drops" },
                      { value: "Ointment", label: "Ointment" },
                      { value: "Powder", label: "Powder" },
                    ]}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Frequency</label>
                  <CustomDropdown
                    value={newMedFrequency}
                    onChange={(val) => setNewMedFrequency(val)}
                    options={[
                      { value: "1-0-1", label: "1-0-1 (Morning & Night)" },
                      { value: "1-0-0", label: "1-0-0 (Morning Only)" },
                      { value: "0-0-1", label: "0-0-1 (Night Only)" },
                      { value: "1-1-1", label: "1-1-1 (Three times a day)" },
                      { value: "1-1-1-1", label: "1-1-1-1 (Four times a day)" },
                      { value: "SOS", label: "SOS (As needed / PRN)" },
                      { value: "Once Daily", label: "Once Daily" },
                      { value: "Weekly", label: "Weekly" },
                    ]}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Duration</label>
                  <input
                    type="text"
                    value={newMedDuration}
                    onChange={(e) => setNewMedDuration(e.target.value)}
                    placeholder="e.g. 5 Days, 1 Month"
                    className="ent-input text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Meal Timing</label>
                  <CustomDropdown
                    value={newMedTiming}
                    onChange={(val) => setNewMedTiming(val)}
                    options={[
                      { value: "after_food", label: "After Food (Postprandial)" },
                      { value: "before_food", label: "Before Food (Empty Stomach)" },
                      { value: "with_food", label: "With Food" },
                      { value: "anytime", label: "Anytime" },
                    ]}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Quantity (Units Prescribed)</label>
                  <input
                    type="number"
                    min={1}
                    value={newMedQuantity}
                    onChange={(e) => setNewMedQuantity(e.target.value)}
                    placeholder="e.g. 10"
                    className="ent-input text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Administration &amp; Usage Instructions</label>
                  <input
                    type="text"
                    value={newMedInstructions}
                    onChange={(e) => setNewMedInstructions(e.target.value)}
                    placeholder="e.g. Take with warm water; Do not chew or crush tablet..."
                    className="ent-input text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddPrescriptionItem}
                  className="mt-5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  + Add Medication
                </button>
              </div>
            </div>
          )}

          {/* Medicines Table */}
          <div className="overflow-x-auto">
            <table className="ent-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Medication &amp; SKU</th>
                  <th>Form &amp; Strength</th>
                  <th>Frequency</th>
                  <th>Duration</th>
                  <th>Timing</th>
                  <th>Prescribed</th>
                  <th>Dispensed</th>
                  <th>Usage Notes</th>
                  {!isSubmitted && prescriptionStatus !== "cancelled" && prescriptionStatus !== "dispensed" && (
                    <th className="text-right">Action</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {prescriptionItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-6 text-slate-400 text-xs">
                      No medications prescribed yet.
                    </td>
                  </tr>
                ) : (
                  prescriptionItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="font-mono text-xs text-slate-400">{idx + 1}</td>
                      <td className="font-bold text-slate-900">
                        {item.medicine_name}
                        {item.stock_snapshot !== null && item.stock_snapshot !== undefined && (
                          <span className="block text-[10px] text-slate-500 font-normal">
                            Inventory: {item.stock_snapshot} units in facility
                          </span>
                        )}
                      </td>
                      <td className="text-xs text-slate-600">
                        {item.form} ({item.dosage})
                      </td>
                      <td>
                        <span className="font-semibold text-xs text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                          {item.frequency}
                        </span>
                      </td>
                      <td className="text-xs text-slate-800 font-medium">{item.duration}</td>
                      <td>
                        <span className="capitalize text-xs text-slate-600">
                          {item.timing?.replace("_", " ")}
                        </span>
                      </td>
                      <td className="font-mono text-xs font-bold text-slate-900">{item.quantity || "--"}</td>
                      <td>
                        <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {item.dispensed_quantity || 0} / {item.quantity || "--"}
                        </span>
                      </td>
                      <td className="text-xs text-slate-500">{item.instructions || "--"}</td>
                      {!isSubmitted && prescriptionStatus !== "cancelled" && prescriptionStatus !== "dispensed" && (
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => handleRemovePrescriptionItem(idx)}
                            className="text-xs text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* General Prescription Instructions */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-800">General Patient Instructions &amp; Advice</label>
            <textarea
              rows={2}
              disabled={isSubmitted || prescriptionStatus === "cancelled"}
              value={generalInstructions}
              onChange={(e) => setGeneralInstructions(e.target.value)}
              placeholder="e.g. Drink plenty of warm fluids. Avoid driving if dizzy. Contact emergency desk if breathing difficulty occurs..."
              className="ent-input text-xs"
            />
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: FOLLOW-UP APPOINTMENT (LESSON 8.7)
          ========================================================================= */}
      {activeTab === "followup" && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-2">
            <h2 className="text-sm font-bold text-slate-900">Schedule Clinical Follow-up Appointment</h2>
            <p className="text-xs text-slate-500">
              Link a subsequent appointment to this visit with calendar conflict checking and automated notification.
            </p>
          </div>

          {followUpSuccess ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-900 space-y-2">
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold">✓</span>
                <span className="font-bold text-sm">Follow-up Successfully Scheduled!</span>
              </div>
              <p>
                Appointment Number: <strong className="font-mono">{followUpSuccess.appointment_number}</strong>
              </p>
              <p>
                Date &amp; Time: <strong>{followUpSuccess.appointment_date} at {followUpSuccess.appointment_time}</strong>
              </p>
              <p className="text-emerald-700">Patient notification has been queued for dispatch.</p>
            </div>
          ) : (
            <div className="max-w-xl space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-800">Follow-up Date</label>
                <input
                  type="date"
                  min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                  max={new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0]}
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="ent-input text-xs font-mono"
                />
                <span className="text-[10px] text-slate-400 block">Enforces up to 3-month booking window.</span>
              </div>

              {followUpDate && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-800">Available Time Slot</label>
                  {loadingSlots ? (
                    <p className="text-xs text-slate-400">Loading physician slots...</p>
                  ) : availableSlots.length === 0 ? (
                    <p className="text-xs text-rose-600">No open appointment slots on this date.</p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {availableSlots.map((slot, i) => {
                        const slotValue = slot.start_time || slot.time_label || slot.display_time;
                        const slotLabel = slot.display_time || slot.time_label || slot.start_time;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setFollowUpTime(slotValue)}
                            className={`px-2 py-1.5 rounded text-xs font-mono font-medium border text-center transition cursor-pointer ${
                              followUpTime === slotValue
                                ? "bg-teal-600 text-white border-teal-700 shadow-xs"
                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            {slotLabel}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-800">Follow-up Purpose</label>
                <textarea
                  rows={2}
                  value={followUpReason}
                  onChange={(e) => setFollowUpReason(e.target.value)}
                  placeholder="e.g. Review blood pressure response and repeat ECG..."
                  className="ent-input text-xs"
                />
              </div>

              <button
                type="button"
                disabled={!followUpDate || !followUpTime || saving}
                onClick={handleScheduleFollowUp}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold transition cursor-pointer"
              >
                {saving ? "Scheduling..." : "Confirm Follow-up Booking"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 6: INPATIENT ADMISSION HANDOFF (LESSON 8.10)
          ========================================================================= */}
      {activeTab === "admission" && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-2">
            <h2 className="text-sm font-bold text-slate-900">Inpatient Admission Clinical Recommendation</h2>
            <p className="text-xs text-slate-500">
              Separates outpatient consultation from inpatient admission without auto-assigning beds.
            </p>
          </div>

          <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-md text-xs text-purple-900 space-y-1">
            <p className="font-semibold text-purple-950">Separation of Consultation &amp; Admission:</p>
            <p>
              Recommending admission records your clinical justification and flags the patient for IPD triage.
              It preserves this outpatient consultation record independently and does <strong>not</strong> assign a bed or change ward status automatically.
            </p>
          </div>

          <div className="space-y-3 max-w-xl">
            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                disabled={isSubmitted}
                checked={admissionRecommended}
                onChange={(e) => setAdmissionRecommended(e.target.checked)}
                className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer"
              />
              <span className="text-xs font-semibold text-slate-900">
                Clinically recommend inpatient hospital admission for this patient
              </span>
            </label>

            {admissionRecommended && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-800">
                  Admission Justification &amp; Unit Notes
                </label>
                <textarea
                  rows={3}
                  disabled={isSubmitted}
                  value={admissionNotes}
                  onChange={(e) => setAdmissionNotes(e.target.value)}
                  placeholder="Specify intended inpatient department, level of care (CCU, ICU, General Ward), and urgent clinical indications..."
                  className="ent-input text-xs"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 7: PATIENT EHR & CONSULTATION HISTORY (LESSON 8.9)
          ========================================================================= */}
      {activeTab === "history" && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-2">
            <h2 className="text-sm font-bold text-slate-900">Patient Electronic Health Record (EHR) History</h2>
            <p className="text-xs text-slate-500">Previous clinical visits, diagnoses, prescriptions, and lab investigations.</p>
          </div>

          {loadingHistory ? (
            <p className="text-xs text-slate-400 py-4">Loading patient history...</p>
          ) : patientHistory.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">No prior consultation records found for this patient.</p>
          ) : (
            <div className="space-y-3">
              {patientHistory.map((rec) => (
                <div key={rec.id} className="border border-slate-200 rounded-md p-3.5 bg-slate-50/50 space-y-2">
                  <div className="flex flex-wrap items-center justify-between text-xs border-b border-slate-200 pb-2">
                    <div className="space-x-2">
                      <strong className="text-slate-900">{rec.formatted_started_at || rec.started_at}</strong>
                      <span className="text-slate-500 font-mono">({rec.appointment_number})</span>
                      <span className="font-semibold text-teal-800">Dr. {rec.doctor_name}</span>
                    </div>
                    <span className="capitalize px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {rec.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="font-semibold text-slate-700">Diagnosis:</span>{" "}
                      <span className="text-slate-900">{rec.diagnosis || "--"}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">Chief Complaint:</span>{" "}
                      <span className="text-slate-900">{rec.chief_complaint || "--"}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">Treatment Plan:</span>{" "}
                      <span className="text-slate-900">{rec.treatment_plan || "--"}</span>
                    </div>
                    {rec.vitals && (
                      <div>
                        <span className="font-semibold text-slate-700">Vitals:</span>{" "}
                        <span className="font-mono text-slate-800">
                          BP: {rec.vitals.systolic_bp}/{rec.vitals.diastolic_bp} mmHg | Pulse: {rec.vitals.pulse_rate} bpm | SpO2: {rec.vitals.oxygen_saturation}%
                        </span>
                      </div>
                    )}
                  </div>

                  {rec.prescription?.items?.length > 0 && (
                    <div className="text-xs pt-1 border-t border-slate-100">
                      <span className="font-semibold text-slate-700">Prescribed: </span>
                      <span className="text-slate-800">
                        {rec.prescription.items.map((i) => `${i.medicine_name} (${i.dosage}, ${i.frequency})`).join("; ")}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          CONFIRMATION MODAL BEFORE SUBMITTING & COMPLETING
          ========================================================================= */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Confirm Consultation Finalization</span>
            </div>

            <div className="text-xs text-slate-600 space-y-2">
              <p>
                You are about to submit the consultation and mark appointment{" "}
                <strong className="font-mono text-slate-900">{appointment?.appointment_number}</strong> as{" "}
                <strong className="text-emerald-700">Completed</strong>.
              </p>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] space-y-1">
                <p>
                  <strong>Complaint:</strong> {chiefComplaint ? `${chiefComplaint.slice(0, 45)}...` : <span className="text-rose-600 font-bold">Missing!</span>}
                </p>
                <p>
                  <strong>Exam Findings:</strong> {examinationFindings ? `${examinationFindings.slice(0, 45)}...` : <span className="text-rose-600 font-bold">Missing!</span>}
                </p>
                <p>
                  <strong>Diagnosis:</strong> {diagnosis || <span className="text-rose-600 font-bold">Missing!</span>}
                </p>
                <p>
                  <strong>Treatment Plan:</strong> {treatmentPlan ? `${treatmentPlan.slice(0, 45)}...` : <span className="text-rose-600 font-bold">Missing!</span>}
                </p>
                <p>
                  <strong>Medications:</strong> {prescriptionItems.length} item(s)
                </p>
                <p>
                  <strong>Investigations:</strong> {investigations.length} test(s)
                </p>
                {admissionRecommended && (
                  <p className="text-purple-700 font-semibold">
                    ● Inpatient admission recommended
                  </p>
                )}
              </div>
              <p className="text-slate-500">
                Once finalized, this clinical observation is sealed for patient privacy and medico-legal audit integrity.
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={completing}
                onClick={() => setShowConfirmModal(false)}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={completing}
                onClick={handleSubmitAndComplete}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {completing ? "Finalizing Visit..." : "Yes, Submit & Complete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
