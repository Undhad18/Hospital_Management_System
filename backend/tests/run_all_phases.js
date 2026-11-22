const { execSync } = require("child_process");

console.log("================================================================================");
console.log("=== HEALTHMESH HMS: MASTER END-TO-END VERIFICATION TEST HARNESS (PHASES 2-8) ===");
console.log("================================================================================\n");

const suites = [
  { name: "Phase 2: AI Infrastructure & Database Migration", file: "backend/tests/phase2_ai_infra.test.js" },
  { name: "Phase 3: AI Hospital Operational Assistant", file: "backend/tests/phase3_ai_assistant.test.js" },
  { name: "Phase 4: AI Operational Intelligence & Analytics", file: "backend/tests/phase4_ai_analytics.test.js" },
  { name: "Phase 5: AI Reporting & Workflow Notification Engine", file: "backend/tests/phase5_ai_reporting.test.js" },
  { name: "Phase 6: Hospital Digital Twin Core Telemetry", file: "backend/tests/phase6_digital_twin.test.js" },
  { name: "Phase 7: Socket.IO Real-Time Event Synchronization", file: "backend/tests/phase7_realtime_sync.test.js" },
  { name: "Phase 8: Digital Twin What-If Simulation Sandbox", file: "backend/tests/phase8_digital_twin_simulation.test.js" },
];

let allPassed = true;
const results = [];

for (const suite of suites) {
  process.stdout.write(`Executing ${suite.name}... `);
  try {
    const output = execSync(`node ${suite.file}`, {
      encoding: "utf8",
      shell: "C:\\Windows\\SysWOW64\\cmd.exe",
    });
    console.log("PASSED ✓");
    results.push({ name: suite.name, status: "PASSED", passed: true });
  } catch (err) {
    console.log("FAILED ✗");
    console.error(err.stdout || err.message);
    results.push({ name: suite.name, status: "FAILED", passed: false });
    allPassed = false;
  }
}

console.log("\n================================================================================");
console.log("=== FINAL MASTER VERIFICATION SUMMARY SCORECARD ===");
console.log("================================================================================");
results.forEach((r, idx) => {
  console.log(`${idx + 1}. ${r.name.padEnd(60)} : [ ${r.status} ]`);
});
console.log("================================================================================");

if (allPassed) {
  console.log(">>> ALL 7 BACKEND TEST SUITES PASSED WITH 100% SUCCESS RATE <<<\n");
  process.exit(0);
} else {
  console.error(">>> ONE OR MORE TEST SUITES FAILED <<<\n");
  process.exit(1);
}
