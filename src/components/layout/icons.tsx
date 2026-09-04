type IconProps = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconDashboard = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <rect x="3" y="3" width="7" height="8" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="11" width="7" height="10" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

export const IconEmployees = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20a5.7 5.7 0 0 1 11 0" />
    <path d="M16 5.4a3 3 0 0 1 0 5.6M17.5 20a5.6 5.6 0 0 0-2-4.3" />
  </svg>
);

export const IconVisit = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M8 3v3M16 3v3" />
    <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
    <path d="M12 11v5M9.5 13.5h5" />
  </svg>
);

export const IconLab = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M9.5 3v6.2L4.9 17a2.2 2.2 0 0 0 1.9 3.3h10.4A2.2 2.2 0 0 0 19.1 17l-4.6-7.8V3" />
    <path d="M8.5 3h7M7.2 14.5h9.6" />
  </svg>
);

export const IconImport = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 3v11M8.2 10.2 12 14l3.8-3.8" />
    <path d="M4 16.5v2A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-2" />
  </svg>
);

export const IconVaccine = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="m14.5 3.5 6 6M18 6 8.5 15.5 5 16.5l1-3.5L15.5 3.5" />
    <path d="m10.5 8.5 5 5M4 20l2-2" />
  </svg>
);

export const IconNeedleStick = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="m14.8 3.8 5.4 5.4M17.5 6.5l-7.7 7.7-3.1.8.8-3.1 7.7-7.7" />
    <path d="m9.8 10.2 4 4M4 20l2.7-2.7M3.5 16.5l4 4" />
  </svg>
);

export const IconDue = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </svg>
);

export const IconReports = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M6 3.5h8l5 5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
    <path d="M13.5 3.5V9H19M8 13h8M8 16.5h5" />
  </svg>
);

export const IconUsers = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
  </svg>
);

export const IconAudit = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M5 4.5h11l3.5 3.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5Z" />
    <path d="M7.5 9h6M7.5 12.5h9M7.5 16h4" />
  </svg>
);

export const IconSearch = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
);

export const IconPlus = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 5.5v13M5.5 12h13" />
  </svg>
);

export const IconAlert = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 4.5 3.5 19h17L12 4.5Z" />
    <path d="M12 10v4M12 16.6v.1" />
  </svg>
);

export const IconCheck = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const IconX = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const IconSun = ({ size = 17 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
  </svg>
);

export const IconMoon = ({ size = 17 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z" />
  </svg>
);

export const IconLogout = ({ size = 17 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M14 7.5V5.5A1.5 1.5 0 0 0 12.5 4h-6A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20h6a1.5 1.5 0 0 0 1.5-1.5v-2" />
    <path d="M10 12h10m0 0-3-3m3 3-3 3" />
  </svg>
);

export const IconMenu = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const IconAllergy = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 3.5c2.6 2.4 5.5 4.4 5.5 8.2a5.5 5.5 0 1 1-11 0c0-3.8 2.9-5.8 5.5-8.2Z" />
    <path d="M12 16.6v.1M12 10.5v3" />
  </svg>
);
