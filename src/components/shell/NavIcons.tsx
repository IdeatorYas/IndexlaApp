export type NavIconName =
  | "Dashboard"
  | "Discover"
  | "Degen Club"
  | "Create Portfolio / Index"
  | "My Portfolio"
  | "Strategies"
  | "Leaderboard"
  | "Creators";

export function NavIcon({
  name,
  className = "h-[18px] w-[18px]",
}: {
  name: NavIconName | string;
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "Dashboard":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      );
    case "Discover":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      );
    case "Degen Club":
      return (
        <svg {...common}>
          <path d="M12 3l2.2 5.4L20 9l-4 3.4L17.5 18 12 14.8 6.5 18 8 12.4 4 9l5.8-.6L12 3z" />
        </svg>
      );
    case "Create Portfolio / Index":
    case "Create Portfolio":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case "My Portfolio":
      return (
        <svg {...common}>
          <path d="M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
          <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case "Strategies":
      return (
        <svg {...common}>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 15l3-4 3 2 4-6" />
        </svg>
      );
    case "Leaderboard":
      return (
        <svg {...common}>
          <path d="M8 21h8" />
          <path d="M12 17v4" />
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
          <path d="M5 7H3.5A1.5 1.5 0 0 0 2 8.5V9a3 3 0 0 0 3 3" />
          <path d="M19 7h1.5A1.5 1.5 0 0 1 22 8.5V9a3 3 0 0 1-3 3" />
        </svg>
      );
    case "Creators":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <circle cx="17" cy="9.5" r="2.5" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="M14 19a4 4 0 0 1 6.5-3.1" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}
