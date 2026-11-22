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
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

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

export async function loginWithGoogle(credential) {
  const response = await fetch(`${API_BASE_URL}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Google authentication failed");
    error.status = response.status;
    error.data = result;
    throw error;
  }

  return result;
}

export async function getPatientProfile(token) {
  const response = await fetch(`${API_BASE_URL}/patients/profile`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load patient profile");
  }
  return result.data;
}

export async function updatePatientProfile(token, profileData) {
  const response = await fetch(`${API_BASE_URL}/patients/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(profileData),
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to update profile");
  }
  return result;
}

export async function getPatientProfileStatus(token) {
  const response = await fetch(`${API_BASE_URL}/patients/profile/status`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to check profile status");
  }
  return result;
}

export async function getPatientMedicalRecords(token, type) {
  const query = type ? `?type=${encodeURIComponent(type)}` : "";
  const response = await fetch(`${API_BASE_URL}/patients/medical-records${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load medical records");
  }
  return result.data;
}

export async function getPatientMedicalRecordById(token, id) {
  const response = await fetch(`${API_BASE_URL}/patients/medical-records/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load medical record");
  }
  return result.data;
}

export async function getPatientDashboard(token) {
  const response = await fetch(`${API_BASE_URL}/patients/dashboard`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load dashboard data");
  }
  return result.data;
}

export async function getPatientAppointments(token, filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.append("status", filters.status);
  if (filters.filter) params.append("filter", filters.filter);
  const query = params.toString() ? `?${params.toString()}` : "";

  const response = await fetch(`${API_BASE_URL}/patients/appointments${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load appointments");
  }
  return result.data;
}

export async function bookPatientAppointment(token, appointmentData) {
  const response = await fetch(`${API_BASE_URL}/patients/appointments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(appointmentData),
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Failed to book appointment");
    error.missing_fields = result.missing_fields;
    throw error;
  }
  return result;
}

export async function cancelPatientAppointment(token, appointmentId, reason = "") {
  const response = await fetch(`${API_BASE_URL}/appointments/${appointmentId}/cancel`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reason }),
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to cancel appointment");
  }
  return result;
}

export async function rescheduleAppointment(token, appointmentId, { appointment_date, appointment_time, reason = "" }) {
  const response = await fetch(`${API_BASE_URL}/appointments/${appointmentId}/reschedule`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ appointment_date, appointment_time, reason }),
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to reschedule appointment");
  }
  return result;
}

export async function bookFollowUpAppointment(token, data) {
  const response = await fetch(`${API_BASE_URL}/appointments/follow-up`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to book follow-up appointment");
  }
  return result;
}

export async function getAppointmentHospitals(token) {
  const response = await fetch(`${API_BASE_URL}/appointments/hospitals`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load hospitals");
  }
  return result.data;
}

export async function getAppointmentDepartments(token, hospitalId) {
  const response = await fetch(`${API_BASE_URL}/appointments/departments?hospital_id=${hospitalId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load departments");
  }
  return result.data;
}

export async function getAppointmentDoctors(token, hospitalId, departmentId) {
  const response = await fetch(
    `${API_BASE_URL}/appointments/doctors?hospital_id=${hospitalId}&department_id=${departmentId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load doctors");
  }
  return result.data;
}

export async function validateAppointmentSelection(token, { hospital_id, department_id, doctor_id }) {
  const response = await fetch(`${API_BASE_URL}/appointments/validate-selection`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ hospital_id, department_id, doctor_id }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    const error = new Error(result.message || "Invalid doctor selection");
    error.valid = false;
    error.status = response.status;
    throw error;
  }
  return result;
}

export async function getDoctorAvailableSlots(token, doctorId, date) {
  const response = await fetch(`${API_BASE_URL}/appointments/doctors/${doctorId}/available-slots?date=${date}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();
  return result;
}
export async function getAppointmentLabTests(token, appointmentId) {
  const response = await fetch(`${API_BASE_URL}/labs/appointments/${appointmentId}/tests`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load laboratory tests");
  }
  return result;
}

export async function getMyLabReports(token) {
  const response = await fetch(`${API_BASE_URL}/labs/my-reports`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load your laboratory reports");
  }
  return result;
}

export async function getOrderReports(token, orderId) {
  const response = await fetch(`${API_BASE_URL}/labs/orders/${orderId}/reports`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load reports for order");
  }
  return result;
}

export async function downloadLabReport(token, reportId, filename = "lab-report.pdf") {
  const response = await fetch(`${API_BASE_URL}/labs/reports/${reportId}/download`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
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

export async function viewLabReport(token, reportId) {
  const response = await fetch(`${API_BASE_URL}/labs/reports/${reportId}/view`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
 * Module 13 Prescription Management API Methods (Patient Portal)
 */
export async function getMyPrescriptions(token) {
  const response = await fetch(`${API_BASE_URL}/prescriptions/patient/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load prescriptions.");
  }
  return result.data || [];
}

export async function getPrescriptionDetails(token, id) {
  const response = await fetch(`${API_BASE_URL}/prescriptions/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load prescription details.");
  }
  return result.data;
}

/**
 * Module 14 Pharmacy Billing & Payment API Methods (Patient Portal)
 */
export async function getPatientPharmacyBills(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE_URL}/pharmacy/bills?${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to retrieve pharmacy bills.");
  }
  return result;
}

export async function getPatientPharmacyInvoice(token, billId) {
  const response = await fetch(`${API_BASE_URL}/pharmacy/bills/${billId}/invoice`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to retrieve pharmacy invoice.");
  }
  return result.data;
}

export async function emailPatientPharmacyInvoice(token, billId, recipientEmail = null) {
  const response = await fetch(`${API_BASE_URL}/pharmacy/bills/${billId}/email-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ recipient_email: recipientEmail }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to send invoice email.");
  }
  return result;
}

// Module 16: Consultation Billing APIs
export async function getPatientConsultationBills(token) {
  const response = await fetch(`${API_BASE_URL}/consultation-billing/patient/my-bills`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to retrieve consultation bills.");
  }
  return result;
}

export async function emailPatientConsultationReceipt(token, billId, recipientEmail = null) {
  const response = await fetch(`${API_BASE_URL}/consultation-billing/bills/${billId}/email-receipt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email: recipientEmail }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to send consultation receipt email.");
  }
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





