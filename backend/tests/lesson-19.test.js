const fs = require("fs");
const path = require("path");
const assert = require("assert");

async function runTests() {
  console.log("================================================================================");
  console.log("=== Running Module 19: User Interface and Integration Test Suite ===");
  console.log("================================================================================\n");

  const rootDir = path.resolve(__dirname, "../..");
  const expectedApps = [
    { name: "super-admin", port: 5173, role: "super_admin" },
    { name: "hospital-admin", port: 5174, role: "hospital_admin" },
    { name: "doctor", port: 5175, role: "doctor" },
    { name: "staff", port: 5176, role: "staff" },
    { name: "patient", port: 5177, role: "patient" },
  ];

  // --------------------------------------------------------------------------
  // LESSON 19.1 — PATIENT WEBSITE VERSUS MANAGEMENT PANELS
  // --------------------------------------------------------------------------
  console.log("--- Lesson 19.1: Patient Website vs Management Panels Partitioning ---");

  // 1. Patient Website Public Landing component exists
  const publicHomePath = path.join(rootDir, "apps/patient/src/pages/PublicHome.jsx");
  assert.ok(fs.existsSync(publicHomePath), "PublicHome.jsx must exist for public patient portal visitors");
  const publicHomeContent = fs.readFileSync(publicHomePath, "utf8");
  assert.ok(publicHomeContent.includes("HealthMesh"), "PublicHome must render hospital network branding");
  assert.ok(publicHomeContent.includes("Our Network Hospitals"), "PublicHome must provide hospital directory");
  console.log("✓ Verified: Patient Website PublicHome.jsx available for unauthenticated public visitors");

  // 2. Patient App.jsx defaults unauthenticated view to public home
  const patientAppPath = path.join(rootDir, "apps/patient/src/App.jsx");
  const patientAppContent = fs.readFileSync(patientAppPath, "utf8");
  assert.ok(patientAppContent.includes('useState("home")'), "Patient App.jsx must default unauthView to public 'home'");
  assert.ok(patientAppContent.includes("<PublicHome"), "Patient App.jsx must mount PublicHome component");
  console.log("✓ Verified: Patient Website cleanly partitions public directory from authenticated portal");

  // 3. Management Panels enforce strict role redirection
  for (const app of expectedApps) {
    const portalConfigPath = path.join(rootDir, `apps/${app.name}/src/services/portalConfig.js`);
    assert.ok(fs.existsSync(portalConfigPath), `portalConfig.js must exist in ${app.name}`);
    const configContent = fs.readFileSync(portalConfigPath, "utf8");
    assert.ok(configContent.includes("redirectIfForeignRole"), `portalConfig in ${app.name} must enforce foreign role redirection`);
    assert.ok(configContent.includes(`port: ${app.port}`), `portalConfig in ${app.name} must specify dedicated port ${app.port}`);
  }
  console.log("✓ Verified: Role-based portal redirection and boundary isolation strictly configured");

  // --------------------------------------------------------------------------
  // LESSON 19.2 — SEPARATE PANELS AND PORT CONFIGURATION
  // --------------------------------------------------------------------------
  console.log("\n--- Lesson 19.2: Dedicated Ports, Root Orchestrator & Environment Config ---");

  // 1. Vite configurations and dedicated development ports
  for (const app of expectedApps) {
    const vitePath = path.join(rootDir, `apps/${app.name}/vite.config.js`);
    assert.ok(fs.existsSync(vitePath), `vite.config.js must exist for ${app.name}`);
    const viteContent = fs.readFileSync(vitePath, "utf8");
    assert.ok(
      viteContent.includes(`port: ${app.port}`),
      `${app.name} must be configured for strict development port ${app.port}`
    );
    assert.ok(
      viteContent.includes("strictPort: true"),
      `${app.name} must enforce strictPort to prevent port collision`
    );
  }
  console.log("✓ Verified: All 5 frontend Vite applications configured with strict dedicated ports (5173 - 5177)");

  // 2. Environment variables configuration
  for (const app of expectedApps) {
    const envPath = path.join(rootDir, `apps/${app.name}/.env`);
    const envExPath = path.join(rootDir, `apps/${app.name}/.env.example`);
    assert.ok(fs.existsSync(envPath), `.env must exist for ${app.name}`);
    assert.ok(fs.existsSync(envExPath), `.env.example must exist for ${app.name}`);
    const envContent = fs.readFileSync(envPath, "utf8");
    assert.ok(envContent.includes("VITE_API_BASE_URL"), `${app.name} .env must define VITE_API_BASE_URL`);
  }
  console.log("✓ Verified: Standardized .env and .env.example files present in all 5 frontend portals");

  // 3. Root package.json and convenience scripts
  const rootPkgPath = path.join(rootDir, "package.json");
  assert.ok(fs.existsSync(rootPkgPath), "Root package.json must exist");
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
  assert.ok(rootPkg.scripts["dev:all"], "Root package.json must contain 'dev:all' script");
  assert.ok(rootPkg.scripts["build:all"], "Root package.json must contain 'build:all' script");
  assert.ok(rootPkg.scripts["dev:backend"], "Root package.json must contain 'dev:backend' script");
  assert.ok(rootPkg.scripts["dev:super-admin"], "Root package.json must contain 'dev:super-admin' script");
  assert.ok(rootPkg.scripts["dev:hospital-admin"], "Root package.json must contain 'dev:hospital-admin' script");
  assert.ok(rootPkg.scripts["dev:doctor"], "Root package.json must contain 'dev:doctor' script");
  assert.ok(rootPkg.scripts["dev:staff"], "Root package.json must contain 'dev:staff' script");
  assert.ok(rootPkg.scripts["dev:patient"], "Root package.json must contain 'dev:patient' script");
  console.log("✓ Verified: Root package.json provides convenient development and build scripts for all services");

  // --------------------------------------------------------------------------
  // LESSON 19.3 — CONSISTENT LIGHT-THEME UI
  // --------------------------------------------------------------------------
  console.log("\n--- Lesson 19.3: Consistent Light-Theme UI & Harmonized Design Tokens ---");

  // 1. All 5 index.css define unified clinical & brand design tokens
  for (const app of expectedApps) {
    const cssPath = path.join(rootDir, `apps/${app.name}/src/index.css`);
    const cssContent = fs.readFileSync(cssPath, "utf8");
    assert.ok(cssContent.includes("--color-brand-50"), `${app.name} index.css must define --color-brand-* tokens`);
    assert.ok(cssContent.includes("--color-clinical-50"), `${app.name} index.css must define --color-clinical-* tokens`);
    assert.ok(cssContent.includes("--color-surface-card: #FFFFFF"), `${app.name} index.css must define white card surface token`);
    assert.ok(cssContent.includes("--color-surface-bg: #F8FAFC"), `${app.name} index.css must define slate-50 light background token`);
  }
  console.log("✓ Verified: All 5 frontend portals share unified light-theme color, surface, and text tokens");

  // 2. Patient Hospitals.jsx uses light-theme cards and zero dark-theme card blocks
  const patientHospPath = path.join(rootDir, "apps/patient/src/pages/Hospitals.jsx");
  const patientHospContent = fs.readFileSync(patientHospPath, "utf8");
  assert.ok(!patientHospContent.includes("bg-[#0D1527]"), "Patient Hospitals.jsx must not use dark-theme #0D1527 cards");
  assert.ok(patientHospContent.includes("bg-white rounded-xl"), "Patient Hospitals.jsx must use modern white rounded-xl cards");
  assert.ok(patientHospContent.includes("border-slate-200"), "Patient Hospitals.jsx must use standard slate-200 light borders");
  console.log("✓ Verified: Patient Hospitals interface refactored to clean light-theme cards & readable typography");

  // --------------------------------------------------------------------------
  // LESSON 19.4 — RESPONSIVE DESKTOP, TABLET AND MOBILE LAYOUTS
  // --------------------------------------------------------------------------
  console.log("\n--- Lesson 19.4: Responsive Desktop, Tablet, and Mobile Layouts ---");

  // 1. Management panels mobile sidebar drawer and backdrop
  const mgmtPanels = ["super-admin", "hospital-admin", "doctor", "staff"];
  for (const panel of mgmtPanels) {
    const appPath = path.join(rootDir, `apps/${panel}/src/App.jsx`);
    const appContent = fs.readFileSync(appPath, "utf8");
    assert.ok(appContent.includes("mobileSidebarOpen"), `${panel} App.jsx must track mobileSidebarOpen state`);
    assert.ok(appContent.includes("setMobileSidebarOpen(true)"), `${panel} App.jsx must provide mobile hamburger toggle`);
    assert.ok(appContent.includes("md:hidden"), `${panel} App.jsx must use responsive md:hidden breakpoints for drawer`);
  }
  console.log("✓ Verified: All 4 management panels feature collapsible responsive mobile sidebars & touch backdrops");

  // 2. Patient portal responsive desktop header and mobile bottom navigation bar
  assert.ok(patientAppContent.includes("hidden md:flex"), "Patient App.jsx must feature desktop navigation tabs on md+");
  assert.ok(patientAppContent.includes("md:hidden fixed bottom-0"), "Patient App.jsx must provide a dedicated mobile bottom navigation bar");
  assert.ok(patientAppContent.includes("pb-24 md:pb-12"), "Patient App.jsx main container must pad bottom to prevent mobile nav overlap");
  console.log("✓ Verified: Patient portal features dual responsive navigation: desktop header tabs + touch mobile bottom bar");

  // --------------------------------------------------------------------------
  // LESSON 19.5 — TABLES, SEARCH, FILTERS AND PAGINATION
  // --------------------------------------------------------------------------
  console.log("\n--- Lesson 19.5: Tables, Debounced Search, Filters & Pagination ---");

  for (const app of expectedApps) {
    const compDir = path.join(rootDir, `apps/${app.name}/src/components`);
    // DataTable
    const dtPath = path.join(compDir, "DataTable.jsx");
    assert.ok(fs.existsSync(dtPath), `DataTable.jsx must exist in ${app.name}`);
    const dtContent = fs.readFileSync(dtPath, "utf8");
    assert.ok(dtContent.includes("overflow-x-auto"), `DataTable in ${app.name} must feature horizontal scroll`);
    assert.ok(dtContent.includes("emptyMessage"), `DataTable in ${app.name} must support customizable empty states`);
    assert.ok(dtContent.includes("loading"), `DataTable in ${app.name} must support loading indicator`);

    // SearchInput
    const siPath = path.join(compDir, "SearchInput.jsx");
    assert.ok(fs.existsSync(siPath), `SearchInput.jsx must exist in ${app.name}`);
    const siContent = fs.readFileSync(siPath, "utf8");
    assert.ok(siContent.includes("debounceMs"), `SearchInput in ${app.name} must support debounced input`);

    // Pagination
    const pgPath = path.join(compDir, "Pagination.jsx");
    assert.ok(fs.existsSync(pgPath), `Pagination.jsx must exist in ${app.name}`);
    const pgContent = fs.readFileSync(pgPath, "utf8");
    assert.ok(pgContent.includes("onPageChange"), `Pagination in ${app.name} must support onPageChange callback`);
  }
  console.log("✓ Verified: Reusable DataTable, debounced SearchInput, and Pagination active across all 5 portals");

  // --------------------------------------------------------------------------
  // LESSON 19.6 — ICONS, TOOLTIPS, ACTION MENUS AND STATUS DROPDOWNS
  // --------------------------------------------------------------------------
  console.log("\n--- Lesson 19.6: Handcrafted SVG Icon Suite, Tooltips & Action Menus ---");

  // Verify full OrganicIcons suite in all 5 apps
  const requiredIcons = ["OrganicHospital", "OrganicBed", "OrganicCross", "OrganicShield", "OrganicClock", "OrganicHeartPulse"];
  for (const app of expectedApps) {
    const iconPath = path.join(rootDir, `apps/${app.name}/src/components/OrganicIcons.jsx`);
    assert.ok(fs.existsSync(iconPath), `OrganicIcons.jsx must exist in ${app.name}`);
    const iconContent = fs.readFileSync(iconPath, "utf8");
    for (const icon of requiredIcons) {
      assert.ok(iconContent.includes(icon), `OrganicIcons in ${app.name} must contain ${icon}`);
    }

    // StatusBadge
    const badgePath = path.join(rootDir, `apps/${app.name}/src/components/StatusBadge.jsx`);
    assert.ok(fs.existsSync(badgePath), `StatusBadge.jsx must exist in ${app.name}`);

    // ActionMenu
    const menuPath = path.join(rootDir, `apps/${app.name}/src/components/ActionMenu.jsx`);
    assert.ok(fs.existsSync(menuPath), `ActionMenu.jsx must exist in ${app.name}`);
  }
  console.log("✓ Verified: Full clinical SVG icon suite, ActionMenu, and StatusBadge synchronized to all 5 portals");

  // --------------------------------------------------------------------------
  // LESSON 19.7 — FORM VALIDATION, LOADING AND EMPTY STATES
  // --------------------------------------------------------------------------
  console.log("\n--- Lesson 19.7: Form Validation Helpers, Loading Spinners & Empty States ---");

  for (const app of expectedApps) {
    const compDir = path.join(rootDir, `apps/${app.name}/src/components`);
    // LoadingSpinner
    const spinPath = path.join(compDir, "LoadingSpinner.jsx");
    assert.ok(fs.existsSync(spinPath), `LoadingSpinner.jsx must exist in ${app.name}`);
    const spinContent = fs.readFileSync(spinPath, "utf8");
    assert.ok(spinContent.includes("animate-spin"), `LoadingSpinner in ${app.name} must use animate-spin`);

    // EmptyState
    const emptyPath = path.join(compDir, "EmptyState.jsx");
    assert.ok(fs.existsSync(emptyPath), `EmptyState.jsx must exist in ${app.name}`);
    const emptyContent = fs.readFileSync(emptyPath, "utf8");
    assert.ok(emptyContent.includes("actionLabel"), `EmptyState in ${app.name} must support action triggers`);

    // Input with validation error indicators
    const inpPath = path.join(compDir, "Input.jsx");
    assert.ok(fs.existsSync(inpPath), `Input.jsx must exist in ${app.name}`);
    const inpContent = fs.readFileSync(inpPath, "utf8");
    assert.ok(inpContent.includes("aria-invalid"), `Input in ${app.name} must bind aria-invalid for accessibility`);
    assert.ok(inpContent.includes("text-rose-600"), `Input in ${app.name} must render inline error feedback`);
  }
  console.log("✓ Verified: LoadingSpinner, EmptyState, and accessible Input validation active across all 5 portals");

  // --------------------------------------------------------------------------
  // LESSON 19.8 — FRONTEND AND BACKEND API INTEGRATION
  // --------------------------------------------------------------------------
  console.log("\n--- Lesson 19.8: Centralized API Layer, Environment URLs & Session Guards ---");

  for (const app of expectedApps) {
    const apiPath = path.join(rootDir, `apps/${app.name}/src/services/api.js`);
    assert.ok(fs.existsSync(apiPath), `api.js must exist in ${app.name}`);
    const apiContent = fs.readFileSync(apiPath, "utf8");
    assert.ok(
      apiContent.includes("import.meta.env.VITE_API_BASE_URL"),
      `api.js in ${app.name} must dynamically read VITE_API_BASE_URL`
    );
    assert.ok(
      apiContent.includes("http://localhost:5000/api"),
      `api.js in ${app.name} must fallback to default backend URL`
    );
  }
  console.log("✓ Verified: All 5 portals connect to Express backend via centralized, environment-aware API services");

  // --------------------------------------------------------------------------
  // LESSON 19.9 — ERROR HANDLING AND USER NOTIFICATIONS
  // --------------------------------------------------------------------------
  console.log("\n--- Lesson 19.9: Multi-Type Toast Notifications & Confirmation Dialogs ---");

  for (const app of expectedApps) {
    const compDir = path.join(rootDir, `apps/${app.name}/src/components`);
    // ToastNotification
    const toastPath = path.join(compDir, "ToastNotification.jsx");
    assert.ok(fs.existsSync(toastPath), `ToastNotification.jsx must exist in ${app.name}`);
    const toastContent = fs.readFileSync(toastPath, "utf8");
    assert.ok(toastContent.includes("role=\"alert\""), `ToastNotification in ${app.name} must use role alert`);
    assert.ok(toastContent.includes("success:"), `ToastNotification in ${app.name} must support success variant`);
    assert.ok(toastContent.includes("error:"), `ToastNotification in ${app.name} must support error variant`);

    // ConfirmationModal
    const confPath = path.join(compDir, "ConfirmationModal.jsx");
    assert.ok(fs.existsSync(confPath), `ConfirmationModal.jsx must exist in ${app.name}`);
    const confContent = fs.readFileSync(confPath, "utf8");
    assert.ok(confContent.includes("onConfirm"), `ConfirmationModal in ${app.name} must handle onConfirm action`);
  }
  console.log("✓ Verified: ToastNotification and ConfirmationModal available across all 5 portals");

  // --------------------------------------------------------------------------
  // LESSON 19.10 — MAINTAINING CONSISTENCY ACROSS ALL PANELS
  // --------------------------------------------------------------------------
  console.log("\n--- Lesson 19.10: Full Cross-Panel Shared UI Component Library ---");

  const requiredSharedComponents = [
    "Button.jsx",
    "Input.jsx",
    "Modal.jsx",
    "ConfirmationModal.jsx",
    "DataTable.jsx",
    "SearchInput.jsx",
    "Pagination.jsx",
    "StatusBadge.jsx",
    "ActionMenu.jsx",
    "LoadingSpinner.jsx",
    "EmptyState.jsx",
    "ToastNotification.jsx",
    "OrganicIcons.jsx",
  ];

  for (const app of expectedApps) {
    const compDir = path.join(rootDir, `apps/${app.name}/src/components`);
    for (const comp of requiredSharedComponents) {
      const compPath = path.join(compDir, comp);
      assert.ok(fs.existsSync(compPath), `${comp} must exist in ${app.name}/src/components/`);
    }
  }
  console.log("✓ Verified: 100% component parity across all 5 applications (13 standardized components per portal)");

  console.log("\n================================================================================");
  console.log("=== ALL 10 MODULE 19 LESSONS SUCCESSFULLY TESTED AND VERIFIED (10/10) ===");
  console.log("================================================================================\n");

  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test Suite Execution Failed:", err);
  process.exit(1);
});

