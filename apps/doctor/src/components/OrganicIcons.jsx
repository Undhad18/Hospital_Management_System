import React from "react";

// Handcrafted organic icons with natural curves and human feel
export function OrganicCross({ className = "w-6 h-6", strokeWidth = 2.2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M12 4.2c.4 2.8-.2 9.5 0 15.6M4.5 11.8c2.9.2 9.4-.3 15 0"
      />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function OrganicHospital({ className = "w-5 h-5", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      {/* Organic building outline with slight natural slope */}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M3.8 21.2h16.4M5.2 21.2V6.4c0-1.2.9-2.1 2.2-2.3l9.2-.2c1.3.1 2.2 1.1 2.2 2.3v15"
      />
      {/* Arch door */}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M10 21.2v-4.5c0-1.1.9-2 2-2s2 .9 2 2v4.5"
      />
      {/* Organic hospital cross on facade */}
      <path
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        d="M12 7.8v3.4M10.3 9.5h3.4"
      />
      {/* Windows */}
      <circle cx="7.8" cy="14" r=".9" fill="currentColor" />
      <circle cx="16.2" cy="14" r=".9" fill="currentColor" />
    </svg>
  );
}

export function OrganicHeartPulse({ className = "w-5 h-5", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M3.2 12.8h4.2l2.3-5.2c.3-.7 1.3-.8 1.7-.1l3.2 9.2 2.1-4.8c.2-.5.8-.8 1.3-.7h3.2"
      />
      <path
        strokeLinecap="round"
        strokeWidth={strokeWidth - 0.5}
        opacity="0.4"
        d="M12 4.2c-2.4-2.2-6.2-1.3-7.5 1.7-1.1 2.5-.1 5.3 1.8 7.3l5.7 5.6 5.8-5.6c1.9-2 2.9-4.8 1.8-7.3-1.3-3-5.1-3.9-7.6-1.7z"
      />
    </svg>
  );
}

export function OrganicClock({ className = "w-5 h-5", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      {/* Slightly organic imperfect circular loop */}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M12 3.5c4.8-.2 8.7 3.5 8.9 8.3.2 4.9-3.6 8.9-8.5 9-4.9.1-8.9-3.7-8.9-8.6 0-4.7 3.7-8.5 8.5-8.7z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M12 7.8v4.6l3.2 2.2"
      />
      <circle cx="12" cy="12.4" r="1" fill="currentColor" />
    </svg>
  );
}

export function OrganicShield({ className = "w-5 h-5", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M12 3.8s5.8 1.4 7.6 2.3c.3 3.6-.2 9.2-3.8 12.7-2.3 2.2-3.8 2.8-3.8 2.8s-1.5-.6-3.8-2.8c-3.6-3.5-4.1-9.1-3.8-12.7C6.2 5.2 12 3.8 12 3.8z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M9.8 11.8l1.8 2 3.6-3.8"
      />
    </svg>
  );
}

export function OrganicUsers({ className = "w-5 h-5", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      {/* Primary figure */}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M9.5 11.2a3.8 3.8 0 100-7.6 3.8 3.8 0 000 7.6z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M3.5 19.8c.4-3.5 3.3-5.8 6.5-5.8s6.1 2.3 6.5 5.8"
      />
      {/* Secondary companion */}
      <path
        strokeLinecap="round"
        strokeWidth={strokeWidth - 0.4}
        d="M16.5 7.5a2.8 2.8 0 100-5.6"
      />
      <path
        strokeLinecap="round"
        strokeWidth={strokeWidth - 0.4}
        d="M18.5 17.5c1.6-.4 2.8-1.8 3-3.6.1-1.6-.9-3-2.5-3.5"
      />
    </svg>
  );
}

export function OrganicDepartment({ className = "w-5 h-5", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M4.2 8.5a2 2 0 012-2h11.6a2 2 0 012 2v9.5a2 2 0 01-2 2H6.2a2 2 0 01-2-2V8.5z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M8.5 6.5V4.6a1.8 1.8 0 011.8-1.8h3.4a1.8 1.8 0 011.8 1.8v1.9M4.5 12.5h15"
      />
      <circle cx="12" cy="16" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function OrganicKey({ className = "w-5 h-5", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle
        cx="8.5"
        cy="14"
        r="4.5"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M12 11l7.8-7.8c.6-.6 1.6-.6 2.2 0l0 0M17.5 5.5l2 2M15 8l1.8 1.8"
      />
    </svg>
  );
}

export function OrganicCheck({ className = "w-4 h-4", strokeWidth = 2.5 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M4.8 12.6l4.8 5.1L19.2 6.5"
      />
    </svg>
  );
}

export function OrganicPhone({ className = "w-4 h-4", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M4.5 5.8c.2 3.8 2.8 7.8 6.4 10.4 2.2 1.6 4.8 2.4 6.8 2.3.8 0 1.6-.4 2-.9l1.4-1.8c.6-.8.4-1.9-.3-2.5l-2.8-2.2c-.7-.5-1.7-.4-2.2.3l-.8 1c-.3.4-.9.6-1.4.3-1.6-.9-3.2-2.5-4.1-4.1-.3-.5-.1-1.1.3-1.4l1-.8c.7-.5.8-1.5.3-2.2L8.9 4.1c-.6-.7-1.7-.9-2.5-.3L4.6 5.2c-.4.4-.7 1-.1 1.6z"
      />
    </svg>
  );
}

export function OrganicMail({ className = "w-4 h-4", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M4.2 6.5h15.6a1.8 1.8 0 011.8 1.8v10a1.8 1.8 0 01-1.8 1.8H4.2a1.8 1.8 0 01-1.8-1.8v-10a1.8 1.8 0 011.8-1.8z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M3.2 8.2l7.9 6.2c.5.4 1.3.4 1.8 0l7.9-6.2"
      />
    </svg>
  );
}

export function OrganicPin({ className = "w-4 h-4", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M12 21.2s-6.5-6.2-6.5-11.2a6.5 6.5 0 1113 0c0 5-6.5 11.2-6.5 11.2z"
      />
      <circle cx="12" cy="10" r="2.2" strokeWidth={strokeWidth - 0.5} />
    </svg>
  );
}

export function OrganicQr({ className = "w-5 h-5", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      {/* Hand-drawn corner bracket markers */}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M4 8V4.8C4 4.4 4.4 4 4.8 4H8M16 4h3.2c.4 0 .8.4.8.8V8M4 16v3.2c0 .4.4.8.8.8H8M16 20h3.2c.4 0 .8-.4.8-.8V16"
      />
      <rect x="7" y="7" width="3" height="3" rx="0.8" fill="currentColor" />
      <rect x="14" y="7" width="3" height="3" rx="0.8" fill="currentColor" />
      <rect x="7" y="14" width="3" height="3" rx="0.8" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function OrganicSparkle({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.5c.3 4 3 6.7 7 7-4 .3-6.7 3-7 7-.3-4-3-6.7-7-7 4-.3 6.7-3 7-7z" />
    </svg>
  );
}

export function OrganicUnderline({ className = "w-32 h-3" }) {
  return (
    <svg className={className} viewBox="0 0 120 12" fill="none">
      <path
        d="M2.5 8.2c22-3.8 54-4.5 76-2.8 14 1.1 29 3.2 39 1.4"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function OrganicSignOut({ className = "w-5 h-5", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M15.5 16.5l4-4-4-4M19 12.5H8.5"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M12.5 5.5h-5c-1.3 0-2.3 1-2.3 2.3v9.4c0 1.3 1 2.3 2.3 2.3h5"
      />
    </svg>
  );
}

export function OrganicEdit({ className = "w-4 h-4", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M15.2 4.6l4.2 4.2M4.5 19.5l3.8-.8 11.4-11.4a2 2 0 000-2.8l-1.8-1.8a2 2 0 00-2.8 0L3.7 14.1l-.8 4.2 1.6 1.2z"
      />
    </svg>
  );
}

export function OrganicCamera({ className = "w-5 h-5", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M4.2 8.5a2 2 0 012-2h1.8l1.4-2.2a1.8 1.8 0 011.5-.8h4.2a1.8 1.8 0 011.5.8l1.4 2.2h1.8a2 2 0 012 2v9.4a2 2 0 01-2 2H6.2a2 2 0 01-2-2V8.5z"
      />
      <circle cx="12" cy="13.2" r="3.2" strokeWidth={strokeWidth} />
    </svg>
  );
}


// Additional clinical SVG icons
export function OrganicBed({ className = "w-5 h-5", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M3 19v-8a2 2 0 012-2h14a2 2 0 012 2v8M3 19h18M3 19v2M21 19v2M7 9V7a2 2 0 012-2h2a2 2 0 012 2v2" />
    </svg>
  );
}

export function OrganicStethoscope({ className = "w-5 h-5", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M6 3v5a6 6 0 0012 0V3M9 19a3 3 0 106 0v-4a3 3 0 00-3-3M6 3h2M16 3h2" />
    </svg>
  );
}

export function OrganicPill({ className = "w-5 h-5", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M10.5 5.5l8 8a4.95 4.95 0 11-7 7l-8-8a4.95 4.95 0 017-7zM7.5 12.5l7-7" />
    </svg>
  );
}

export function OrganicLab({ className = "w-5 h-5", strokeWidth = 2 }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M19.4 18.2L14 9V4h1a1 1 0 000-2H9a1 1 0 000 2h1v5L4.6 18.2A3 3 0 007.2 22h9.6a3 3 0 002.6-3.8z" />
    </svg>
  );
}
