const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

export async function loginUser(email, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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

export async function registerPatient({ fullName, email, password, phone }) {
  const response = await fetch(`${API_BASE_URL}/auth/register-patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: fullName,
      email,
      password,
      phone,
    }),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Registration failed");
  }

  return result;
}

export async function verifyOtp({ email, otp, purpose = "registration" }) {
  const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp, purpose }),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "OTP verification failed");
  }

  return result;
}

export async function resendOtp({ email, purpose = "registration" }) {
  const response = await fetch(`${API_BASE_URL}/auth/resend-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, purpose }),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to resend code");
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
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/hospitals`, {
    headers,
  });

  const result = await response.json();

  if (response.status === 401 || response.status === 403) {
    throw new Error(result.message || "Your session is not authorized");
  }

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load hospitals");
  }

  return result.data;
}

export async function getPendingApprovals(token) {
  const response = await fetch(`${API_BASE_URL}/users/pending-approvals`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to approve account");
  }

  return result.data;
}

export async function getUsers(token) {
  const response = await fetch(`${API_BASE_URL}/users`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
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

// Staff Self-Profile APIs (Lessons 4.6 - 4.8)
export async function getStaffProfile(token, staffId) {
  const response = await fetch(`${API_BASE_URL}/staff/${staffId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load staff profile");
  return result.data;
}

export async function updateStaffProfile(token, staffId, data) {
  const response = await fetch(`${API_BASE_URL}/staff/${staffId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to update staff profile");
  return result.data;
}

export async function registerPatientByStaff(token, patientData) {
  const response = await fetch(`${API_BASE_URL}/staff/patients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patientData),
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to register patient");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result;
}

// Module 6 Appointment & Queue APIs for Front Desk Staff
export async function getStaffLiveQueue(token, { doctor_id, date } = {}) {
  let url = `${API_BASE_URL}/appointments/queue/live`;
  const params = [];
  if (doctor_id) params.push(`doctor_id=${doctor_id}`);
  if (date) params.push(`date=${date}`);
  if (params.length) url += `?${params.join("&")}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load live queue");
  return result.data || result;
}

export async function checkInAppointment(token, appointmentId) {
  const response = await fetch(`${API_BASE_URL}/appointments/${appointmentId}/check-in`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const err = new Error(result.message || "Failed to check in appointment");
    err.status = response.status;
    throw err;
  }
  return result;
}

export async function getStaffAppointments(token, queryParams = {}) {
  let url = `${API_BASE_URL}/appointments`;
  const query = new URLSearchParams(queryParams).toString();
  if (query) url += `?${query}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load appointments");
  return result.data;
}

export async function bookAppointmentByStaff(token, bookingData) {
  const response = await fetch(`${API_BASE_URL}/appointments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(bookingData),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const err = new Error(result.message || "Failed to book appointment");
    err.status = response.status;
    throw err;
  }
  return result;
}

export async function updateAppointmentStatusByStaff(token, appointmentId, status, reason = "") {
  const response = await fetch(`${API_BASE_URL}/appointments/${appointmentId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status, reason }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to update status");
  return result;
}

// ============================================================================
// Module 9: Patient Admission Management APIs
// ============================================================================

export async function searchPatientsForAdmission(token, query) {
  const response = await fetch(`${API_BASE_URL}/admissions/patients/search?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to search patients");
  return result.data || [];
}

export async function checkActiveAdmission(token, patientId) {
  const response = await fetch(`${API_BASE_URL}/admissions/active-check/${patientId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to check active admission");
  return result;
}

export async function getAdmissions(token, filters = {}) {
  const query = new URLSearchParams(filters).toString();
  const url = `${API_BASE_URL}/admissions${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load admissions");
  return result.data || [];
}

export async function getAdmissionById(token, admissionId) {
  const response = await fetch(`${API_BASE_URL}/admissions/${admissionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to get admission details");
  return result.data;
}

export async function getAdmissionHistory(token, admissionId) {
  const response = await fetch(`${API_BASE_URL}/admissions/${admissionId}/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to get admission history");
  return result.data || [];
}

export async function createAdmission(token, payload) {
  const response = await fetch(`${API_BASE_URL}/admissions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to create patient admission");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result;
}

export async function updateAdmissionStatus(token, admissionId, status, reason = "") {
  const response = await fetch(`${API_BASE_URL}/admissions/${admissionId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status, reason }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to update admission status");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result;
}

export async function getAdmissionHospitals(token) {
  const response = await fetch(`${API_BASE_URL}/appointments/hospitals`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load hospitals");
  return result.data || [];
}

export async function getAdmissionDepartments(token, hospitalId) {
  const response = await fetch(`${API_BASE_URL}/appointments/departments?hospital_id=${hospitalId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load departments");
  return result.data || [];
}

export async function getAdmissionDoctors(token, hospitalId, departmentId) {
  const response = await fetch(`${API_BASE_URL}/appointments/doctors?hospital_id=${hospitalId}&department_id=${departmentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load doctors");
  return result.data || [];
}

// ============================================================================
// MODULE 10: WARDS & BEDS API CLIENT (STAFF PORTAL)
// ============================================================================

export async function getWards(token, filters = {}) {
  const params = new URLSearchParams();
  if (filters.hospital_id) params.append("hospital_id", filters.hospital_id);
  if (filters.department_id) params.append("department_id", filters.department_id);
  if (filters.status && filters.status !== "all") params.append("status", filters.status);
  if (filters.ward_type && filters.ward_type !== "all") params.append("ward_type", filters.ward_type);
  if (filters.search) params.append("search", filters.search);

  const response = await fetch(`${API_BASE_URL}/wards?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load wards");
  return result.data || [];
}

export async function getWardById(token, wardId) {
  const response = await fetch(`${API_BASE_URL}/wards/${wardId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load ward details");
  return result.data;
}

export async function createWard(token, wardData) {
  const response = await fetch(`${API_BASE_URL}/wards`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(wardData),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to create ward");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result.data;
}

export async function updateWard(token, wardId, wardData) {
  const response = await fetch(`${API_BASE_URL}/wards/${wardId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(wardData),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to update ward");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result.data;
}

export async function updateWardStatus(token, wardId, status) {
  const response = await fetch(`${API_BASE_URL}/wards/${wardId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to update ward status");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result.data;
}

export async function getBeds(token, filters = {}) {
  const params = new URLSearchParams();
  if (filters.ward_id) params.append("ward_id", filters.ward_id);
  if (filters.department_id) params.append("department_id", filters.department_id);
  if (filters.hospital_id) params.append("hospital_id", filters.hospital_id);
  if (filters.status && filters.status !== "all") params.append("status", filters.status);
  if (filters.bed_type && filters.bed_type !== "all") params.append("bed_type", filters.bed_type);
  if (filters.search) params.append("search", filters.search);

  const response = await fetch(`${API_BASE_URL}/beds?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load beds");
  return result.data || [];
}

export async function getBedById(token, bedId) {
  const response = await fetch(`${API_BASE_URL}/beds/${bedId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load bed details");
  return result.data;
}

export async function createBed(token, bedData) {
  const response = await fetch(`${API_BASE_URL}/beds`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(bedData),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to create bed");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result.data;
}

export async function updateBed(token, bedId, bedData) {
  const response = await fetch(`${API_BASE_URL}/beds/${bedId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(bedData),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to update bed");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result.data;
}

export async function assignBed(token, { bed_id, admission_id, notes }) {
  const response = await fetch(`${API_BASE_URL}/beds/assign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ bed_id, admission_id, notes }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to assign bed");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result.data;
}

export async function releaseBed(token, { bed_id, admission_id, reason }) {
  const response = await fetch(`${API_BASE_URL}/beds/release`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ bed_id, admission_id, reason }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to release bed");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result.data;
}

export async function updateBedMaintenance(token, bedId, { action, reason }) {
  const response = await fetch(`${API_BASE_URL}/beds/${bedId}/maintenance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, reason }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to update bed maintenance status");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result.data;
}

export async function getBedHistory(token, bedId) {
  const response = await fetch(`${API_BASE_URL}/beds/${bedId}/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load bed history");
  return result;
}

export async function getAdmissionBedAssignment(token, admissionId) {
  const response = await fetch(`${API_BASE_URL}/beds/admission/${admissionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load admission bed assignment");
  return result;
}

/**
 * ============================================================================
 * Lesson 11.6: Laboratory Queue & Pending Test Management
 * ============================================================================
 */

export async function getLabOrders(token, params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      searchParams.append(key, val);
    }
  });

  const url = `${API_BASE_URL}/labs/orders${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to retrieve laboratory orders");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result;
}

export async function getLabOrderDetails(token, orderId) {
  const response = await fetch(`${API_BASE_URL}/labs/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to retrieve laboratory order details");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result.data;
}

export async function updateLabOrderStatus(token, orderId, { status, cancellation_reason, notes }) {
  const response = await fetch(`${API_BASE_URL}/labs/orders/${orderId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status, cancellation_reason, notes }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to update laboratory order status");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result;
}

export async function collectLabSample(token, orderId, notes = "") {
  return updateLabOrderStatus(token, orderId, { status: "sample_collected", notes });
}

export async function startLabAnalysis(token, orderId, notes = "") {
  return updateLabOrderStatus(token, orderId, { status: "in_progress", notes });
}

export async function cancelLabOrder(token, orderId, cancellation_reason, notes = "") {
  return updateLabOrderStatus(token, orderId, { status: "cancelled", cancellation_reason, notes });
}

/**
 * ============================================================================
 * Lesson 11.7: Report Upload & File Linking
 * ============================================================================
 */

export async function uploadLabReport(token, orderId, formData) {
  const response = await fetch(`${API_BASE_URL}/labs/orders/${orderId}/reports`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to upload laboratory report");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result;
}

export async function getOrderReports(token, orderId) {
  const response = await fetch(`${API_BASE_URL}/labs/orders/${orderId}/reports`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to fetch order reports");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result.data;
}

export async function getLabReportDetails(token, reportId) {
  const response = await fetch(`${API_BASE_URL}/labs/reports/${reportId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to fetch report metadata");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result.data;
}

export async function downloadLabReportFile(token, reportId, filename = "lab-report.pdf") {
  const response = await fetch(`${API_BASE_URL}/labs/reports/${reportId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error("Failed to download laboratory report file.");
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function viewLabReportFile(token, reportId) {
  const response = await fetch(`${API_BASE_URL}/labs/reports/${reportId}/view`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error("Failed to open laboratory report file.");
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank");
}

/**
 * ============================================================================
 * Lesson 11.9: Laboratory Payment Status Management
 * ============================================================================
 */

export async function recordLabPayment(token, orderId, paymentData) {
  const response = await fetch(`${API_BASE_URL}/labs/orders/${orderId}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(paymentData),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to record payment");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result;
}

export async function getOrderPayments(token, orderId) {
  const response = await fetch(`${API_BASE_URL}/labs/orders/${orderId}/payments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to fetch order payments");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result;
}

export async function waiveLabOrderPayment(token, orderId, { waiver_reason, notes = "" }) {
  const response = await fetch(`${API_BASE_URL}/labs/orders/${orderId}/waive`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ waiver_reason, notes }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to waive order payment");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result;
}

export async function refundLabPayment(token, paymentId, { refund_reason, notes = "" }) {
  const response = await fetch(`${API_BASE_URL}/labs/payments/${paymentId}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refund_reason, notes }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to refund payment");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result;
}

export async function getLabPaymentReceipt(token, paymentId) {
  const response = await fetch(`${API_BASE_URL}/labs/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to fetch payment receipt");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result.data;
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
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(
      ([_, v]) => v !== undefined && v !== null && v !== "" && v !== "undefined" && v !== "null"
    )
  );
  const q = new URLSearchParams(cleanParams).toString();
  const res = await fetch(`${API_BASE_URL}/pharmacy/prescriptions/pending${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch pending prescriptions");
  return result.data || [];
}

/**
 * Module 13 Prescription Management API Methods (Staff Portal)
 */
export async function getStaffPrescriptions(token, params = {}) {
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(
      ([_, v]) => v !== undefined && v !== null && v !== "" && v !== "undefined" && v !== "null"
    )
  );
  const q = new URLSearchParams(cleanParams).toString();
  const res = await fetch(`${API_BASE_URL}/prescriptions${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch prescriptions");
  return result;
}

export async function getPrescriptionDetails(token, id) {
  const res = await fetch(`${API_BASE_URL}/prescriptions/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch prescription details");
  return result.data;
}

export async function validatePrescriptionDispense(token, id) {
  const res = await fetch(`${API_BASE_URL}/prescriptions/${id}/validate-dispense`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to validate prescription for dispensing");
  return result.data;
}

export async function dispensePrescriptionDirect(token, id, data) {
  const res = await fetch(`${API_BASE_URL}/prescriptions/${id}/dispense`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Dispensing transaction failed");
  return result;
}

export async function updatePrescriptionStatus(token, id, status, reason = "") {
  const res = await fetch(`${API_BASE_URL}/prescriptions/${id}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status, reason }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to update prescription status");
  return result.data;
}

/**
 * ============================================================================
 * Module 14 Pharmacy Billing & Payments API Methods (Staff Portal)
 * ============================================================================
 */
export async function createPharmacyBill(token, billData) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/bills`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(billData),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to generate pharmacy bill");
  return result.data;
}

export async function getPharmacyBills(token, params = {}) {
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== "" && v !== "all")
  );
  const q = new URLSearchParams(cleanParams).toString();
  const res = await fetch(`${API_BASE_URL}/pharmacy/bills${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch pharmacy bills");
  return result;
}

export async function getPharmacyBillDetails(token, id) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/bills/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch bill details");
  return result.data;
}

export async function recordPharmacyPayment(token, billId, paymentData) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/bills/${billId}/payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(paymentData),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Payment recording failed");
  return result.data;
}

export async function refundPharmacyPayment(token, paymentId, refundData) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/payments/${paymentId}/refund`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(refundData),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Refund processing failed");
  return result.data;
}

export async function getPharmacyInvoice(token, billId) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/bills/${billId}/invoice`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to generate invoice");
  return result.data;
}

export async function emailPharmacyInvoice(token, billId, email) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/bills/${billId}/email-invoice`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to dispatch invoice email");
  return result;
}

export async function emailPharmacyReceipt(token, paymentId, email) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/payments/${paymentId}/email-receipt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to dispatch receipt email");
  return result;
}

export async function recordOutsidePurchase(token, purchaseData) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/outside-purchases`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(purchaseData),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to record outside purchase");
  return result.data;
}

// -----------------------------------------------------------------------------
// MODULE 16: CONSULTATION BILLING APIS
// -----------------------------------------------------------------------------
export async function getEligibleConsultationAppointments(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}/consultation-billing/eligible-appointments?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load eligible appointments");
  return result.data;
}

export async function getConsultationFeePreview(token, appointmentId) {
  const res = await fetch(`${API_BASE_URL}/consultation-billing/fee-preview/${appointmentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load fee preview");
  return result.data;
}

export async function generateConsultationBill(token, billData) {
  const res = await fetch(`${API_BASE_URL}/consultation-billing/bills`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(billData),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to generate consultation bill");
  return result;
}

export async function getConsultationBills(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}/consultation-billing/bills?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load consultation bills");
  return result;
}

export async function getConsultationBillDetails(token, billId) {
  const res = await fetch(`${API_BASE_URL}/consultation-billing/bills/${billId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load bill details");
  return result.data;
}

export async function recordConsultationPayment(token, billId, paymentData) {
  const res = await fetch(`${API_BASE_URL}/consultation-billing/bills/${billId}/payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(paymentData),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to record payment");
  return result;
}

export async function emailConsultationReceipt(token, billId, email = null) {
  const res = await fetch(`${API_BASE_URL}/consultation-billing/bills/${billId}/email-receipt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to dispatch receipt email");
  return result;
}

export async function downloadConsultationReceiptPdf(token, billId, receiptNumber = null) {
  const res = await fetch(`${API_BASE_URL}/consultation-billing/bills/${billId}/receipt-pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.message || "Failed to download receipt PDF.");
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Official_Receipt_${receiptNumber || billId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
  return true;
}

// ============================================================================
// MODULE 17: PHARMACY TRANSACTION HISTORY & REPORTING
// ============================================================================

export async function getPharmacyDashboardSummary(token, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.append(k, v);
  });
  const res = await fetch(`${API_BASE_URL}/pharmacy/reports/dashboard-summary?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load dashboard summary");
  return result;
}

export async function getPharmacyTransactions(token, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.append(k, v);
  });
  const res = await fetch(`${API_BASE_URL}/pharmacy/reports/transactions?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load transactions");
  return result;
}

export async function getPharmacyTransactionDetail(token, type, id) {
  const res = await fetch(`${API_BASE_URL}/pharmacy/reports/transactions/${type}/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load transaction details");
  return result;
}

export async function getPharmacyPurchases(token, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.append(k, v);
  });
  const res = await fetch(`${API_BASE_URL}/pharmacy/reports/purchases?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load purchases");
  return result;
}

export async function getPharmacyDispensationsReport(token, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.append(k, v);
  });
  const res = await fetch(`${API_BASE_URL}/pharmacy/reports/dispensations?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load dispensations report");
  return result;
}

export async function getPharmacyRefundsReport(token, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.append(k, v);
  });
  const res = await fetch(`${API_BASE_URL}/pharmacy/reports/refunds?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load refunds report");
  return result;
}

export async function getPharmacyStockMovementsReport(token, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.append(k, v);
  });
  const res = await fetch(`${API_BASE_URL}/pharmacy/reports/stock-movements?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load stock movements report");
  return result;
}

// ============================================================================
// AI HOSPITAL INTELLIGENCE API SERVICES
// ============================================================================

// --- Feature 1: AI Assistant ---
export async function queryAiAssistant(token, { question, conversationId }) {
  const res = await fetch(`${API_BASE_URL}/ai/assistant/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question, conversation_id: conversationId }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "AI Assistant query failed");
  return result;
}

export async function getAiConversations(token) {
  const res = await fetch(`${API_BASE_URL}/ai/assistant/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load AI conversations");
  return result;
}

export async function getAiConversationMessages(token, conversationId) {
  const res = await fetch(`${API_BASE_URL}/ai/assistant/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load messages");
  return result;
}

export async function deleteAiConversation(token, conversationId) {
  const res = await fetch(`${API_BASE_URL}/ai/assistant/conversations/${conversationId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to delete conversation");
  return result;
}

export async function clearAllAiConversations(token) {
  const res = await fetch(`${API_BASE_URL}/ai/assistant/conversations`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to clear conversations");
  return result;
}

// --- Features 2-8: AI Operational Analytics ---
export async function getAiAppointmentAnalytics(token) {
  const res = await fetch(`${API_BASE_URL}/ai/analytics/appointments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load appointment analytics");
  return result;
}

export async function getAiQueueAnalytics(token) {
  const res = await fetch(`${API_BASE_URL}/ai/analytics/patient-queue`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load queue analytics");
  return result;
}

export async function getAiBedPredictionAnalytics(token) {
  const res = await fetch(`${API_BASE_URL}/ai/analytics/bed-prediction`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load bed predictions");
  return result;
}

export async function getAiMedicineForecastingAnalytics(token) {
  const res = await fetch(`${API_BASE_URL}/ai/analytics/medicine-forecasting`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load inventory forecast");
  return result;
}

export async function getAiLabAnalytics(token) {
  const res = await fetch(`${API_BASE_URL}/ai/analytics/laboratory`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load lab analytics");
  return result;
}

export async function getAiBillingInsights(token) {
  const res = await fetch(`${API_BASE_URL}/ai/analytics/billing-insights`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load billing insights");
  return result;
}

// --- Feature 9: AI Automated Reports ---
export async function generateAiReport(token, { report_type, period = "daily", parameters = {} }) {
  const res = await fetch(`${API_BASE_URL}/ai/reports/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ report_type, period, parameters }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to generate AI report");
  return result;
}

export async function getAiReports(token, limit = 20) {
  const res = await fetch(`${API_BASE_URL}/ai/reports?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load reports");
  return result;
}

export async function getAiReportDetail(token, reportId) {
  const res = await fetch(`${API_BASE_URL}/ai/reports/${reportId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load report detail");
  return result;
}

// --- Feature 10 & Opportunities: AI Notifications & Workflow ---
export async function getAiActiveNotifications(token) {
  const res = await fetch(`${API_BASE_URL}/ai/notifications/active`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load active notifications");
  return result;
}

export async function getAiNotificationPreferences(token) {
  const res = await fetch(`${API_BASE_URL}/ai/notifications/preferences`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load notification preferences");
  return result;
}

export async function updateAiNotificationPreferences(token, preferences) {
  const res = await fetch(`${API_BASE_URL}/ai/notifications/preferences`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ preferences }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to update notification preferences");
  return result;
}

export async function getAiAutomationOpportunities(token) {
  const res = await fetch(`${API_BASE_URL}/ai/automation-opportunities`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load automation opportunities");
  return result;
}

// ============================================================================
// DIGITAL TWIN API SERVICES (OPERATIONAL VIRTUAL HOSPITAL)
// ============================================================================

export async function getDigitalTwinDashboard(token) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load Digital Twin dashboard");
  return result;
}

export async function getDigitalTwinWards(token) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/wards`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load Ward Digital Twin");
  return result;
}

export async function getDigitalTwinPatientFlow(token) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/patient-flow`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load Patient Flow Digital Twin");
  return result;
}

export async function getDigitalTwinDoctors(token) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/doctors`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load Doctor Digital Twin");
  return result;
}

export async function getDigitalTwinPharmacy(token) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/pharmacy`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load Pharmacy Digital Twin");
  return result;
}

export async function getDigitalTwinLaboratory(token) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/laboratory`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load Laboratory Digital Twin");
  return result;
}

export async function getDigitalTwinHistorical(token, days = 7) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/historical?days=${days}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load Historical Digital Twin");
  return result;
}

export async function getDigitalTwinFloorplan(token) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/floorplan`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load Floorplan Digital Twin");
  return result;
}

export async function getDigitalTwinOt(token) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/ot`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load OT Digital Twin");
  return result;
}

export async function transitionDigitalTwinOtCase(token, caseId, { next_stage, pacu_bed }) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/ot/cases/${caseId}/transition`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ next_stage, pacu_bed }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to transition surgical case");
  return result;
}

// --- Emergency Code Blue & Disaster Incident Command Twin ---
export async function getDigitalTwinEmergency(token) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/emergency`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load Emergency Command Twin");
  return result.data;
}

export async function triggerDigitalTwinEmergency(token, payload) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/emergency/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to trigger emergency incident");
  return result;
}

export async function toggleDigitalTwinChecklistItem(token, { incidentId, checklistId, completed, completedBy }) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/emergency/checklist/toggle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ incidentId, checklistId, completed, completedBy }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to toggle checklist item");
  return result;
}

export async function resolveDigitalTwinEmergency(token, { incidentId, outcomeNotes }) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/emergency/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ incidentId, outcomeNotes }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to resolve emergency incident");
  return result;
}

// --- AI Discharge Readiness & Bed Liberation Twin ---
export async function getDigitalTwinDischargeReadiness(token) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/discharge-readiness`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load Discharge Readiness Twin");
  return result.data;
}

export async function advanceDigitalTwinDischargeStage(token, { assessmentId, next_stage, barrier_notes }) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/discharge-readiness/advance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ assessmentId, next_stage, barrier_notes }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to advance discharge stage");
  return result;
}

export async function preAllocateDigitalTwinBed(token, { assessmentId, candidate }) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/discharge-readiness/pre-allocate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ assessmentId, candidate }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to pre-allocate bed");
  return result;
}

// --- Biomedical Equipment & IoT Asset Tracking Twin ---
export async function getDigitalTwinBiomedicalAssets(token) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/biomedical-assets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load Biomedical Assets");
  return result.data;
}

export async function relocateDigitalTwinBiomedicalAsset(token, payload) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/biomedical-assets/relocate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to relocate asset");
  return result;
}

export async function updateDigitalTwinBiomedicalAssetMaintenance(token, payload) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/biomedical-assets/maintenance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to update asset maintenance");
  return result;
}

export async function syncDigitalTwin(token) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to trigger sync");
  return result;
}

export async function runDigitalTwinSimulation(token, { scenario_type, parameters, scenario_name }) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/simulations/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ scenario_type, parameters, scenario_name }),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Simulation execution failed");
  return result;
}

export async function getDigitalTwinSimulations(token, limit = 20) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/simulations?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load simulations");
  return result;
}

export async function getDigitalTwinSimulationDetail(token, simulationId) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/simulations/${simulationId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load simulation detail");
  return result;
}

export async function getAiDoctorWorkloadAnalytics(token) {
  const res = await fetch(`${API_BASE_URL}/ai/analytics/doctor-workload`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load doctor workload");
  return result;
}

// --- Infection Control, Outbreak Surveillance & Contact Tracing Twin ---
export async function getDigitalTwinInfectionControl(token) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/infection-control`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load Infection Control Twin");
  return result.data;
}

export async function triggerDigitalTwinInfectionCase(token, payload) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/infection-control/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to flag infection case");
  return result;
}

export async function recordDigitalTwinContactSwab(token, payload) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/infection-control/contacts/swab`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to record swab result");
  return result;
}

export async function updateDigitalTwinIsolationStatus(token, payload) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/infection-control/cases/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to update isolation status");
  return result;
}







