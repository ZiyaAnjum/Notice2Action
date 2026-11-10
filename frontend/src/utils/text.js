/**
 * Text processing, quote matching, and date calculation utilities.
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
 * @returns {{ found: boolean, before?: string, highlighted?: string, after?: string, text?: string, reason?: string }}
 */
export function findQuoteHighlight(pageText, quote) {
  if (!pageText) {
    return { found: false, text: "", reason: "This page contains no readable text." };
  }

  if (!quote || !quote.trim()) {
    return { found: false, text: pageText, reason: "No evidence quote was provided." };
  }

  const trimmedQuote = quote.trim();

  // Try direct case-insensitive match first
  const directIdx = pageText.toLowerCase().indexOf(trimmedQuote.toLowerCase());
  if (directIdx !== -1) {
    return {
      found: true,
      before: pageText.slice(0, directIdx),
      highlighted: pageText.slice(directIdx, directIdx + trimmedQuote.length),
      after: pageText.slice(directIdx + trimmedQuote.length),
    };
  }

  // Tokenize quote by whitespace and build a flexible regex matching any whitespace between words
  const tokens = trimmedQuote
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => escapeRegex(t));

  if (tokens.length === 0) {
    return { found: false, text: pageText, reason: "Evidence quote is empty." };
  }

  try {
    const pattern = tokens.join("\\s+");
    const regex = new RegExp(pattern, "i");
    const match = regex.exec(pageText);

    if (match && typeof match.index === "number") {
      const matchIndex = match.index;
      const matchLength = match[0].length;
      return {
        found: true,
        before: pageText.slice(0, matchIndex),
        highlighted: pageText.slice(matchIndex, matchIndex + matchLength),
        after: pageText.slice(matchIndex + matchLength),
      };
    }
  } catch {
    // Regex construction failure fallback
  }

  return {
    found: false,
    text: pageText,
    reason: "The exact quote was not found on this page. Showing full page text.",
  };
}

/**
 * Formats a date string into a friendly, readable format.
 * Accurately parses date-only YYYY-MM-DD values in local time to avoid timezone drift.
 *
 * @param {string|null} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return "Not specified";
  try {
    const trimmed = String(dateStr).trim();
    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let d;
    if (dateOnlyMatch) {
      d = new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]));
      if (
  d.getFullYear() !== Number(dateOnlyMatch[1]) ||
  d.getMonth() !== Number(dateOnlyMatch[2]) - 1 ||
  d.getDate() !== Number(dateOnlyMatch[3])
) {
  return dateStr;
}
    } else {
      d = new Date(trimmed);
    }
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Calculates countdown and urgency state for a given deadline date.
 * Handles date-only values (YYYY-MM-DD) against local calendar midnight to prevent timezone skew.
 *
 * @param {string|null} dateStr - Target date string.
 * @param {Date} [referenceDate=new Date()] - Baseline date (defaults to current time).
 * @returns {{ daysRemaining: number, label: string, urgency: "critical"|"urgent"|"warning"|"normal"|"overdue", isOverdue: boolean } | null}
 */
export function getCountdownDetails(dateStr, referenceDate = new Date()) {
  if (!dateStr || typeof dateStr !== "string") return null;

  const trimmed = dateStr.trim();
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let targetDate;

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    targetDate = new Date(year, month, day);
    if (
  targetDate.getFullYear() !== year ||
  targetDate.getMonth() !== month ||
  targetDate.getDate() !== day
) {
  return null;
}
  } else {
    targetDate = new Date(trimmed);
    if (isNaN(targetDate.getTime())) return null;
  }

  // Compare on whole calendar days (local midnight) to avoid partial day artifacts
  const targetMidnight = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const refMidnight = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  const diffMs = targetMidnight.getTime() - refMidnight.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    return {
      daysRemaining: diffDays,
      label: absDays === 1 ? "Overdue by 1 day" : `Overdue by ${absDays} days`,
      urgency: "overdue",
      isOverdue: true,
    };
  }

  if (diffDays === 0) {
    return {
      daysRemaining: 0,
      label: "Due today",
      urgency: "critical",
      isOverdue: false,
    };
  }

  if (diffDays === 1) {
    return {
      daysRemaining: 1,
      label: "Due tomorrow (1 day left)",
      urgency: "critical",
      isOverdue: false,
    };
  }

  if (diffDays <= 3) {
    return {
      daysRemaining: diffDays,
      label: `${diffDays} days left`,
      urgency: "urgent",
      isOverdue: false,
    };
  }

  if (diffDays <= 7) {
    return {
      daysRemaining: diffDays,
      label: `${diffDays} days left`,
      urgency: "warning",
      isOverdue: false,
    };
  }

  return {
    daysRemaining: diffDays,
    label: `${diffDays} days left`,
    urgency: "normal",
    isOverdue: false,
  };
}
