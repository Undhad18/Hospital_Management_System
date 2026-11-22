/**
 * Email Service (Module 7)
 * Production SMTP email transport with fallback to development mock adapter.
 * Never leaks passwords or SMTP credentials.
 */

const fs = require("fs");
const path = require("path");
let nodemailer;
try {
  nodemailer = require("nodemailer");
} catch (e) {
  nodemailer = null;
}

const { accountCredentialsTemplate } = require("./emailTemplates");

const DEV_EMAIL_FILE = path.join(__dirname, "../.dev-emails.json");

function readDevSentEmails() {
  try {
    if (fs.existsSync(DEV_EMAIL_FILE)) {
      const content = fs.readFileSync(DEV_EMAIL_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (e) { }
  return [];
}

function writeDevSentEmails(emails) {
  try {
    fs.writeFileSync(DEV_EMAIL_FILE, JSON.stringify(emails, null, 2), "utf-8");
  } catch (e) { }
}

function clearDevSentEmails() {
  try {
    if (fs.existsSync(DEV_EMAIL_FILE)) {
      fs.unlinkSync(DEV_EMAIL_FILE);
    }
  } catch (e) { }
}

/**
 * Creates SMTP transporter if configured
 */
function getSmtpTransporter() {
  if (!nodemailer) return null;

  const host = (process.env.SMTP_HOST || "").trim();
  const service = (process.env.SMTP_SERVICE || "").trim().toLowerCase();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");

  if (!user || !pass) {
    return null;
  }

  // Gmail direct service optimization (handles port, SSL/TLS, and Google auth automatically)
  if (service === "gmail" || host.includes("gmail.com")) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user,
        pass,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }

  // Generic SMTP transport
  if (host) {
    const port = Number(process.env.SMTP_PORT) || 587;
    const isSecure = port === 465;

    return nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === "production",
      },
    });
  }

  return null;
}

/**
 * Send an email notification
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content
 * @param {string} [options.html] - HTML content
 * @param {Array<Object>} [options.attachments] - Email attachments (e.g., PDF buffer)
 * @returns {Promise<{ success: boolean, mode: string, messageId: string }>}
 */
async function sendEmail({ to, subject, text, html, attachments }) {
  const normalizedTo = String(to || "").trim().toLowerCase();
  const fromAddress = process.env.EMAIL_FROM || "HealthMesh Hospital System <no-reply@hms.com>";
  const isDev = process.env.NODE_ENV !== "production";

  // Validate recipient format
  if (!normalizedTo || !normalizedTo.includes("@")) {
    const error = new Error("Invalid recipient email address");
    error.code = "INVALID_EMAIL";
    throw error;
  }

  const transporter = getSmtpTransporter();

  if (transporter && process.env.EMAIL_PROVIDER !== "dev_mock") {
    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        to: normalizedTo,
        subject,
        text,
        html: html || undefined,
        attachments: attachments || undefined,
      });

      console.log(`[SMTP] Successfully sent email to ${normalizedTo} (ID: ${info.messageId})`);
      return {
        success: true,
        mode: "smtp",
        messageId: info.messageId,
      };
    } catch (smtpErr) {
      console.error(`[SMTP Error] Delivery failed to ${normalizedTo}:`, smtpErr.message);
      const deliveryErr = new Error(`Email provider delivery failure: ${smtpErr.message}`);
      deliveryErr.originalError = smtpErr;
      throw deliveryErr;
    }
  }

  // Development Mock Adapter:
  const messageId = `mock-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const emailRecord = {
    to: normalizedTo,
    subject,
    text,
    html: html || null,
    attachments: attachments
      ? attachments.map((att) => ({
          filename: att.filename,
          contentType: att.contentType || "application/pdf",
          size: att.content ? (Buffer.isBuffer(att.content) ? att.content.length : String(att.content).length) : 0,
          hasBuffer: Boolean(att.content),
        }))
      : [],
    messageId,
    sentAt: new Date().toISOString(),
  };

  const list = readDevSentEmails();
  list.push(emailRecord);
  if (list.length > 100) {
    list.shift();
  }
  writeDevSentEmails(list);

  if (isDev) {
    console.log(`\n================== [DEV EMAIL ADAPTER] ==================`);
    console.log(`To: ${normalizedTo}`);
    console.log(`Subject: ${subject}`);
    console.log(`MessageId: ${messageId}`);
    if (attachments && attachments.length > 0) {
      console.log(`Attachments: ${attachments.map(a => a.filename).join(", ")}`);
    }
    console.log(`Content (Excerpt):\n${text ? text.substring(0, 300) : "No plain text"}`);
    console.log(`=========================================================\n`);
  }

  return {
    success: true,
    mode: "dev_mock",
    messageId,
  };
}

/**
 * Helper strictly for development / automated testing
 */
function getDevSentEmails(email) {
  if (process.env.NODE_ENV === "production") return [];
  const list = readDevSentEmails();
  if (!email) return [...list];
  return list.filter((e) => e.to.toLowerCase() === email.toLowerCase());
}

/**
 * Dispatch onboarding credentials email (Lesson 4.9 & 7.1)
 */
async function sendCredentialEmail({
  to,
  fullName,
  role,
  temporaryPassword,
  loginUrl,
  hospitalName,
}) {
  const { subject, text, html } = accountCredentialsTemplate({
    fullName,
    role,
    temporaryPassword,
    loginUrl,
    hospitalName,
  });

  return sendEmail({ to, subject, text, html });
}

/**
 * Dispatch consultation payment receipt email (Module 16 - Lesson 16.8)
 */
async function sendConsultationPaymentReceiptEmail({
  to,
  patientName,
  hospitalName,
  doctorName,
  appointmentNumber,
  billNumber,
  receiptNumber,
  amountPaid,
  balanceDue,
  paymentMethod,
  billStatus,
}) {
  const emailHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 550px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <div style="border-bottom: 2px solid #0284c7; padding-bottom: 10px; margin-bottom: 15px;">
        <h2 style="color: #0f172a; margin: 0;">Physician Consultation Payment Receipt</h2>
        <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Receipt #: <strong>${receiptNumber}</strong></p>
      </div>
      <p style="color: #334155; font-size: 14px;">Dear <strong>${patientName || "Patient"}</strong>,</p>
      <p style="color: #334155; font-size: 14px;">Your consultation payment has been recorded and verified.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b;">Hospital:</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${hospitalName || "HealthMesh Hospital"}</td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b;">Appointment Ref:</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${appointmentNumber}</td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b;">Consulting Doctor:</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">Dr. ${doctorName}</td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b;">Invoice #:</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${billNumber}</td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b;">Payment Method:</td><td style="padding: 8px 0; font-weight: 600; text-align: right; text-transform: uppercase;">${paymentMethod}</td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b;">Amount Paid:</td><td style="padding: 8px 0; font-weight: bold; color: #0284c7; text-align: right;">₹${Number(amountPaid).toFixed(2)}</td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b;">Balance Due:</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">₹${Number(balanceDue).toFixed(2)}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;">Settlement Status:</td><td style="padding: 8px 0; font-weight: bold; color: ${billStatus === 'paid' ? '#16a34a' : '#ea580c'}; text-align: right; text-transform: uppercase;">${billStatus}</td></tr>
      </table>
      <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 25px;">Statutory Healthcare Exemption: Clinical consultation services are exempt from GST under Indian Tax Laws.</p>
    </div>
  `;

  return sendEmail({
    to,
    subject: `Payment Receipt: ${receiptNumber} - ${hospitalName}`,
    text: `Your payment of ₹${Number(amountPaid).toFixed(2)} for Appointment ${appointmentNumber} has been recorded at ${hospitalName}. Invoice: ${billNumber}. Receipt: ${receiptNumber}.`,
    html: emailHtml,
  });
}

module.exports = {
  sendEmail,
  sendCredentialEmail,
  sendConsultationPaymentReceiptEmail,
  getDevSentEmails,
  clearDevSentEmails,
};
