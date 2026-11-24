# HealthMesh — Enterprise Multi-Hospital Clinical & Operational Ecosystem

> A production-grade, multi-tenant healthcare enterprise information system (HIS) engineered for central hospital network governance, clinical physician workstations, front-desk operational terminals, laboratory diagnostics, pharmacy inventory, consumer patient health portals, **AI Clinical Intelligence**, and **Real-Time Hospital Digital Twin Simulations**.

---

## 🏥 System Overview

**HealthMesh** is an integrated, modular hospital management system built with strict role-based access control (RBAC), multi-tenant hospital-level data isolation, transactional database integrity, real-time WebSocket state synchronization, and an advanced **Digital Twin & AI Decision Support Suite**.

The platform architecture decouples five specialized React 19 micro-frontend portals communicating with a hardened, centralized Express.js / MySQL backend:

```
                                  ┌───────────────────────────────┐
                                  │      HealthMesh Backend       │
                                  │   (Express + MySQL + Sockets) │
                                  │          Port :5000           │
                                  └──────────────┬────────────────┘
                                                 │ REST API / JWT / Socket.IO
            ┌──────────────────┬─────────────────┼─────────────────┬──────────────────┐
            ▼                  ▼                 ▼                 ▼                  ▼
     Super Admin        Hospital Admin        Doctor            Staff              Patient
   Central Authority    Facility Ops     Physician Station   Reception Desk    HealthMesh Patient
      Port :5173          Port :5174        Port :5175         Port :5176          Port :5177
```

---

## 🌐 Portals & Architecture Topology

| Portal | Port | Target Audience | Primary Responsibilities & Capabilities |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `http://localhost:5173` | Network Board & Central Healthcare Authorities | Multi-hospital onboarding & licensing, global geographic taxonomy (countries/states/cities), master departments & designations, centralized master lab test catalog, master medicine catalog, system-wide user governance, audit telemetry, and cross-hospital reporting. |
| **Hospital Admin** | `http://localhost:5174` | Hospital Directors & Facility Administrators | Facility setup & branding, emergency helpdesks, shift schedules, UPI settlement integration, facility departments, ward & bed grid, inpatient admissions, lab test pricing, hospital formulary & stock surveillance, user approvals, outbox DLQ retries, **AI Operational Intelligence**, and the complete **Hospital Digital Twin Ecosystem (Features 1–7 & What-If Simulations)**. |
| **Doctor** | `http://localhost:5175` | Consulting Physicians & Clinical Specialists | Clinical consultations, vital signs recording & automated BMI computation, clinical notes & chief complaints, electronic prescriptions, diagnostic lab investigation orders, follow-up scheduling, inpatient admission recommendations, live shift clock, and clinical AI assistants. |
| **Staff** | `http://localhost:5176` | Receptionists, Nurses, Lab Techs & Pharmacists | Patient intake & registration, token queue dispatch, triage check-in, inpatient admission desk & discharge, bed allocations, lab order management (specimen collection, PDF report upload & validation, lab billing), pharmacy operations (suppliers, batch intake, FEFO movements, dispensation), consultation billing cash counter, and **Frontline Digital Twin Operations (Floorplan, OT, Code Blue, Bed Liberation, IoT Assets & Infection Control)**. |
| **Patient** | `http://localhost:5177` | Patients & Caregivers | Public accredited hospital network discovery, doctor directory & slot booking, profile & medical history management, electronic health records (EHR), verified PDF lab reports, digital prescriptions, consultation receipts, pharmacy invoices with statutory 12% GST breakdown, and dynamic UPI QR payments. |
| **Central Backend** | `http://localhost:5000/api` | API Services | 24 REST route controllers, Socket.IO server, JWT authentication with token revocation, PDFKit receipt generation, Nodemailer live SMTP delivery, ACID-compliant transaction rollbacks, AI Provider integration, and Digital Twin telemetry streaming. |

---

## 🛠️ Technology Stack

### Backend Architecture
- **Runtime & Framework:** Node.js (v18+ / v20+ / v24+), Express.js (v5.x)
- **Database:** MySQL 8.x with connection pooling (`mysql2/promise`), strict foreign keys, virtual generated columns, and `ON DELETE RESTRICT` integrity guards
- **Security & Session Governance:** JSON Web Tokens (`jsonwebtoken`), `bcryptjs` password hashing (salt rounds: 10), token versioning (`token_version`), role-based access control (RBAC), and multi-tenant hospital data isolation
- **Real-Time Communication:** Socket.IO (`socket.io` v4.8+) with room isolation scoped per hospital (`hospital_${id}`) and subsystem channels (`digital_twin:update`, `ot_suite`, `emergency`, `discharge_twin`, `biomedical_assets`, `infection_control`)
- **Official PDF Receipt Generation:** PDFKit (`pdfkit` v0.20+) generating high-density vector A4 consultation, laboratory, and pharmacy receipts
- **Email Delivery:** Nodemailer (`nodemailer` v10.2+) supporting live SMTP delivery (Gmail Service, TLS/SSL on port 465/587) with fallback to development simulation adapter (`.dev-emails.json`)
- **Asset Handling & Upload Security:** Multer with MIME verification, SHA-256 cryptographic deduplication, and execution blocking for non-allowed file extensions
- **AI & Analytics Services:** Multi-provider AI abstractions (Gemini 2.5 / OpenAI / Fallback), predictive capacity forecasting, natural-language query engine, markdown report generation
- **Digital Twin Real-Time Simulation Engine:** In-memory Monte Carlo & stateful what-if surge simulators projecting lobby queue saturation, physician overtime, pharmacy depletion, and bed bottlenecks

### Frontend Architecture (All 5 Micro-Frontends)
- **Framework & Build Tool:** React 19, Vite 8
- **Styling & Design System:** Tailwind CSS v4, enterprise high-density light theme (`#FFFFFF` surfaces, `#0F172A` slate text, `#0284C7` clinical blue accents, `#E2E8F0` borders)
- **Iconography & Fonts:** Heroicons SVG suite, Google Fonts (Inter & JetBrains Mono)
- **Unified Reusable UI Components:**
  - `Pagination.jsx`: Universal table pagination component with 10, 25, 50, 100 page-size selectors, page jump controls, and auto-reset on search/filter changes
  - `CustomDropdown.jsx`: Accessible searchable single/multi dropdown with keyboard navigation
  - `FormattedMarkdown.jsx`: GitHub Flavored Markdown renderer for executive reports and clinical assistant chat
  - `Dev Mesh Switcher`: Floating developer widget for instant 1-click navigation across all 5 portal ports (`:5173` through `:5177`)
- **Real-Time Sync:** Socket.IO Client (`socket.io-client` v4.8+) for live updates across surgical suites, emergency codes, bed liberation, IoT assets, infection surveillance, queues, and formulary inventory

---

## 📂 Project Directory Structure

```
Hospital_Management_System-HarshilU/
├── backend/
│   ├── database/
│   │   ├── migrations/          # 18 Incremental database migration SQL scripts (001 - 018)
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
│   │   │   ├── 014_module15_dispensing_and_stock_management.sql
│   │   │   ├── 015_module16_consultation_billing.sql
│   │   │   ├── 016_module17_pharmacy_transaction_reporting.sql
│   │   │   ├── 017_module18_database_design_and_relationships.sql
│   │   │   └── 018_ai_and_digital_twin_module.sql
│   │   ├── migrate.js           # Automated migration runner & baseline seeder
│   │   └── schema.sql           # Complete baseline database schema
│   ├── middleware/
│   │   ├── auth.js              # JWT authentication, token revocation & RBAC guards
│   │   └── upload.js            # Multer file storage, MIME validation & SHA-256 deduplication
│   ├── routes/                  # 24 REST API controllers
│   │   ├── admissions.js        # Inpatient admissions, bed links & discharge summaries
│   │   ├── ai.js                # AI Clinical Assistant, analytics, automated reports, workflows
│   │   ├── appointments.js      # Booking hierarchy, dynamic slots & queue management
│   │   ├── auth.js              # Authentication, login, password reset & OTP
│   │   ├── beds.js              # Bed management, daily rates & maintenance logs
│   │   ├── consultationBilling.js # Consultation bills, 0% GST, cash counter & PDF receipts
│   │   ├── consultations.js     # Clinical workspace, vitals, labs, Rx & follow-ups
│   │   ├── departments.js       # Hospital department assignments
│   │   ├── designations.js      # Global/hospital designation master
│   │   ├── digitalTwin.js       # Digital Twin telemetry: floorplan, OT, codes, discharge, IoT, infection, simulations
│   │   ├── doctors.js           # Doctor profiles, fees, schedules & leaves
│   │   ├── hospitals.js         # Hospital directory, profiles & UPI QR configuration
│   │   ├── labs.js              # Lab test catalog, pricing, specimen queue & reports
│   │   ├── locations.js         # Countries, States, Cities master data
│   │   ├── masterDepartments.js # Global department taxonomy
│   │   ├── notifications.js     # Centralized outbox, audit logs & retry triggers
│   │   ├── opd.js               # Clinical queue, triage check-in & consultation actions
│   │   ├── patients.js          # Patient profiles, records & staff walk-in intake
│   │   ├── pharmacy.js          # Formulary, batches, FEFO stock, dispensations & billing
│   │   ├── pharmacyReports.js   # Pharmacy transaction history, sales & financial audits
│   │   ├── prescriptions.js     # Electronic prescription formulation & status history
│   │   ├── staff.js             # Staff profiles, permissions & onboarding
│   │   ├── users.js             # User accounts, approvals & credential dispatch
│   │   └── wards.js             # Ward definitions, department links & capacity limits
│   ├── services/
│   │   ├── aiAnalyticsService.js # AI Doctor workload, queue forecasting, bed shortages
│   │   ├── aiAssistantService.js # Clinical & administrative conversational chatbot
│   │   ├── aiProviderService.js  # Multi-LLM provider abstraction (Gemini / OpenAI / Fallback)
│   │   ├── aiReportingService.js # Scheduled executive PDF & Markdown reporting engine
│   │   ├── aiWorkflowNotificationService.js # Proactive operational bottleneck detector
│   │   ├── auditService.js      # Centralized security & administrative audit logging
│   │   ├── digitalTwinService.js # Real-time hospital spatial twin, OT, codes, assets, infection
│   │   ├── digitalTwinSimulationService.js # In-memory what-if scenario forecasting sandbox
│   │   ├── emailService.js      # Live SMTP delivery & dev simulation adapter
│   │   ├── emailTemplates.js    # Responsive clinical HTML email templates
│   │   ├── googleAuthService.js # Google OAuth2 authentication service
│   │   ├── notificationService.js # Idempotent notification dispatcher & retries
│   │   ├── otpService.js        # 6-digit OTP generation, hashing & rate limiting
│   │   ├── receiptPdfService.js # PDFKit official consultation receipt generator
│   │   ├── reminderScheduler.js # Automated 24h cron reminder background job
│   │   ├── scheduleService.js   # Slot computation and physician availability
│   │   └── socketService.js     # Real-time WebSocket event dispatcher & room isolation
│   ├── scripts/                 # Maintenance, diagnostics, seeding & twin initializers
│   │   ├── init_ot_digital_twin.js            # OT suites & surgical cases initializer
│   │   ├── init_emergency_digital_twin.js     # Code Blue & disaster incident initializer
│   │   ├── init_discharge_twin.js             # AI discharge readiness assessments
│   │   ├── init_biomedical_assets_twin.js     # IoT biomedical assets & dispatch tracker
│   │   ├── init_infection_twin.js             # Pathogen cases & spatial contact tracing
│   │   ├── seed_live_today_data.js            # Comprehensive today's live clinical data seeder
│   │   └── test_email.js                      # Live SMTP email & PDF receipt diagnostic tool
│   ├── tests/                   # 50+ automated unit, integration, and E2E test suites
│   ├── uploads/                 # Storage for branding, QR codes, medical records & lab PDFs
│   ├── .env.example             # Backend configuration template
│   ├── db.js                    # MySQL2 pool configuration
│   └── server.js                # Express entrypoint, Socket.IO server & API router mounting
│
├── apps/                        # 5 Micro-Frontend Portals
│   ├── super-admin/             # Super Admin Central Governance (Port 5173)
│   ├── hospital-admin/          # Hospital Admin Operations & Digital Twin (Port 5174)
│   ├── doctor/                  # Doctor Clinical Workstation (Port 5175)
│   ├── staff/                   # Front-Desk, Nurse, Lab, Pharmacy & Frontline Twin (Port 5176)
│   └── patient/                 # Public Network & Patient Health Portal (Port 5177)
│
├── scripts/
│   ├── start-all.js             # Launches backend and all 5 portals concurrently
│   └── build-all.js             # Validates production builds across all 5 portals
│
├── FINAL-VALIDATION-REPORT.md   # Complete QA test audit & Module 20 sign-off report
├── FILE-MAP.md                  # Comprehensive architectural file mapping
├── package.json                 # Monorepo root workspace configuration
└── README.md                    # System documentation
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ / v24+ recommended)
- **npm**: v9.0.0 or higher
- **MySQL**: MySQL Server 8.0+ running locally or on a network host

---

### 2. Database Setup

1. Open your MySQL client and create the database:
   ```sql
   CREATE DATABASE hospital_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. Configure backend environment:
   Navigate to `/backend` and initialize `.env` from `.env.example`:
   ```bash
   cd backend
   cp .env.example .env
   ```

3. Update `backend/.env` with your database credentials:
   ```env
   PORT=5000
   NODE_ENV=development

   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=hospital_management

   JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long
   JWT_EXPIRES_IN=30d
   ```

4. Run database migrations to provision tables and seed master data (Modules 1–18):
   ```bash
   cd backend
   npm install
   node database/migrate.js
   ```

5. (Optional) Initialize Digital Twin & Today's Real Clinical Data:
   ```bash
   cd backend
   node scripts/seed_live_today_data.js
   node scripts/init_ot_digital_twin.js
   node scripts/init_emergency_digital_twin.js
   node scripts/init_discharge_twin.js
   node scripts/init_biomedical_assets_twin.js
   node scripts/init_infection_twin.js
   ```

---

### 3. Email & Live SMTP Setup (Optional for Live Delivery)

The system includes dual-mode email handling:
- **Development Mode (Default):** If SMTP credentials are not specified, emails and PDF attachments are safely captured in `backend/.dev-emails.json` and printed to the server console.
- **Live SMTP Mode:** To send real emails with attached PDF receipts directly to personal Gmail or custom SMTP inboxes:

1. Enable **2-Step Verification** on your Google Account: [myaccount.google.com/security](https://myaccount.google.com/security).
2. Generate a 16-character **Google App Password**: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Set the credentials in `backend/.env`:
   ```env
   EMAIL_PROVIDER=smtp
   SMTP_SERVICE=gmail
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your16charpassword
   EMAIL_FROM="HealthMesh Hospital System <your_email@gmail.com>"
   ```
4. Test live delivery instantly:
   ```bash
   node backend/scripts/test_email.js your_email@gmail.com
   ```

---

### 4. Running the Complete System

#### Option A: One-Command Startup (All Services)
From the project root directory:
```bash
# Install root dependencies
npm install

# Start backend and all 5 portals concurrently
npm run dev:all
```
This launches the backend on `:5000` and all 5 micro-frontend portals (`:5173`, `:5174`, `:5175`, `:5176`, `:5177`).

#### Option B: Individual Service Launch
You can also run services independently in separate terminals:

```bash
# 1. Central Backend (Port 5000)
cd backend && npm run dev

# 2. Super Admin Portal (Port 5173)
cd apps/super-admin && npm run dev

# 3. Hospital Admin Portal (Port 5174)
cd apps/hospital-admin && npm run dev

# 4. Doctor Clinical Workstation (Port 5175)
cd apps/doctor && npm run dev

# 5. Staff Operations Desk (Port 5176)
cd apps/staff && npm run dev

# 6. Patient Health Portal (Port 5177)
cd apps/patient && npm run dev
```

---

## 🔑 Default Credentials & Quick Login

Every login screen includes a **"Prefill"** button under **Development Sandbox Credentials** for instant one-click authentication:

| Role | Portal URL | Default Email | Default Password | Scoped Facility / Context |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | `http://localhost:5173` | `admin@hms.com` | `@abcd_123456` | Central Network Governance |
| **Hospital Admin** | `http://localhost:5174` | `hospitaladmin@hms.com` | `@abcd_123456` | Development Hospital Admin (#1) |
| **Doctor** | `http://localhost:5175` | `doctor@hms.com` | `@abcd_123456` | Dr. Sarah Jenkins (Cardiology #1) |
| **Staff** | `http://localhost:5176` | `staff@hms.com` | `@abcd_123456` | Robert Vance (Front Desk #1) |
| **Patient** | `http://localhost:5177` | `patient@example.com` | `password` | Verified Patient Portal |

---

## 🌟 Comprehensive Module Specifications (Modules 1 — 22)

### Module 1: Enterprise Clinical UI/UX & Design System
- **High-Density Light Theme:** Clean clinical surfaces (`#FFFFFF`), subtle slate borders (`#E2E8F0`), and clinical blue focus indicators (`#0284C7`).
- **Stationary Clinical Header:** Persistent 56px top navigation bar displaying real-time clock (`HH:MM:SS`), online node indicators, breadcrumbs, and operator identity chip.
- **Scrollbar Isolation:** Viewport scrollbars are docked; content scrollbars originate strictly below the navbar (`y = 56px`).
- **Dev Mesh Switcher:** Floating navigation widget available across all portals to quickly toggle between ports `:5173` through `:5177`.

### Module 2: Authentication, Roles & Security Governance
- **Multi-Tenant JWT Authentication:** Cryptographic JWT tokens with embedded `hospitalId`, `role`, and `token_version`.
- **Granular RBAC:** Server-side role enforcement across `super_admin`, `hospital_admin`, `doctor`, `staff`, and `patient`.
- **Forced Password Reset:** Mandatory password change on initial login (`must_change_password`).
- **Token Invalidation:** Token versions stored in database to revoke sessions instantly upon password changes or suspension.
- **Audit Logging:** Centralized `audit_logs` tracking actor ID, action, target entity, IP address, and metadata.

### Module 3: Master Data & Hospital Governance
- **Geographic Taxonomy:** Normalized global master tables for Countries, States, and Cities.
- **Hospital Directory & Profile:** Facility code, licensed capacity, shifts, emergency contacts, and logo branding.
- **UPI Settlement Configuration:** Merchant VPA ID, payee name, and dynamic live UPI QR code generation.
- **Designation Taxonomy:** Global and hospital-specific designation management.

### Module 4: Department, Doctor & Staff Management
- **Master Department Taxonomy:** Super Admin maintains global departments mapped to active hospitals with duplicate protection (`409 Conflict`).
- **Doctor Clinical Profiles & Onboarding:** Mandatory hospital scoping, credentials tracking (qualifications, experience, license number, license expiry), consultation fee, and doctor self-profile management.
- **Operational Staff & Granular Permissions:** Provisioning for `Receptionist`, `Nurse`, `Pharmacist`, `Lab Staff`, and `Accountant` with automated permission templates and shift scheduling.
- **Automated Credential Dispatch:** 14-character cryptographically secure temporary passwords, email dispatch, and delivery status auditing (`sent`, `not_sent`, `failed`).

### Module 5: Patient Registration, Profiles & Medical Records
- **Patient Self-Registration & OTP:** Full name, email, phone, DOB, gender, blood group, and emergency contact details with 6-digit numeric OTP verification.
- **Staff-Assisted Walk-In Registration:** Expedited desk terminal registration for emergency and walk-in patients.
- **Profile Completeness Guard & IDOR Protection:** Mandatory profile completeness checks before booking, medical records upload, and strict multi-tenant IDOR protection.

### Module 6: Appointment Booking, Scheduling & Queue Management
- **Strict 4-Step Selection Hierarchy:** Hospital Selection → Department Filtering → Attending Physician → Time Slot.
- **Doctor Availability & Slot Generation:** Dynamic 30-minute slot computation honoring physician working hours, break periods, and leave calendars.
- **Concurrency Locking & Cancellation Rules:** Pessimistic transaction locks preventing double-booking collision; 4-hour advance cancellation policy.
- **3-Month Window & Rescheduling:** Max 90-day booking window and 10-hour advance rescheduling window.
- **Reception Check-In & Live Queue Telemetry:** Sequential queue tokens (`Q-001`, `Q-002`) and physician hall call integration.

### Module 7: Notifications & Email Automation
- **Account Onboarding & Approval Emails:** Welcome, registration review, and account approval emails.
- **Booking Lifecycle Emails:** Booking request received and booking confirmation emails with doctor details and 30-minute check-in instructions.
- **Cancellation & Rescheduling Notifications:** Side-by-side comparison emails for rescheduled visits and stated cancellation notices.
- **Automated 24-Hour Reminders & Cron Scheduler:** Background cron job scanning for upcoming appointments with built-in idempotency deduplication.
- **Consultation Completion & Follow-up Summaries:** Care summary upon visit completion and follow-up appointment notifications linked to parent visit.
- **Password Reset OTP:** Brute-force protection, rate limiting, and generic anti-enumeration responses.
- **HTML Email Templates:** Responsive clinical HTML templates with plain-text fallbacks.
- **Centralized Outbox & DLQ Retries:** Facility outbox dashboard with status filtering and dead-letter queue (DLQ) retry engine.

### Module 8: Daily Consultation and Follow-up Management
- **Starting Consultation from Doctor Panel:** Authenticated physician workstation opening assigned appointments with ownership and status validation.
- **Consultation Workflow & Mandatory Fields:** Draft vs finalized documentation with server-side validation for chief complaint, examination findings, diagnosis, and treatment plan.
- **Recording Clinical Details & Vital Signs:** Systolic/diastolic BP, pulse rate, temperature, respiratory rate, SpO2, height, weight, and automated BMI calculation with clinical alert thresholds.
- **Diagnostic Investigations & Laboratory Requests:** Master lab tests catalog, priority levels (`routine`, `urgent`, `stat`), and hospital-scoped diagnostic order tracking.
- **Prescription Formulation & Medication Regimen:** Master medicines catalog, dosage, form, frequency (`1-0-1`, `1-0-0`, `0-0-1`, `1-1-1`, `SOS`), duration, food timing, and decoupling from pharmacy inventory dispensing.
- **Consultation Notes & Patient Condition:** Structured patient condition assessment (`stable`, `improving`, `critical`, `guarded`, `fair`), advice, and doctor confidential notes.
- **Follow-up Appointment Scheduling:** Integrated follow-up scheduling referencing parent appointment with conflict checking and automated email alerts.
- **Enforced Submission-Before-Completion Guard:** Hardened backend validation requiring a submitted consultation before an appointment status can transition to `completed`.
- **Patient EHR & Consultation History:** Multi-tenant electronic health record timeline with hospital data isolation and IDOR protection.
- **Decoupled Outpatient vs Inpatient Admission:** Clinical inpatient recommendation handoff without automatic bed occupancy or premature status mutations.

### Module 9: Patient Inpatient Admission Management
- **Standardized Inpatient Admission Workflow:** Structured admission intake (`ADM-YYYYMMDD-XXXX`) linking patient, operating facility, attending physician, department, admission timestamp, and clinical indication.
- **Multi-Tenant Scoping & Entity Verification:** Cross-tenant verification validating patient existence, ensuring attending doctor and department strictly belong to the operating hospital (`403 Forbidden` on mismatch).
- **Admission Date & Reason Guardrails:** Format validation for admission timestamps, protection against far-future bookings (>30 days ahead), and clinical validation ensuring admission reasons meet minimum length requirements (>= 5 characters).
- **Status Lifecycle Transitions & Audit History:** Formal state machine (`pending` / `admitted` -> `discharged` / `cancelled`), automatic `discharged_at` timestamping, discharge summaries, terminal state protection, and immutable `admission_status_history`.
- **Duplicate Active Admission Prevention:** Concurrency safeguard with pessimistic locking returning `409 Conflict` if an active, non-discharged admission already exists for the patient.

### Module 10: Ward and Bed Management & Concurrency Control
- **Department-Wise Ward Management & Creation:** Hospital administrators define inpatient wards mapped to clinical departments (`general`, `semi_private`, `private`, `icu`, `emergency`, `maternity`, `pediatric`, `surgical`) with configured total bed capacity.
- **Bed Creation & Ward Capacity Enforcement:** Bed registration with unique bed numbers, clinical bed types (`standard`, `icu`, `pediatric`, `bariatric`, `electric`, `ventilator_enabled`), and daily room rates. Strict ward capacity enforcement prevents registering beds beyond configured ward limits.
- **Bed Lifecycle & Maintenance Logging:** Dedicated bed states (`available`, `occupied`, `maintenance`). Maintenance transitions require a documented reason, log in `bed_maintenance_logs`, and cannot be occupied until returned to service.
- **Concurrency-Safe Bed Allocation & Generated Keys:** High-concurrency allocation with pessimistic database row locks and MySQL generated virtual unique columns (`active_bed_key`, `active_admission_key`) enforcing single active assignments at the database engine level.
- **Discharge & Automatic Bed Release:** Discharging a patient or closing an active admission automatically releases the occupied bed, records release timestamps, and returns bed status to `available`.
- **Occupancy Timeline & Multi-Hospital Isolation:** Immutable chronological tracking of patient bed stays (`assigned_at`, `released_at`, notes, `assigned_by`, `released_by`), with strict tenant boundary enforcement.

### Module 11: Laboratory and Diagnostic Investigations
- **Master Lab Test Catalog Management:** Super Admin centralized diagnostic test catalog with unique test codes (`CBC-001`, `LIPID-005`), specimen types, patient fasting instructions, and clinical descriptions.
- **Hospital Laboratory Tests & Pricing:** Hospital-specific test assignment with facility pricing (`hospital_lab_tests`), active/inactive toggling, and audit logging.
- **Physician Test Ordering During Consultations:** Attending physicians prescribe diagnostic investigations directly from hospital formulary during consultations, supporting clinical priorities (`routine`, `urgent`, `stat`).
- **Laboratory Specimen & Order Queue:** Technician workstation tracking diagnostic lifecycle (`ordered` -> `sample_collected` -> `in_progress` -> `completed` / `cancelled`) with specimen collection timestamps.
- **Diagnostic Report Upload & SHA-256 Deduplication:** Secure report attachment (PDF / images) with SHA-256 cryptographic hash computation to detect duplicate reports, file size validation, MIME verification, and report versioning.
- **Laboratory Payment Desk & Cashiering:** Itemized lab billing with sequential receipts (`LAB-REC-YYYYMMDD-XXXX`), payment mode support (`cash`, `upi`, `card`), and status management.
- **Role-Governed EHR & Diagnostic Access:** Patient portal viewing/downloading of verified lab reports and physician workstation access to test results with IDOR isolation.

### Module 12: Medicine Inventory, Batch Tracking & FEFO Dispensing
- **Medicine Category Taxonomy:** Pharmaceutical classification taxonomy (`Analgesics`, `Antibiotics`, `Antidiabetic`, `Cardiovascular`, `NSAIDs`, etc.) with category-level medicine counts.
- **Approved Pharmaceutical Suppliers:** Vendor directory tracking supplier names, contact persons, phones, emails, and addresses with active status governance.
- **Master Medicines & Formulary:** Standardized drug catalog with unique pharmaceutical SKUs (`MED-PARA-500`, `MED-AMOX-500`), dosage forms, and strengths mapped to hospital formulary (`hospital_medicines`).
- **Financial Validation & Pricing Rules:** Strict pricing validation ensuring `sale_price >= purchase_price` and max discount percentage constraints (`0% - 100%`).
- **Batch Inventory & Expiry Tracking:** Strict batch-level tracking (`batch_number`, purchase date, expiry date, purchase price, initial & current quantities, batch status).
- **Minimum Stock & Near-Expiry Surveillance:** Visual telemetry indicators and alert filtering for low-stock medicines (`min_stock_alert_level`) and near-expiry batches (<30, <60, or <90 days).
- **Atomic FEFO Dispensing & Stock Movement Ledger:** First-Expiry-First-Out automated dispensing logic with atomic database transactions preventing negative inventory, coupled with an immutable `stock_movements` ledger auditing all stock movements.

### Module 13: Prescription Management & Clinical Dispensing Integration
- **Clinical Prescription Authoring:** Integrated prescription writing within the Doctor Clinical Workstation and standalone prescription desk, automatically linking patient, doctor, hospital, appointment, and consultation records.
- **Inventory-Backed Medicine Selection:** Real-time formulary search displaying medication forms, strengths, and available stock levels.
- **Structured Dosage Regimens & Duplicate Prevention:** Clinical dosage frequency formatting (`1-0-1`, `1-0-0`, `0-0-1`, `1-1-1`, `SOS`), duration in days, meal timing instructions (`before_food`, `after_food`), and server-side duplicate medication detection.
- **Prescription Status Transitions & History:** Formal state machine (`draft` -> `active` -> `partially_dispensed` -> `dispensed` / `cancelled`) with full status transition tracking in `prescription_status_history`.
- **Pre-Dispensing Verification & Expiry Guards:** Pre-dispense check validating batch availability, rejecting expired batches, and blocking cancelled or draft prescriptions from fulfillment.
- **Partial Dispensation & Fulfillment Timeline:** Multi-step fulfillment tracking `dispensed_quantity` per line item, updating status to `partially_dispensed` until completed.

### Module 14: Pharmacy Billing, Payments & 12% GST Settlement
- **Prescription-to-Bill Generation:** Pharmacists generate itemized bills from validated prescriptions or OTC walk-ins with patient identity verification.
- **Medicine Unit Pricing & Formulary Snapshots:** Automatic price resolution from hospital formulary snapshotting unit sale prices at the time of invoice creation.
- **Subtotal & Discount Calculation:** Transparent subtotal calculations and percentage-based discounts capped at the hospital formulary's `max_discount_percent`.
- **Statutory 12% GST Computation:** Compliant tax calculation engine applying statutory 12% GST on taxable base (`gst_rate = 12.00%`, `gst_amount = taxable_amount * 0.12`), computing final grand total and outstanding balance.
- **Multi-Channel Cashiering Desk:** Point-of-sale checkout supporting `cash`, `upi` (with merchant QR code verification), and `card` settlements.
- **Payment Lifecycle & Refund Engine:** State management (`pending`, `partially_paid`, `paid`, `refunded`), supporting partial payments, full settlements, and audit-logged refund processing (`pharmacy_refunds`).
- **Sequential Invoices & Idempotency Protection:** Deterministic sequential numbering (`BILL-YYYYMMDD-XXXX`, `REC-YYYYMMDD-XXXX`) and idempotency key enforcement.
- **Hospital vs Outside Pharmacy Purchases:** Dedicated workflow for external pharmacy purchases capturing outside pharmacy name and external bill number without depleting hospital pharmacy stock.

### Module 15: Medicine Dispensing, Stock Management & Official PDF/Email Receipt Generation
- **Pharmacy Dispensing Workflow:** End-to-end dispensing orchestration from authorized pharmacist sign-in, queue lookup, prescription selection, item verification, FEFO batch allocation, to sequential receipt creation (`DISP-YYYYMMDD-XXXX`).
- **Prescription and Bill Verification:** Pre-dispense check validating active prescription state, patient identity, hospital facility scoping, and linked billing status.
- **Expiry Surveillance & FEFO Allocation:** First-Expiry-First-Out automated batch allocation engine strictly excluding expired batches (`expiry_date < CURDATE()`), prioritizing lots with the nearest future expiration date.
- **Atomic Stock Deduction & Movement Ledger:** Atomic batch quantity decrement coupled with immutable double-entry style stock ledger records in `stock_movements`. Atomic conditional database updates (`AND current_quantity >= ?`) prevent inventory from dropping below zero under race conditions.
- **Database Transactions and Rollback on Failure:** ACID-compliant database transaction wrappers (`beginTransaction()`, `commit()`, `rollback()`) guaranteeing zero partial mutations or orphaned inventory records if any line item fails validation.
- **Official Consultation Receipt PDF Generation:**
  - High-density vector PDF generator (`receiptPdfService.js`) using PDFKit.
  - Streaming binary PDF download endpoint (`GET /api/consultation-billing/bills/:id/receipt-pdf`) with `Content-Disposition: attachment; filename="Official_Receipt_[ReceiptNumber].pdf"`.
  - Comprehensive clinical and financial information: hospital credentials, patient MRN, consulting doctor/department, appointment reference, fee snapshot, statutory 0% GST healthcare exemption clause, payment method, payment date, and historical payment transactions.
- **Official Receipt Email Dispatch with Attached PDF:**
  - Standardized email dispatch endpoint (`POST /api/consultation-billing/bills/:id/email-receipt`).
  - Attaches generated PDF receipt to outgoing Nodemailer email message with verified MIME type.
  - Standardized subject line: `"Official Payment Receipt – [Receipt Number]"`.
  - Structured HTML and plain text email body detailing patient name, receipt number, appointment reference, total amount, paid amount, balance due, and hospital name.
  - Full audit trail recorded in `audit_logs` (`action = 'DISPATCH_OFFICIAL_RECEIPT_EMAIL'`).

### Module 16: Consultation Billing, Cash Counter & Invoicing
- **Separation of Clinical Consultation Fees from Pharmacy Invoices:** Dedicated consultation billing architecture (`consultation_bills`, `consultation_payments`) completely decoupled from pharmacy drug charges.
- **Statutory 0% GST Healthcare Exemption Clause:** Consultation fees carry statutory 0% GST pursuant to national healthcare tax regulations (`tax_amount = 0.00`).
- **Cash Counter & Invoicing Terminal:** Receptionist desk invoicing supporting `cash`, `upi`, and `card` payment recording, partial payments, and balance tracking.
- **Bill Cancellation & Authorization Guards:** Role-governed cancellation requiring administrative justification and logging.
- **Payment History & Settlement Audit:** Full chronological payment history linking cashier identity, receipt numbers, and payment modes.

### Module 17: Pharmacy Transaction Reporting & Financial Governance
- **Transaction Ledger & Report Exploration:** Specialized reporting controller (`pharmacyReports.js`) supporting date-range filtering, payment mode segmentation (`cash`, `upi`, `card`), and status breakdown (`paid`, `refunded`).
- **Revenue Analytics & Cash Reconciliations:** Real-time aggregation of total sales, total refunds, net revenue, tax collected, and payment mode breakdowns.
- **Sidebar Integration:** Directly accessible from the Hospital Admin and Staff navigation sidebars for instant financial audit review.

### Module 18: Database Referential Integrity, Constraints & Relationships
- **Referential Constraint Enforcement:** Database schema normalized with explicit foreign keys, cascading rules, and `ON DELETE RESTRICT` protection on critical clinical and financial entities.
- **Virtual Unique Indexes:** Generated virtual columns (`active_bed_key`, `active_admission_key`) enforcing single active bed occupancies and active patient admissions at the database engine level.
- **Data Isolation:** Strict hospital scoping across every query preventing multi-tenant data leakage.

### Module 19: User Interface, Micro-Frontend Integration & Responsive Layouts
- **Consistent Light-Theme Design System:** Standardized Tailwind CSS v4 design tokens ensuring a cohesive light-theme visual identity across all 5 portals.
- **Standardized Reusable Pagination:** Universal `Pagination.jsx` component implemented across all tables and long lists in all 5 portals (page sizes: 10, 25, 50, 100).
- **Responsive Layouts:** Mobile, tablet, and desktop responsive layouts with accessible sidebar collapse toggles, sticky table headers, and modal overlays.
- **Dev Mesh Switcher:** Development-mode floating widget for instant cross-portal port hopping (`:5173` through `:5177`).

### Module 20: Testing, Security and Quality Assurance
- **Comprehensive Quality Assurance Suite:** Master test suite in `backend/tests/lesson-20.test.js` validating all baseline modules (176/176 tests passing).
- **Mandatory End-to-End Clinical Scenarios Validated:** Complete patient journey, failed payment handling, slot booking concurrency, multi-tenant IDOR protection, inpatient bed lifecycle, and lab report SHA-256 verification.

---

### Module 21: AI Hospital Intelligence & Operational Decision Suite
- **Lesson 21.1: AI Clinical & Administrative Chatbot Workstation (`AiHospitalAssistant.jsx`):**
  - Interactive multi-turn conversational AI workstation with streaming responses, formatted markdown rendering (`FormattedMarkdown.jsx`), and persistent conversation threads (`ai_chat_conversations`, `ai_chat_messages`).
  - Context-aware clinical prompt templates: *Triage Assistant, Drug-Drug Interaction Checker, Clinical Protocol Summary, Inpatient Discharge Planning*.
  - Strict clinical safety disclaimers, hallucination guards, and role-based guard rails.
- **Lesson 21.2: AI Operational Intelligence & Predictive Analytics (`AiOperationalAnalytics.jsx`):**
  - **Doctor Workload & Burnout Telemetry:** Consultations per shift, average consultation minutes, schedule utilization %, and balanced vs overloaded status flags.
  - **OPD Queue Wait-Time Forecasting:** Real-time queue velocity calculations predicting estimated wait times per triage token.
  - **Bed & Admission Capacity Shortage Risk:** Ward-by-ward occupancy forecasting calculating surge probabilities over the next 24–48 hours.
  - **Pharmacy Stockout & Expiry Burn-Rate Analysis:** Consumption velocity calculations estimating days of stock remaining for critical formulary medicines.
  - **Diagnostic Lab Turnaround Delays:** Identifies overdue STAT, urgent, and routine tests exceeding target turnaround times.
- **Lesson 21.3: AI Automated Executive & Clinical Operational Reports (`AiAutomatedReports.jsx`):**
  - On-demand and scheduled PDF/Markdown reports (`ai_generated_reports`): *Daily Operational Briefings, Weekly Executive Summaries, Monthly Financial Reconciliations, Bed Capacity Audits, and Custom Natural-Language Inquiries*.
  - Aggregates multi-department telemetry into printable executive summaries with structured metric snapshots and actionable recommendations.
- **Lesson 21.4: AI Workflow Bottleneck Detection & Automation Matrix (`AiWorkflowNotificationCenter.jsx`):**
  - Rule-based notification engine (`ai_automation_rules`) continuously scanning for threshold breaches: *queue congestion > 15 waiting, emergency bed saturation > 85%, low pharmacy stock alerts, delayed lab tests > 120 mins*.
  - Proactive workflow suggestions enabling 1-click execution: *calling in on-call physicians, initiating inter-ward transfers, ordering expedited pharmaceuticals*.

---

### Module 22: Enterprise Hospital Digital Twin & Operational Simulation Ecosystem (Features 1 — 7)

The **HealthMesh Digital Twin** is a real-time virtual replica of hospital physical spaces, surgical suites, biomedical assets, infection isolation zones, and patient journeys. Enabled across both **Hospital Admin (`:5174`)** and **Staff Operations Desk (`:5176`)**:

#### 🏥 Feature 1: Interactive 2D Spatial Floorplan & Heatmap Twin (`FloorplanHeatmapDigitalTwin.jsx`)
- **Multi-Floor Architectural Blueprint:** Interactive spatial map of the hospital spanning Ground Floor (OPD Lobby, Triage, Pharmacy, Lab), First Floor (Inpatient Wards, CCU, Surgical), and Second Floor (Operation Theaters & PACU).
- **Thermal Congestion Heatmap:** Live room-by-room patient density, physician staffing rosters, and equipment allocation tracking.
- **Visual Congestion Index:** Categorizes zones into *Optimal (<40%)*, *Moderate (40–69%)*, *High (70–84%)*, and *Bottleneck Surge (≥85%)*, allowing front-desk staff to dynamically reroute lobby traffic.

#### 🩺 Feature 2: Operation Theater (OT) & PACU Surgical Suite Twin (`OtSurgicalSuiteDigitalTwin.jsx`)
- **End-to-End Surgical State Machine:** Real-time tracking of surgical cases across four lifecycle phases:
  $$\text{Pre-Op Holding} \longrightarrow \text{Intra-Op Surgery} \longrightarrow \text{Post-Op PACU Recovery} \longrightarrow \text{Turnaround Sanitization}$$
- **OT Suite Environmental Telemetry:** Live temperature (°C), relative humidity (%), air turnover rate (ACH), and laminar air flow verification.
- **PACU Recovery Bay Allocation:** Direct bed assignment in Post-Anesthesia Care Units with live recovery countdowns and surgeon/anesthesiologist roster links.
- **Turnaround Buffer Optimization:** Dynamic delay tracking automatically adjusting downstream operating room schedules when emergency procedures run over.

#### 🚨 Feature 3: Emergency Code Blue & Mass-Casualty Disaster Incident Command Twin (`EmergencyIncidentCommandDigitalTwin.jsx`)
- **Strobe-Activated Emergency Response:** One-click activation of facility-wide critical incident protocols (*Code Blue Cardiac Arrest, Mass-Casualty Trauma Surge, Disaster Influx, Drill Simulation*).
- **Rapid Response Team (RRT) Dispatch:** Live roster telemetry broadcasting automated paging, specialist roles (*Code Leader, Airway Anesthesiologist, Critical Care RN, Crash Cart Porter*), and real-time ETAs / on-scene arrival stamps.
- **Interactive ACLS Checklist:** Synchronized clinical resuscitation checklist with timestamped actions (*CPR Initiation, Airway Secured, Rhythm Analysis, Epinephrine 1mg IV/IO*).
- **Automated Ward Decanting Cascade:** Algorithms instantly analyze all admitted inpatients to identify stable step-down candidates and liberate acute CCU/ICU beds for incoming resuscitations.

#### 🔮 Feature 4: AI Discharge Readiness & Predictive Bed Liberation Twin (`DischargeReadinessDigitalTwin.jsx`)
- **6-Stage Discharge Funnel:** Real-time tracking of admitted inpatients approaching discharge:
  $$\text{Clinical Clearance} \to \text{Pharmacy Reconciliation} \to \text{Billing Settlement} \to \text{Patient Transit} \to \text{EVS Sanitization} \to \text{Liberated}$$
- **Predictive Liberation Windows:** Forecasts bed liberation 4–6 hours in advance based on clinical vitals, lab results, and barrier documentation.
- **Automated Bed Pre-Allocation:** Pre-allocates upcoming liberated beds to emergency room candidates and elective admissions before the current occupant physically departs, eliminating lobby boarding times.

#### 🧪 Feature 5: Biomedical Equipment & IoT Asset Tracking Digital Twin (`BiomedicalAssetDigitalTwin.jsx`)
- **Real-Time Critical Equipment Telemetry:** Comprehensive IoT tracking of mobile and life-support assets: *Mechanical Ventilators, Biphasic Defibrillators, Syringe Infusion Pumps, Multiparameter Monitors, Portable X-Rays, ECG Units*.
- **Battery & Power Grid Surveillance:** Live battery percentage (with low-power alerts for $\le 20\%$) and power source status (*Mains AC, Internal Battery, Charging, Offline*).
- **Dynamic Bed & Ward Relocation:** Tracks equipment movement from central biomedical storage to specific ward beds with location logs and operator accountability in `asset_dispatch_logs`.
- **Maintenance, Calibration & Sanitization Engine:** State tracking (*In Use, Available Standby, Maintenance Due, Sanitization Required, Fault Reported*) with one-click sanitization and calibration logging.

#### 🛡️ Feature 6: Infection Control, Outbreak Surveillance & Contact Tracing Twin (`InfectionControlDigitalTwin.jsx`)
- **Hospital Pathogen Isolation Dossier:** Active containment tracking for multidrug-resistant organisms and contagious airborne agents (*MRSA, VRE, C. difficile, Acinetobacter baumannii MDR, SARS-CoV-2 / Influenza A*).
- **Airborne Infection Isolation Room (AIIR) Telemetry:** Real-time differential manometer tracking maintaining $\approx -2.8\text{ Pa}$ negative pressure inward airflow seal with 12 ACH HEPA exhaust ventilation.
- **Automated Spatial Contact Tracing Matrix:** Flagging a contagion case automatically scans past 48–72 hour co-location logs to trace exposed adjacent bed occupants, rounding physicians, floor nurses, and visiting phlebotomists.
- **3-Step Negative Swab Clearance Regimen:** Tracks serial PCR/culture swab testing ($X/3$ negative swabs) before de-escalating isolation precautions.

#### 🏢 Feature 7: Interactive 3D Spatial Digital Twin & WebGL Model (`Hospital3DDigitalTwin.jsx`)
- **Procedural 3D Stacked Floor Architecture:** Built with WebGL/Three.js featuring stacked 3D floorplates across Ground Floor (L0 OPD/Triage), 1st Floor (L1 Inpatient Wards/CCU), and 2nd Floor (L2 Surgical OT Suites).
- **Spatial Props & Equipment Modeling:** Procedurally generated 3D hospital beds with dynamic color binding (Green=Available, Blue=Occupied, Red=Critical), bedside vital sign monitors, operating tables with scialytic surgical lamps, rotating airborne infection isolation air vortex rings, and pulsing emergency code beacons.
- **Interactive Raycasting & Drawer Telemetry:** Real-time mouse hover glow and click-to-inspect 3D raycasting opening a slide-out Clinical Telemetry Drawer with live headcounts, congestion indices, and environmental parameters.
- **Dual Visual Modes & Multi-Camera Views:** One-click toggling between Architectural 3D render and 3D Congestion Thermal Heatmap, with instant camera preset switching (Isometric, Top-Down Floorplan, Front Elevation) and smooth OrbitControls.

#### 🎲 Digital Twin What-If Simulation Sandbox (`DigitalTwinSimulationCenter.jsx`)
- **In-Memory Predictive Sandbox:** Zero database mutation testing allowing administrators to simulate operational shocks:
  - *Outpatient Surge:* Simulates $+N$ emergency walk-ins to project lobby wait time expansion, doctor overtime, and downstream lab/pharmacy orders.
  - *Ward Closure / Bed Loss:* Simulates catastrophic HVAC failure or room sanitization closing a ward and planning inter-ward reallocations.
  - *Physician Absence:* Projects queue overflow and patient rescheduling cascades when specialists are unexpectedly absent.
  - *Laboratory & Pharmacy Workload Surges:* Tests diagnostic turnaround and inventory burn-rates under stress conditions.
- **Multi-Tenant Scoping:** Simulations are strictly scoped per hospital (`digital_twin_simulations`), preserving historical run metrics, baseline vs simulated deltas, and automated executive mitigation recommendations.

---

## 🧪 Automated Testing & QA Verification

The system includes comprehensive automated test suites covering every layer of the architecture:

```bash
cd backend

# 1. Master System Quality Assurance Suite (All 20 Modules & E2E Scenarios)
node tests/lesson-20.test.js

# 2. Module 15: Official Receipt PDF Download & Email Dispatch
node tests/module-15-receipt.test.js

# 3. Real-Time WebSocket Synchronization Test
node tests/realtime_sync.test.js

# 4. Module-Specific Test Suites
node tests/module-2.all.test.js      # Auth, RBAC & Tokens
node tests/lesson-6.1-6.12.test.js   # Appointments & Concurrency
node tests/lesson-7.1-7.8.test.js    # Notifications & Outbox Retries
node tests/lesson-8.test.js          # Clinical Consultations & EHR
node tests/lesson-9.test.js          # Inpatient Admissions
node tests/lesson-10.test.js         # Wards & Bed Concurrency Safety
node tests/lesson-11.1-11.10.test.js # Laboratory Investigations & Reports
node tests/lesson-12.test.js         # Inventory, Batches & FEFO
node tests/lesson-13.test.js         # Prescription Management
node tests/lesson-14.test.js         # Pharmacy Billing & 12% GST
node tests/lesson-15.test.js         # Dispensing, Movements & Rollbacks
node tests/lesson-16.test.js         # Consultation Billing (0% GST)
node tests/lesson-17.test.js         # Financial Reporting & Ledger
node tests/lesson-18.test.js         # Referential Constraints & Database Integrity
node tests/lesson-19.test.js         # UI & Frontend Integration

# 5. Digital Twin & AI Verification Diagnostics
node scripts/seed_live_today_data.js # Seeds live operational telemetry
node scripts/init_ot_digital_twin.js # Validates surgical suite tables
node scripts/init_emergency_digital_twin.js # Validates emergency command tables
node scripts/init_discharge_twin.js # Validates predictive discharge engine
node scripts/init_biomedical_assets_twin.js # Validates IoT asset tables
node scripts/init_infection_twin.js # Validates infection & contact tracing
```

---

## 📦 Building for Production

To validate compilation across all 5 React micro-frontend portals simultaneously:

```bash
# Using the root build orchestrator:
npm run build:all
```

Or build individual portals directly:
```bash
npm --prefix apps/super-admin run build
npm --prefix apps/hospital-admin run build
npm --prefix apps/doctor run build
npm --prefix apps/staff run build
npm --prefix apps/patient run build
```

---

## 📄 License & Intellectual Property
This enterprise software is proprietary and confidential. Engineered for accredited multi-hospital networks, clinical healthcare institutions, and hospital operational commands. All rights reserved.
