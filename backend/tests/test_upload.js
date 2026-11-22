require("dotenv").config();
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

async function testImageUpload() {
  console.log("=== Testing Image Upload Endpoint (Lesson 3.2) ===");
  const superAdminToken = jwt.sign(
    { sub: 1, role: "super_admin", tokenVersion: 1 },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const baseUrl = `http://localhost:${process.env.PORT || 5000}`;

  // Create a minimal 1x1 PNG dummy buffer for test
  const png1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );

  const boundary = "----WebKitFormBoundaryTest" + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="logo"; filename="test_logo.png"\r\nContent-Type: image/png\r\n\r\n`),
    png1x1,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch(`${baseUrl}/api/hospitals/1/images`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${superAdminToken}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: body,
  });

  const data = await res.json().catch(() => ({}));
  console.log("Upload status:", res.status, data);

  if (res.status === 200 && data.success && data.data?.logo_url) {
    console.log("Image upload test: PASS. Logo URL:", data.data.logo_url);
    // Verify static access
    const staticRes = await fetch(`${baseUrl}${data.data.logo_url}`);
    console.log("Static asset served status:", staticRes.status, staticRes.status === 200 ? "PASS" : "FAIL");
  } else {
    console.error("Image upload test: FAIL");
    process.exit(1);
  }

  process.exit(0);
}

testImageUpload().catch((err) => {
  console.error("Upload error:", err);
  process.exit(1);
});
