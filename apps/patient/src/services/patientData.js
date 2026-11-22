/**
 * CareCommand Patient Data Store & Schema Simulation
 * Mirrors MySQL Schema: tbl_patients, tbl_hospitals, tbl_departments, tbl_doctors,
 * tbl_appointments, tbl_consultation_bills, tbl_pharmacy_bills, tbl_lab_reports.
 */

const STORAGE_KEYS = {
  PROFILE: "hms_patient_profile",
  APPOINTMENTS: "hms_patient_appointments",
  CONSULTATIONS: "hms_patient_consultations",
  LAB_REPORTS: "hms_patient_lab_reports",
  PRESCRIPTIONS: "hms_patient_prescriptions",
  CONSULTATION_BILLS: "hms_patient_consultation_bills",
  PHARMACY_BILLS: "hms_patient_pharmacy_bills",
};

// --------------------------------------------------------------------------
// 1. Master Facilities & Clinical Taxonomy
// --------------------------------------------------------------------------
export const HOSPITALS = [
  {
    id: 1,
    name: "Demo General Hospital",
    code: "DEMO-001",
    city: "Mumbai",
    state: "Maharashtra",
    address: "Plot 42, Health City Avenue, Bandra West, Mumbai 400050",
    phone: "+91-22-2640-5500",
    email: "reception@demogeneral.org",
    working_hours: "24/7 Emergency & Inpatient Services",
    upi_id: "demogeneral@okhdfcbank",
    payee_name: "Demo General Hospital Healthcare Trust",
    status: "active",
  },
  {
    id: 2,
    name: "St Jude Medical Center",
    code: "SJH-002",
    city: "Pune",
    state: "Maharashtra",
    address: "18/B Seneca Boulevard, Shivajinagar, Pune 411005",
    phone: "+91-20-4100-8800",
    email: "care@stjudepune.org",
    working_hours: "08:00 AM - 08:00 PM (Emergency 24/7)",
    upi_id: "stjudepune@icici",
    payee_name: "St Jude Medical Trust",
    status: "active",
  },
  {
    id: 3,
    name: "Apollo Care Specialty Hospital",
    code: "ACH-003",
    city: "Bengaluru",
    state: "Karnataka",
    address: "7th Main, 100ft Ring Road, Indiranagar, Bengaluru 560038",
    phone: "+91-80-2525-9900",
    email: "frontdesk@apollocare.org",
    working_hours: "24/7 Multi-Specialty Clinic",
    upi_id: "apollocare@axisbank",
    payee_name: "Apollo Care Health Systems",
    status: "active",
  },
];

export const DEPARTMENTS = [
  { id: 101, hospital_id: 1, name: "Cardiology", description: "Heart, coronary, and vascular clinical care" },
  { id: 102, hospital_id: 1, name: "Orthopedics", description: "Bones, joints, sports medicine and rehabilitation" },
  { id: 103, hospital_id: 1, name: "General Medicine", description: "Primary care, health evaluations, and preventative checkups" },
  { id: 104, hospital_id: 1, name: "Pediatrics", description: "Child health, infant immunizations, and developmental care" },
  { id: 201, hospital_id: 2, name: "Cardiology", description: "Coronary diagnostics, ECG review, and lifestyle medicine" },
  { id: 202, hospital_id: 2, name: "Orthopedics", description: "Joint reconstruction, trauma, and arthritis care" },
  { id: 203, hospital_id: 2, name: "Dermatology", description: "Skin, hair, allergic, and laser clinical treatments" },
  { id: 301, hospital_id: 3, name: "Neurology", description: "Brain, nervous system, migraine, and spinal care" },
  { id: 302, hospital_id: 3, name: "General Medicine", description: "Internal diagnostics, lifestyle management, and routine consults" },
];

export const DOCTORS = [
  {
    id: 301,
    hospital_id: 1,
    department_id: 101,
    name: "Dr. Sarah Jenkins",
    designation: "Senior Consultant Cardiologist",
    education: "MBBS, MD (Medicine), DM (Cardiology)",
    experience_years: 14,
    license_number: "MMC-2012-08491",
    languages: ["English", "Hindi", "Marathi"],
    consultation_fee: 800,
    room: "OPD Wing B &bull; Room 304",
    avatar: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150&auto=format&fit=crop&q=80",
    available_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  },
  {
    id: 302,
    hospital_id: 1,
    department_id: 102,
    name: "Dr. Marcus Reed",
    designation: "Chief of Orthopedics & Joint Reconstruction",
    education: "MBBS, MS (Orthopedics), M.Ch (Ortho)",
    experience_years: 18,
    license_number: "MMC-2008-04192",
    languages: ["English", "Hindi"],
    consultation_fee: 900,
    room: "OPD Wing A &bull; Room 201",
    avatar: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80",
    available_days: ["Monday", "Wednesday", "Friday"],
  },
  {
    id: 303,
    hospital_id: 1,
    department_id: 103,
    name: "Dr. Liam Patel",
    designation: "Consultant Physician & Internist",
    education: "MBBS, MD (Internal Medicine)",
    experience_years: 9,
    license_number: "MMC-2017-09341",
    languages: ["English", "Hindi", "Gujarati"],
    consultation_fee: 500,
    room: "OPD Wing C &bull; Room 105",
    avatar: "https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=150&auto=format&fit=crop&q=80",
    available_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  },
  {
    id: 304,
    hospital_id: 1,
    department_id: 104,
    name: "Dr. Ananya Sharma",
    designation: "Pediatric Care Specialist",
    education: "MBBS, DCH, DNB (Pediatrics)",
    experience_years: 11,
    license_number: "MMC-2015-05512",
    languages: ["English", "Hindi"],
    consultation_fee: 650,
    room: "Pediatric Suite &bull; Room 108",
    avatar: "https://images.unsplash.com/photo-1594824813583-4a1cb0e487fd?w=150&auto=format&fit=crop&q=80",
    available_days: ["Monday", "Tuesday", "Thursday", "Friday"],
  },
  {
    id: 305,
    hospital_id: 2,
    department_id: 201,
    name: "Dr. Rajesh Kulkarni",
    designation: "Consultant Interventional Cardiologist",
    education: "MBBS, MD, FACC",
    experience_years: 16,
    license_number: "PMC-2010-01994",
    languages: ["English", "Marathi", "Hindi"],
    consultation_fee: 850,
    room: "Cardiac Block &bull; Suite 02",
    avatar: "https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=150&auto=format&fit=crop&q=80",
    available_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  },
  {
    id: 306,
    hospital_id: 3,
    department_id: 301,
    name: "Dr. Vikram Mehra",
    designation: "Senior Neurophysician",
    education: "MBBS, MD (Medicine), DM (Neurology)",
    experience_years: 21,
    license_number: "KMC-2005-00128",
    languages: ["English", "Kannada", "Hindi"],
    consultation_fee: 1200,
    room: "Neurology Wing &bull; Suite 402",
    avatar: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150&auto=format&fit=crop&q=80",
    available_days: ["Monday", "Wednesday", "Friday", "Saturday"],
  },
];

export const AVAILABLE_TIME_SLOTS = [
  "09:00 AM",
  "09:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "02:00 PM",
  "02:30 PM",
  "03:00 PM",
  "03:30 PM",
  "04:00 PM",
  "04:30 PM",
];

// --------------------------------------------------------------------------
// 2. Default Initial State Datasets
// --------------------------------------------------------------------------
const INITIAL_PROFILE = {
  full_name: "Undhad Harshil",
  email: "patient@hms.com",
  mobile: "+91-9876543210",
  dob: "2000-08-15",
  gender: "Male",
  blood_group: "B+",
  address_line1: "Flat 402, Lotus Residency",
  address_line2: "MG Road, Bandra West",
  country: "India",
  state: "Maharashtra",
  city: "Mumbai",
  pincode: "400050",
  emergency_contact_name: "Ramesh Undhad",
  emergency_contact_number: "+91-9876500000",
  allergies: "Penicillin, Sulfa drugs",
  chronic_conditions: "Mild Hypertension",
  current_medicines: "Telmisartan 20mg (Once daily morning)",
  profile_completed: true,
};

// Seed initial appointment lifecycle scenarios
function getInitialAppointments() {
  const now = new Date();
  
  // 1. Pending appointment created 1 hour ago -> 3 hours remaining on 4-hour countdown
  const pendingCreated = new Date(now.getTime() - 1 * 60 * 60 * 1000);
  const pendingDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days in future
  
  // 2. Confirmed appointment scheduled tomorrow at 10:30 AM
  const confirmedDate = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
  
  // 3. Completed past appointment
  const pastDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  return [
    {
      id: "APT-2026-9041",
      hospital_id: 1,
      hospital_name: "Demo General Hospital",
      department_id: 101,
      department_name: "Cardiology",
      doctor_id: 301,
      doctor_name: "Dr. Sarah Jenkins",
      doctor_designation: "Senior Consultant Cardiologist",
      doctor_room: "OPD Wing B &bull; Room 304",
      doctor_avatar: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150&auto=format&fit=crop&q=80",
      appointment_date: confirmedDate.toISOString().split("T")[0],
      appointment_time: "10:30 AM",
      appointment_type: "Visit Hospital",
      reason: "Follow-up consultation for BP fluctuation & review of recent 2D-Echocardiogram",
      status: "CONFIRMED", // PENDING, CONFIRMED, IN_WAITING, IN_PROGRESS, COMPLETED, CANCELLED
      payment_method: "UPI",
      consultation_fee: 800,
      bill_id: "BILL-2026-0819",
      created_at: new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "APT-2026-9088",
      hospital_id: 1,
      hospital_name: "Demo General Hospital",
      department_id: 102,
      department_name: "Orthopedics",
      doctor_id: 302,
      doctor_name: "Dr. Marcus Reed",
      doctor_designation: "Chief of Orthopedics",
      doctor_room: "OPD Wing A &bull; Room 201",
      doctor_avatar: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80",
      appointment_date: pendingDate.toISOString().split("T")[0],
      appointment_time: "02:30 PM",
      appointment_type: "Visit Hospital",
      reason: "Persistent knee joint inflammation following sports activity",
      status: "PENDING",
      payment_method: "UPI",
      consultation_fee: 900,
      bill_id: "BILL-2026-0892",
      created_at: pendingCreated.toISOString(), // 1h ago
    },
    {
      id: "APT-2026-8710",
      hospital_id: 1,
      hospital_name: "Demo General Hospital",
      department_id: 103,
      department_name: "General Medicine",
      doctor_id: 303,
      doctor_name: "Dr. Liam Patel",
      doctor_designation: "Consultant Physician",
      doctor_room: "OPD Wing C &bull; Room 105",
      doctor_avatar: "https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=150&auto=format&fit=crop&q=80",
      appointment_date: pastDate.toISOString().split("T")[0],
      appointment_time: "11:00 AM",
      appointment_type: "Visit Hospital",
      reason: "Seasonal viral fever evaluation and comprehensive blood test review",
      status: "COMPLETED",
      payment_method: "CASH",
      consultation_fee: 500,
      bill_id: "BILL-2026-0711",
      created_at: new Date(pastDate.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

const INITIAL_CONSULTATIONS = [
  {
    id: "CNS-1049",
    appointment_id: "APT-2026-8710",
    date: "2026-10-09",
    doctor_name: "Dr. Liam Patel",
    department: "General Medicine",
    hospital: "Demo General Hospital",
    provisional_diagnosis: "Acute Upper Respiratory Tract Infection (Resolving) & Stage 1 HTN",
    clinical_notes:
      "Patient presented with mild throat erythema and fatigue. Chest clear to auscultation, SpO2 99% on room air. Blood pressure elevated at 138/88 mmHg. Advised continuation of low-sodium diet and stress reduction. Complete blood count within normal limits.",
    recommended_follow_up: "2026-11-09",
    vitals: { bp: "138/88 mmHg", pulse: "74 bpm", temp: "98.4 F", weight: "72 kg" },
  },
];

const INITIAL_LAB_REPORTS = [
  {
    id: "LAB-8812",
    test_name: "Complete Blood Count (CBC) with Differential",
    category: "Hematology",
    ordered_by: "Dr. Liam Patel",
    hospital: "Demo General Hospital",
    ordered_date: "2026-10-09",
    status: "Report Uploaded", // 'Report Uploaded' | 'Pending Sample / Payment'
    report_date: "2026-10-09",
    sample_type: "Whole Blood (EDTA)",
    summary_findings: "WBC 7,200/mcL (Normal), Hemoglobin 14.8 g/dL, Platelets 260,000/mcL. Normocytic normochromic smear.",
    download_filename: "CBC_Report_Undhad_Harshil_LAB8812.pdf",
  },
  {
    id: "LAB-8813",
    test_name: "Lipid Profile & Serum Cholesterol Panel",
    category: "Biochemistry",
    ordered_by: "Dr. Sarah Jenkins",
    hospital: "Demo General Hospital",
    ordered_date: "2026-10-15",
    status: "Report Uploaded",
    report_date: "2026-10-16",
    sample_type: "Serum Fasting",
    summary_findings: "Total Cholesterol 186 mg/dL (Desirable), Triglycerides 142 mg/dL, HDL 48 mg/dL, LDL 110 mg/dL.",
    download_filename: "Lipid_Profile_LAB8813.pdf",
  },
  {
    id: "LAB-8814",
    test_name: "Serum Vitamin D3 (25-OH) & Vitamin B12 Assay",
    category: "Specialized Immunoassay",
    ordered_by: "Dr. Sarah Jenkins",
    hospital: "Demo General Hospital",
    ordered_date: "2026-10-22",
    status: "Pending Sample / Payment",
    report_date: null,
    sample_type: "Serum",
    summary_findings: "Awaiting sample collection at laboratory phlebotomy desk or home collection booking.",
    download_filename: null,
  },
];

const INITIAL_PRESCRIPTIONS = [
  {
    id: "RX-401",
    consultation_id: "CNS-1049",
    doctor_name: "Dr. Sarah Jenkins",
    hospital: "Demo General Hospital",
    date: "2026-10-15",
    medicine_name: "Telmisartan Tablets IP",
    dosage: "20 mg",
    frequency: "Once Daily (Morning)",
    timing: "After Meal",
    duration: "30 Days",
    instructions: "Take with water after breakfast. Monitor weekly blood pressure readings in morning.",
  },
  {
    id: "RX-402",
    consultation_id: "CNS-1049",
    doctor_name: "Dr. Liam Patel",
    hospital: "Demo General Hospital",
    date: "2026-10-09",
    medicine_name: "Azithromycin Tablets IP",
    dosage: "500 mg",
    frequency: "Once Daily",
    timing: "Before Meal",
    duration: "3 Days",
    instructions: "Complete the full 3-day course. Take 1 hour before lunch.",
  },
  {
    id: "RX-403",
    consultation_id: "CNS-1049",
    doctor_name: "Dr. Liam Patel",
    hospital: "Demo General Hospital",
    date: "2026-10-09",
    medicine_name: "Paracetamol & Cetirizine Hydrochloride",
    dosage: "500mg / 5mg",
    frequency: "Twice Daily (Morning / Night)",
    timing: "After Meal",
    duration: "5 Days (SOS)",
    instructions: "Take only if body temperature exceeds 99.5 F or severe nasal congestion.",
  },
];

const INITIAL_CONSULTATION_BILLS = [
  {
    id: "BILL-2026-0819",
    bill_number: "INV-CNS-2026-00412",
    appointment_id: "APT-2026-9041",
    doctor_name: "Dr. Sarah Jenkins",
    hospital_name: "Demo General Hospital",
    department: "Cardiology",
    fee: 800,
    payment_mode: "UPI (Google Pay)",
    transaction_id: "UPI/2026/8940128491",
    status: "COMPLETED",
    bill_date: "2026-10-22",
  },
  {
    id: "BILL-2026-0711",
    bill_number: "INV-CNS-2026-00388",
    appointment_id: "APT-2026-8710",
    doctor_name: "Dr. Liam Patel",
    hospital_name: "Demo General Hospital",
    department: "General Medicine",
    fee: 500,
    payment_mode: "CASH",
    transaction_id: "REC-CSH-9812",
    status: "COMPLETED", // Receipt cleared by receptionist
    bill_date: "2026-10-09",
  },
];

const INITIAL_PHARMACY_BILLS = [
  {
    id: "PHARM-2026-104",
    invoice_number: "RX-INV-2026-9921",
    hospital_name: "Demo General Hospital Pharmacy Unit #1",
    bill_date: "2026-10-15",
    payment_mode: "UPI / QR",
    payment_status: "COMPLETED",
    pharmacist_license: "PH-MH-84920",
    items: [
      { name: "Telmisartan 20mg (Strip of 15)", dosage: "20mg", qty: 2, unit_price: 110.0, line_total: 220.0 },
      { name: "Atorvastatin 10mg (Strip of 10)", dosage: "10mg", qty: 3, unit_price: 140.0, line_total: 420.0 },
      { name: "Vitamin C 500mg Chewable (Strip of 20)", dosage: "500mg", qty: 1, unit_price: 85.0, line_total: 85.0 },
    ],
    // Statutory 12% GST calculation
    subtotal: 725.0,
    gst_rate: 12,
    gst_amount: 87.0, // 725 * 0.12
    total_payable: 812.0, // 725 + 87
  },
  {
    id: "PHARM-2026-088",
    invoice_number: "RX-INV-2026-8419",
    hospital_name: "Demo General Hospital Pharmacy Unit #1",
    bill_date: "2026-10-09",
    payment_mode: "CASH",
    payment_status: "COMPLETED",
    pharmacist_license: "PH-MH-84920",
    items: [
      { name: "Azithromycin 500mg (Strip of 3)", dosage: "500mg", qty: 1, unit_price: 120.0, line_total: 120.0 },
      { name: "Paracetamol 650mg (Strip of 15)", dosage: "650mg", qty: 2, unit_price: 45.0, line_total: 90.0 },
      { name: "Electral Oral Rehydration Salts", dosage: "21.8g Sachet", qty: 4, unit_price: 25.0, line_total: 100.0 },
    ],
    subtotal: 310.0,
    gst_rate: 12,
    gst_amount: 37.2, // 310 * 0.12
    total_payable: 347.2,
  },
];

// --------------------------------------------------------------------------
// 3. Storage Getters & Setters with LocalStorage Persistence
// --------------------------------------------------------------------------
function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to load ${key} from storage:`, err);
    return fallback;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to save ${key} to storage:`, err);
  }
}

// --------------------------------------------------------------------------
// 4. Exported Store API
// --------------------------------------------------------------------------
export const patientStore = {
  // --- Profile ---
  getProfile: () => loadFromStorage(STORAGE_KEYS.PROFILE, INITIAL_PROFILE),
  updateProfile: (updates) => {
    const current = patientStore.getProfile();
    const updated = { ...current, ...updates, profile_completed: true };
    saveToStorage(STORAGE_KEYS.PROFILE, updated);
    return updated;
  },

  // --- Appointments ---
  getAppointments: () => loadFromStorage(STORAGE_KEYS.APPOINTMENTS, getInitialAppointments()),
  
  createAppointment: (appointmentData) => {
    const list = patientStore.getAppointments();
    const newId = `APT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const billId = `BILL-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    
    const newAppointment = {
      id: newId,
      bill_id: billId,
      status: "PENDING", // Strict Rule: Starts as PENDING
      ...appointmentData,
      created_at: appointmentData.created_at || new Date().toISOString(),
    };
    
    const updatedList = [newAppointment, ...list];
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, updatedList);

    // Bill Generation
    if (appointmentData.payment_method === "UPI") {
      // Option A: UPI payment generates COMPLETED consultation bill
      const bills = patientStore.getConsultationBills();
      const newBill = {
        id: billId,
        bill_number: `INV-CNS-2026-${Math.floor(10000 + Math.random() * 90000)}`,
        appointment_id: newId,
        doctor_name: appointmentData.doctor_name,
        hospital_name: appointmentData.hospital_name,
        department: appointmentData.department_name,
        fee: appointmentData.consultation_fee,
        payment_mode: "UPI (GPay / PhonePe)",
        transaction_id: `UPI/${Date.now().toString().slice(-8)}`,
        status: "COMPLETED",
        bill_date: new Date().toISOString().split("T")[0],
      };
      saveToStorage(STORAGE_KEYS.CONSULTATION_BILLS, [newBill, ...bills]);
    } else {
      // Option B: CASH generates PENDING bill which is HIDDEN until receptionist clears it
      const cashPendingBills = loadFromStorage("hms_cash_pending_bills", []);
      cashPendingBills.push({
        id: billId,
        appointment_id: newId,
        status: "PENDING",
        payment_mode: "CASH",
        fee: appointmentData.consultation_fee,
      });
      saveToStorage("hms_cash_pending_bills", cashPendingBills);
    }

    return newAppointment;
  },

  rescheduleAppointment: (appointmentId, newDate, newTime) => {
    const list = patientStore.getAppointments();
    const index = list.findIndex((a) => a.id === appointmentId);
    if (index === -1) throw new Error("Appointment record not found.");

    const apt = list[index];

    // Strict Rule: Allowed ONLY when status is PENDING or CONFIRMED
    const check = canReschedule(apt);
    if (!check.allowed) {
      throw new Error(check.reason || "Appointment cannot be rescheduled.");
    }

    // Check Slot Collision
    const isSlotTaken = list.some(
      (a) =>
        a.id !== appointmentId &&
        a.doctor_id === apt.doctor_id &&
        a.appointment_date === newDate &&
        a.appointment_time === newTime &&
        a.status !== "CANCELLED"
    );

    if (isSlotTaken) {
      throw new Error("Selected time slot is already booked for this doctor. Please choose another slot.");
    }

    list[index] = {
      ...apt,
      appointment_date: newDate,
      appointment_time: newTime,
      rescheduled_at: new Date().toISOString(),
    };

    saveToStorage(STORAGE_KEYS.APPOINTMENTS, list);
    return list[index];
  },

  cancelAppointment: (appointmentId, cancelReason = "Cancelled by patient") => {
    const list = patientStore.getAppointments();
    const index = list.findIndex((a) => a.id === appointmentId);
    if (index === -1) throw new Error("Appointment not found.");

    const apt = list[index];

    // Strict Rule: In-progress appointments cannot be cancelled
    if (apt.status === "IN_PROGRESS" || apt.status === "COMPLETED") {
      throw new Error("Active consultations in cabin or completed sessions cannot be cancelled.");
    }

    // Strict Rule: Cancellation permitted up to 4 HOURS before scheduled time
    const scheduledDateTime = new Date(`${apt.appointment_date} ${apt.appointment_time}`);
    const now = new Date();
    const hoursDifference = (scheduledDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursDifference < 4) {
      throw new Error(
        "Cancellation policy violation: Appointments can only be cancelled up to 4 hours prior to the scheduled slot."
      );
    }

    list[index] = {
      ...apt,
      status: "CANCELLED",
      cancel_reason: cancelReason,
      cancelled_at: new Date().toISOString(),
    };

    saveToStorage(STORAGE_KEYS.APPOINTMENTS, list);
    return list[index];
  },

  // --- Clinical History & Records ---
  getConsultations: () => loadFromStorage(STORAGE_KEYS.CONSULTATIONS, INITIAL_CONSULTATIONS),
  getLabReports: () => loadFromStorage(STORAGE_KEYS.LAB_REPORTS, INITIAL_LAB_REPORTS),
  getPrescriptions: () => loadFromStorage(STORAGE_KEYS.PRESCRIPTIONS, INITIAL_PRESCRIPTIONS),

  // --- Bills & Invoices ---
  // Strict Rule: Only COMPLETED bills are visible to patient
  getConsultationBills: () => {
    const all = loadFromStorage(STORAGE_KEYS.CONSULTATION_BILLS, INITIAL_CONSULTATION_BILLS);
    return all.filter((b) => b.status === "COMPLETED");
  },
  getPharmacyBills: () => loadFromStorage(STORAGE_KEYS.PHARMACY_BILLS, INITIAL_PHARMACY_BILLS),
};

// --------------------------------------------------------------------------
// 5. Time & Date Utility Helpers for Business Rules
// --------------------------------------------------------------------------

/**
 * Checks if a date is within the strictly allowed 3-month (90-day) booking window
 * and not in the past.
 */
export function validateBookingDate(dateString) {
  const selected = new Date(dateString);
  selected.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 90); // 3-month future ceiling

  if (selected < today) {
    return { valid: false, message: "Cannot select a past date." };
  }
  if (selected > maxDate) {
    return { valid: false, message: "Appointments can only be booked within a 3-month window from today." };
  }
  return { valid: true };
}

/**
 * Computes remaining time on a 4-hour pending confirmation window
 */
export function getPendingCountdown(createdAtString) {
  if (!createdAtString) {
    return { expired: true, text: "Expired" };
  }
  const created = new Date(createdAtString).getTime();
  if (isNaN(created)) {
    return { expired: true, text: "Expired" };
  }

  const expiresAt = created + 4 * 60 * 60 * 1000; // 4 hours in ms
  const now = Date.now();
  const diffMs = expiresAt - now;

  if (diffMs <= 0) {
    return { expired: true, text: "Expired" };
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  return {
    expired: false,
    text: `${hours}h ${minutes}m`,
    totalSeconds: Math.floor(diffMs / 1000),
  };
}

/**
 * Checks if rescheduling is permitted (>= 10 hours before appointment, and confirmation window not expired)
 */
export function canReschedule(appointment, countdown = null) {
  if (!appointment) return { allowed: false, reason: "No appointment provided." };

  const statusUpper = (appointment.status || "").toUpperCase();
  if (statusUpper !== "PENDING" && statusUpper !== "CONFIRMED") {
    return { allowed: false, reason: "Status does not permit rescheduling." };
  }

  // 1. If pending confirmation window has expired (time is out)
  if (statusUpper === "PENDING") {
    const cd = countdown || (appointment.created_at ? getPendingCountdown(appointment.created_at) : { expired: true });
    if (cd && cd.expired) {
      return {
        allowed: false,
        reason: "Confirmation window expired (Time is out).",
      };
    }
  }

  // 2. Parse scheduled appointment time
  let scheduled = new Date(`${appointment.appointment_date} ${appointment.appointment_time}`).getTime();
  if (isNaN(scheduled)) {
    const dateOnly = appointment.appointment_date ? String(appointment.appointment_date).split("T")[0] : "";
    scheduled = new Date(`${dateOnly} ${appointment.appointment_time}`).getTime();
  }
  const now = Date.now();
  const hoursLeft = (scheduled - now) / (1000 * 60 * 60);

  if (isNaN(scheduled) || hoursLeft <= 0) {
    return {
      allowed: false,
      reason: "Appointment time has already passed.",
    };
  }

  if (hoursLeft < 10) {
    return {
      allowed: false,
      reason: "Locked (Within 10h of slot)",
      hoursLeft: Math.max(0, hoursLeft).toFixed(1),
    };
  }

  return { allowed: true, hoursLeft: hoursLeft.toFixed(1) };
}

/**
 * Checks if cancellation is permitted (>= 4 hours before appointment, and not expired)
 */
export function canCancel(appointment, countdown = null) {
  if (!appointment) return { allowed: false, reason: "No appointment provided." };

  const statusUpper = (appointment.status || "").toUpperCase();
  if (statusUpper === "IN_PROGRESS" || statusUpper === "COMPLETED" || statusUpper === "CANCELLED") {
    return { allowed: false, reason: "Cannot cancel an active or finished consultation." };
  }

  // 1. If pending confirmation window has expired (time is out)
  if (statusUpper === "PENDING") {
    const cd = countdown || (appointment.created_at ? getPendingCountdown(appointment.created_at) : { expired: true });
    if (cd && cd.expired) {
      return {
        allowed: false,
        reason: "Confirmation window expired (Time is out).",
      };
    }
  }

  let scheduled = new Date(`${appointment.appointment_date} ${appointment.appointment_time}`).getTime();
  if (isNaN(scheduled)) {
    const dateOnly = appointment.appointment_date ? String(appointment.appointment_date).split("T")[0] : "";
    scheduled = new Date(`${dateOnly} ${appointment.appointment_time}`).getTime();
  }
  const now = Date.now();
  const hoursLeft = (scheduled - now) / (1000 * 60 * 60);

  if (isNaN(scheduled) || hoursLeft <= 0) {
    return {
      allowed: false,
      reason: "Appointment time has already passed.",
    };
  }

  if (hoursLeft < 4) {
    return {
      allowed: false,
      reason: "Locked (Within 4h of slot)",
      hoursLeft: Math.max(0, hoursLeft).toFixed(1),
    };
  }

  return { allowed: true, hoursLeft: hoursLeft.toFixed(1) };
}

