/**
 * Real SMTP Delivery Test Script
 * Tests live email and PDF receipt delivery to a real inbox.
 *
 * Usage:
 *   node backend/scripts/test_email.js [recipient_email]
 *
 * Example:
 *   node backend/scripts/test_email.js undhadharshil18@gmail.com
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const nodemailer = require("nodemailer");
const { generateConsultationReceiptPdf } = require("../services/receiptPdfService");

async function main() {
  console.log("================================================================================");
  console.log("             HEALTHMESH — LIVE EMAIL & RECEIPT DELIVERY TEST                    ");
  console.log("================================================================================\n");

  const targetEmail = process.argv[2] || process.env.SMTP_USER || "undhadharshil18@gmail.com";
  const user = (process.env.SMTP_USER || "").trim();
  const rawPass = (process.env.SMTP_PASS || "").trim();
  const pass = rawPass.replace(/\s+/g, "");
  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const service = (process.env.SMTP_SERVICE || "gmail").trim();

  console.log(`[Configuration Status]`);
  console.log(`- Recipient Target : ${targetEmail}`);
  console.log(`- SMTP Host        : ${host}`);
  console.log(`- SMTP User        : ${user || "(NOT CONFIGURED)"}`);
  console.log(`- SMTP Pass        : ${pass ? "******** (Configured, " + pass.length + " chars)" : "(EMPTY - App Password Needed)"}`);
  console.log(`- Email Provider   : ${process.env.EMAIL_PROVIDER || "smtp"}\n`);

  if (!user || !pass) {
    console.log("--------------------------------------------------------------------------------");
    console.log("⚠️  ACTION REQUIRED: GMAIL APP PASSWORD IS NOT YET ENTERED IN backend/.env");
    console.log("--------------------------------------------------------------------------------");
    console.log("Why this is required:");
    console.log("  Gmail requires an 'App Password' to allow external applications like");
    console.log("  Hospital Management System to send real emails to your inbox.\n");
    console.log("Follow these 3 quick steps to activate live delivery:");
    console.log("  1. Open your Google Account Security page:");
    console.log("     👉 https://myaccount.google.com/security");
    console.log("     (Make sure 2-Step Verification is turned ON)");
    console.log("  2. Open Google App Passwords:");
    console.log("     👉 https://myaccount.google.com/apppasswords");
    console.log("     Enter 'Hospital System' as App name and click 'Create'.");
    console.log("     Google will show a 16-character code (e.g. 'abcd efgh ijkl mnop').");
    console.log("  3. Open file: backend/.env");
    console.log("     Set: SMTP_PASS=your16charcode");
    console.log("     Save the file and run this script again:");
    console.log("     👉 node backend/scripts/test_email.js " + targetEmail + "\n");
    console.log("--------------------------------------------------------------------------------");
    return;
  }

  console.log(`Connecting to SMTP server (${service === "gmail" ? "Gmail Service" : host})...`);

  const transportConfig = service === "gmail" || host.includes("gmail.com")
    ? {
        service: "gmail",
        auth: { user, pass },
      }
    : {
        host,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user, pass },
      };

  const transporter = nodemailer.createTransport(transportConfig);

  try {
    console.log("Verifying SMTP credentials and connection...");
    await transporter.verify();
    console.log("✅ SMTP connection verified successfully!\n");
  } catch (verifyErr) {
    console.error("❌ SMTP Verification Failed:", verifyErr.message);
    if (verifyErr.message.includes("BadCredentials") || verifyErr.message.includes("Username and Password not accepted")) {
      console.log("\n💡 Tip: For Gmail, ensure you are using an App Password from https://myaccount.google.com/apppasswords");
      console.log("    Do not use your regular Gmail login password.\n");
    }
    process.exit(1);
  }

  console.log("Generating sample Official Consultation Receipt PDF...");
  const receiptNumber = `CRCP-TEST-${Date.now().toString().slice(-4)}`;
  const pdfBuffer = await generateConsultationReceiptPdf({
    hospital_name: "CareCommand Apex Hospital",
    hospital_phone: "+91 22 2490 8000",
    hospital_email: "billing@carecommand.org",
    hospital_address: "702 Medical Enclave, Worli, Mumbai, MH - 400018",
    upi_id: "apexcare@icici",
    patient_name: "Harshil Undhad",
    patient_email: targetEmail,
    patient_phone: "+91 98765 43210",
    doctor_name: "Dr. Sarah Jenkins",
    doctor_specialization: "Cardiology",
    department_name: "Cardiology & Vascular Sciences",
    appointment_number: "APT-M15-LIVE",
    appointment_date: new Date().toISOString().split("T")[0],
    appointment_time: "10:30 AM",
    bill_number: "INV-TEST-001",
    receipt_number: receiptNumber,
    payment_date: new Date(),
    consultation_fee: 500.00,
    subtotal: 500.00,
    discount_amount: 0.00,
    tax_amount: 0.00,
    total_amount: 500.00,
    paid_amount: 500.00,
    balance_due: 0.00,
    payments: [
      {
        receipt_number: receiptNumber,
        amount: 500.00,
        payment_method: "upi",
        transaction_reference: "UPI-TEST-8492049",
        created_at: new Date(),
        collector_name: "Harshil U (Billing Cashier)",
      },
    ],
  });

  console.log(`✅ Receipt PDF generated successfully (${pdfBuffer.length} bytes).\n`);

  console.log(`Dispatching live email with attached PDF to: ${targetEmail}...`);
  const fromAddress = process.env.EMAIL_FROM || `HealthMesh Hospital System <${user}>`;

  const mailOptions = {
    from: fromAddress,
    to: targetEmail,
    subject: `Official Payment Receipt – ${receiptNumber}`,
    text: `Dear Harshil Undhad,

Please find attached your official payment receipt for your consultation.

Official Receipt Summary:
- Patient Name: Harshil Undhad
- Receipt Number: ${receiptNumber}
- Appointment Reference: APT-M15-LIVE
- Hospital Name: CareCommand Apex Hospital
- Total Amount: Rs. 500.00
- Paid Amount: Rs. 500.00
- Balance Due: Rs. 0.00

The official receipt PDF is attached to this email.

Sincerely,
CareCommand Apex Hospital`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <div style="border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 18px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 18px;">Official Payment Receipt</h2>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Receipt #: <strong>${receiptNumber}</strong></p>
        </div>
        <p style="color: #334155; font-size: 14px;">Dear <strong>Harshil Undhad</strong>,</p>
        <p style="color: #334155; font-size: 14px;">Thank you for your visit. Your official consultation payment receipt has been issued and is attached as a PDF to this email.</p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin: 18px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 7px 0; color: #64748b;">Hospital:</td><td style="padding: 7px 0; font-weight: 600; text-align: right; color: #0f172a;">CareCommand Apex Hospital</td></tr>
            <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 7px 0; color: #64748b;">Receipt Number:</td><td style="padding: 7px 0; font-weight: bold; text-align: right; color: #0284c7;">${receiptNumber}</td></tr>
            <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 7px 0; color: #64748b;">Paid Amount:</td><td style="padding: 7px 0; font-weight: bold; text-align: right; color: #16a34a;">₹500.00</td></tr>
            <tr><td style="padding: 7px 0; color: #64748b;">Balance Due:</td><td style="padding: 7px 0; font-weight: bold; text-align: right; color: #0f172a;">₹0.00</td></tr>
          </table>
        </div>

        <p style="color: #334155; font-size: 13px;">The official receipt PDF is attached to this email. You can download and keep it for your tax and medical records.</p>
      </div>
    `,
    attachments: [
      {
        filename: `Official_Receipt_${receiptNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  };

  const info = await transporter.sendMail(mailOptions);
  console.log("================================================================================");
  console.log("🎉 SUCCESS! LIVE EMAIL DELIVERED OVER SMTP");
  console.log("================================================================================");
  console.log(`- Recipient : ${targetEmail}`);
  console.log(`- MessageId : ${info.messageId}`);
  console.log(`- Response  : ${info.response}`);
  console.log(`\nPlease check your inbox at: ${targetEmail}`);
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("❌ Fatal Error:", err);
  process.exit(1);
});

