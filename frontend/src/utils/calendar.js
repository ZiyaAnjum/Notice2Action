/**
 * Calendar utilities for Notice2Action.
 * Generates RFC 5545 iCalendar files and Google Calendar URLs.
 */

/**
 * Escapes text for RFC 5545 iCalendar format.
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function escapeIcsText(text) {
  if (text == null || text === "") return "";
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Formats a Date as an RFC 5545 UTC timestamp.
 * @param {Date} [date]
 * @returns {string}
 */
export function formatIcsUtcTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(
    date.getUTCDate()
  )}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(
    date.getUTCSeconds()
  )}Z`;
}

function isValidDateOnly(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function formatUtcDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(
    date.getUTCDate()
  )}`;
}

/**
 * Parses a date-only value or ISO timestamp for calendar export.
 * Date-only events remain all-day events; timed events default to one hour.
 *
 * @param {string} dateStr
 * @returns {{ isDateOnly: boolean, dtStart: string, dtEnd: string } | null}
 */
export function formatIcsEventDates(dateStr) {
  if (typeof dateStr !== "string" || !dateStr.trim()) return null;

  const trimmed = dateStr.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    if (!isValidDateOnly(year, month, day)) return null;

    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    const start = `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
    return {
      isDateOnly: true,
      dtStart: start,
      dtEnd: formatUtcDate(nextDay),
    };
  }

  const dateTimeMatch = /^(\d{4})-(\d{2})-(\d{2})(?:T|\s)/.exec(trimmed);
  if (
    dateTimeMatch &&
    !isValidDateOnly(
      Number(dateTimeMatch[1]),
      Number(dateTimeMatch[2]),
      Number(dateTimeMatch[3])
    )
  ) {
    return null;
  }

  const parsedDate = new Date(trimmed);
  if (Number.isNaN(parsedDate.getTime())) return null;
  const endDate = new Date(parsedDate.getTime() + 60 * 60 * 1000);
  return {
    isDateOnly: false,
    dtStart: formatIcsUtcTimestamp(parsedDate),
    dtEnd: formatIcsUtcTimestamp(endDate),
  };
}

/**
 * Legacy date formatting API retained for callers from the shaza branch.
 * @param {string} dateStr
 * @returns {{ isAllDay: boolean, dtStart: string, dtEnd: string, googleDates: string } | null}
 */
export function formatCalendarDates(dateStr) {
  const dates = formatIcsEventDates(dateStr);
  if (!dates) return null;

  return {
    isAllDay: dates.isDateOnly,
    dtStart: dates.isDateOnly ? `VALUE=DATE:${dates.dtStart}` : dates.dtStart,
    dtEnd: dates.isDateOnly ? `VALUE=DATE:${dates.dtEnd}` : dates.dtEnd,
    googleDates: `${dates.dtStart}/${dates.dtEnd}`,
  };
}

/**
 * Generates an RFC 5545 compliant iCalendar string.
 * @param {{ title?: string, description?: string, dateStr: string, noticeId?: string }} options
 * @returns {string|null}
 */
export function generateIcsContent({
  title,
  description = "",
  dateStr,
  noticeId = "",
}) {
  const dates = formatIcsEventDates(dateStr);
  if (!dates) return null;

  const safeTitle = escapeIcsText(title || "Notice Deadline");
  const safeDescription = escapeIcsText(
    description || "Official notice deadline from Notice2Action."
  );
  const safeNoticeId = encodeURIComponent(String(noticeId || "notice"));
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const startProperty = dates.isDateOnly
    ? `DTSTART;VALUE=DATE:${dates.dtStart}`
    : `DTSTART:${dates.dtStart}`;
  const endProperty = dates.isDateOnly
    ? `DTEND;VALUE=DATE:${dates.dtEnd}`
    : `DTEND:${dates.dtEnd}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Notice2Action//Notice Intelligence and Action Management//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:notice2action-${safeNoticeId}-${uniqueId}@notice2action.ai`,
    `DTSTAMP:${formatIcsUtcTimestamp()}`,
    startProperty,
    endProperty,
    `SUMMARY:${safeTitle}`,
    `DESCRIPTION:${safeDescription}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Generates a Google Calendar template link.
 * @param {{ title?: string, description?: string, dateStr: string }} options
 * @returns {string|null}
 */
export function getGoogleCalendarUrl({
  title,
  description = "",
  dateStr,
}) {
  const dates = formatIcsEventDates(dateStr);
  if (!dates) return null;

  const params = [
    ["action", "TEMPLATE"],
    ["text", title || "Notice Deadline"],
    ["dates", `${dates.dtStart}/${dates.dtEnd}`],
    ["details", description || "Official notice deadline from Notice2Action."],
  ]
    .map(([key, value]) =>
      `${key}=${key === "dates" ? value : encodeURIComponent(value)}`
    )
    .join("&");
  return `https://calendar.google.com/calendar/render?${params}`;
}

/**
 * Triggers a browser download of an iCalendar file.
 * @param {string} filename
 * @param {string} icsContent
 */
export function triggerIcsDownload(filename, icsContent) {
  if (typeof window === "undefined" || !icsContent) return;

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
