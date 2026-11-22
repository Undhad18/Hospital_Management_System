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
  const response = await fetch(`${API_BASE_URL}/hospitals`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
// MODULE 10: WARDS & BEDS API CLIENT
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

// ==========================================
// Module 11: Hospital Laboratory Offerings
// ==========================================

export async function getHospitalLabTests(token, params = {}) {
  const query = new URLSearchParams();
  if (params.hospital_id) query.append("hospital_id", params.hospital_id);
  if (params.search || params.q) query.append("q", params.search || params.q);
  if (params.category) query.append("category", params.category);
  if (params.status) query.append("status", params.status);
  if (params.page) query.append("page", params.page);
  if (params.limit) query.append("limit", params.limit);

  const response = await fetch(`${API_BASE_URL}/labs/hospital-tests?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load hospital lab tests");
  }
  return result;
}

export async function getUnassignedMasterLabTests(token, params = {}) {
  const query = new URLSearchParams();
  if (params.hospital_id) query.append("hospital_id", params.hospital_id);
  if (params.q) query.append("q", params.q);
  if (params.category) query.append("category", params.category);

  const response = await fetch(`${API_BASE_URL}/labs/hospital-tests/unassigned?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load unassigned master tests");
  }
  return result.data || [];
}

export async function assignHospitalLabTests(token, payload) {
  const response = await fetch(`${API_BASE_URL}/labs/hospital-tests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to assign lab test to hospital");
    error.status = response.status;
    error.data = result;
    throw error;
  }
  return result;
}

export async function toggleHospitalLabTestStatus(token, id, status) {
  const response = await fetch(`${API_BASE_URL}/labs/hospital-tests/${id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to update test offering status");
  }
  return result.data;
}

export async function updateHospitalLabTestPrice(token, id, price) {
  const response = await fetch(`${API_BASE_URL}/labs/hospital-tests/${id}/price`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ price }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to update test price");
  }
  return result.data;
}

export async function removeHospitalLabTest(token, id) {
  const response = await fetch(`${API_BASE_URL}/labs/hospital-tests/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to remove test offering");
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

/**
 * Module 13 Prescription Management API Methods (Hospital Admin Portal)
 */
export async function getHospitalPrescriptions(token, params = {}) {
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

/* ==========================================================================
   AI HOSPITAL INTELLIGENCE & DIGITAL TWIN API CLIENTS
   ========================================================================== */

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

export async function getAiDoctorWorkloadAnalytics(token) {
  const res = await fetch(`${API_BASE_URL}/ai/analytics/doctor-workload`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Failed to load doctor workload");
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

// --- DIGITAL TWIN TELEMETRY & DASHBOARDS ---
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

export async function syncDigitalTwin(token) {
  const res = await fetch(`${API_BASE_URL}/digital-twin/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.message || "Digital Twin sync failed");
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

// --- Digital Twin What-If Simulations ---
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
