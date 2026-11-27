/**
 * Single source of truth for Eventis email branding. Values mirror the
 * primary brand color already used by the mobile app (constants/colors.ts)
 * and the admin console (app/globals.css) so emails stay visually
 * consistent with the rest of the product.
 */
export const BRAND = {
  appName: "Eventis",
  tagline: "Discover. Connect. Experience.",
  primary: "#0284c7",
  primaryDark: "#0369a1",
  accent: "#38bdf8",
  tint: "#f0f9ff",
  background: "#f0f4fa",
  cardBorder: "#dfe7f1",
  ink: "#0a1022",
  muted: "#5c6478",
  mutedLight: "#7b8496",
  divider: "#e8edf4",
  badgeBg: "#e0f2fe",
  logoUrl:
    "https://res.cloudinary.com/ds34h7zrm/image/upload/v1795686324/eventis/email-logo.png",
} as const;
