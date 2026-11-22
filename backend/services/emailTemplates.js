/**
 * Email Templates Service (Lesson 7.7)
 * Produces clean, accessible, responsive HTML and plain-text emails.
 * All dynamic parameters are safely HTML-escaped.
 */

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function baseLayout({ title, previewText, bodyContent, footerExtra = "" }) {
  const safeTitle = escapeHtml(title);
  const safePreview = escapeHtml(previewText || title);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <!-- Preview Text -->
  <div style="display: none; max-height: 0px; overflow: hidden; mso-hide: all;">
    ${safePreview}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card (600px Max) -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0284c7; padding: 20px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #ffffff; letter-spacing: -0.01em;">
                      HealthMesh
                    </h1>
                    <p style="margin: 2px 0 0; font-size: 11px; font-weight: 500; color: #bae6fd; text-transform: uppercase; letter-spacing: 0.05em;">
                      Hospital Management System
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 28px 24px; font-size: 14px; line-height: 1.6; color: #334155;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f1f5f9; padding: 20px 24px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.5;">
              ${footerExtra ? `<div style="margin-bottom: 12px;">${footerExtra}</div>` : ""}
              <p style="margin: 0 0 4px; font-weight: 600; color: #475569;">HealthMesh Healthcare Network</p>
              <p style="margin: 0;">This is an automated operational notification. Please do not reply directly to this email.</p>
              <p style="margin: 4px 0 0; font-size: 11px; color: #94a3b8;">Confidentiality Notice: Intended strictly for the addressed recipient.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return html;
}

// ---------------------------------------------------------------------------
// 1. Account Pending Review (Doctor / Staff)
// ---------------------------------------------------------------------------
function accountPendingReviewTemplate({ fullName, role, hospitalName, departmentName }) {
  const safeName = escapeHtml(fullName || "Healthcare Professional");
  const safeRole = escapeHtml(role === "doctor" ? "Attending Physician" : "Clinical/Operational Staff");
  const safeHospital = escapeHtml(hospitalName || "HealthMesh Hospital Partner");
  const safeDept = escapeHtml(departmentName || "General Department");

  const subject = `Application Received — ${safeHospital}`;
  const text = `Dear ${safeName},

Thank you for registering with ${safeHospital}.

Your account registration for the role of ${safeRole} (${safeDept}) has been received and is currently under administrative review.

Once your credentials and affiliation have been verified by the hospital administration, you will receive an account activation confirmation along with your login access instructions.

Best regards,
Hospital Administration Team
${safeHospital}`;

  const bodyContent = `
    <h2 style="margin: 0 0 16px; font-size: 18px; color: #0f172a; font-weight: 600;">
      Account Registration Received
    </h2>
    <p style="margin: 0 0 12px;">Dear <strong>${safeName}</strong>,</p>
    <p style="margin: 0 0 16px;">
      Thank you for registering with <strong>${safeHospital}</strong>. Your account has been logged and placed into the administrative review queue.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0284c7; padding: 14px 16px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 6px; font-size: 13px;"><strong>Assigned Role:</strong> ${safeRole}</p>
      <p style="margin: 0 0 6px; font-size: 13px;"><strong>Hospital:</strong> ${safeHospital}</p>
      <p style="margin: 0; font-size: 13px;"><strong>Department:</strong> ${safeDept}</p>
    </div>

    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #1e40af; margin: 16px 0;">
      <strong>Next Steps:</strong> An administrator will verify your profile and licensing. You will receive an email as soon as your access is approved.
    </div>

    <p style="margin: 20px 0 0;">Best regards,<br><strong>Hospital Administration Team</strong></p>
  `;

  const html = baseLayout({
    title: subject,
    previewText: `Your account registration with ${safeHospital} is under review.`,
    bodyContent,
  });

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// 2. Account Approved
// ---------------------------------------------------------------------------
function accountApprovedTemplate({ fullName, role, hospitalName, loginUrl }) {
  const safeName = escapeHtml(fullName || "User");
  const safeRole = escapeHtml(role === "doctor" ? "Doctor" : role === "staff" ? "Staff" : "Healthcare Member");
  const safeHospital = escapeHtml(hospitalName || "HealthMesh Portal");
  const safeLoginUrl = escapeHtml(loginUrl || "http://localhost:5174");

  const subject = `Account Approved — ${safeHospital}`;
  const text = `Dear ${safeName},

We are pleased to inform you that your ${safeRole} account for ${safeHospital} has been approved and activated.

You may now access your portal using your registered credentials:
${safeLoginUrl}

Best regards,
Hospital Administration Team`;

  const bodyContent = `
    <h2 style="margin: 0 0 16px; font-size: 18px; color: #0f172a; font-weight: 600;">
      Account Approved &amp; Activated
    </h2>
    <p style="margin: 0 0 12px;">Dear <strong>${safeName}</strong>,</p>
    <p style="margin: 0 0 16px;">
      We are pleased to notify you that your <strong>${safeRole}</strong> account for <strong>${safeHospital}</strong> has been verified and officially approved.
    </p>

    <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-left: 4px solid #10b981; padding: 14px 16px; margin: 20px 0; border-radius: 4px; color: #065f46;">
      <p style="margin: 0; font-size: 13px; font-weight: 500;">
        Your profile is now active on the HealthMesh platform.
      </p>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${safeLoginUrl}" style="background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 10px 24px; font-size: 13px; font-weight: 600; border-radius: 6px; display: inline-block;">
        Sign In to Portal
      </a>
    </div>

    <p style="margin: 20px 0 0;">Best regards,<br><strong>Hospital Administration &amp; Operations</strong></p>
  `;

  const html = baseLayout({
    title: subject,
    previewText: `Your ${safeRole} account for ${safeHospital} is now active.`,
    bodyContent,
  });

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// 3. Account Login Credentials (Temporary Password)
// ---------------------------------------------------------------------------
function accountCredentialsTemplate({ fullName, role, hospitalName, temporaryPassword, loginUrl }) {
  const safeName = escapeHtml(fullName || "User");
  const roleTitle =
    role === "doctor"
      ? "Attending Physician"
      : role === "staff"
      ? "Hospital Operational Staff"
      : "Hospital Administrator";
  const safeHospital = escapeHtml(hospitalName || "HealthMesh Portal");
  const safeUrl = escapeHtml(loginUrl || "http://localhost:5174");

  const subject = `Your Access Credentials — ${safeHospital}`;
  const text = `Dear ${safeName},

Your access credentials for ${safeHospital} have been established:

Role: ${roleTitle}
Login Portal: ${safeUrl}
Temporary Password: ${temporaryPassword}

IMPORTANT SECURITY NOTICE:
You will be required to change your temporary password immediately upon your initial sign-in.

Best regards,
Hospital Administration & IT Security`;

  const bodyContent = `
    <h2 style="margin: 0 0 16px; font-size: 18px; color: #0f172a; font-weight: 600;">
      Welcome to ${safeHospital}
    </h2>
    <p style="margin: 0 0 12px;">Dear <strong>${safeName}</strong>,</p>
    <p style="margin: 0 0 16px;">
      Your access credentials for the healthcare management portal have been created:
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0284c7; padding: 14px 16px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 6px; font-size: 13px;"><strong>Assigned Role:</strong> ${escapeHtml(roleTitle)}</p>
      <p style="margin: 0 0 6px; font-size: 13px;"><strong>Login Portal:</strong> <a href="${safeUrl}" style="color: #0284c7; text-decoration: underline;">${safeUrl}</a></p>
      <p style="margin: 0; font-size: 13px;"><strong>Temporary Password:</strong> <code style="background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; font-weight: bold; color: #0f172a;">${escapeHtml(temporaryPassword)}</code></p>
    </div>

    <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #92400e; margin: 16px 0;">
      <strong>Security Notice:</strong> You are required to update your temporary password immediately upon your first sign-in. Never share your password with anyone.
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${safeUrl}" style="background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 10px 24px; font-size: 13px; font-weight: 600; border-radius: 6px; display: inline-block;">
        Log In Now
      </a>
    </div>

    <p style="margin: 20px 0 0;">Best regards,<br><strong>Hospital Administration &amp; IT Security</strong></p>
  `;

  const html = baseLayout({
    title: subject,
    previewText: `Your credentials for ${safeHospital} have been issued.`,
    bodyContent,
  });

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// 4. Appointment Booking Received (Pending Review)
// ---------------------------------------------------------------------------
function bookingReceivedTemplate({
  patientName,
  appointmentNumber,
  hospitalName,
  departmentName,
  doctorName,
  appointmentDate,
  appointmentTime,
  appointmentType,
  appointmentMode,
  viewUrl,
}) {
  const safePatient = escapeHtml(patientName || "Patient");
  const safeNumber = escapeHtml(appointmentNumber);
  const safeHospital = escapeHtml(hospitalName || "Hospital");
  const safeDept = escapeHtml(departmentName || "Department");
  const safeDoctor = escapeHtml(doctorName || "Assigned Doctor");
  const safeDate = escapeHtml(appointmentDate);
  const safeTime = escapeHtml(appointmentTime);
  const safeType = escapeHtml(appointmentType || "consultation");
  const safeMode = escapeHtml(appointmentMode === "video_consultation" ? "Video Consultation" : "In-Person Visit");
  const safeViewUrl = escapeHtml(viewUrl || "http://localhost:5173");

  const subject = `Booking Request Received — #${safeNumber}`;
  const text = `Dear ${safePatient},

Your appointment booking request has been received by ${safeHospital}.

Appointment Reference: ${safeNumber}
Status: Pending Review
Doctor: Dr. ${safeDoctor}
Department: ${safeDept}
Requested Date: ${safeDate}
Requested Time: ${safeTime}
Mode: ${safeMode}

Please note: Your appointment is currently pending confirmation from our scheduling team. You will receive an update once confirmed.

View Appointment: ${safeViewUrl}

Best regards,
${safeHospital}`;

  const bodyContent = `
    <h2 style="margin: 0 0 16px; font-size: 18px; color: #0f172a; font-weight: 600;">
      Appointment Request Received
    </h2>
    <p style="margin: 0 0 12px;">Dear <strong>${safePatient}</strong>,</p>
    <p style="margin: 0 0 16px;">
      We have received your appointment request. It is currently under review by our hospital coordination team.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 20px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 13px;">
        <tr>
          <td style="padding: 4px 0; color: #64748b; width: 140px;">Reference:</td>
          <td style="padding: 4px 0; font-weight: 600; color: #0f172a;">#${safeNumber}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b;">Current Status:</td>
          <td style="padding: 4px 0;"><span style="background-color: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">Pending Review</span></td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b;">Hospital:</td>
          <td style="padding: 4px 0; color: #0f172a;">${safeHospital}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b;">Department:</td>
          <td style="padding: 4px 0; color: #0f172a;">${safeDept}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b;">Doctor:</td>
          <td style="padding: 4px 0; color: #0f172a;">Dr. ${safeDoctor}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b;">Date &amp; Time:</td>
          <td style="padding: 4px 0; font-weight: 600; color: #0284c7;">${safeDate} at ${safeTime}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b;">Visit Mode:</td>
          <td style="padding: 4px 0; color: #0f172a;">${safeMode} (${safeType})</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #f1f5f9; padding: 12px 16px; border-radius: 4px; font-size: 12px; color: #475569; margin: 16px 0;">
      <strong>Please note:</strong> This email confirms receipt of your booking request. An official confirmation email will follow once our medical team approves the schedule.
    </div>

    <p style="margin: 20px 0 0;">Best regards,<br><strong>${safeHospital}</strong></p>
  `;

  const html = baseLayout({
    title: subject,
    previewText: `Booking request #${safeNumber} received for ${safeDate}.`,
    bodyContent,
  });

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// 5. Appointment Booking Confirmed
// ---------------------------------------------------------------------------
function bookingConfirmedTemplate({
  patientName,
  appointmentNumber,
  hospitalName,
  departmentName,
  doctorName,
  appointmentDate,
  appointmentTime,
  appointmentType,
  appointmentMode,
  consultationFee,
  viewUrl,
}) {
  const safePatient = escapeHtml(patientName || "Patient");
  const safeNumber = escapeHtml(appointmentNumber);
  const safeHospital = escapeHtml(hospitalName || "Hospital");
  const safeDept = escapeHtml(departmentName || "Department");
  const safeDoctor = escapeHtml(doctorName || "Assigned Doctor");
  const safeDate = escapeHtml(appointmentDate);
  const safeTime = escapeHtml(appointmentTime);
  const safeType = escapeHtml(appointmentType || "consultation");
  const safeMode = escapeHtml(appointmentMode === "video_consultation" ? "Video Consultation" : "In-Person Hospital Visit");
  const safeFee = consultationFee !== undefined && consultationFee !== null ? Number(consultationFee).toFixed(2) : "0.00";
  const safeViewUrl = escapeHtml(viewUrl || "http://localhost:5173");

  const subject = `Appointment Confirmed — #${safeNumber} at ${safeHospital}`;
  const text = `Dear ${safePatient},

Your appointment #${safeNumber} has been officially confirmed!

Hospital: ${safeHospital}
Department: ${safeDept}
Doctor: Dr. ${safeDoctor}
Date: ${safeDate}
Time: ${safeTime}
Mode: ${safeMode}
Consultation Fee: ₹${safeFee}

Instructions:
- Please arrive 15 minutes before your scheduled appointment time.
- Present appointment reference #${safeNumber} at reception for queue check-in.
- Bring any relevant prior test results or medications.

View Details: ${safeViewUrl}

Best regards,
${safeHospital}`;

  const bodyContent = `
    <h2 style="margin: 0 0 16px; font-size: 18px; color: #0f172a; font-weight: 600;">
      Appointment Confirmed
    </h2>
    <p style="margin: 0 0 12px;">Dear <strong>${safePatient}</strong>,</p>
    <p style="margin: 0 0 16px;">
      Your appointment with <strong>${safeHospital}</strong> has been confirmed. Below are your consultation details:
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 20px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 13px;">
        <tr>
          <td style="padding: 4px 0; color: #64748b; width: 140px;">Reference:</td>
          <td style="padding: 4px 0; font-weight: 700; color: #0284c7; font-size: 14px;">#${safeNumber}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b;">Status:</td>
          <td style="padding: 4px 0;"><span style="background-color: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">Confirmed</span></td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b;">Hospital:</td>
          <td style="padding: 4px 0; color: #0f172a; font-weight: 600;">${safeHospital}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b;">Department:</td>
          <td style="padding: 4px 0; color: #0f172a;">${safeDept}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b;">Physician:</td>
          <td style="padding: 4px 0; color: #0f172a; font-weight: 600;">Dr. ${safeDoctor}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b;">Date &amp; Time:</td>
          <td style="padding: 4px 0; font-weight: 700; color: #0f172a;">${safeDate} at ${safeTime}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b;">Mode:</td>
          <td style="padding: 4px 0; color: #0f172a;">${safeMode}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748b;">Consultation Fee:</td>
          <td style="padding: 4px 0; color: #0f172a;">₹${safeFee}</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 14px 16px; border-radius: 6px; font-size: 13px; color: #1e3a8a; margin: 16px 0;">
      <p style="margin: 0 0 6px; font-weight: 600;">Preparation Guidelines:</p>
      <ul style="margin: 0; padding-left: 18px;">
        <li>Please arrive 15 minutes before your scheduled appointment time.</li>
        <li>Present your reference number <strong>#${safeNumber}</strong> at the front desk for check-in.</li>
        <li>Carry prior diagnostic reports, prescriptions, and an ID proof.</li>
      </ul>
    </div>

    <p style="margin: 20px 0 0;">Best regards,<br><strong>${safeHospital}</strong></p>
  `;

  const html = baseLayout({
    title: subject,
    previewText: `Confirmed appointment #${safeNumber} on ${safeDate} at ${safeTime}.`,
    bodyContent,
  });

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// 6. Appointment Cancelled
// ---------------------------------------------------------------------------
function appointmentCancelledTemplate({
  patientName,
  appointmentNumber,
  hospitalName,
  doctorName,
  appointmentDate,
  appointmentTime,
  cancellationReason,
  rescheduleUrl,
}) {
  const safePatient = escapeHtml(patientName || "Patient");
  const safeNumber = escapeHtml(appointmentNumber);
  const safeHospital = escapeHtml(hospitalName || "Hospital");
  const safeDoctor = escapeHtml(doctorName || "Assigned Doctor");
  const safeDate = escapeHtml(appointmentDate);
  const safeTime = escapeHtml(appointmentTime);
  const safeReason = escapeHtml(cancellationReason || "No specific reason provided.");
  const safeUrl = escapeHtml(rescheduleUrl || "http://localhost:5173");

  const subject = `Appointment Cancelled — #${safeNumber}`;
  const text = `Dear ${safePatient},

This is to confirm that your appointment #${safeNumber} has been cancelled.

Details:
Hospital: ${safeHospital}
Doctor: Dr. ${safeDoctor}
Original Schedule: ${safeDate} at ${safeTime}
Cancellation Reason: ${safeReason}

If you would like to book another appointment or explore other available time slots, please visit:
${safeUrl}

Best regards,
${safeHospital}`;

  const bodyContent = `
    <h2 style="margin: 0 0 16px; font-size: 18px; color: #b91c1c; font-weight: 600;">
      Appointment Cancelled
    </h2>
    <p style="margin: 0 0 12px;">Dear <strong>${safePatient}</strong>,</p>
    <p style="margin: 0 0 16px;">
      This email confirms that your appointment <strong>#${safeNumber}</strong> scheduled for <strong>${safeDate} at ${safeTime}</strong> has been cancelled.
    </p>

    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #ef4444; padding: 14px 16px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 6px; font-size: 13px;"><strong>Doctor:</strong> Dr. ${safeDoctor}</p>
      <p style="margin: 0 0 6px; font-size: 13px;"><strong>Hospital:</strong> ${safeHospital}</p>
      <p style="margin: 0; font-size: 13px;"><strong>Cancellation Reason:</strong> ${safeReason}</p>
    </div>

    <p style="margin: 16px 0;">
      If you need to reschedule or select another convenient date, you may book a new slot online:
    </p>

    <div style="text-align: center; margin: 20px 0;">
      <a href="${safeUrl}" style="background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 10px 24px; font-size: 13px; font-weight: 600; border-radius: 6px; display: inline-block;">
        Book New Appointment
      </a>
    </div>

    <p style="margin: 20px 0 0;">Best regards,<br><strong>${safeHospital}</strong></p>
  `;

  const html = baseLayout({
    title: subject,
    previewText: `Appointment #${safeNumber} on ${safeDate} has been cancelled.`,
    bodyContent,
  });

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// 7. Appointment Rescheduled
// ---------------------------------------------------------------------------
function appointmentRescheduledTemplate({
  patientName,
  appointmentNumber,
  hospitalName,
  departmentName,
  doctorName,
  previousDate,
  previousTime,
  newDate,
  newTime,
  appointmentMode,
  viewUrl,
}) {
  const safePatient = escapeHtml(patientName || "Patient");
  const safeNumber = escapeHtml(appointmentNumber);
  const safeHospital = escapeHtml(hospitalName || "Hospital");
  const safeDept = escapeHtml(departmentName || "Department");
  const safeDoctor = escapeHtml(doctorName || "Assigned Doctor");
  const safePrevDate = escapeHtml(previousDate);
  const safePrevTime = escapeHtml(previousTime);
  const safeNewDate = escapeHtml(newDate);
  const safeNewTime = escapeHtml(newTime);
  const safeMode = escapeHtml(appointmentMode === "video_consultation" ? "Video Consultation" : "In-Person Visit");
  const safeUrl = escapeHtml(viewUrl || "http://localhost:5173");

  const subject = `Appointment Rescheduled — #${safeNumber}`;
  const text = `Dear ${safePatient},

Your appointment #${safeNumber} with ${safeHospital} has been successfully rescheduled.

Doctor: Dr. ${safeDoctor} (${safeDept})
Previous Schedule: ${safePrevDate} at ${safePrevTime}
NEW SCHEDULE: ${safeNewDate} at ${safeNewTime}
Mode: ${safeMode}

Please update your calendar. Please arrive 15 minutes before your new scheduled time.

View Appointment: ${safeUrl}

Best regards,
${safeHospital}`;

  const bodyContent = `
    <h2 style="margin: 0 0 16px; font-size: 18px; color: #0f172a; font-weight: 600;">
      Appointment Rescheduled
    </h2>
    <p style="margin: 0 0 12px;">Dear <strong>${safePatient}</strong>,</p>
    <p style="margin: 0 0 16px;">
      Your appointment <strong>#${safeNumber}</strong> has been updated with a new date and time:
    </p>

    <!-- Reschedule Comparison Box -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 20px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 13px;">
        <tr>
          <td style="padding: 6px 0; color: #94a3b8; text-decoration: line-through; width: 140px;">Previous Schedule:</td>
          <td style="padding: 6px 0; color: #94a3b8; text-decoration: line-through;">${safePrevDate} at ${safePrevTime}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #0f172a; font-weight: 700; width: 140px;">New Schedule:</td>
          <td style="padding: 6px 0; font-weight: 700; color: #0284c7; font-size: 14px;">${safeNewDate} at ${safeNewTime}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Hospital:</td>
          <td style="padding: 6px 0; color: #0f172a;">${safeHospital}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Department:</td>
          <td style="padding: 6px 0; color: #0f172a;">${safeDept}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Physician:</td>
          <td style="padding: 6px 0; color: #0f172a;">Dr. ${safeDoctor}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Visit Mode:</td>
          <td style="padding: 6px 0; color: #0f172a;">${safeMode}</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #eff6ff; padding: 12px 16px; border-radius: 4px; font-size: 12px; color: #1e40af; margin: 16px 0;">
      <strong>Reminder:</strong> Please arrive 15 minutes before ${safeNewTime} on ${safeNewDate} with reference <strong>#${safeNumber}</strong>.
    </div>

    <p style="margin: 20px 0 0;">Best regards,<br><strong>${safeHospital}</strong></p>
  `;

  const html = baseLayout({
    title: subject,
    previewText: `Rescheduled to ${safeNewDate} at ${safeNewTime}.`,
    bodyContent,
  });

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// 8. Appointment Reminder (Upcoming 24h)
// ---------------------------------------------------------------------------
function appointmentReminderTemplate({
  patientName,
  appointmentNumber,
  hospitalName,
  departmentName,
  doctorName,
  appointmentDate,
  appointmentTime,
  appointmentMode,
  viewUrl,
}) {
  const safePatient = escapeHtml(patientName || "Patient");
  const safeNumber = escapeHtml(appointmentNumber);
  const safeHospital = escapeHtml(hospitalName || "Hospital");
  const safeDept = escapeHtml(departmentName || "Department");
  const safeDoctor = escapeHtml(doctorName || "Assigned Doctor");
  const safeDate = escapeHtml(appointmentDate);
  const safeTime = escapeHtml(appointmentTime);
  const safeMode = escapeHtml(appointmentMode === "video_consultation" ? "Video Consultation" : "In-Person Visit");
  const safeUrl = escapeHtml(viewUrl || "http://localhost:5173");

  const subject = `Appointment Reminder — Tomorrow at ${safeTime} (#${safeNumber})`;
  const text = `Dear ${safePatient},

This is a reminder for your upcoming appointment with ${safeHospital}:

Reference: #${safeNumber}
Doctor: Dr. ${safeDoctor} (${safeDept})
Date: ${safeDate}
Time: ${safeTime}
Mode: ${safeMode}

Please plan to arrive 15 minutes ahead of your scheduled time.

View Appointment: ${safeUrl}

Best regards,
${safeHospital}`;

  const bodyContent = `
    <h2 style="margin: 0 0 16px; font-size: 18px; color: #0f172a; font-weight: 600;">
      Upcoming Appointment Reminder
    </h2>
    <p style="margin: 0 0 12px;">Dear <strong>${safePatient}</strong>,</p>
    <p style="margin: 0 0 16px;">
      This is a friendly reminder of your scheduled medical consultation tomorrow:
    </p>

    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; padding: 16px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 6px; font-size: 14px; font-weight: 700; color: #166534;">
        ${safeDate} at ${safeTime}
      </p>
      <p style="margin: 0 0 4px; font-size: 13px; color: #15803d;">Dr. ${safeDoctor} &bull; ${safeDept}</p>
      <p style="margin: 0 0 4px; font-size: 13px; color: #15803d;">Hospital: ${safeHospital}</p>
      <p style="margin: 0; font-size: 13px; color: #15803d;">Reference: #${safeNumber}</p>
    </div>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 14px 16px; border-radius: 6px; font-size: 13px; color: #334155; margin: 16px 0;">
      <p style="margin: 0 0 6px; font-weight: 600;">Check-in Guidelines:</p>
      <ul style="margin: 0; padding-left: 18px;">
        <li>Arrive 15 minutes early to complete check-in at reception.</li>
        <li>Have reference number <strong>#${safeNumber}</strong> ready.</li>
        <li>Carry all recent prescriptions and medical reports.</li>
      </ul>
    </div>

    <p style="margin: 20px 0 0;">Best regards,<br><strong>${safeHospital}</strong></p>
  `;

  const html = baseLayout({
    title: subject,
    previewText: `Reminder: Appointment tomorrow at ${safeTime} with Dr. ${safeDoctor}.`,
    bodyContent,
  });

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// 9. Appointment Completed & Care Follow-up
// ---------------------------------------------------------------------------
function appointmentCompletedTemplate({
  patientName,
  appointmentNumber,
  hospitalName,
  doctorName,
  appointmentDate,
  followUpUrl,
}) {
  const safePatient = escapeHtml(patientName || "Patient");
  const safeNumber = escapeHtml(appointmentNumber);
  const safeHospital = escapeHtml(hospitalName || "Hospital");
  const safeDoctor = escapeHtml(doctorName || "Doctor");
  const safeDate = escapeHtml(appointmentDate);
  const safeFollowUpUrl = escapeHtml(followUpUrl || "http://localhost:5173");

  const subject = `Consultation Summary — #${safeNumber} at ${safeHospital}`;
  const text = `Dear ${safePatient},

Thank you for visiting ${safeHospital} for your consultation with Dr. ${safeDoctor} on ${safeDate}.

Your appointment #${safeNumber} is marked as completed.

General Care Guidance:
- Review any prescribed medication and adhere strictly to dosage guidelines.
- Your digital medical records and notes are accessible in your patient portal.
- If your physician recommended a follow-up consultation, you can schedule it here: ${safeFollowUpUrl}

We wish you a prompt and smooth recovery.

Best regards,
${safeHospital}`;

  const bodyContent = `
    <h2 style="margin: 0 0 16px; font-size: 18px; color: #0f172a; font-weight: 600;">
      Consultation Completed
    </h2>
    <p style="margin: 0 0 12px;">Dear <strong>${safePatient}</strong>,</p>
    <p style="margin: 0 0 16px;">
      Thank you for choosing <strong>${safeHospital}</strong>. Your consultation with <strong>Dr. ${safeDoctor}</strong> on ${safeDate} (Reference <strong>#${safeNumber}</strong>) has been completed.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 20px 0; font-size: 13px;">
      <p style="margin: 0 0 8px; font-weight: 600; color: #0f172a;">General Aftercare &amp; Follow-up Advice:</p>
      <ul style="margin: 0; padding-left: 18px; color: #475569; line-height: 1.6;">
        <li>Follow all dosage and medication schedules prescribed by your physician.</li>
        <li>Access your diagnostic reports and consultation notes through your patient portal.</li>
        <li>If your symptoms change or worsen, do not hesitate to contact our care coordination desk.</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${safeFollowUpUrl}" style="background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 10px 24px; font-size: 13px; font-weight: 600; border-radius: 6px; display: inline-block;">
        View Patient Portal
      </a>
    </div>

    <p style="margin: 20px 0 0;">Wishing you good health,<br><strong>${safeHospital} Care Team</strong></p>
  `;

  const html = baseLayout({
    title: subject,
    previewText: `Consultation #${safeNumber} completed. View your aftercare summary.`,
    bodyContent,
  });

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// 10. Follow-up Scheduled
// ---------------------------------------------------------------------------
function followUpScheduledTemplate({
  patientName,
  appointmentNumber,
  previousAppointmentNumber,
  hospitalName,
  doctorName,
  appointmentDate,
  appointmentTime,
  viewUrl,
}) {
  const safePatient = escapeHtml(patientName || "Patient");
  const safeNumber = escapeHtml(appointmentNumber);
  const safePrevNumber = escapeHtml(previousAppointmentNumber || "");
  const safeHospital = escapeHtml(hospitalName || "Hospital");
  const safeDoctor = escapeHtml(doctorName || "Assigned Doctor");
  const safeDate = escapeHtml(appointmentDate);
  const safeTime = escapeHtml(appointmentTime);
  const safeUrl = escapeHtml(viewUrl || "http://localhost:5173");

  const subject = `Follow-up Appointment Confirmed — #${safeNumber}`;
  const text = `Dear ${safePatient},

Your follow-up appointment with Dr. ${safeDoctor} at ${safeHospital} has been booked.

New Appointment Reference: #${safeNumber}
${safePrevNumber ? `Linked to Previous Visit: #${safePrevNumber}\n` : ""}Date: ${safeDate}
Time: ${safeTime}

View Appointment: ${safeUrl}

Best regards,
${safeHospital}`;

  const bodyContent = `
    <h2 style="margin: 0 0 16px; font-size: 18px; color: #0f172a; font-weight: 600;">
      Follow-up Consultation Confirmed
    </h2>
    <p style="margin: 0 0 12px;">Dear <strong>${safePatient}</strong>,</p>
    <p style="margin: 0 0 16px;">
      Your follow-up appointment with <strong>Dr. ${safeDoctor}</strong> at <strong>${safeHospital}</strong> has been successfully scheduled.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0284c7; padding: 14px 16px; margin: 20px 0; border-radius: 4px; font-size: 13px;">
      <p style="margin: 0 0 6px;"><strong>Follow-up Reference:</strong> #${safeNumber}</p>
      ${safePrevNumber ? `<p style="margin: 0 0 6px; color: #64748b;">Previous Consultation: #${safePrevNumber}</p>` : ""}
      <p style="margin: 0 0 6px;"><strong>Scheduled Date:</strong> ${safeDate}</p>
      <p style="margin: 0;"><strong>Scheduled Time:</strong> ${safeTime}</p>
    </div>

    <p style="margin: 20px 0 0;">Best regards,<br><strong>${safeHospital}</strong></p>
  `;

  const html = baseLayout({
    title: subject,
    previewText: `Follow-up consultation confirmed on ${safeDate} at ${safeTime}.`,
    bodyContent,
  });

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// 11. Password Reset OTP
// ---------------------------------------------------------------------------
function passwordResetOtpTemplate({ email, otp, expiresMinutes = 10 }) {
  const safeOtp = escapeHtml(otp);
  const safeMinutes = escapeHtml(expiresMinutes);

  const subject = `Password Reset Verification Code`;
  const text = `You requested a password reset for your Hospital Management account.

Your 6-digit verification code is: ${otp}

This code will expire in ${expiresMinutes} minutes. If you did not make this request, your account remains secure and you can safely disregard this email.`;

  const bodyContent = `
    <h2 style="margin: 0 0 16px; font-size: 18px; color: #0f172a; font-weight: 600;">
      Password Reset Verification
    </h2>
    <p style="margin: 0 0 12px;">Hello,</p>
    <p style="margin: 0 0 16px;">
      We received a request to reset the password for your healthcare management account. Use the verification code below to complete your reset:
    </p>

    <div style="text-align: center; margin: 24px 0;">
      <div style="display: inline-block; background-color: #f1f5f9; border: 2px dashed #0284c7; padding: 14px 28px; border-radius: 8px;">
        <span style="font-family: monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #0f172a;">
          ${safeOtp}
        </span>
      </div>
      <p style="margin: 8px 0 0; font-size: 12px; color: #64748b;">Valid for ${safeMinutes} minutes</p>
    </div>

    <div style="background-color: #fffbeb; border: 1px solid #fef3c7; padding: 12px 16px; border-radius: 4px; font-size: 12px; color: #92400e; margin: 16px 0;">
      <strong>Security Notice:</strong> If you did not request a password reset, your account is still secure. Please do not share this code with anyone.
    </div>

    <p style="margin: 20px 0 0;">Best regards,<br><strong>HealthMesh Security Team</strong></p>
  `;

  const html = baseLayout({
    title: subject,
    previewText: `Your password reset code is ${otp}. Valid for ${expiresMinutes} minutes.`,
    bodyContent,
  });

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// 12. Registration OTP
// ---------------------------------------------------------------------------
function registrationOtpTemplate({ email, otp, expiresMinutes = 10 }) {
  const safeOtp = escapeHtml(otp);
  const safeMinutes = escapeHtml(expiresMinutes);

  const subject = `Account Verification Code`;
  const text = `Welcome to HealthMesh.

Your 6-digit registration verification code is: ${otp}

This code will expire in ${expiresMinutes} minutes.`;

  const bodyContent = `
    <h2 style="margin: 0 0 16px; font-size: 18px; color: #0f172a; font-weight: 600;">
      Verify Your Email Address
    </h2>
    <p style="margin: 0 0 12px;">Welcome to <strong>HealthMesh</strong>,</p>
    <p style="margin: 0 0 16px;">
      Thank you for registering. Please enter the verification code below to verify your email address and activate your patient account:
    </p>

    <div style="text-align: center; margin: 24px 0;">
      <div style="display: inline-block; background-color: #f1f5f9; border: 2px dashed #0284c7; padding: 14px 28px; border-radius: 8px;">
        <span style="font-family: monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #0f172a;">
          ${safeOtp}
        </span>
      </div>
      <p style="margin: 8px 0 0; font-size: 12px; color: #64748b;">Valid for ${safeMinutes} minutes</p>
    </div>

    <p style="margin: 20px 0 0;">Best regards,<br><strong>HealthMesh Care Team</strong></p>
  `;

  const html = baseLayout({
    title: subject,
    previewText: `Your verification code is ${otp}.`,
    bodyContent,
  });

  return { subject, text, html };
}

module.exports = {
  escapeHtml,
  baseLayout,
  accountPendingReviewTemplate,
  accountApprovedTemplate,
  accountCredentialsTemplate,
  bookingReceivedTemplate,
  bookingConfirmedTemplate,
  appointmentCancelledTemplate,
  appointmentRescheduledTemplate,
  appointmentReminderTemplate,
  appointmentCompletedTemplate,
  followUpScheduledTemplate,
  passwordResetOtpTemplate,
  registrationOtpTemplate,
};
