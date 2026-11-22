/**
 * scheduleService.js
 * Comprehensive Doctor Availability, Working Hours, Leaves, and Slot Generator for Module 6 (Lesson 6.2)
 */

const pool = require("../db");

/**
 * Converts a 24h or 12h time string to minutes from midnight (0 - 1439)
 * e.g., "09:30:00" -> 570, "02:30 PM" -> 870
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const clean = timeStr.trim().toUpperCase();

  // Handle 12-hour AM/PM format
  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const mins = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[4];
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return hours * 60 + mins;
  }

  // Handle standard 24-hour "HH:MM" or "HH:MM:SS"
  const parts = clean.split(":");
  if (parts.length >= 2) {
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    if (!isNaN(hours) && !isNaN(mins)) {
      return hours * 60 + mins;
    }
  }

  return null;
}

/**
 * Converts minutes from midnight back to 24h "HH:MM:SS" and 12h "hh:mm A"
 */
function formatMinutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hh24 = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const time24 = `${hh24}:${mm}:00`;

  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const time12 = `${String(h12).padStart(2, "0")}:${mm} ${period}`;

  return { time24, time12 };
}

/**
 * Returns UTC day of week name ('monday', 'tuesday', etc.) for 'YYYY-MM-DD'
 */
function getDayOfWeekFromDate(dateStr) {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  return days[d.getUTCDay()];
}

/**
 * Check if doctor is on leave on a given date
 */
async function getDoctorLeave(poolClient, doctorId, dateStr) {
  const [rows] = await poolClient.execute(
    "SELECT id, DATE_FORMAT(leave_date, '%Y-%m-%d') AS leave_date, reason FROM doctor_leaves WHERE doctor_id = ? AND leave_date = ? LIMIT 1",
    [doctorId, dateStr]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get active schedule configuration for a doctor on a specific day of the week
 */
async function getDoctorDaySchedule(poolClient, doctorId, dayOfWeek) {
  const [rows] = await poolClient.execute(
    `SELECT id, doctor_id, hospital_id, day_of_week, start_time, end_time,
            slot_duration_minutes, break_start, break_end, is_available
     FROM doctor_schedules
     WHERE doctor_id = ? AND day_of_week = ?
     LIMIT 1`,
    [doctorId, dayOfWeek]
  );

  if (rows.length > 0) {
    return rows[0];
  }

  // Check if doctor has ANY schedules configured at all
  const [allSchedules] = await poolClient.execute(
    "SELECT COUNT(*) AS total FROM doctor_schedules WHERE doctor_id = ?",
    [doctorId]
  );

  const hasCustomSchedules = (allSchedules[0]?.total || 0) > 0;
  if (hasCustomSchedules) {
    // If doctor has configured schedules for some days, but not this day, they are off-duty on this day
    return null;
  }

  // Fallback default for doctors with no configured schedules yet (Monday-Friday 09:00 - 17:00, lunch 13:00 - 14:00)
  const isWeekday = ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(dayOfWeek);
  if (!isWeekday) {
    return null;
  }

  return {
    doctor_id: doctorId,
    day_of_week: dayOfWeek,
    start_time: "09:00:00",
    end_time: "17:00:00",
    slot_duration_minutes: 30,
    break_start: "13:00:00",
    break_end: "14:00:00",
    is_available: true,
    is_default: true,
  };
}

/**
 * Computes available and booked time slots dynamically for a doctor on a specific date
 */
async function computeDoctorAvailableSlots(poolClient, doctorId, dateStr) {
  // 1. Validate date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetDate = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(targetDate.getTime())) {
    return { success: false, status: 400, message: "Invalid date format. Expected YYYY-MM-DD." };
  }

  // Comparison using local date string format YYYY-MM-DD
  const todayYear = today.getFullYear();
  const todayMonth = String(today.getMonth() + 1).padStart(2, "0");
  const todayDay = String(today.getDate()).padStart(2, "0");
  const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;

  if (dateStr < todayStr) {
    return { success: false, status: 400, message: "Appointment date cannot be in the past." };
  }

  // 2. Check if doctor exists and is active
  const [docRows] = await poolClient.execute(
    `SELECT u.id, u.full_name, u.hospital_id, u.department_id, u.status
     FROM users u
     JOIN roles r ON r.id = u.role_id AND r.name = 'doctor'
     WHERE u.id = ? LIMIT 1`,
    [doctorId]
  );

  if (!docRows.length) {
    return { success: false, status: 404, message: "Doctor not found." };
  }

  if (docRows[0].status !== "active") {
    return { success: false, status: 400, message: "Doctor account is not active." };
  }

  // 3. Check for doctor leave on this date
  const leave = await getDoctorLeave(poolClient, doctorId, dateStr);
  if (leave) {
    return {
      success: true,
      available: false,
      is_on_leave: true,
      leave_reason: leave.reason || "Doctor on leave / holiday",
      message: "Doctor is unavailable on this date due to scheduled leave.",
      date: dateStr,
      slots: [],
    };
  }

  // 4. Get active schedule for day of week
  const dayOfWeek = getDayOfWeekFromDate(dateStr);
  const schedule = await getDoctorDaySchedule(poolClient, doctorId, dayOfWeek);

  if (!schedule || !schedule.is_available) {
    return {
      success: true,
      available: false,
      is_off_duty: true,
      message: `Doctor is not scheduled to work on ${dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)}s.`,
      date: dateStr,
      day_of_week: dayOfWeek,
      slots: [],
    };
  }

  // 5. Query active booked appointments on this date
  const [bookedRows] = await poolClient.execute(
    `SELECT id, appointment_time, start_time, end_time, status
     FROM appointments
     WHERE doctor_id = ? AND appointment_date = ? AND status NOT IN ('cancelled', 'rejected')`,
    [doctorId, dateStr]
  );

  const bookedTimeMinutes = new Set();
  for (const b of bookedRows) {
    const mins = parseTimeToMinutes(b.start_time || b.appointment_time);
    if (mins !== null) {
      bookedTimeMinutes.add(mins);
    }
  }

  // 6. Generate slot intervals
  const startMins = parseTimeToMinutes(schedule.start_time);
  const endMins = parseTimeToMinutes(schedule.end_time);
  const slotDuration = schedule.slot_duration_minutes || 30;

  const breakStartMins = schedule.break_start ? parseTimeToMinutes(schedule.break_start) : null;
  const breakEndMins = schedule.break_end ? parseTimeToMinutes(schedule.break_end) : null;

  const slots = [];
  const now = new Date();
  const isToday = dateStr === todayStr;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (let m = startMins; m + slotDuration <= endMins; m += slotDuration) {
    const slotEnd = m + slotDuration;

    // Check if slot falls in break window
    const isInBreak =
      breakStartMins !== null &&
      breakEndMins !== null &&
      m < breakEndMins &&
      slotEnd > breakStartMins;

    if (isInBreak) {
      continue; // Skip break intervals
    }

    const { time24, time12 } = formatMinutesToTime(m);
    const { time24: end24, time12: end12 } = formatMinutesToTime(slotEnd);

    const isPastToday = isToday && m <= currentMinutes;
    const isBooked = bookedTimeMinutes.has(m);
    const isAvailable = !isPastToday && !isBooked;

    slots.push({
      start_time: time24,
      end_time: end24,
      display_time: time12,
      display_range: `${time12} - ${end12}`,
      is_available: isAvailable,
      is_booked: isBooked,
      is_past: isPastToday,
    });
  }

  const availableSlots = slots.filter((s) => s.is_available);
  const bookedSlots = slots.filter((s) => s.is_booked);

  return {
    success: true,
    available: availableSlots.length > 0,
    date: dateStr,
    day_of_week: dayOfWeek,
    working_hours: {
      start: schedule.start_time,
      end: schedule.end_time,
      break_start: schedule.break_start,
      break_end: schedule.break_end,
      slot_duration_minutes: slotDuration,
    },
    total_slots: slots.length,
    available_count: availableSlots.length,
    booked_count: bookedSlots.length,
    available_slots: availableSlots,
    all_slots: slots,
  };
}

/**
 * Validates whether a specific appointment booking slot is valid, open, and within doctor's schedule
 */
async function validateDoctorBookingSlot(poolClient, doctorId, dateStr, timeStr) {
  const slotRes = await computeDoctorAvailableSlots(poolClient, doctorId, dateStr);
  if (!slotRes.success) {
    return { valid: false, message: slotRes.message };
  }

  if (slotRes.is_on_leave) {
    return { valid: false, message: "Doctor is on leave on the selected date." };
  }

  if (slotRes.is_off_duty) {
    return { valid: false, message: slotRes.message };
  }

  const requestedMinutes = parseTimeToMinutes(timeStr);
  if (requestedMinutes === null) {
    return { valid: false, message: "Invalid appointment time format." };
  }

  // Find matching slot in all generated slots
  const matchingSlot = slotRes.all_slots.find((s) => {
    const sMinutes = parseTimeToMinutes(s.start_time);
    return sMinutes === requestedMinutes;
  });

  if (!matchingSlot) {
    return {
      valid: false,
      message: "The requested appointment time is outside the doctor's active working hours or falls during a scheduled break.",
    };
  }

  if (matchingSlot.is_past) {
    return { valid: false, message: "The selected time slot has already passed." };
  }

  if (matchingSlot.is_booked) {
    return { valid: false, message: "The selected time slot is already booked. Please select another slot." };
  }

  return {
    valid: true,
    matchingSlot,
    start_time: matchingSlot.start_time,
    end_time: matchingSlot.end_time,
  };
}

module.exports = {
  parseTimeToMinutes,
  formatMinutesToTime,
  getDayOfWeekFromDate,
  getDoctorLeave,
  getDoctorDaySchedule,
  computeDoctorAvailableSlots,
  validateDoctorBookingSlot,
};
