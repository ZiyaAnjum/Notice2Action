/**
 * Calendar utilities for Notice to Action.
 * Generates RFC 5545 compliant iCalendar (.ics) files and Google Calendar URLs.
 * Strictly respects date-only formats without assuming unknown times.
 */

/**
 * Escapes text for RFC 5545 iCalendar format.
 * Semicolons, commas, backslashes, and newlines must be backslash-escaped.
 * @param {string} text
 * @returns {string}
 */
export function escapeIcsText(text) {
  if (!text) return "";
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Parses a date or date-time string into RFC 5545 date formats.
 * Handles date-only values (YYYY-MM-DD) without assuming an unknown time.
 * For all-day events, DTEND is the next calendar day per RFC 5545 §3.6.1.
 *
 * @param {string} dateStr - Date string (YYYY-MM-DD or ISO timestamp).
 * @returns {{ isAllDay: boolean, dtStart: string, dtEnd: string, googleDates: string } | null}
 */
export function formatCalendarDates(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;

  const trimmed = dateStr.trim();

  // 1. Check for Date-only format (YYYY-MM-DD)
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    const dateCheck = new Date(Date.UTC(year, month - 1, day));

    if (
      dateCheck.getUTCFullYear() !== year ||
      dateCheck.getUTCMonth() !== month - 1 ||
      dateCheck.getUTCDate() !== day
    ) {
      return null;
    }

    const yStr = String(year).padStart(4, "0");
    const mStr = String(month).padStart(2, "0");
    const dStr = String(day).padStart(2, "0");
    const dtStart = `${yStr}${mStr}${dStr}`;

    // Calculate next day for DTEND in all-day RFC 5545 events
    const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
    const nextY = String(nextDate.getUTCFullYear()).padStart(4, "0");
    const nextM = String(nextDate.getUTCMonth() + 1).padStart(2, "0");
    const nextD = String(nextDate.getUTCDate()).padStart(2, "0");
    const dtEnd = `${nextY}${nextM}${nextD}`;

    return {
      isAllDay: true,
      dtStart: `VALUE=DATE:${dtStart}`,
      dtEnd: `VALUE=DATE:${dtEnd}`,
      googleDates: `${dtStart}/${dtEnd}`,
    };
  }

  // 2. Date-time format
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) {
    return null;
  }

  // UTC formatting for timed events
  const pad = (n) => String(n).padStart(2, "0");
  const y = parsed.getUTCFullYear();
  const m = pad(parsed.getUTCMonth() + 1);
  const d = pad(parsed.getUTCDate());
  const h = pad(parsed.getUTCHours());
  const min = pad(parsed.getUTCMinutes());
  const s = pad(parsed.getUTCSeconds());

  const startUtc = `${y}${m}${d}T${h}${min}${s}Z`;

  // Default duration of 1 hour for timed deadlines
  const endDate = new Date(parsed.getTime() + 60 * 60 * 1000);
  const endY = endDate.getUTCFullYear();
  const endM = pad(endDate.getUTCMonth() + 1);
  const endD = pad(endDate.getUTCDate());
  const endH = pad(endDate.getUTCHours());
  const endMin = pad(endDate.getUTCMinutes());
  const endS = pad(endDate.getUTCSeconds());

  const endUtc = `${endY}${endM}${endD}T${endH}${endMin}${endS}Z`;

  return {
    isAllDay: false,
    dtStart: startUtc,
    dtEnd: endUtc,
    googleDates: `${startUtc}/${endUtc}`,
  };
}

/**
 * Generates an RFC 5545 compliant iCalendar string.
 * @param {object} params
 * @param {string} params.title - Event summary.
 * @param {string} [params.description] - Event details.
 * @param {string} params.dateStr - Date or date-time string.
 * @param {string} [params.noticeId] - Notice ID for UID creation.
 * @returns {string|null} RFC 5545 formatted text, or null if date is invalid.
 */
export function generateIcsContent({ title, description, dateStr, noticeId }) {
  const dates = formatCalendarDates(dateStr);
  if (!dates) return null;

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dtStamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(
    now.getUTCDate()
  )}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const safeUid = `notice-${noticeId ? encodeURIComponent(noticeId) : Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}@notice2action.ai`;

  const safeTitle = escapeIcsText(title || "Notice Deadline");
  const safeDesc = escapeIcsText(description || "Official notice deadline from Notice to Action.");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Action4AI//Notice to Action//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${safeUid}`,
    `DTSTAMP:${dtStamp}`,
    dates.isAllDay ? `DTSTART;${dates.dtStart}` : `DTSTART:${dates.dtStart}`,
    dates.isAllDay ? `DTEND;${dates.dtEnd}` : `DTEND:${dates.dtEnd}`,
    `SUMMARY:${safeTitle}`,
    `DESCRIPTION:${safeDesc}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

/**
 * Generates a Google Calendar template link.
 * @param {object} params
 * @param {string} params.title
 * @param {string} [params.description]
 * @param {string} params.dateStr
 * @returns {string|null} URL string or null if invalid.
 */
export function getGoogleCalendarUrl({ title, description, dateStr }) {
  const dates = formatCalendarDates(dateStr);
  if (!dates) return null;

  const text = encodeURIComponent(title || "Notice Deadline");
  const details = encodeURIComponent(description || "Official notice deadline from Notice to Action.");

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates.googleDates}&details=${details}`;
}

/**
 * Triggers browser download of an iCalendar .ics file.
 * @param {string} filename - Target filename (e.g. deadline.ics).
 * @param {string} icsContent - RFC 5545 iCalendar content.
 */
export function triggerIcsDownload(filename, icsContent) {
  if (!icsContent || typeof window === "undefined") return;

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
