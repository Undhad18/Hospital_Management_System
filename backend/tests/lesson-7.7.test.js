const assert = require("assert");
const templates = require("../services/emailTemplates");

function runTests() {
  console.log("=================================================");
  console.log(" RUNNING TESTS: Lesson 7.7");
  console.log(" (Professional Responsive Email Templates & XSS Safety)");
  console.log("=================================================\n");

  // -------------------------------------------------------------
  // TEST 1: HTML Escaping & Injection Protection
  // -------------------------------------------------------------
  console.log("[TEST 1] Dynamic Content HTML Escaping (XSS Prevention)");
  const dangerousInput = "<script>alert('xss')</script> & \"quoted\"";
  const escaped = templates.escapeHtml(dangerousInput);
  assert(!escaped.includes("<script>"), "Must escape opening angle bracket");
  assert(escaped.includes("&lt;script&gt;"), "Must convert to entity");
  assert(escaped.includes("&quot;quoted&quot;"), "Must escape quotes");
  assert(escaped.includes("&amp;"), "Must escape ampersand");
  console.log("  ✓ Dynamic input successfully sanitized with HTML entities");

  // -------------------------------------------------------------
  // TEST 2: Every Template Produces Valid HTML & Plain Text
  // -------------------------------------------------------------
  console.log("\n[TEST 2] Template Rendering & Plain-Text Fallback Verification");
  const testCases = [
    {
      name: "accountPendingReviewTemplate",
      fn: () => templates.accountPendingReviewTemplate({
        fullName: "Dr. Gregory House",
        role: "doctor",
        hospitalName: "Princeton-Plainsboro",
        departmentName: "Diagnostics",
      }),
      expectedKeywords: ["Princeton-Plainsboro", "Diagnostics", "review queue"],
    },
    {
      name: "accountApprovedTemplate",
      fn: () => templates.accountApprovedTemplate({
        fullName: "Nurse Jackie",
        role: "staff",
        hospitalName: "All Saints Hospital",
        loginUrl: "http://localhost:5176",
      }),
      expectedKeywords: ["All Saints Hospital", "approved", "http://localhost:5176"],
    },
    {
      name: "accountCredentialsTemplate",
      fn: () => templates.accountCredentialsTemplate({
        fullName: "Dr. James Wilson",
        role: "doctor",
        hospitalName: "Mercy General",
        temporaryPassword: "TempPass#9988",
        loginUrl: "http://localhost:5175",
      }),
      expectedKeywords: ["TempPass#9988", "IMPORTANT SECURITY NOTICE", "Mercy General"],
    },
    {
      name: "bookingReceivedTemplate",
      fn: () => templates.bookingReceivedTemplate({
        patientName: "John Doe",
        appointmentNumber: "APT-1001",
        hospitalName: "City Hospital",
        departmentName: "Cardiology",
        doctorName: "Jane Smith",
        appointmentDate: "2026-11-01",
        appointmentTime: "10:30",
        appointmentType: "consultation",
        appointmentMode: "in_person",
      }),
      expectedKeywords: ["APT-1001", "Pending Review", "City Hospital", "10:30"],
    },
    {
      name: "bookingConfirmedTemplate",
      fn: () => templates.bookingConfirmedTemplate({
        patientName: "John Doe",
        appointmentNumber: "APT-1002",
        hospitalName: "City Hospital",
        departmentName: "Cardiology",
        doctorName: "Jane Smith",
        appointmentDate: "2026-11-01",
        appointmentTime: "10:30",
        appointmentType: "consultation",
        appointmentMode: "in_person",
        consultationFee: 750,
      }),
      expectedKeywords: ["APT-1002", "Confirmed", "₹750.00", "Preparation Guidelines"],
    },
    {
      name: "appointmentCancelledTemplate",
      fn: () => templates.appointmentCancelledTemplate({
        patientName: "John Doe",
        appointmentNumber: "APT-1003",
        hospitalName: "City Hospital",
        doctorName: "Jane Smith",
        appointmentDate: "2026-11-01",
        appointmentTime: "10:30",
        cancellationReason: "Patient request",
      }),
      expectedKeywords: ["APT-1003", "Cancelled", "Patient request"],
    },
    {
      name: "appointmentRescheduledTemplate",
      fn: () => templates.appointmentRescheduledTemplate({
        patientName: "John Doe",
        appointmentNumber: "APT-1004",
        hospitalName: "City Hospital",
        departmentName: "Cardiology",
        doctorName: "Jane Smith",
        previousDate: "2026-11-01",
        previousTime: "10:30",
        newDate: "2026-11-03",
        newTime: "14:00",
        appointmentMode: "in_person",
      }),
      expectedKeywords: ["APT-1004", "Rescheduled", "2026-11-01", "2026-11-03"],
    },
    {
      name: "appointmentReminderTemplate",
      fn: () => templates.appointmentReminderTemplate({
        patientName: "John Doe",
        appointmentNumber: "APT-1005",
        hospitalName: "City Hospital",
        departmentName: "Cardiology",
        doctorName: "Jane Smith",
        appointmentDate: "2026-11-02",
        appointmentTime: "09:00",
        appointmentMode: "in_person",
      }),
      expectedKeywords: ["APT-1005", "Reminder", "Tomorrow", "09:00"],
    },
    {
      name: "appointmentCompletedTemplate",
      fn: () => templates.appointmentCompletedTemplate({
        patientName: "John Doe",
        appointmentNumber: "APT-1006",
        hospitalName: "City Hospital",
        doctorName: "Jane Smith",
        appointmentDate: "2026-11-01",
      }),
      expectedKeywords: ["APT-1006", "Consultation Completed", "Aftercare"],
    },
    {
      name: "followUpScheduledTemplate",
      fn: () => templates.followUpScheduledTemplate({
        patientName: "John Doe",
        appointmentNumber: "APT-1007",
        previousAppointmentNumber: "APT-1006",
        hospitalName: "City Hospital",
        doctorName: "Jane Smith",
        appointmentDate: "2026-11-15",
        appointmentTime: "11:00",
      }),
      expectedKeywords: ["APT-1007", "APT-1006", "Follow-up"],
    },
    {
      name: "passwordResetOtpTemplate",
      fn: () => templates.passwordResetOtpTemplate({
        email: "user@example.com",
        otp: "654321",
        expiresMinutes: 10,
      }),
      expectedKeywords: ["654321", "10 minutes", "Password Reset Verification"],
    },
    {
      name: "registrationOtpTemplate",
      fn: () => templates.registrationOtpTemplate({
        email: "user@example.com",
        otp: "123456",
        expiresMinutes: 10,
      }),
      expectedKeywords: ["123456", "Verify Your Email Address"],
    },
  ];

  for (const tc of testCases) {
    const rendered = tc.fn();
    assert(rendered.subject, `${tc.name}: Subject is missing`);
    assert(rendered.text, `${tc.name}: Text version is missing`);
    assert(rendered.html, `${tc.name}: HTML version is missing`);

    // Verify presence of required keywords in HTML and Text
    for (const kw of tc.expectedKeywords) {
      assert(
        rendered.html.includes(kw) || rendered.text.includes(kw),
        `${tc.name}: Expected keyword "${kw}" not found in rendered email`
      );
    }

    // Verify responsive container properties
    assert(rendered.html.includes("max-width: 600px"), `${tc.name}: Missing standard 600px width constraint`);
    assert(rendered.html.includes("<!DOCTYPE html>"), `${tc.name}: Missing DOCTYPE`);
    assert(!rendered.html.includes("undefined"), `${tc.name}: Unresolved undefined detected in HTML`);
    assert(!rendered.text.includes("undefined"), `${tc.name}: Unresolved undefined detected in Text`);
    console.log(`  ✓ ${tc.name} rendered with HTML & plain-text fallbacks`);
  }

  // -------------------------------------------------------------
  // TEST 3: Graceful Handling of Missing Optional Data
  // -------------------------------------------------------------
  console.log("\n[TEST 3] Graceful Degradation on Missing Optional Fields");
  const minimalBooking = templates.bookingReceivedTemplate({
    appointmentNumber: "APT-MINIMAL",
    appointmentDate: "2026-12-01",
    appointmentTime: "10:00",
  });
  assert(!minimalBooking.html.includes("undefined"), "Missing patientName must not render 'undefined'");
  assert(!minimalBooking.text.includes("undefined"), "Missing hospitalName must not render 'undefined'");
  console.log("  ✓ Empty optional fields gracefully handled without 'undefined' leaks");

  console.log("\n=================================================");
  console.log(" ALL TESTS FOR LESSON 7.7 PASSED (100%)");
  console.log("=================================================\n");
}

runTests();
