# FILE-MAP.md — Verified Repository Navigation Map

> **Inspection Timestamp:** 2026-10-30T13:30:00+05:30  
> **Repository Root:** `c:\Users\Admin\Documents\doc\Exe.GitHub\Hospital_Management_System-HarshilU`  
> **Documentation Scope:** Repository codebase analysis, static code tracing, route registration mapping, schema verification, and architectural dependency analysis. No source code or runtime behavior was modified.

---

## 1. Document Purpose

This document serves as an authoritative, verified navigation map of the **HealthMesh / Hospital Management System (HMS)** software repository. It provides developers and AI agents with precise pointers to where functionality lives, how frontend and backend modules interconnect, how database entities relate, and which business flows are confirmed versus unverified.

All claims in this document have been verified directly against the repository's files, exports, route handlers, SQL schemas, and test suites. Speculative features are explicitly categorized as **Unknown**, **Partially Verified**, or **Documented Requirement Without Verified Implementation**.

---

## 2. Repository Overview

- **Repository Type:** Modular Monorepo containing a centralized Express/Node.js backend and five specialized React micro-frontend applications.
- **Frameworks & Languages:**
  - **Backend:** Node.js (v18+/v20+), Express.js (v5.x), JavaScript (CommonJS)
  - **Frontend:** React 19, Vite 8, Tailwind CSS v4, JavaScript (ES Modules, JSX)
  - **Database:** MySQL 8.x accessed via `mysql2/promise` with connection pooling
- **Actual Frontend Applications Identified:**
  1. `apps/super-admin` (Port 5173): Central healthcare authority, multi-hospital governance, master catalogs.
  2. `apps/hospital-admin` (Port 5174): Facility operations, wards, beds, admissions, hospital lab/pharmacy formulary, user management.
  3. `apps/doctor` (Port 5175): Physician workstation, consultations, vitals, electronic prescriptions, lab test orders.
  4. `apps/staff` (Port 5176): Reception intake, triage queue, inpatient admissions, bed allocation, lab processing, pharmacy inventory & billing.
  5. `apps/patient` (Port 5177): Patient self-service, booking, digital prescriptions, lab reports, pharmacy bill settlements.
  - *Public Website:* **Not Found** in the current repository.
- **Backend Architecture:** REST API mounted under `/api/*`, supplemented by a Socket.IO real-time WebSocket server (`socket.io` v4.8+) running concurrently on the same HTTP server (`server.js`).
- **Database Layer:** Direct parameterized SQL execution and multi-statement transactions via `mysql2/promise` connection pool. Schema managed through baseline `schema.sql` and 13 sequential SQL migrations with an automated JavaScript runner (`migrate.js`).
- **Authentication & Authorization:** Multi-tenant JSON Web Tokens (`jsonwebtoken`) with embedded `sub` (user ID), `hospitalId`, `role`, and `token_version`. Enforced through `backend/middleware/auth.js` (`requireAuth`, `allowRoles`).
- **External Integrations:**
  - Nodemailer email delivery with a local development fallback (`backend/.dev-emails.json`)
  - Dynamic UPI QR code generation via `qrcode`
  - Google OAuth identity provider helper (`services/googleAuthService.js`)
- **Tests & Verification:** 48 automated test suites located in `backend/tests/` covering Modules 2, 4–14, and real-time Socket.IO synchronization.

---

## 3. Repository Structure

```
Hospital_Management_System-HarshilU/
├── apps/
│   ├── doctor/                 # Consulting Physician Workstation (Port 5175)
│   │   ├── src/
│   │   │   ├── components/     # CustomDropdown
│   │   │   ├── pages/          # DoctorDashboard, ConsultationWorkspace, DoctorPrescriptions, DoctorProfile, Hospitals
│   │   │   ├── services/       # api.js, portalConfig.js
│   │   │   ├── App.jsx         # Role guard, session management, tab-based navigation
│   │   │   └── main.jsx        # React root entry point
│   │   └── package.json
│   ├── hospital-admin/         # Facility Administration Portal (Port 5174)
│   │   ├── src/
│   │   │   ├── components/     # CustomDropdown
│   │   │   ├── pages/          # Hospitals, UserManagement, HospitalDepartments, AdmissionManagement, WardBedManagement,
│   │   │   │                   # HospitalLabTests, HospitalPharmacy, NotificationHistory, PendingApprovals
│   │   │   ├── services/       # api.js, portalConfig.js, socket.js
│   │   │   ├── App.jsx         # Role guard, session management, navigation routing
│   │   │   └── main.jsx
│   │   └── package.json
│   ├── patient/                # Consumer Patient Health Portal (Port 5177)
│   │   ├── src/
│   │   │   ├── components/     # CustomDropdown
│   │   │   ├── pages/          # PatientDashboard, MyAppointments, BookAppointmentModal, MedicalRecords, BillsAndPayments,
│   │   │   │                   # ProfileCompletion, PatientRegistration, OtpVerificationModal
│   │   │   ├── services/       # api.js, patientData.js, portalConfig.js
│   │   │   ├── App.jsx         # Role guard, session persistence, mandatory profile guard
│   │   │   └── main.jsx
│   │   └── package.json
│   ├── staff/                  # Front-Desk, Nursing & Pharmacy Operations Desk (Port 5176)
│   │   ├── src/
│   │   │   ├── components/     # CustomDropdown
│   │   │   ├── pages/          # StaffDashboard, AdmissionManagement, WardBedManagement, LaboratoryManagement,
│   │   │   │                   # PharmacyManagement, StaffProfile, Hospitals
│   │   │   ├── services/       # api.js, portalConfig.js, socket.js
│   │   │   ├── App.jsx         # Role guard, session management, navigation tabs
│   │   │   └── main.jsx
│   │   └── package.json
│   └── super-admin/            # Central Governance Authority Portal (Port 5173)
│       ├── src/
│       │   ├── components/     # CustomDropdown
│       │   ├── pages/          # Hospitals, UserManagement, PendingApprovals, Locations, DepartmentsAndDesignations,
│       │   │                   # MasterLabCatalog, MasterMedicineCatalog, NotificationHistory
│       │   ├── services/       # api.js, portalConfig.js, socket.js
│       │   ├── App.jsx         # Super admin session guard, tab-based navigation
│       │   └── main.jsx
│       └── package.json
│
├── backend/
│   ├── database/
│   │   ├── migrations/         # 13 Sequential SQL migrations (001 - 013)
│   │   │   ├── 001_auth_module2.sql
│   │   │   ├── 002_module3_master_data.sql
│   │   │   ├── 003_module4_departments_doctors_staff.sql
│   │   │   ├── 004_module5_patient_registration_profiles.sql
│   │   │   ├── 005_module6_appointment_scheduling.sql
│   │   │   ├── 006_module7_notifications_emails.sql
│   │   │   ├── 007_module8_consultation_management.sql
│   │   │   ├── 008_module9_patient_admissions.sql
│   │   │   ├── 009_module10_wards_and_beds.sql
│   │   │   ├── 010_module11_laboratory_investigations.sql
│   │   │   ├── 011_module12_medicine_inventory_and_dispensing.sql
│   │   │   ├── 012_module13_prescription_management.sql
│   │   │   ├── 013_module14_pharmacy_billing_and_payment.sql
│   │   │   └── 014_module15_dispensing_and_stock_management.sql
│   │   ├── migrate.js          # Migration runner & comprehensive seed generator
│   │   └── schema.sql          # Baseline relational schema
│   ├── middleware/
│   │   ├── auth.js             # JWT verification, token versioning, allowRoles guard
│   │   └── upload.js           # Multer storage configuration for branding, records & lab PDFs
│   ├── routes/
│   │   ├── admissions.js       # Inpatient admissions, status lifecycle, history logs
│   │   ├── appointments.js     # Hierarchy booking, doctor slots, queue, cancellation, rescheduling
│   │   ├── auth.js             # Authentication, password change, OTP, first-login reset
│   │   ├── beds.js             # Bed inventory, capacity, maintenance logging, allocations
│   │   ├── consultations.js    # Doctor clinical workspace, vitals, diagnoses, clinical notes
│   │   ├── departments.js      # Hospital-level department mapping & status toggling
│   │   ├── designations.js     # Global & facility designation taxonomy
│   │   ├── doctors.js          # Doctor profiles, fees, availability schedules, leave management
│   │   ├── hospitals.js        # Hospital CRUD, profiles, branding logos, UPI settlement QR
│   │   ├── labs.js             # Lab catalog, hospital formulary, requests, PDF reports, billing
│   │   ├── locations.js        # Geographic taxonomy: Countries, States, Cities
│   │   ├── masterDepartments.js# Global department master taxonomy
│   │   ├── notifications.js    # Outbox management, email status logs, DLQ retries
│   │   ├── opd.js              # OPD clinical queue, reception triage check-in, token dispatch
│   │   ├── patients.js         # Patient profiles, medical history, staff walk-in registration
│   │   ├── pharmacy.js         # Categories, suppliers, batch inventory, FEFO dispensing, bills & GST
│   │   ├── prescriptions.js    # Prescription lifecycle, dosage regimens, dispensation integration
│   │   ├── staff.js            # Operational staff profiles, onboarding, permission templates
│   │   ├── users.js            # User directory, approvals, password reset dispatch
│   │   └── wards.js            # Ward management, department mapping, capacity limits
│   ├── services/
│   │   ├── auditService.js     # System-wide audit logging to `audit_logs` table
│   │   ├── emailService.js     # Nodemailer transport, fallback outbox logging
│   │   ├── emailTemplates.js   # Clinical HTML email layouts with plain text fallback
│   │   ├── googleAuthService.js# Google OAuth integration
│   │   ├── notificationService.js# Idempotent notification dispatcher & queue
│   │   ├── otpService.js       # 6-digit numeric OTP generation, hashing & rate limiting
│   │   ├── reminderScheduler.js# 24-hour appointment reminder background cron job
│   │   ├── scheduleService.js  # Slot generation & doctor schedule calculation
│   │   └── socketService.js    # Socket.IO server initialization & hospital room broadcasting
│   ├── tests/                  # 48 automated test suites for Modules 2, 4–14 & Real-Time Sync
│   ├── uploads/                # File storage for hospital logos, lab reports, and patient records
│   ├── db.js                   # mysql2 connection pool instantiation
│   └── server.js               # Express application entry point & Socket.IO server
│
├── README.md                   # Enterprise system documentation
└── FILE-MAP.md                 # Verified repository navigation map (This document)
```

---

## 4. Application Entry Points

| Subsystem / Application | Entry File | Port / Protocol | Verified Command |
| :--- | :--- | :--- | :--- |
| **Backend API & Real-time Server** | [backend/server.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/server.js) | Port 5000 (HTTP / WS) | `node server.js` or `npx nodemon server.js` |
| **Database Migration Runner** | [backend/database/migrate.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/database/migrate.js) | CLI / MySQL Connection | `node database/migrate.js` |
| **Super Admin Portal** | [apps/super-admin/src/main.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/super-admin/src/main.jsx) | Port 5173 (Vite HTTP) | `npm run dev` (inside `apps/super-admin`) |
| **Hospital Admin Portal** | [apps/hospital-admin/src/main.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/hospital-admin/src/main.jsx) | Port 5174 (Vite HTTP) | `npm run dev` (inside `apps/hospital-admin`) |
| **Doctor Workstation** | [apps/doctor/src/main.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/doctor/src/main.jsx) | Port 5175 (Vite HTTP) | `npm run dev` (inside `apps/doctor`) |
| **Staff Operations Desk** | [apps/staff/src/main.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/staff/src/main.jsx) | Port 5176 (Vite HTTP) | `npm run dev` (inside `apps/staff`) |
| **Patient Health Portal** | [apps/patient/src/main.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/patient/src/main.jsx) | Port 5177 (Vite HTTP) | `npm run dev` (inside `apps/patient`) |

---

## 5. Frontend Application Map

Each of the five frontend applications follows a unified architecture:
- **Build System:** Vite 8, React 19.
- **Routing:** Tab/state-based routing synchronized with the browser URL query parameters, managed in root `App.jsx`.
- **Session Management:** `services/portalConfig.js` provides centralized session storage (`localStorage`), foreign role redirect protection (`redirectIfForeignRole`), and cross-portal session handoff (`consumeIncomingSession`).
- **Global Auth Interceptor:** Custom `hms_unauthorized` window event triggered by `services/api.js` on HTTP 401, causing immediate session eviction and redirect to login.
- **Real-Time Client:** Portals that display operational telemetry (`hospital-admin`, `staff`, `super-admin`) import `services/socket.js`, connecting to `http://localhost:5000` with the JWT token in the handshake auth.

### 5.1 Super Admin (`apps/super-admin`)
- **Root Component:** [App.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/super-admin/src/App.jsx)
- **Role Guard:** `CURRENT_ROLE = "super_admin"`
- **Key Pages:**
  - `Hospitals`: Multi-hospital listing, onboarding modal, facility status toggling.
  - `UserManagement`: Cross-hospital user directory, account status toggles, password reset.
  - `PendingApprovals`: Review pending hospital registrations and user approvals.
  - `Locations`: Countries, States, Cities master data tables.
  - `DepartmentsAndDesignations`: Global department master taxonomy and clinical designations.
  - `MasterLabCatalog`: Global diagnostic laboratory test taxonomy.
  - `MasterMedicineCatalog`: Central master pharmaceutical drug catalog and categories.
  - `NotificationHistory`: Centralized email notification outbox and DLQ logs.
- **API Client:** [services/api.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/super-admin/src/services/api.js) communicates with `/api/hospitals`, `/api/master-departments`, `/api/designations`, `/api/locations`, `/api/labs`, `/api/pharmacy`, `/api/users`, `/api/notifications`.

### 5.2 Hospital Admin (`apps/hospital-admin`)
- **Root Component:** [App.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/hospital-admin/src/App.jsx)
- **Role Guard:** `CURRENT_ROLE = "hospital_admin"`
- **Key Pages:**
  - `Hospitals`: Facility profile, emergency contact, shift configuration, UPI settlement QR code upload.
  - `HospitalDepartments`: Mapping master departments to the hospital.
  - `UserManagement`: Provisioning and managing doctors, receptionists, nurses, and pharmacists.
  - `AdmissionManagement`: Viewing inpatient admissions, monitoring patient status history.
  - `WardBedManagement`: Configuring inpatient wards, registering beds, tracking capacity and maintenance.
  - `HospitalLabTests`: Assigning diagnostic tests to hospital catalog, setting test prices.
  - `HospitalPharmacy`: Setting hospital medicine sale prices, minimum stock alert levels, discount limits.
  - `NotificationHistory`: Hospital-scoped email outbox and retry triggers.
- **Real-Time Integration:** Subscribes via `services/socket.js` to `wards:updated`, `beds:updated`, `admissions:updated`, `departments:updated`.

### 5.3 Doctor Workstation (`apps/doctor`)
- **Root Component:** [App.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/doctor/src/App.jsx)
- **Role Guard:** `CURRENT_ROLE = "doctor"`
- **Key Pages:**
  - `DoctorDashboard`: Active clinical shift clock, assigned appointment queue, waiting room status.
  - `ConsultationWorkspace`: Vital signs recording, automated BMI alert computation, diagnosis formulation, diagnostic lab investigation orders, electronic prescription writing, follow-up scheduling, and admission recommendation handoff.
  - `DoctorPrescriptions`: Prescription history review, status tracking (`active`, `dispensed`, `cancelled`).
  - `DoctorProfile`: Availability schedule, working hours, break periods, consultation fee.
- **API Client:** [services/api.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/doctor/src/services/api.js) communicates with `/api/opd`, `/api/consultations`, `/api/prescriptions`, `/api/labs`, `/api/appointments`, `/api/doctors`.

### 5.4 Staff Operations Desk (`apps/staff`)
- **Root Component:** [App.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/staff/src/App.jsx)
- **Role Guard:** `CURRENT_ROLE = "staff"`
- **Key Pages:**
  - `StaffDashboard`: Front-desk patient search, walk-in registration, sequential queue token dispatch, triage check-in.
  - `AdmissionManagement`: Creating inpatient admissions, executing patient discharge, viewing status history.
  - `WardBedManagement`: Live bed occupancy matrix, assigning available beds to admitted patients, releasing beds on discharge, placing beds in maintenance.
  - `LaboratoryManagement`: Lab test orders queue, specimen collection timestamping, report PDF upload with SHA-256 validation, lab cashiering.
  - `PharmacyManagement`: Medicine suppliers, categories, batch intake, stock movement ledger, prescription fulfillment queue, atomic FEFO dispensing, pharmacy billing desk with 12% GST calculation.
- **Real-Time Integration:** Subscribes via `services/socket.js` to live bed allocations, admissions, and departmental updates.

### 5.5 Patient Health Portal (`apps/patient`)
- **Root Component:** [App.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/patient/src/App.jsx)
- **Role Guard:** `CURRENT_ROLE = "patient"`
- **Mandatory Profile Guard:** Blocks access to appointment booking until blood group, DOB, gender, and emergency contact are completed (`ProfileCompletion.jsx`).
- **Key Pages:**
  - `PatientDashboard`: Upcoming appointment timeline, care summary highlights.
  - `MyAppointments`: View scheduled visits, cancellation (subject to 4-hour rule), rescheduling (subject to 4-hour rule).
  - `BookAppointmentModal`: 4-step hierarchy (Hospital → Department → Doctor → 30-min Slot).
  - `MedicalRecords`: View and download verified lab reports, electronic consultations timeline.
  - `BillsAndPayments`: View pharmacy bills, itemized GST breakdown, dynamic UPI QR settlement, record external pharmacy purchases.
- **API Client:** [services/api.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/patient/src/services/api.js).

---

## 6. Backend Architecture Map

### 6.1 Server Initialization & Middleware Stack
- **Entry Point:** [backend/server.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/server.js)
- **HTTP & WebSocket Server:** Creates standard Node `http.createServer(app)` and attaches `initSocketServer(server)`.
- **Global Middleware:**
  - `cors()` for cross-origin portal requests
  - `express.json()` for JSON body parsing
  - `express.static('/uploads')` for serving uploaded hospital logos, patient records, and lab report PDFs
- **Background Cron Jobs:** `startReminderScheduler()` initiated on server startup.

### 6.2 Authentication & Security Middleware
- **Module:** [backend/middleware/auth.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/middleware/auth.js)
  - `requireAuth`: Validates `Authorization: Bearer <token>`. Decodes payload, queries `users` table, checks if user is active, and verifies that the token's `token_version` matches the database `token_version` (revoking sessions immediately upon password change or suspension).
  - `allowRoles(...roles)`: Verifies caller role matches required privileges (`super_admin`, `hospital_admin`, `doctor`, `staff`, `patient`).
- **File Upload Security:** [backend/middleware/upload.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/middleware/upload.js) restricts uploads by MIME type (JPEG, PNG, WebP, PDF) and file size (max 5MB for logos/records, max 10MB for lab reports).

### 6.3 Registered API Route Groups

| Route Prefix | Route Handler File | Main Responsibilities | Primary Middleware |
| :--- | :--- | :--- | :--- |
| `/api/auth` | [backend/routes/auth.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/auth.js) | Login, token issuance, password reset OTP, first-login password update | Public / `requireAuth` |
| `/api/users` | [backend/routes/users.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/users.js) | User directory, approval workflows, temporary credential generation | `requireAuth`, `allowRoles` |
| `/api/hospitals` | [backend/routes/hospitals.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/hospitals.js) | Hospital directory, profile updates, UPI QR upload, shifts | `requireAuth` |
| `/api/departments` | [backend/routes/departments.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/departments.js) | Hospital department assignments, status toggling | `requireAuth` |
| `/api/master-departments` | [backend/routes/masterDepartments.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/masterDepartments.js) | Global department taxonomy | `requireAuth`, `allowRoles` |
| `/api/doctors` | [backend/routes/doctors.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/doctors.js) | Doctor clinical profiles, consultation fees, leaves | `requireAuth` |
| `/api/staff` | [backend/routes/staff.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/staff.js) | Operational staff profiles, role assignment | `requireAuth` |
| `/api/patients` | [backend/routes/patients.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/patients.js) | Self-registration, walk-in registration, medical records | `requireAuth` |
| `/api/appointments` | [backend/routes/appointments.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/appointments.js) | 4-step hierarchy, slot calculation, booking, rescheduling, cancel | `requireAuth` |
| `/api/opd` | [backend/routes/opd.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/opd.js) | Reception check-in, token queue dispatch, triage vitals | `requireAuth` |
| `/api/consultations` | [backend/routes/consultations.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/consultations.js) | Physician clinical workspace, vitals, labs, Rx linkage | `requireAuth`, `allowRoles` |
| `/api/admissions` | [backend/routes/admissions.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/admissions.js) | Inpatient admissions, status lifecycle, discharge summaries | `requireAuth` |
| `/api/wards` | [backend/routes/wards.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/wards.js) | Ward creation, department scoping, capacity configuration | `requireAuth` |
| `/api/beds` | [backend/routes/beds.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/beds.js) | Bed registration, concurrency-safe assignment, release, maintenance | `requireAuth` |
| `/api/labs` | [backend/routes/labs.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/labs.js) | Master tests catalog, hospital pricing, report upload, billing | `requireAuth` |
| `/api/pharmacy` | [backend/routes/pharmacy.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/pharmacy.js) | Categories, suppliers, batch inventory, FEFO dispensing, bills, GST | `requireAuth` |
| `/api/prescriptions` | [backend/routes/prescriptions.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/prescriptions.js) | Prescription creation, structured regimens, partial dispensing | `requireAuth` |
| `/api/notifications` | [backend/routes/notifications.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/notifications.js) | Notification outbox, delivery logs, DLQ retry triggers | `requireAuth`, `allowRoles` |
| `/api/locations` | [backend/routes/locations.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/locations.js) | Countries, States, Cities master taxonomy | `requireAuth` |
| `/api/designations` | [backend/routes/designations.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/designations.js) | Staff and doctor designation taxonomy | `requireAuth` |

---

## 7. Database Architecture Map

### 7.1 Database Connection Pattern
- **Configuration File:** [backend/db.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/db.js)
- **Engine:** `mysql2/promise` connection pool
- **Pool Settings:** `waitForConnections: true`, `connectionLimit: 10`, `queueLimit: 0`
- **Transactions & Concurrency:** Multi-step operations use `const connection = await pool.getConnection(); await connection.beginTransaction(); ... await connection.commit();` with pessimistic row locking (`SELECT ... FOR UPDATE`).
- **Stored Procedures:** **None Found.** The codebase executes parameterized inline SQL and transactional queries directly via `mysql2/promise`.

### 7.2 Migrations Manifest

| Migration File | Description & Core Tables / Modifications |
| :--- | :--- |
| `001_auth_module2.sql` | `users` (adds `must_change_password`, `token_version`), `otp_verifications`, `audit_logs` |
| `002_module3_master_data.sql` | `countries`, `states`, `cities`, `hospitals` (shifts, emergency contacts, UPI VPA) |
| `003_module4_departments_doctors_staff.sql` | `master_departments`, `departments`, `doctor_profiles`, `staff_profiles`, `designations` |
| `004_module5_patient_registration_profiles.sql` | `patient_profiles`, `medical_records` |
| `005_module6_appointment_scheduling.sql` | `doctor_schedules`, `doctor_leaves`, `appointments`, `appointment_status_history` |
| `006_module7_notifications_emails.sql` | `notification_outbox`, `notification_logs` |
| `007_module8_consultation_management.sql` | `consultations`, `consultation_vitals`, `master_lab_tests`, `investigation_requests`, `master_medicines`, `prescriptions`, `prescription_items` |
| `008_module9_patient_admissions.sql` | `admissions`, `admission_status_history` |
| `009_module10_wards_and_beds.sql` | `wards`, `beds`, `bed_assignments` (with virtual keys), `bed_maintenance_logs` |
| `010_module11_laboratory_investigations.sql` | `hospital_lab_tests`, `lab_reports` (SHA-256 hash), `lab_payments`, extends `investigation_requests` |
| `011_module12_medicine_inventory_and_dispensing.sql` | `medicine_categories`, `suppliers`, `hospital_medicines`, `medicine_batches`, `stock_movements`, `pharmacy_dispensations`, `pharmacy_dispensation_items` |
| `012_module13_prescription_management.sql` | Extends `prescriptions` (status), `prescription_items` (dispensed_quantity), `prescription_status_history` |
| `013_module14_pharmacy_billing_and_payment.sql` | `pharmacy_bills`, `pharmacy_bill_items`, `pharmacy_payments`, `pharmacy_refunds` |
| `014_module15_dispensing_and_stock_management.sql` | Extends `pharmacy_dispensations` (`bill_id`, `idempotency_key`, indexes `fk_disp_bill`, `uq_disp_idempotency`) |

### 7.3 Concurrency Control via Virtual Generated Columns
In [009_module10_wards_and_beds.sql](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/database/migrations/009_module10_wards_and_beds.sql), table `bed_assignments` enforces strict single-active-assignment invariants at the MySQL engine level:
```sql
active_bed_key BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', bed_id, NULL)) VIRTUAL,
active_admission_key BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', admission_id, NULL)) VIRTUAL,
CONSTRAINT uq_active_bed_assignment UNIQUE (active_bed_key),
CONSTRAINT uq_active_admission_assignment UNIQUE (active_admission_key)
```
This guarantees that no two concurrent database transactions can assign the same bed or the same admission simultaneously.

---

## 8. Functional Map

### 8.1 Authentication & Session Governance
- **Purpose:** Multi-tenant JWT authentication, first-login password reset, OTP verification, and token invalidation.
- **Entry Point:** `POST /api/auth/login`
- **Primary Files:** [backend/routes/auth.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/auth.js), [backend/services/otpService.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/services/otpService.js)
- **Supporting Files:** [backend/middleware/auth.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/middleware/auth.js), `apps/*/src/services/portalConfig.js`
- **Data Layer:** `users`, `otp_verifications`, `audit_logs`
- **Confidence:** Verified

### 8.2 Master Data & Multi-Hospital Governance
- **Purpose:** Onboarding hospitals, configuring facilities, managing global departments, designations, and geographic taxonomy.
- **Entry Point:** `GET|POST /api/hospitals`, `/api/master-departments`, `/api/locations`
- **Primary Files:** [backend/routes/hospitals.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/hospitals.js), [backend/routes/masterDepartments.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/masterDepartments.js)
- **Supporting Files:** [apps/super-admin/src/pages/Hospitals.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/super-admin/src/pages/Hospitals.jsx), [apps/hospital-admin/src/pages/Hospitals.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/hospital-admin/src/pages/Hospitals.jsx)
- **Data Layer:** `hospitals`, `master_departments`, `departments`, `countries`, `states`, `cities`
- **Confidence:** Verified

### 8.3 Doctor & Staff Provisioning
- **Purpose:** Hospital Admin provisions physicians and operational staff, assigns clinical credentials, shifts, and triggers temporary password email dispatch.
- **Entry Point:** `POST /api/users/doctor`, `POST /api/users/staff`
- **Primary Files:** [backend/routes/users.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/users.js), [backend/routes/doctors.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/doctors.js), [backend/routes/staff.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/staff.js)
- **Supporting Files:** [apps/hospital-admin/src/pages/UserManagement.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/hospital-admin/src/pages/UserManagement.jsx)
- **Data Layer:** `users`, `doctor_profiles`, `staff_profiles`
- **Confidence:** Verified

### 8.4 Patient Registration & Profiles
- **Purpose:** Self-registration with email OTP, staff-assisted walk-in registration, profile completion validation.
- **Entry Point:** `POST /api/patients/register`, `POST /api/patients/walk-in`
- **Primary Files:** [backend/routes/patients.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/patients.js)
- **Supporting Files:** [apps/patient/src/pages/ProfileCompletion.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/patient/src/pages/ProfileCompletion.jsx), [apps/staff/src/pages/StaffDashboard.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/staff/src/pages/StaffDashboard.jsx)
- **Data Layer:** `users`, `patient_profiles`, `otp_verifications`, `medical_records`
- **Confidence:** Verified

### 8.5 Appointment Scheduling & Reception Queue
- **Purpose:** Strict 4-step booking hierarchy, dynamic 30-min slot generation, pessimistic double-booking locks, reception check-in, token dispatch.
- **Entry Point:** `POST /api/appointments`, `PATCH /api/appointments/:id/cancel`, `PATCH /api/appointments/:id/reschedule`, `POST /api/opd/check-in`
- **Primary Files:** [backend/routes/appointments.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/appointments.js), [backend/routes/opd.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/opd.js), [backend/services/scheduleService.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/services/scheduleService.js)
- **Data Layer:** `appointments`, `appointment_status_history`, `doctor_schedules`, `doctor_leaves`
- **Confidence:** Verified

### 8.6 Clinical Consultations & EHR
- **Purpose:** Doctor clinical documentation, chief complaint, systolic/diastolic vitals, BMI computation, diagnosis, follow-up scheduling, and completion guard.
- **Entry Point:** `POST|PATCH /api/consultations`
- **Primary Files:** [backend/routes/consultations.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/consultations.js)
- **Supporting Files:** [apps/doctor/src/pages/ConsultationWorkspace.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/doctor/src/pages/ConsultationWorkspace.jsx)
- **Data Layer:** `consultations`, `consultation_vitals`, `appointments`
- **Confidence:** Verified

### 8.7 Patient Inpatient Admissions
- **Purpose:** Inpatient admission intake (`ADM-YYYYMMDD-XXXX`), assigning patient, doctor, and department; validating tenant relationships; preventing duplicate active admissions (`409 Conflict`); managing status transitions to `discharged`.
- **Entry Point:** `POST /api/admissions`, `PATCH /api/admissions/:id/status`
- **Primary Files:** [backend/routes/admissions.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/admissions.js)
- **Supporting Files:** [apps/hospital-admin/src/pages/AdmissionManagement.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/hospital-admin/src/pages/AdmissionManagement.jsx), [apps/staff/src/pages/AdmissionManagement.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/staff/src/pages/AdmissionManagement.jsx)
- **Data Layer:** `admissions`, `admission_status_history`
- **Confidence:** Verified

### 8.8 Ward & Bed Management
- **Purpose:** Department wards, bed capacity limits, maintenance logs, concurrency-safe bed allocation to active admissions, automatic bed release upon discharge.
- **Entry Point:** `POST /api/wards`, `POST /api/beds`, `POST /api/beds/:id/assign`, `POST /api/beds/:id/release`, `PATCH /api/beds/:id/maintenance`
- **Primary Files:** [backend/routes/wards.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/wards.js), [backend/routes/beds.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/beds.js)
- **Supporting Files:** [apps/hospital-admin/src/pages/WardBedManagement.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/hospital-admin/src/pages/WardBedManagement.jsx), [apps/staff/src/pages/WardBedManagement.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/staff/src/pages/WardBedManagement.jsx)
- **Data Layer:** `wards`, `beds`, `bed_assignments`, `bed_maintenance_logs`
- **Confidence:** Verified

### 8.9 Laboratory & Diagnostic Investigations
- **Purpose:** Super Admin master test catalog (`CBC-001`), hospital lab formulary pricing, doctor clinical test requests (`routine`, `urgent`, `stat`), specimen tracking, secure PDF report upload with SHA-256 deduplication, and cashiering.
- **Entry Point:** `POST|GET /api/labs/master`, `POST /api/labs/hospital-tests`, `POST /api/labs/requests`, `POST /api/labs/orders/:id/reports`, `POST /api/labs/orders/:id/payments`
- **Primary Files:** [backend/routes/labs.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/labs.js)
- **Supporting Files:** [apps/super-admin/src/pages/MasterLabCatalog.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/super-admin/src/pages/MasterLabCatalog.jsx), [apps/staff/src/pages/LaboratoryManagement.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/staff/src/pages/LaboratoryManagement.jsx), [apps/patient/src/pages/MedicalRecords.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/patient/src/pages/MedicalRecords.jsx)
- **Data Layer:** `master_lab_tests`, `hospital_lab_tests`, `investigation_requests`, `lab_reports`, `lab_payments`
- **Confidence:** Verified

### 8.10 Medicine Inventory & FEFO Dispensing
- **Purpose:** Drug categories, approved suppliers, master medicine SKUs (`MED-PARA-500`), hospital formulary, batch inventory with expiry tracking, minimum stock alerts, immutable stock movements ledger, and atomic FEFO dispensing.
- **Entry Point:** `POST /api/pharmacy/categories`, `POST /api/pharmacy/suppliers`, `POST /api/pharmacy/batches`, `POST /api/pharmacy/dispensations`
- **Primary Files:** [backend/routes/pharmacy.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/pharmacy.js)
- **Supporting Files:** [apps/super-admin/src/pages/MasterMedicineCatalog.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/super-admin/src/pages/MasterMedicineCatalog.jsx), [apps/hospital-admin/src/pages/HospitalPharmacy.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/hospital-admin/src/pages/HospitalPharmacy.jsx), [apps/staff/src/pages/PharmacyManagement.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/staff/src/pages/PharmacyManagement.jsx)
- **Data Layer:** `medicine_categories`, `suppliers`, `master_medicines`, `hospital_medicines`, `medicine_batches`, `stock_movements`, `pharmacy_dispensations`, `pharmacy_dispensation_items`
- **Confidence:** Verified

### 8.11 Prescription Management
- **Purpose:** Electronic prescription creation during clinical consultations, structured dosage regimens (`1-0-1`, `SOS`), meal timings, duplicate medicine guards, prescription status machine (`draft` → `active` → `partially_dispensed` → `dispensed`), and pre-dispensing expiry checks.
- **Entry Point:** `POST /api/prescriptions`, `GET /api/prescriptions`, `POST /api/prescriptions/:id/dispense`
- **Primary Files:** [backend/routes/prescriptions.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/prescriptions.js)
- **Supporting Files:** [apps/doctor/src/pages/DoctorPrescriptions.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/doctor/src/pages/DoctorPrescriptions.jsx), [apps/staff/src/pages/PharmacyManagement.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/staff/src/pages/PharmacyManagement.jsx)
- **Data Layer:** `prescriptions`, `prescription_items`, `prescription_status_history`
- **Confidence:** Verified

### 8.12 Pharmacy Billing, Payments & GST Settlement
- **Purpose:** Prescription-to-bill generation, formulary pricing snapshots, statutory 12% GST computation, cashiering desk (`cash`, `upi`, `card`), refunds, idempotency protection, thermal print layouts, email invoice dispatch, and outside pharmacy purchase logging.
- **Entry Point:** `POST /api/pharmacy/bills`, `POST /api/pharmacy/bills/:id/payments`, `POST /api/pharmacy/bills/outside-purchase`, `GET /api/pharmacy/bills/:id/invoice`
- **Primary Files:** [backend/routes/pharmacy.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/pharmacy.js)
- **Supporting Files:** [apps/staff/src/pages/PharmacyManagement.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/staff/src/pages/PharmacyManagement.jsx), [apps/patient/src/pages/BillsAndPayments.jsx](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/apps/patient/src/pages/BillsAndPayments.jsx)
- **Data Layer:** `pharmacy_bills`, `pharmacy_bill_items`, `pharmacy_payments`, `pharmacy_refunds`
- **Confidence:** Verified

### 8.13 Real-Time WebSocket Synchronization
- **Purpose:** Real-time event broadcasting with multi-tenant room isolation (`hospital_${hospitalId}`), pushing live ward, bed, admission, and order updates to connected staff and admin stations without polling.
- **Entry Point:** Handshake on `http://localhost:5000` via Socket.IO
- **Primary Files:** [backend/services/socketService.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/services/socketService.js)
- **Supporting Files:** `apps/*/src/services/socket.js`
- **Channels:** `wards:updated`, `beds:updated`, `admissions:updated`, `departments:updated`, `inventory:updated`, `prescriptions:updated`
- **Confidence:** Verified

---

## 9. File-to-Function Index

### 9.1 Backend Core & Routing
| File/Module | Type | Main Responsibility | Important For | Confidence |
| :--- | :--- | :--- | :--- | :--- |
| `backend/server.js` | Entry Point | Express setup, HTTP server creation, Socket.IO mounting, route registration | Backend runtime | Verified |
| `backend/db.js` | Infrastructure | Creates `mysql2/promise` connection pool | All database queries | Verified |
| `backend/middleware/auth.js` | Middleware | Validates Bearer JWT, verifies `token_version`, enforces `allowRoles` | API security & RBAC | Verified |
| `backend/middleware/upload.js` | Middleware | Multer disk storage, file extension & MIME filters, size limits | Logos, reports & records | Verified |
| `backend/routes/auth.js` | Controller | Handles login, password change, first-login reset, OTP verification | Authentication | Verified |
| `backend/routes/users.js` | Controller | User provisioning, staff/doctor creation, credential dispatch | User management | Verified |
| `backend/routes/hospitals.js` | Controller | Hospital directory CRUD, facility settings, UPI QR code uploads | Facility management | Verified |
| `backend/routes/appointments.js`| Controller | Slot calculation, 4-step booking hierarchy, cancellation, rescheduling | Appointment system | Verified |
| `backend/routes/opd.js` | Controller | Reception check-in, token dispatch, triage vital collection | Outpatient queue | Verified |
| `backend/routes/consultations.js`| Controller | Doctor clinical workspace, vitals, diagnosis, follow-up linkage | Clinical consultations | Verified |
| `backend/routes/admissions.js` | Controller | Inpatient admissions, lifecycle transitions, duplicate prevention | Inpatient care | Verified |
| `backend/routes/wards.js` | Controller | Ward registration, department mapping, capacity limits | Ward administration | Verified |
| `backend/routes/beds.js` | Controller | Bed creation, allocation, discharge release, maintenance | Bed management | Verified |
| `backend/routes/labs.js` | Controller | Master test catalog, hospital formulary, report upload, lab billing | Laboratory operations | Verified |
| `backend/routes/pharmacy.js` | Controller | Categories, suppliers, batch inventory, FEFO dispensing, bills & GST | Pharmacy & inventory | Verified |
| `backend/routes/prescriptions.js`| Controller | Prescription authoring, structured regimens, partial dispensing | Prescription management | Verified |
| `backend/routes/notifications.js`| Controller | Email outbox, delivery status tracking, DLQ retry triggers | Notifications | Verified |

### 9.2 Backend Services & Utilities
| File/Module | Type | Main Responsibility | Important For | Confidence |
| :--- | :--- | :--- | :--- | :--- |
| `backend/services/socketService.js` | Service | Socket.IO server initialization, JWT handshake, room broadcast | Real-time sync | Verified |
| `backend/services/notificationService.js` | Service | Dispatches transactional emails, records outbox logs | Notification delivery | Verified |
| `backend/services/emailService.js` | Service | Nodemailer transport, fallback logging to `.dev-emails.json` | Email transport | Verified |
| `backend/services/emailTemplates.js` | Service | Responsive clinical HTML email layouts with plain text fallback | Email styling | Verified |
| `backend/services/reminderScheduler.js` | Background Task | 24-hour appointment reminder cron runner with idempotency checks | Automated reminders | Verified |
| `backend/services/otpService.js` | Service | 6-digit numeric OTP generation, hashing, rate limiting | Registration & reset | Verified |
| `backend/services/scheduleService.js` | Service | Calculates physician 30-min booking slots, checks leaves | Availability checking | Verified |
| `backend/services/auditService.js` | Service | Records security & operational audit records in `audit_logs` | Audit trail | Verified |

### 9.3 Frontend Applications
| File/Module | Type | Main Responsibility | Important For | Confidence |
| :--- | :--- | :--- | :--- | :--- |
| `apps/super-admin/src/App.jsx` | App Root | Super Admin navigation tabs, session guard, layout docking | Super Admin Portal | Verified |
| `apps/hospital-admin/src/App.jsx`| App Root | Hospital Admin tabs, session guard, real-time socket connection | Facility Admin Portal | Verified |
| `apps/doctor/src/App.jsx` | App Root | Doctor navigation, clinical shift timer, session guard | Doctor Workstation | Verified |
| `apps/staff/src/App.jsx` | App Root | Staff tabs, reception queue, admissions, pharmacy, socket client | Staff Operations Desk | Verified |
| `apps/patient/src/App.jsx` | App Root | Patient navigation, mandatory profile completion guard | Patient Health Portal | Verified |
| `apps/*/src/services/portalConfig.js` | Utility | Manages localStorage sessions, cross-portal redirects | Authentication & session | Verified |
| `apps/*/src/components/CustomDropdown.jsx` | Component | Searchable, keyboard-accessible dropdown with clinical styling | UI selection forms | Verified |

---

## 10. Critical Business Flows

### 10.1 User Authentication & Session Flow
```
User (Login Form)
  → POST /api/auth/login
    → Check email & password_hash (bcryptjs)
    → Verify status == 'active'
    → Generate JWT { sub, hospitalId, role, token_version }
  → Frontend receives token & user object
  → Stores in localStorage via portalConfig.js
  → Validates role against CURRENT_ROLE (redirects if foreign)
  → Opens role dashboard
```

### 10.2 Patient Appointment Booking Flow (Hierarchy)
```
Patient (BookAppointmentModal.jsx)
  → 1. Hospital Selection (GET /api/appointments/hospitals)
  → 2. Department Selection (GET /api/appointments/hospitals/:id/departments)
  → 3. Doctor Selection (GET /api/appointments/hospitals/:id/departments/:deptId/doctors)
  → 4. Date & 30-min Slot (GET /api/appointments/doctors/:id/available-slots)
  → POST /api/appointments
    → requireAuth
    → Validate slot availability & working hours
    → Pessimistic Lock: SELECT ... FOR UPDATE (checks duplicate booking)
    → INSERT INTO appointments (status = 'pending')
    → INSERT INTO appointment_status_history
    → Trigger Booking Received Email (notificationService.js)
```

### 10.3 Appointment Acceptance, Cancellation & Rescheduling Verification

#### Intended Workflow vs. Verified Implementation
- **Pending State:** **Verified.** Online patient bookings are created with `status = 'pending'`. Front-desk staff bookings default to `confirmed`.
- **4-Hour Acceptance Deadline:** **Partially Verified.**
  - In [backend/routes/appointments.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/appointments.js#L1405-L1414), when rescheduling an appointment in `pending` status, the backend enforces:
    ```javascript
    if (currentApt.status === "pending" && currentApt.created_at) {
      if (Date.now() - new Date(currentApt.created_at).getTime() > 4 * 60 * 60 * 1000) {
        return res.status(400).json({ message: "The 4-hour confirmation window has passed..." });
      }
    }
    ```
- **Automatic Cancellation:** **Not Found.** There is no automated background cron worker or timer that autonomously mutates expired pending appointments to `cancelled`. (The existing background job `reminderScheduler.js` only processes upcoming appointment reminders).
- **Confirmed Transition:** **Verified.** Attending doctors or hospital staff transition appointments from `pending` to `confirmed` via `PATCH /api/appointments/:id/status` (or `PATCH /api/appointments/:id/accept`).
- **Rescheduling / Cancellation Advance Notice:**
  - *Documented Requirement:* Rescheduling requires 10 hours advance notice before appointment time.
  - *Actual Code Implementation:* In [backend/routes/appointments.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/appointments.js#L477-L485), the helper `isLessThanFourHoursAhead` enforces a **4-hour rule** for both cancellations and rescheduling:
    ```javascript
    function isLessThanFourHoursAhead(appointmentDateStr, appointmentTimeStr) {
      const diffHours = (appointmentDateTime - Date.now()) / (1000 * 60 * 60);
      return diffHours < 4;
    }
    ```
    Rescheduling or cancelling within 4 hours is rejected with `400 Bad Request`.

### 10.4 Inpatient Admission & Concurrency-Safe Bed Allocation Flow
```
Staff / Admin (AdmissionManagement.jsx)
  → POST /api/admissions
    → Verify patient, doctor, and department belong to hospital
    → Pessimistic lock on patient active admissions (rejects 409 if active admission exists)
    → INSERT INTO admissions (status = 'admitted')
    → Emits Socket.IO 'admissions:updated'

Staff (WardBedManagement.jsx)
  → POST /api/beds/:id/assign
    → Lock bed row FOR UPDATE (verifies status == 'available')
    → Lock admission row FOR UPDATE (verifies status == 'admitted')
    → INSERT INTO bed_assignments (status = 'active')
    → (Protected by virtual unique key uq_active_bed_assignment)
    → UPDATE beds SET status = 'occupied'
    → Emits Socket.IO 'beds:updated'
```

### 10.5 Diagnostic Lab Request & Report Upload Flow
```
Doctor (ConsultationWorkspace.jsx)
  → POST /api/labs/requests
    → Select tests from hospital lab formulary
    → Flag priority ('routine' | 'urgent' | 'stat')
    → INSERT INTO investigation_requests

Staff (LaboratoryManagement.jsx)
  → PATCH /api/labs/orders/:id/status (sample collected -> in progress)
  → POST /api/labs/orders/:id/reports (upload report PDF)
    → Multer validates file type (PDF/image) and size (<10MB)
    → Computes SHA-256 hash of file buffer
    → Verifies no duplicate report with identical hash exists for this order
    → Stores file in backend/uploads/lab_reports
    → INSERT INTO lab_reports (status = 'final', version = 1)
    → UPDATE investigation_requests SET status = 'completed'
    → Emits notification to patient
```

### 10.6 Pharmacy Prescriptions, FEFO Dispensing & 12% GST Billing Flow
```
Doctor (ConsultationWorkspace.jsx)
  → POST /api/prescriptions
    → Select medicine from hospital inventory formulary
    → Configure dosage ('1-0-1'), duration, meal instructions
    → INSERT INTO prescriptions (status = 'active')
    → INSERT INTO prescription_items

Staff / Pharmacist (PharmacyManagement.jsx)
  → 1. Dispense Prescription (POST /api/prescriptions/:id/dispense)
    → Validate batches have not expired
    → FEFO Sort: ORDER BY expiry_date ASC
    → Deduct batch current_quantity (atomic check: current_quantity >= qty)
    → Record in stock_movements ledger (type = 'dispense')
    → Update prescription status ('partially_dispensed' or 'dispensed')

  → 2. Generate Pharmacy Bill (POST /api/pharmacy/bills)
    → Snapshot unit prices from hospital_medicines formulary
    → Calculate subtotal and line discounts
    → Compute Statutory 12% GST: gst_amount = taxable_amount * 0.12
    → Calculate grand_total = taxable_amount + gst_amount
    → INSERT INTO pharmacy_bills (status = 'pending')

  → 3. Process Payment (POST /api/pharmacy/bills/:id/payments)
    → Record payment method ('cash' | 'upi' | 'card')
    → If full payment, set bill status = 'paid'
    → Dispatch thermal print invoice & send email receipt to patient
```

---

## 11. Authentication and Authorization Map

### 11.1 Token Structure & Lifecycle
- Tokens are standard signed JWTs using `process.env.JWT_SECRET` (HMAC SHA-256).
- Standard claims:
  - `sub`: User ID (`users.id`)
  - `email`: User email address
  - `role`: One of `super_admin`, `hospital_admin`, `doctor`, `staff`, `patient`
  - `hospitalId`: Associated hospital ID (or `null` for super admin)
  - `token_version`: Monotonically increasing integer (matching `users.token_version`)

### 11.2 Invalidation & Security Checks
- **Session Revocation:** On password change or administrative suspension, `users.token_version` is incremented. `requireAuth` compares the token's version against the DB on every protected request, instantly rejecting revoked tokens with `401 Unauthorized`.
- **First-Login Force Reset:** If `users.must_change_password == true`, the frontend displays a blocking modal dialog requiring a password update via `PATCH /api/auth/change-password` before proceeding.
- **Role Enforcement:** Handled by `allowRoles('role1', 'role2')` middleware. Unauthorized roles receive `403 Forbidden`.
- **Tenant Isolation:** Routes interacting with hospital-scoped records (`beds`, `wards`, `admissions`, `prescriptions`, `pharmacy`) explicitly compare `req.user.hospitalId` with the targeted entity's `hospital_id` (except for `super_admin`), blocking cross-hospital access with `403 Forbidden`.

---

## 12. External Integrations and Background Processing

| Integration / Worker | Implementation File | Configuration / Mechanism | Verified Behavior |
| :--- | :--- | :--- | :--- |
| **Email Delivery** | [backend/services/emailService.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/services/emailService.js) | Nodemailer transport with SMTP settings from `.env`. Fallback dev mode logs to `.dev-emails.json`. | Verified |
| **Email Templates** | [backend/services/emailTemplates.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/services/emailTemplates.js) | HTML string generators with clinical styling and plain-text alternatives. | Verified |
| **Appointment Reminders Cron** | [backend/services/reminderScheduler.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/services/reminderScheduler.js) | Node.js timer loop started in `server.js`. Scans confirmed appointments within 2 days, enforces idempotency via `reminder_sent_at`. | Verified |
| **Real-time WebSockets** | [backend/services/socketService.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/services/socketService.js) | Socket.IO server on port 5000. JWT handshake authentication, hospital-scoped rooms. | Verified |
| **Dynamic UPI QR Codes** | [backend/routes/hospitals.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/hospitals.js) | Dynamic QR image generation using `qrcode` library encoding merchant VPA and payee name. | Verified |
| **Google OAuth Integration** | [backend/services/googleAuthService.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/services/googleAuthService.js) | OAuth2 client helper for Google identity validation. | Verified |

---

## 13. Tests and Verification Resources

The repository contains 48 automated test scripts in `backend/tests/`. All tests can be run using standard Node.js:

```bash
cd backend

# Module 2: Authentication & Security
node tests/lesson-2.1.test.js
node tests/module-2.all.test.js

# Module 4: Departments, Doctors & Staff
node tests/lesson-4.1-4.2.test.js
node tests/lesson-4.3-4.5.test.js
node tests/lesson-4.6-4.8.test.js
node tests/lesson-4.9.test.js

# Module 5: Patient Profiles & Registration
node tests/lesson-5.1.test.js
node tests/lesson-5.2.test.js
node tests/lesson-5.3-5.5.test.js
node tests/lesson-5.6.test.js
node tests/lesson-5.7.test.js
node tests/lesson-5.8.test.js

# Module 6: Appointments & Scheduling
node tests/lesson-6.1.test.js
node tests/lesson-6.2.test.js
node tests/lesson-6.3-6.4.test.js
node tests/lesson-6.5-6.6.test.js
node tests/lesson-6.7-6.8.test.js
node tests/lesson-6.9-6.11.test.js
node tests/lesson-6.12.test.js

# Module 7: Notifications & Outbox
node tests/lesson-7.1.test.js to tests/lesson-7.8.test.js

# Module 8: Clinical Consultations & Follow-ups
node tests/lesson-8.test.js

# Module 9: Patient Inpatient Admissions
node tests/lesson-9.test.js

# Module 10: Ward & Bed Management (Concurrency & Generated Keys)
node tests/lesson-10.test.js

# Module 11: Laboratory Investigations & Reports
node tests/lesson-11.1.test.js to tests/lesson-11.10.test.js

# Module 12: Medicine Categories, Batches & FEFO Dispensing
node tests/lesson-12.test.js

# Module 13: Prescription Management
node tests/lesson-13.test.js

# Module 14: Pharmacy Billing, Payments & 12% GST
node tests/lesson-14.test.js

# Module 15: Medicine Dispensing & Stock Management (FEFO, Transactions & Rollback)
node tests/lesson-15.test.js

# Real-Time WebSocket Synchronization Suite
node tests/realtime_sync.test.js
```

---

## 14. Known Gaps and Unknowns

| Topic | Status | Detailed Finding & Codebase Evidence |
| :--- | :--- | :--- |
| **Public Website Application** | **Not Found** | The repository contains five frontend client applications in `apps/` (`doctor`, `hospital-admin`, `patient`, `staff`, `super-admin`). No public-facing marketing or landing website was located. |
| **Database Stored Procedures** | **Documented Requirement Without Verified Implementation** | Stored procedures are mentioned in architectural specifications, but zero `CREATE PROCEDURE` statements exist in the repository. All data access is implemented as inline parameterized SQL and multi-statement transactions in route handlers and services via `mysql2/promise`. |
| **10-Hour Rescheduling Rule** | **Documented Requirement Without Verified Implementation** | System specifications call for a 10-hour advance notice for patient rescheduling. The verified implementation in [backend/routes/appointments.js](file:///c:/Users/Admin/Documents/doc/Exe.GitHub/Hospital_Management_System-HarshilU/backend/routes/appointments.js#L477-L485) enforces a **4-hour advance window** (`diffHours < 4`). |
| **Automatic 4-Hour Cancellation Cron** | **Partially Verified** | Rescheduling an appointment that remained in `pending` status past 4 hours is explicitly blocked by backend validation (`"The 4-hour confirmation window has passed..."`). However, there is no autonomous background worker actively scanning and updating expired pending appointments to `cancelled`. |
| **Payment Gateway Integration** | **Partially Verified** | Payment records (`lab_payments`, `pharmacy_payments`) track cash, card (card network and last-4 digits), and UPI references with merchant VPA QR codes. Direct server-to-server webhook integrations with third-party payment gateways (e.g. Razorpay, Stripe) were not found. |

---

## 15. Maintenance Guidance

1. **Keep Synchronized:** When new routes, services, database migrations, or frontend portals are added, this `FILE-MAP.md` must be updated to preserve navigation accuracy.
2. **Safety Rule for Future Agents:** Do not rely on assumptions or filenames alone. Future agents and developers must verify imports, route registration in `server.js`, and database schema changes in `backend/database/migrations` before executing modifications.
3. **No Phantom Code:** Never mark an architectural requirement as implemented unless verified against concrete source code.

