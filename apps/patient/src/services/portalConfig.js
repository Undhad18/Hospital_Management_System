export const PORTALS = {
  super_admin: {
    role: "super_admin",
    name: "Super Admin Portal",
    badge: "Super Admin",
    port: 5173,
    url: "http://localhost:5173",
    description: "Multi-Hospital Central Governance & Master Directory",
    badgeColor: "bg-purple-950/80 text-purple-300 border-purple-800/50",
    gradient: "from-purple-600 to-indigo-600",
  },
  hospital_admin: {
    role: "hospital_admin",
    name: "Hospital Admin Portal",
    badge: "Hospital Admin",
    port: 5174,
    url: "http://localhost:5174",
    description: "Facility Administration, Approvals & Staff Lifecycle",
    badgeColor: "bg-blue-950/80 text-blue-300 border-blue-800/50",
    gradient: "from-blue-600 to-indigo-600",
  },
  doctor: {
    role: "doctor",
    name: "Doctor Clinical Portal",
    badge: "Doctor",
    port: 5175,
    url: "http://localhost:5175",
    description: "Clinical Consultations, Patient History & OPD Workstation",
    badgeColor: "bg-emerald-950/80 text-emerald-300 border-emerald-800/50",
    gradient: "from-emerald-600 to-teal-600",
  },
  staff: {
    role: "staff",
    name: "Hospital Staff Portal",
    badge: "Staff Member",
    port: 5176,
    url: "http://localhost:5176",
    description: "Front Desk Operations, Patient Check-in & Department Desk",
    badgeColor: "bg-amber-950/80 text-amber-300 border-amber-800/50",
    gradient: "from-amber-600 to-orange-600",
  },
  patient: {
    role: "patient",
    name: "Patient Care Portal",
    badge: "Patient",
    port: 5177,
    url: "http://localhost:5177",
    description: "Personal Healthcare Directory, Facilities & Health Records",
    badgeColor: "bg-cyan-950/80 text-cyan-300 border-cyan-800/50",
    gradient: "from-cyan-600 to-blue-600",
  },
};

/**
 * Checks if the logged-in user belongs to another portal.
 * If so, redirects to their dedicated port and hands off the session seamlessly.
 */
export function redirectIfForeignRole(session, currentRole) {
  if (!session || !session.user || !session.user.role) return false;

  const userRole = session.user.role;
  // If the user's role does not match this portal's intended role:
  if (userRole !== currentRole) {
    const target = PORTALS[userRole];
    if (target && !window.location.origin.includes(`:${target.port}`)) {
      const payload = encodeURIComponent(JSON.stringify(session));
      window.location.href = `${target.url}/#session=${payload}`;
      return true;
    }
  }
  return false;
}

/**
 * Retrieves the current active session from sessionStorage.
 */
export function getSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("hms_session");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * Saves active session into sessionStorage and purges old persistent localStorage.
 */
export function saveSession(sessionData) {
  if (typeof window === "undefined" || !sessionData) return;
  try {
    sessionStorage.setItem("hms_session", JSON.stringify(sessionData));
    localStorage.removeItem("hms_session");
  } catch (e) {
    console.error("Failed to save session to sessionStorage:", e);
  }
}

/**
 * Clears session from both sessionStorage and localStorage.
 */
export function clearSession() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("hms_session");
    localStorage.removeItem("hms_session");
  } catch (e) {
    // ignore
  }
}

/**
 * Automatically intercepts 401 Unauthorized responses to force clean redirection
 * back to the Login Page, avoiding stuck/expired token error states.
 */
export function setupAuthInterceptor() {
  if (typeof window === "undefined" || window.__hms_auth_interceptor_set__) return;
  window.__hms_auth_interceptor_set__ = true;

  // On initial project start / tab opening, clean out any stale localStorage sessions
  try {
    localStorage.removeItem("hms_session");
  } catch (e) {}

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    if (response.status === 401) {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      if (
        !url.includes("/auth/login") &&
        !url.includes("/auth/verify-otp") &&
        !url.includes("/auth/reset-password") &&
        !url.includes("/hospitals")
      ) {
        const activeSession = getSession();
        if (activeSession && activeSession.token) {
          clearSession();
          window.dispatchEvent(
            new CustomEvent("hms_unauthorized", {
              detail: { message: "Session expired or invalid. Please sign in again." },
            })
          );
        }
      }
    }
    return response;
  };
}

// Auto-run interceptor on import
if (typeof window !== "undefined") {
  setupAuthInterceptor();
}

/**
 * Reads any incoming session passed via hash from another portal redirect.
 */
export function consumeIncomingSession() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  if (hash.includes("session=")) {
    try {
      const match = hash.match(/session=([^&]+)/);
      if (match && match[1]) {
        const decoded = JSON.parse(decodeURIComponent(match[1]));
        if (decoded?.token && decoded?.user) {
          saveSession(decoded);
          window.history.replaceState(null, "", window.location.pathname);
          return decoded;
        }
      }
    } catch (e) {
      console.error("Failed to parse incoming cross-portal session:", e);
    }
  }
  return null;
}

