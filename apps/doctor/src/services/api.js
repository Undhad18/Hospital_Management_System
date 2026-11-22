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

// Doctor Self-Profile APIs (Lessons 4.3 - 4.5)
export async function getDoctorProfile(token, doctorId) {
  const response = await fetch(`${API_BASE_URL}/doctors/${doctorId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load doctor profile");
  return result.data;
}

export async function updateDoctorProfile(token, doctorId, data) {
  const response = await fetch(`${API_BASE_URL}/doctors/${doctorId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to update doctor profile");
  return result.data;
}

// Doctor Availability, Schedule & Leave APIs (Lesson 6.2)
export async function getDoctorSchedules(token, doctorId) {
  const response = await fetch(`${API_BASE_URL}/doctors/${doctorId}/schedules`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load schedules");
  return result.data;
}

export async function updateDoctorSchedules(token, doctorId, schedules) {
  const response = await fetch(`${API_BASE_URL}/doctors/${doctorId}/schedules`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ schedules }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to update schedules");
  return result;
}

export async function getDoctorLeaves(token, doctorId) {
  const response = await fetch(`${API_BASE_URL}/doctors/${doctorId}/leaves`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load leaves");
  return result.data;
}

export async function addDoctorLeave(token, doctorId, leaveData) {
  const response = await fetch(`${API_BASE_URL}/doctors/${doctorId}/leaves`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(leaveData),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to add leave");
  return result;
}

export async function deleteDoctorLeave(token, doctorId, leaveId) {
  const response = await fetch(`${API_BASE_URL}/doctors/${doctorId}/leaves/${leaveId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to delete leave");
  return result;
}

export async function getDoctorAvailableSlots(token, doctorId, date) {
  const response = await fetch(`${API_BASE_URL}/doctors/${doctorId}/available-slots?date=${date}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  return result;
}

export async function getDoctorAppointments(token, queryParams = {}) {
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

export async function updateDoctorAppointmentStatus(token, appointmentId, status, reason = "") {
  const response = await fetch(`${API_BASE_URL}/appointments/${appointmentId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status, reason }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to update appointment status");
  return result;
}

export async function getOpdSchedule(token, queryParams = {}) {
  let url = `${API_BASE_URL}/opd/schedule`;
  const query = new URLSearchParams(queryParams).toString();
  if (query) url += `?${query}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load OPD schedule");
  return result.data;
}

export async function getOpdQueue(token, queryParams = {}) {
  let url = `${API_BASE_URL}/opd/queue`;
  const query = new URLSearchParams(queryParams).toString();
  if (query) url += `?${query}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Failed to load OPD queue");
  return result.data;
}

export async function startConsultation(token, appointmentId) {
  return startConsultationWorkflow(token, appointmentId);
}

export async function completeConsultation(token, appointmentId) {
  return updateDoctorAppointmentStatus(token, appointmentId, "completed");
}

export async function admitPatient(token, appointmentId, reason = "Admitted to inpatient care") {
  return updateDoctorAppointmentStatus(token, appointmentId, "admitted", reason);
}

// ============================================================================
// Module 8: Daily Consultation & Follow-up Management APIs
// ============================================================================

export async function startConsultationWorkflow(token, appointmentId) {
  const response = await fetch(`${API_BASE_URL}/consultations/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ appointment_id: appointmentId }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to start consultation");
  }
  return result.data;
}

export async function getConsultationByAppointment(token, appointmentId) {
  const response = await fetch(`${API_BASE_URL}/consultations/appointment/${appointmentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load consultation");
  }
  return result.data;
}

export async function saveConsultationDraft(token, consultationId, data) {
  const response = await fetch(`${API_BASE_URL}/consultations/${consultationId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const err = new Error(result.message || "Failed to save draft");
    err.errors = result.errors;
    throw err;
  }
  return result;
}

export async function submitConsultation(token, consultationId, data) {
  const response = await fetch(`${API_BASE_URL}/consultations/${consultationId}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const err = new Error(result.message || "Failed to submit consultation");
    err.errors = result.errors;
    throw err;
  }
  return result;
}

export async function submitAndCompleteConsultation(token, consultationId, data) {
  const response = await fetch(`${API_BASE_URL}/consultations/${consultationId}/submit-and-complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const err = new Error(result.message || "Failed to submit and complete consultation");
    err.errors = result.errors;
    throw err;
  }
  return result;
}

export async function getPatientConsultationHistory(token, patientId) {
  const response = await fetch(`${API_BASE_URL}/consultations/patient/${patientId}/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load patient history");
  }
  return result;
}

export async function getMasterMedicines(token) {
  const response = await fetch(`${API_BASE_URL}/consultations/masters/medicines`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load medicines catalog");
  }
  return result.data;
}

export async function getMasterLabTests(token, hospitalId = null) {
  let url = `${API_BASE_URL}/consultations/masters/lab-tests`;
  if (hospitalId) {
    url += `?hospital_id=${encodeURIComponent(hospitalId)}`;
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load lab tests catalog");
  }
  return result.data;
}

export async function scheduleFollowUpAppointment(token, followUpData) {
  const response = await fetch(`${API_BASE_URL}/appointments/follow-up`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(followUpData),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to schedule follow-up appointment");
  }
  return result;
}

export async function getDoctorLabReviews(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE_URL}/labs/doctor-reviews${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load laboratory reports for review");
  }
  return result;
}

export async function getOrderReports(token, orderId) {
  const response = await fetch(`${API_BASE_URL}/labs/orders/${orderId}/reports`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load order laboratory reports");
  }
  return result;
}

export async function downloadLabReportFile(token, reportId, filename = "lab-report.pdf") {
  const response = await fetch(`${API_BASE_URL}/labs/reports/${reportId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to download laboratory report file.");
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
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to open laboratory report file.");
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank");
}

/**
 * Module 13 Prescription Management API Methods
 */
export async function getEligibleMedicines(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE_URL}/prescriptions/medicines/eligible${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load eligible medicines from inventory");
  }
  return result.data || [];
}

export async function getDoctorPrescriptions(token, params = {}) {
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(
      ([_, v]) => v !== undefined && v !== null && v !== "" && v !== "undefined" && v !== "null"
    )
  );
  const query = new URLSearchParams(cleanParams).toString();
  const response = await fetch(`${API_BASE_URL}/prescriptions${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load prescriptions list");
  }
  return result;
}

export async function getPrescriptionDetails(token, id) {
  const response = await fetch(`${API_BASE_URL}/prescriptions/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load prescription details");
  }
  return result.data;
}

export async function createOrUpdatePrescription(token, payload) {
  const response = await fetch(`${API_BASE_URL}/prescriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to save prescription");
  }
  return result.data;
}

export async function updatePrescriptionStatus(token, id, status, reason = "") {
  const response = await fetch(`${API_BASE_URL}/prescriptions/${id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status, reason }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to update prescription status");
  }
  return result.data;
}






