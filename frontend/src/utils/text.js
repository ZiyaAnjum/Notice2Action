/**
 * Text processing and quote matching utilities.
 */

/**
 * Escapes regex special characters in a literal string.
 * @param {string} str
 * @returns {string}
 */
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalizes all whitespace runs (newlines, tabs, spaces) to a single space.
 * @param {string} str
 * @returns {string}
 */
export function normalizeWhitespace(str) {
  if (!str) return "";
  return str.replace(/\s+/g, " ").trim();
}

/**
 * Matches an evidence quote inside page text using whitespace-normalized matching.
 * Preserves the exact characters and formatting of the page text around the match.
 *
 * @param {string} pageText - Raw text of the notice page.
 * @param {string} quote - Evidence quote to search for.
 * @returns {{ hasMatch: boolean, before?: string, matched?: string, after?: string, text?: string, reason?: string }}
 */
export function findQuoteHighlight(pageText, quote) {
  if (!pageText) {
    return { hasMatch: false, text: "", reason: "This page contains no readable text." };
  }

  if (!quote || !quote.trim()) {
    return { hasMatch: false, text: pageText, reason: "No evidence quote was provided." };
  }

  const trimmedQuote = quote.trim();

  // Try direct case-insensitive match first
  const directIdx = pageText.toLowerCase().indexOf(trimmedQuote.toLowerCase());
  if (directIdx !== -1) {
    return {
      hasMatch: true,
      before: pageText.slice(0, directIdx),
      matched: pageText.slice(directIdx, directIdx + trimmedQuote.length),
      after: pageText.slice(directIdx + trimmedQuote.length),
    };
  }

    // Fallback: word-boundary whitespace normalized regex
    const words = trimmedQuote.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return { hasMatch: false, text: pageText };
    }

    const patternStr = words.map(escapeRegex).join("\\s+");
    try {
        const rx = new RegExp(patternStr, "i");
        const match = rx.exec(pageText);
        if (match) {
          const start = match.index;
          const end = start + match[0].length;
          return {
            hasMatch: true,
            before: pageText.slice(0, start),
            matched: pageText.slice(start, end),
            after: pageText.slice(end),
          };
        }
      } catch {
        // ignore regex execution failure
      }

      return { hasMatch: false, text: pageText };
    }

/**
 * Formats an ISO date string or date-only string into a clean, localized format.
 * Explicitly guards against UTC midnight timezone shifting for YYYY-MM-DD.
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
          if(!dateStr || typeof dateStr !== "string") return "Date not specified";

        const trimmed = dateStr.trim();
        const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

        if (dateOnlyMatch) {
          const year = parseInt(dateOnlyMatch[1], 10);
          const month = parseInt(dateOnlyMatch[2], 10) - 1;
          const day = parseInt(dateOnlyMatch[3], 10);
          const localDate = new Date(year, month, day);

          return localDate.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
        }

        const parsed = new Date(trimmed);
        if (isNaN(parsed.getTime())) {
          return trimmed;
        }

        return parsed.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      }

/**
 * Computes calendar countdown metrics relative to reference date (defaults to today local midnight).
 * @param {string} dateStr - Target ISO date or YYYY-MM-DD.
 * @param {Date} [referenceDate] - Baseline date for countdown calculation.
 * @returns {{ daysRemaining: number, label: string, urgency: "critical"|"urgent"|"warning"|"normal"|"overdue" } | null}
 */
export function getCountdownDetails(dateStr, referenceDate = new Date()) {
        if (!dateStr || typeof dateStr !== "string") return null;

        const trimmed = dateStr.trim();
        const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

        let targetDate;
        if (dateOnlyMatch) {
          const year = parseInt(dateOnlyMatch[1], 10);
          const month = parseInt(dateOnlyMatch[2], 10) - 1;
          const day = parseInt(dateOnlyMatch[3], 10);
          targetDate = new Date(year, month, day);
        } else {
          const parsed = new Date(trimmed);
          if (isNaN(parsed.getTime())) return null;
          targetDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
        }

        const baseDate = new Date(
          referenceDate.getFullYear(),
          referenceDate.getMonth(),
          referenceDate.getDate()
        );

        const diffMs = targetDate.getTime() - baseDate.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          const overdueCount = Math.abs(diffDays);
          return {
            daysRemaining: diffDays,
            label: overdueCount === 1 ? "Overdue by 1 day" : `Overdue by ${overdueCount} days`,
            urgency: "overdue",
          };
        }

        if (diffDays === 0) {
          return {
            daysRemaining: 0,
            label: "Due today",
            urgency: "critical",
          };
        }

        if (diffDays === 1) {
          return {
            daysRemaining: 1,
            label: "Due tomorrow (1 day left)",
            urgency: "urgent",
          };
        }

        if (diffDays <= 3) {
          return {
            daysRemaining: diffDays,
            label: `${diffDays} days left`,
            urgency: "urgent",
          };
        }

        if (diffDays <= 7) {
          return {
            daysRemaining: diffDays,
            label: `${diffDays} days left`,
            urgency: "warning",
          };
        }

        return {
          daysRemaining: diffDays,
          label: `${diffDays} days left`,
          urgency: "normal",
        };
      }
