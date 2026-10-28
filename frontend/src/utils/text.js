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
 * Formats an ISO date string into a friendly, readable format.
 * @param {string|null} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return "Not specified";
  try {
    const d = new Date(dateStr);
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
