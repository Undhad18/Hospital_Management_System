const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

export function getMediaUrl(path) {
  if (!path) return "";
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("blob:")
  ) {
    return path;
  }
  const backendBase = (
    import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
  ).replace(/\/api\/?$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${backendBase}${cleanPath}`;
}

export async function loginUser(email, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Login failed");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result;
}

export async function forgotPassword(email) {
  const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to process forgot password");
  }
  return result;
}

export async function resetPassword({ email, otp, newPassword, confirmPassword }) {
  const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      otp,
      new_password: newPassword,
      confirm_password: confirmPassword,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to reset password");
  }
  return result;
}

export async function changePassword(token, { currentPassword, newPassword, confirmPassword }) {
  const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to change password");
  }
  return result;
}

export async function getHospitals(token) {
  const response = await fetch(`${API_BASE_URL}/hospitals`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load hospitals");
  }
  return result.data;
}

export async function createHospital(token, data) {
  const response = await fetch(`${API_BASE_URL}/hospitals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to create hospital");
  }
  return result.data;
}

export async function getHospitalDetail(token, id) {
  const response = await fetch(`${API_BASE_URL}/hospitals/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load hospital details");
  }
  return result.data;
}

export async function updateHospital(token, id, data) {
  const response = await fetch(`${API_BASE_URL}/hospitals/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to update hospital");
  }
  return result.data;
}

export async function updateHospitalProfile(token, id, data) {
  const response = await fetch(`${API_BASE_URL}/hospitals/${id}/profile`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to update hospital profile");
  }
  return result.data;
}

export async function updateHospitalStatus(token, id, status, reason = "") {
  const response = await fetch(`${API_BASE_URL}/hospitals/${id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status, reason }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to update hospital status");
  }
  return result.data;
}

export async function getHospitalQr(token, id) {
  const response = await fetch(`${API_BASE_URL}/hospitals/${id}/qr`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to retrieve hospital QR code");
  }
  return result.data;
}

export async function uploadHospitalMedia(token, id, formData) {
  const response = await fetch(`${API_BASE_URL}/hospitals/${id}/images`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to upload images");
  }
  return result.data;
}

export async function getUsers(token) {
  const response = await fetch(`${API_BASE_URL}/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load users");
  }
  return result.data;
}

export async function updateUserStatus(token, userId, status) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to update account status");
  }
  return result.data;
}

export async function getPendingApprovals(token) {
  const response = await fetch(`${API_BASE_URL}/users/pending-approvals`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load pending approvals");
  }
  return result.data;
}

export async function approveUser(token, userId) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/approve`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to approve account");
  }
  return result.data;
}

// Geographic Master API helpers
export async function getCountries(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/locations/countries${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load countries");
  return result.data;
}

export async function createCountry(token, data) {
  const response = await fetch(`${API_BASE_URL}/locations/countries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to create country");
  return result.data;
}

export async function updateCountry(token, id, data) {
  const response = await fetch(`${API_BASE_URL}/locations/countries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to update country");
  return result.data;
}

export async function getStates(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/locations/states${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load states");
  return result.data;
}

export async function createState(token, data) {
  const response = await fetch(`${API_BASE_URL}/locations/states`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to create state");
  return result.data;
}

export async function updateState(token, id, data) {
  const response = await fetch(`${API_BASE_URL}/locations/states/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to update state");
  return result.data;
}

export async function getCities(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/locations/cities${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load cities");
  return result.data;
}

export async function createCity(token, data) {
  const response = await fetch(`${API_BASE_URL}/locations/cities`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to create city");
  return result.data;
}

export async function updateCity(token, id, data) {
  const response = await fetch(`${API_BASE_URL}/locations/cities/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to update city");
  return result.data;
}

// Department Master API helpers
export async function getDepartments(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/departments${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load departments");
  return result.data;
}

export async function createDepartment(token, data) {
  const response = await fetch(`${API_BASE_URL}/departments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to create department");
  return result.data;
}

export async function updateDepartment(token, id, data) {
  const response = await fetch(`${API_BASE_URL}/departments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to update department");
  return result.data;
}

// Master Department Global Catalog API helpers
export async function getMasterDepartments(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/master-departments${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load master departments");
  return result.data;
}

export async function createMasterDepartment(token, data) {
  const response = await fetch(`${API_BASE_URL}/master-departments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to create master department");
  return result.data;
}

export async function updateMasterDepartment(token, id, data) {
  const response = await fetch(`${API_BASE_URL}/master-departments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to update master department");
  return result.data;
}

export async function assignMasterDepartment(token, data) {
  const response = await fetch(`${API_BASE_URL}/departments/assign-master`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to assign master department");
  return result.data;
}

// Designation Master API helpers
export async function getDesignations(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/designations${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load designations");
  return result.data;
}

export async function createDesignation(token, data) {
  const response = await fetch(`${API_BASE_URL}/designations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to create designation");
  return result.data;
}

export async function updateDesignation(token, id, data) {
  const response = await fetch(`${API_BASE_URL}/designations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to update designation");
  return result.data;
}

// Doctor & Clinical Profiles (Lessons 4.3 - 4.5)
export async function getDoctors(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/doctors${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load doctors");
  return result.data;
}

export async function getDoctorById(token, id) {
  const response = await fetch(`${API_BASE_URL}/doctors/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load doctor profile");
  return result.data;
}

export async function createDoctor(token, data) {
  const response = await fetch(`${API_BASE_URL}/doctors`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to create doctor account");
  return result.data;
}

export async function updateDoctor(token, id, data) {
  const response = await fetch(`${API_BASE_URL}/doctors/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to update doctor profile");
  return result.data;
}

// Staff & Clinical Support Profiles (Lessons 4.6 - 4.8)
export async function getStaff(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/staff${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load staff members");
  return result.data;
}

export async function getStaffById(token, id) {
  const response = await fetch(`${API_BASE_URL}/staff/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load staff details");
  return result.data;
}

export async function createStaff(token, data) {
  const response = await fetch(`${API_BASE_URL}/staff`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to create staff account");
  return result.data;
}

export async function updateStaff(token, id, data) {
  const response = await fetch(`${API_BASE_URL}/staff/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to update staff profile");
  return result.data;
}

// Credential Dispatch (Lesson 4.9)
export async function sendUserCredentials(token, userId, data = {}) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/send-credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to dispatch credentials");
  return result.data;
}

// Notification & Outbox Management (Module 7)
export async function getNotifications(token, { status, type, search, page = 1, limit = 25 } = {}) {
  const query = new URLSearchParams();
  if (status && status !== "all") query.set("status", status);
  if (type && type !== "all") query.set("type", type);
  if (search) query.set("search", search);
  query.set("page", String(page));
  query.set("limit", String(limit));

  const response = await fetch(`${API_BASE_URL}/notifications?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load notifications");
  return result;
}

export async function retryNotification(token, notificationId) {
  const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/retry`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to retry notification");
  return result;
}

export async function runReminders(token, daysAhead = 2) {
  const response = await fetch(`${API_BASE_URL}/notifications/run-reminders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ days_ahead: daysAhead }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to trigger reminders");
  return result;
}

// ==========================================
// Module 11: Laboratory Management API
// ==========================================

export async function getMasterLabTests(token, params = {}) {
  const query = new URLSearchParams();
  if (params.search || params.q) query.append("q", params.search || params.q);
  if (params.category) query.append("category", params.category);
  if (params.status) query.append("status", params.status);
  if (params.page) query.append("page", params.page);
  if (params.limit) query.append("limit", params.limit);

  const response = await fetch(`${API_BASE_URL}/labs/master-tests?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load master lab tests");
  }
  return result;
}

export async function getMasterLabTestDetail(token, id) {
  const response = await fetch(`${API_BASE_URL}/labs/master-tests/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load master lab test details");
  }
  return result.data;
}

export async function createMasterLabTest(token, data) {
  const response = await fetch(`${API_BASE_URL}/labs/master-tests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to create master lab test");
  }
  return result.data;
}

export async function updateMasterLabTest(token, id, data) {
  const response = await fetch(`${API_BASE_URL}/labs/master-tests/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to update master lab test");
  }
  return result.data;
}

export async function toggleMasterLabTestStatus(token, id, status) {
  const response = await fetch(`${API_BASE_URL}/labs/master-tests/${id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to toggle test status");
  }
  return result.data;
}

export async function deleteMasterLabTest(token, id) {
  const response = await fetch(`${API_BASE_URL}/labs/master-tests/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to delete master lab test");
  }
  return result;
}

// ============================================================================
// MODULE 12: PHARMACY & INVENTORY MANAGEMENT API CLIENT
// ============================================================================

export async function getMedicineCategories(token, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}/pharmacy/categories${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch medicine categories");
  return result.data || [];
}

export async function createMedicineCategory(token, data) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/categories`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to create category");
  return result;
}

export async function updateMedicineCategory(token, id, data) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/categories/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to update category");
  return result;
}

export async function updateMedicineCategoryStatus(token, id, status) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/categories/${id}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to update category status");
  return result;
}

export async function deleteMedicineCategory(token, id) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/categories/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to delete category");
  return result;
}

export async function getSuppliers(token, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}/pharmacy/suppliers${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch suppliers");
  return result.data || [];
}

export async function createSupplier(token, data) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/suppliers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to create supplier");
  return result;
}

export async function updateSupplier(token, id, data) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/suppliers/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to update supplier");
  return result;
}

export async function updateSupplierStatus(token, id, status) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/suppliers/${id}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to update supplier status");
  return result;
}

export async function getPharmacyMedicines(token, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}/pharmacy/medicines${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch medicines");
  return result.data || [];
}

export async function getPharmacyMedicineDetails(token, id) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/medicines/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch medicine details");
  return result.data;
}

export async function createPharmacyMedicine(token, data) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/medicines`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to create medicine");
  return result;
}

export async function updatePharmacyMedicine(token, id, data) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/medicines/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to update medicine");
  return result;
}

export async function updatePharmacyMedicineStatus(token, id, status) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/medicines/${id}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to update medicine status");
  return result;
}

export async function getInventoryBatches(token, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}/pharmacy/batches${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch inventory batches");
  return result.data || [];
}

export async function receiveInventoryBatch(token, data) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/batches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to receive stock batch");
  return result;
}

export async function adjustBatchStock(token, batchId, data) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/batches/${batchId}/adjust`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to adjust stock");
  return result;
}

export async function getStockMovements(token, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}/pharmacy/movements${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch stock movements");
  return result.data || [];
}

export async function getPharmacyAlertsSummary(token, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}/pharmacy/alerts/summary${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch alerts summary");
  return result.data;
}

export async function getLowStockAlerts(token, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}/pharmacy/alerts/low-stock${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch low stock alerts");
  return result.data || [];
}

export async function getExpiringAlerts(token, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}/pharmacy/alerts/expiring${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch expiring alerts");
  return result.data || [];
}

export async function dispenseMedications(token, data) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/dispensations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to dispense medications");
  return result;
}

export async function getDispensations(token, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}/pharmacy/dispensations${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch dispensations");
  return result.data || [];
}

export async function getDispensationDetails(token, id) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/dispensations/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch dispensation details");
  return result.data;
}

export async function getPendingPrescriptions(token, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}/pharmacy/prescriptions/pending${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch pending prescriptions");
  return result.data || [];
}



