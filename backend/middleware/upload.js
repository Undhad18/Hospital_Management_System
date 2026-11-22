const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "..", "uploads", "hospitals");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "");
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e6);
    cb(null, `${cleanBase || "hospital"}-${uniqueSuffix}${ext}`);
  },
});

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/bmp",
];

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    const err = new Error(
      "Invalid image format. Allowed formats: JPEG, PNG, WebP, GIF, SVG."
    );
    err.status = 400;
    cb(err, false);
  }
};

const uploadHospitalMedia = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: fileFilter,
});

// --- Medical Records Secure Upload (PDF, PNG, JPEG, WebP) ---
const medicalUploadDir = path.join(__dirname, "..", "uploads", "medical_records");
if (!fs.existsSync(medicalUploadDir)) {
  fs.mkdirSync(medicalUploadDir, { recursive: true });
}

const medicalStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, medicalUploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "");
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e6);
    cb(null, `med-${cleanBase || "doc"}-${uniqueSuffix}${ext}`);
  },
});

const medicalMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const medicalFileFilter = (req, file, cb) => {
  if (medicalMimeTypes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    const err = new Error(
      "Invalid medical document format. Allowed formats: PDF, JPEG, PNG, WebP."
    );
    err.status = 400;
    cb(err, false);
  }
};

const uploadMedicalDocument = multer({
  storage: medicalStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: medicalFileFilter,
});

// --- Laboratory Reports Secure Upload (PDF, JPEG, PNG, WebP) ---
const labReportUploadDir = path.join(__dirname, "..", "uploads", "lab_reports");
if (!fs.existsSync(labReportUploadDir)) {
  fs.mkdirSync(labReportUploadDir, { recursive: true });
}

const labReportStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, labReportUploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "");
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e6);
    cb(null, `lab-rpt-${cleanBase || "doc"}-${uniqueSuffix}${ext}`);
  },
});

const labReportMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const labReportAllowedExts = [".pdf", ".jpeg", ".jpg", ".png", ".webp"];

const labReportFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (
    labReportMimeTypes.includes(file.mimetype.toLowerCase()) &&
    labReportAllowedExts.includes(ext)
  ) {
    cb(null, true);
  } else {
    const err = new Error(
      "Invalid laboratory report format. Allowed formats: PDF, JPEG, PNG, WebP."
    );
    err.status = 400;
    cb(err, false);
  }
};

const uploadLabReport = multer({
  storage: labReportStorage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max
  },
  fileFilter: labReportFileFilter,
});

module.exports = {
  uploadHospitalMedia,
  uploadMedicalDocument,
  uploadLabReport,
  labReportUploadDir,
};

