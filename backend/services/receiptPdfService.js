/**
 * Receipt PDF Generation Service (Module 15)
 * Generates official, pixel-perfect, readable PDF receipts for consultation billing.
 * Implemented using PDFKit without external system dependencies.
 */

const PDFDocument = require("pdfkit");

/**
 * Format currency amount cleanly
 * @param {number|string} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return `Rs. ${num.toFixed(2)}`;
}

/**
 * Format date cleanly (DD/MM/YYYY)
 * @param {string|Date} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return new Date().toLocaleDateString("en-GB");
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch (e) {
    return String(dateStr);
  }
}

/**
 * Generate Official Consultation Receipt PDF Buffer
 * @param {Object} data - Receipt and Bill details
 * @returns {Promise<Buffer>} Resolves to PDF binary buffer
 */
function generateConsultationReceiptPdf(data = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 40,
        info: {
          Title: `Official Receipt - ${data.receipt_number || data.bill_number || "Payment"}`,
          Author: data.hospital_name || "Hospital Management System",
          Subject: "Official Patient Consultation Payment Receipt",
          Keywords: "Receipt, Consultation, Payment, Healthcare, Invoice",
          CreationDate: new Date(),
        },
      });

      const buffers = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      const pageWidth = doc.page.width; // 595.28 for A4
      const margin = 40;
      const contentWidth = pageWidth - margin * 2; // ~515

      // -----------------------------------------------------------------------
      // 1. TOP BRANDING & HEADER BAR
      // -----------------------------------------------------------------------
      // Accent bar at top
      doc.rect(margin, 35, contentWidth, 5).fill("#0284c7");

      // Hospital Header
      doc.fontSize(16).fillColor("#0f172a").font("Helvetica-Bold")
         .text(data.hospital_name || "HealthMesh Hospital Network", margin, 50, { width: 330 });

      doc.fontSize(8.5).fillColor("#64748b").font("Helvetica")
         .text(data.hospital_address || "Multi-Specialty Clinical & Outpatient Centre", margin, 72, { width: 330 })
         .text(`Phone: ${data.hospital_phone || "+91-11-2000-0000"} | Email: ${data.hospital_email || "billing@healthmesh.com"}`, margin, 85, { width: 330 });

      // Receipt Title Box (Right aligned)
      doc.rect(pageWidth - margin - 170, 48, 170, 52).fillAndStroke("#f0f9ff", "#bae6fd");
      doc.fontSize(11).fillColor("#0369a1").font("Helvetica-Bold")
         .text("OFFICIAL RECEIPT", pageWidth - margin - 165, 55, { width: 160, align: "center" });

      const activeReceipt = data.receipt_number || (data.payments && data.payments.length > 0 ? data.payments[0].receipt_number : "CRCP-RECORDED");
      doc.fontSize(10).fillColor("#0f172a").font("Helvetica-Bold")
         .text(activeReceipt, pageWidth - margin - 165, 70, { width: 160, align: "center" });

      const paymentDate = data.payment_date || (data.payments && data.payments.length > 0 ? data.payments[0].created_at : data.created_at);
      doc.fontSize(8).fillColor("#64748b").font("Helvetica")
         .text(`Date: ${formatDate(paymentDate)}`, pageWidth - margin - 165, 85, { width: 160, align: "center" });

      // Horizontal separator
      doc.moveTo(margin, 110).lineTo(pageWidth - margin, 110).strokeColor("#e2e8f0").stroke();

      // -----------------------------------------------------------------------
      // 2. PATIENT & CLINICAL CONSULTATION DETAILS (TWO BOXES)
      // -----------------------------------------------------------------------
      const boxY = 120;
      const boxHeight = 90;
      const colWidth = (contentWidth - 15) / 2;

      // Patient Details Box (Left)
      doc.roundedRect(margin, boxY, colWidth, boxHeight, 4).fillAndStroke("#f8fafc", "#e2e8f0");
      doc.fontSize(9).fillColor("#0369a1").font("Helvetica-Bold")
         .text("PATIENT & APPOINTMENT DETAILS", margin + 10, boxY + 8);

      doc.fontSize(8.5).font("Helvetica");
      let lineY = boxY + 24;

      doc.fillColor("#64748b").text("Patient Name:", margin + 10, lineY);
      doc.fillColor("#0f172a").font("Helvetica-Bold").text(data.patient_name || "N/A", margin + 85, lineY, { width: colWidth - 95 });

      lineY += 15;
      doc.font("Helvetica").fillColor("#64748b").text("Patient Contact:", margin + 10, lineY);
      doc.fillColor("#334155").text(`${data.patient_email || ""} ${data.patient_phone ? `(${data.patient_phone})` : ""}`.trim() || "N/A", margin + 85, lineY, { width: colWidth - 95 });

      lineY += 15;
      doc.fillColor("#64748b").text("Consulting Dr:", margin + 10, lineY);
      doc.fillColor("#0f172a").font("Helvetica-Bold").text(`Dr. ${data.doctor_name || "Assigned Physician"}`, margin + 85, lineY, { width: colWidth - 95 });

      lineY += 15;
      doc.font("Helvetica").fillColor("#64748b").text("Department:", margin + 10, lineY);
      doc.fillColor("#334155").text(`${data.department_name || "General Medicine / OPD"}`, margin + 85, lineY, { width: colWidth - 95 });

      // Billing & Payment Details Box (Right)
      const rightBoxX = margin + colWidth + 15;
      doc.roundedRect(rightBoxX, boxY, colWidth, boxHeight, 4).fillAndStroke("#f8fafc", "#e2e8f0");
      doc.fontSize(9).fillColor("#0369a1").font("Helvetica-Bold")
         .text("INVOICE & TRANSACTION METADATA", rightBoxX + 10, boxY + 8);

      lineY = boxY + 24;
      doc.fontSize(8.5).font("Helvetica");

      doc.fillColor("#64748b").text("Invoice Number:", rightBoxX + 10, lineY);
      doc.fillColor("#0f172a").font("Helvetica-Bold").text(data.bill_number || "N/A", rightBoxX + 90, lineY);

      lineY += 15;
      doc.font("Helvetica").fillColor("#64748b").text("Appointment Ref:", rightBoxX + 10, lineY);
      doc.fillColor("#0284c7").font("Helvetica-Bold").text(data.appointment_number || "N/A", rightBoxX + 90, lineY);

      lineY += 15;
      doc.font("Helvetica").fillColor("#64748b").text("Payment Method:", rightBoxX + 10, lineY);
      const activeMethod = (data.payment_method || (data.payments && data.payments[0] ? data.payments[0].payment_method : "CASH")).toUpperCase();
      doc.fillColor("#0f172a").font("Helvetica-Bold").text(activeMethod, rightBoxX + 90, lineY);

      lineY += 15;
      doc.font("Helvetica").fillColor("#64748b").text("Bill Status:", rightBoxX + 10, lineY);
      const billStatus = (data.status || "paid").toUpperCase();
      const statusColor = billStatus === "PAID" ? "#047857" : "#b45309";
      doc.fillColor(statusColor).font("Helvetica-Bold").text(billStatus, rightBoxX + 90, lineY);

      // -----------------------------------------------------------------------
      // 3. ITEMIZED BREAKDOWN TABLE
      // -----------------------------------------------------------------------
      const tableY = boxY + boxHeight + 15;
      doc.rect(margin, tableY, contentWidth, 22).fill("#0284c7");

      doc.fontSize(8.5).fillColor("#ffffff").font("Helvetica-Bold");
      doc.text("ITEM / SERVICE DESCRIPTION", margin + 10, tableY + 6);
      doc.text("CLINICAL SPECIALTY", margin + 220, tableY + 6);
      doc.text("FEE RATE", margin + 340, tableY + 6, { width: 70, align: "right" });
      doc.text("GST (0%)", margin + 415, tableY + 6, { width: 45, align: "right" });
      doc.text("TOTAL AMOUNT", margin + 450, tableY + 6, { width: 60, align: "right" });

      // Table Row
      const rowY = tableY + 22;
      doc.rect(margin, rowY, contentWidth, 26).fillAndStroke("#ffffff", "#e2e8f0");
      doc.fontSize(8.5).font("Helvetica").fillColor("#0f172a");
      doc.text("Physician Clinical Consultation Fee", margin + 10, rowY + 8);
      doc.fillColor("#64748b").text(data.department_name || "General Medicine", margin + 220, rowY + 8);
      doc.fillColor("#0f172a").text(formatCurrency(data.fee_amount || data.total_amount), margin + 340, rowY + 8, { width: 70, align: "right" });
      doc.fillColor("#64748b").text("Rs. 0.00", margin + 415, rowY + 8, { width: 45, align: "right" });
      doc.font("Helvetica-Bold").fillColor("#0284c7").text(formatCurrency(data.total_amount || data.fee_amount), margin + 450, rowY + 8, { width: 60, align: "right" });

      // -----------------------------------------------------------------------
      // 4. FINANCIAL SUMMARY BREAKDOWN BOX
      // -----------------------------------------------------------------------
      const summaryY = rowY + 35;
      const summaryWidth = 240;
      const summaryX = pageWidth - margin - summaryWidth;

      doc.rect(summaryX, summaryY, summaryWidth, 105).fillAndStroke("#f8fafc", "#e2e8f0");

      let sLineY = summaryY + 8;
      const printSummaryLine = (label, value, isBold = false, color = "#0f172a") => {
        doc.fontSize(8.5).font(isBold ? "Helvetica-Bold" : "Helvetica").fillColor("#64748b");
        doc.text(label, summaryX + 10, sLineY);
        doc.fillColor(color).font(isBold ? "Helvetica-Bold" : "Helvetica");
        doc.text(value, summaryX + 110, sLineY, { width: summaryWidth - 120, align: "right" });
        sLineY += 16;
      };

      printSummaryLine("Consultation Fee Snapshot:", formatCurrency(data.fee_amount || data.total_amount));
      printSummaryLine("Statutory GST (0% Exempt):", "Rs. 0.00", false, "#64748b");
      printSummaryLine("Total Amount Due:", formatCurrency(data.total_amount), true, "#0284c7");
      printSummaryLine("Paid Amount Cleared:", formatCurrency(data.paid_amount), true, "#047857");

      // Balance Due Line (Highlighted)
      doc.rect(summaryX + 5, sLineY - 2, summaryWidth - 10, 22).fillAndStroke(Number(data.balance_due) > 0 ? "#fef3c7" : "#f0fdf4", Number(data.balance_due) > 0 ? "#fde68a" : "#bbf7d0");
      doc.fontSize(9.5).font("Helvetica-Bold").fillColor(Number(data.balance_due) > 0 ? "#b45309" : "#047857");
      doc.text("Balance Due:", summaryX + 12, sLineY + 4);
      doc.text(formatCurrency(data.balance_due || 0), summaryX + 110, sLineY + 4, { width: summaryWidth - 120, align: "right" });

      // -----------------------------------------------------------------------
      // 5. OFFICIAL RECEIPT HISTORY
      // -----------------------------------------------------------------------
      const historyY = summaryY + 118;
      doc.fontSize(9.5).fillColor("#0f172a").font("Helvetica-Bold")
         .text("OFFICIAL RECEIPT TRANSACTION HISTORY", margin, historyY);

      const histTableY = historyY + 14;
      doc.rect(margin, histTableY, contentWidth, 18).fill("#f1f5f9");
      doc.fontSize(8).fillColor("#475569").font("Helvetica-Bold");
      doc.text("RECEIPT NUMBER", margin + 10, histTableY + 5);
      doc.text("PAYMENT DATE", margin + 150, histTableY + 5);
      doc.text("PAYMENT METHOD", margin + 260, histTableY + 5);
      doc.text("TRANSACTION REFERENCE", margin + 360, histTableY + 5);
      doc.text("AMOUNT PAID", margin + 440, histTableY + 5, { width: 70, align: "right" });

      let hRowY = histTableY + 18;
      const paymentList = data.payments && data.payments.length > 0
        ? data.payments
        : [{
            receipt_number: activeReceipt,
            created_at: paymentDate,
            payment_method: activeMethod,
            transaction_reference: data.transaction_reference || "VERIFIED-CASH",
            amount: data.paid_amount || data.total_amount,
          }];

      paymentList.forEach((p, idx) => {
        const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        doc.rect(margin, hRowY, contentWidth, 18).fillAndStroke(bg, "#e2e8f0");
        doc.fontSize(8).font("Helvetica").fillColor("#0f172a");
        doc.text(p.receipt_number || activeReceipt, margin + 10, hRowY + 5);
        doc.fillColor("#64748b").text(formatDate(p.created_at), margin + 150, hRowY + 5);
        doc.fillColor("#0f172a").text((p.payment_method || "CASH").toUpperCase(), margin + 260, hRowY + 5);
        doc.fillColor("#64748b").text(p.transaction_reference || "DIRECT-DESK", margin + 360, hRowY + 5);
        doc.font("Helvetica-Bold").fillColor("#047857").text(formatCurrency(p.amount), margin + 440, hRowY + 5, { width: 70, align: "right" });
        hRowY += 18;
      });

      // -----------------------------------------------------------------------
      // 6. OFFICIAL FOOTER, STATUTORY CLAUSE & STAMP
      // -----------------------------------------------------------------------
      const footerY = 715;

      // Statutory Exemption Disclaimer
      doc.rect(margin, footerY, contentWidth, 34).fillAndStroke("#f8fafc", "#e2e8f0");
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#475569")
         .text("STATUTORY HEALTHCARE EXEMPTION UNDER INDIAN TAX LAWS (GST):", margin + 8, footerY + 6);
      doc.fontSize(7).font("Helvetica").fillColor("#64748b")
         .text("Healthcare and physician clinical consultation services rendered by clinical establishments are statutory-exempt from Goods and Services Tax (GST) pursuant to Central Tax (Rate) Notification No. 12/2017. Total GST Charged: Rs. 0.00.", margin + 8, footerY + 17, { width: contentWidth - 16 });

      // Verification seal / stamp
      doc.fontSize(8).font("Helvetica").fillColor("#94a3b8")
         .text(`This is a verified computer-generated official receipt issued by ${data.hospital_name || "HealthMesh Hospital"}.`, margin, footerY + 44)
         .text(`Issued On: ${new Date().toLocaleString("en-GB")} | HealthMesh HMS Secure Digital Core`, margin, footerY + 56);

      // Digital Signature Mark
      doc.rect(pageWidth - margin - 130, footerY + 40, 130, 24).strokeColor("#cbd5e1").stroke();
      doc.fontSize(7).font("Helvetica-Bold").fillColor("#0284c7")
         .text("DIGITALLY CERTIFIED", pageWidth - margin - 125, footerY + 45, { width: 120, align: "center" })
         .text("OFFICIAL RECEIPT", pageWidth - margin - 125, footerY + 54, { width: 120, align: "center" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateConsultationReceiptPdf,
};

