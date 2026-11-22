require("dotenv").config();
const jwt = require("jsonwebtoken");
const pool = require("../db");

async function main() {
  console.log("=== Running Step 3 Integration Tests (Lesson 3.4 — Geographic Masters) ===");

  const superAdminToken = jwt.sign(
    { sub: 1, role: "super_admin", tokenVersion: 1 },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const doctorToken = jwt.sign(
    { sub: 39, role: "doctor", hospitalId: 1, tokenVersion: 1 },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const baseUrl = `http://localhost:${process.env.PORT || 5000}`;

  async function api(path, options = {}, token = null) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  // 1. List Countries
  const listCountriesRes = await api("/api/locations/countries", { method: "GET" }, superAdminToken);
  console.log("1. List Countries:", listCountriesRes.status === 200 && listCountriesRes.data.success ? "PASS" : "FAIL", `(found ${listCountriesRes.data.count})`);

  // 2. Create Country (Super Admin)
  const testCountryCode = `TC_${Date.now()}`.slice(0, 10);
  const createCountryRes = await api("/api/locations/countries", {
    method: "POST",
    body: JSON.stringify({
      name: `Test Country ${Date.now()}`,
      code: testCountryCode,
      phone_code: "+999",
      status: "active",
    }),
  }, superAdminToken);
  console.log("2. Create Country:", createCountryRes.status === 201 && createCountryRes.data.success ? "PASS" : "FAIL");
  const countryId = createCountryRes.data?.data?.id;

  // 3. Unauthorized Doctor attempting to create country -> must be 403
  const unauthRes = await api("/api/locations/countries", {
    method: "POST",
    body: JSON.stringify({ name: "Hacker Country", code: "HC" }),
  }, doctorToken);
  console.log("3. Unauthorized master modification rejected (403):", unauthRes.status === 403 ? "PASS" : "FAIL");

  // 4. Create State with valid parent country
  const createStateRes = await api("/api/locations/states", {
    method: "POST",
    body: JSON.stringify({
      country_id: countryId,
      name: "Test Province",
      code: "TP",
      status: "active",
    }),
  }, superAdminToken);
  console.log("4. Create State under Country:", createStateRes.status === 201 && createStateRes.data.success ? "PASS" : "FAIL");
  const stateId = createStateRes.data?.data?.id;

  // 5. Attempt creating State under non-existent country -> must be 400
  const badParentStateRes = await api("/api/locations/states", {
    method: "POST",
    body: JSON.stringify({
      country_id: 999999,
      name: "Orphan State",
    }),
  }, superAdminToken);
  console.log("5. Non-existent parent country rejected (400):", badParentStateRes.status === 400 ? "PASS" : "FAIL");

  // 6. Duplicate State in same country rejected -> must be 409
  const dupStateRes = await api("/api/locations/states", {
    method: "POST",
    body: JSON.stringify({
      country_id: countryId,
      name: "Test Province",
    }),
  }, superAdminToken);
  console.log("6. Duplicate state name in same country rejected (409):", dupStateRes.status === 409 ? "PASS" : "FAIL");

  // 7. Create City with valid parent state
  const createCityRes = await api("/api/locations/cities", {
    method: "POST",
    body: JSON.stringify({
      state_id: stateId,
      name: "Metro Capital",
      status: "active",
    }),
  }, superAdminToken);
  console.log("7. Create City under State:", createCityRes.status === 201 && createCityRes.data.success ? "PASS" : "FAIL");
  const cityId = createCityRes.data?.data?.id;

  // 8. Attempt creating City under non-existent state -> must be 400
  const badParentCityRes = await api("/api/locations/cities", {
    method: "POST",
    body: JSON.stringify({
      state_id: 999999,
      name: "Orphan City",
    }),
  }, superAdminToken);
  console.log("8. Non-existent parent state rejected (400):", badParentCityRes.status === 400 ? "PASS" : "FAIL");

  // 9. Duplicate City in same state rejected -> must be 409
  const dupCityRes = await api("/api/locations/cities", {
    method: "POST",
    body: JSON.stringify({
      state_id: stateId,
      name: "Metro Capital",
    }),
  }, superAdminToken);
  console.log("9. Duplicate city in same state rejected (409):", dupCityRes.status === 409 ? "PASS" : "FAIL");

  // 10. Update City status / details
  const updateCityRes = await api(`/api/locations/cities/${cityId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "Metro Capital Central", status: "active" }),
  }, superAdminToken);
  console.log("10. Update City record:", updateCityRes.status === 200 && updateCityRes.data.success ? "PASS" : "FAIL");

  // 11. Cascaded fetch test: list cities by state
  const citiesByStateRes = await api(`/api/locations/cities?state_id=${stateId}`, { method: "GET" }, superAdminToken);
  console.log("11. Filter cities by state_id:", citiesByStateRes.data?.data?.[0]?.name === "Metro Capital Central" ? "PASS" : "FAIL");

  // Clean up test records
  if (cityId) await pool.execute("DELETE FROM cities WHERE id = ?", [cityId]);
  if (stateId) await pool.execute("DELETE FROM states WHERE id = ?", [stateId]);
  if (countryId) await pool.execute("DELETE FROM countries WHERE id = ?", [countryId]);
  console.log("Cleaned up test geographic records.");

  console.log("=== All Step 3 Integration Tests Finished ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
