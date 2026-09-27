// Dates are formatted in one fixed time zone (US Eastern) so the server
// (which runs in UTC) and the browser render exactly the same text. Otherwise
// a lesson recorded late in the evening shows different days on each side
// and React reports a hydration mismatch.
export const DISPLAY_TIME_ZONE = "America/New_York";

export function formatDate(date: Date | string, opts: Intl.DateTimeFormatOptions, locale = "en-US"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  try {
    return d.toLocaleDateString(locale, { ...opts, timeZone: DISPLAY_TIME_ZONE });
  } catch {
    return d.toLocaleDateString("en-US", { ...opts, timeZone: DISPLAY_TIME_ZONE });
  }
}

export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: DISPLAY_TIME_ZONE });
}
