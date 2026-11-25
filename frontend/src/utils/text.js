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
 * Normalizes text for robust fuzzy comparison:
 * - Unicode NFKC
 * - Replaces smart/curved quotes and dashes with ASCII
 * - Replaces non-alphanumeric punctuation with spaces
 * - Collapses whitespace
 * - Lowercases
 */
export function normalizeForFuzzyMatch(str) {
  if (!str) return "";
  return str
    .normalize("NFKC")
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”"״]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/**
 * Matches an evidence quote while preserving the original page text around it.
 * Includes the legacy found/highlighted names and the current hasMatch/matched
 * names so existing consumers on either branch retain their contract.
 *
 * Employs a 4-stage matching strategy:
 * 1. Direct substring match
 * 2. Whitespace-flexible regex word sequence match
 * 3. Punctuation-insensitive word sequence match
 * 4. Sentence-level sliding-window fuzzy overlap (>= 70% word overlap)
 *
 * @param {string} pageText - Raw text of the notice page.
 * @param {string} quote - Evidence quote to search for.
 * @returns {{ found: boolean, hasMatch: boolean, isApproximate?: boolean, before?: string, highlighted?: string, matched?: string, after?: string, text?: string, reason?: string }}
 */
export function findQuoteHighlight(pageText, quote) {
  if (!pageText) {
    return {
      found: false,
      hasMatch: false,
      isApproximate: false,
      text: "",
      reason: "This page contains no readable text.",
    };
  }

  if (!quote || !quote.trim()) {
    return {
      found: false,
      hasMatch: false,
      isApproximate: false,
      text: pageText,
      reason: "No evidence quote was provided.",
    };
  }

  const trimmedQuote = quote.trim();

  // Stage 1: Direct case-insensitive substring match
  const directIndex = pageText.toLowerCase().indexOf(trimmedQuote.toLowerCase());
  if (directIndex !== -1) {
    const matched = pageText.slice(directIndex, directIndex + trimmedQuote.length);
    return {
      found: true,
      hasMatch: true,
      isApproximate: false,
      before: pageText.slice(0, directIndex),
      highlighted: matched,
      matched,
      after: pageText.slice(directIndex + trimmedQuote.length),
    };
  }

  // Stage 2: Exact words joined by flexible whitespace
  const words = trimmedQuote.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return {
      found: false,
      hasMatch: false,
      isApproximate: false,
      text: pageText,
      reason: "Evidence quote is empty.",
    };
  }

  const pattern = words.map(escapeRegex).join("\\s+");
  const match = new RegExp(pattern, "i").exec(pageText);
  if (match && typeof match.index === "number") {
    const start = match.index;
    const end = start + match[0].length;
    return {
      found: true,
      hasMatch: true,
      isApproximate: false,
      before: pageText.slice(0, start),
      highlighted: match[0],
      matched: match[0],
      after: pageText.slice(end),
    };
  }

  // Stage 3: Relaxed punctuation sequence match
  const cleanWords = words
    .map((w) => w.replace(/[^\w]/g, ""))
    .filter(Boolean);
  if (cleanWords.length > 0) {
    const cleanPattern = cleanWords.map(escapeRegex).join("[\\s\\W]+");
    try {
      const match2 = new RegExp(cleanPattern, "i").exec(pageText);
      if (match2 && typeof match2.index === "number") {
        const start = match2.index;
        const end = start + match2[0].length;
        return {
          found: true,
          hasMatch: true,
          isApproximate: true,
          before: pageText.slice(0, start),
          highlighted: match2[0],
          matched: match2[0],
          after: pageText.slice(end),
        };
      }
    } catch {
      // Ignore invalid regex patterns
    }
  }

  // Stage 4: Sentence / clause sliding fuzzy overlap
  const qTokens = new Set(
    normalizeForFuzzyMatch(trimmedQuote).split(" ").filter(Boolean)
  );
  if (qTokens.size > 0) {
    const clauseRegex = /[^.!?\n]+[.!?\n]*/g;
    let m;
    let bestStart = -1;
    let bestEnd = -1;
    let bestOverlap = 0;

    while ((m = clauseRegex.exec(pageText)) !== null) {
      const clause = m[0];
      const cTokens = new Set(
        normalizeForFuzzyMatch(clause).split(" ").filter(Boolean)
      );
      if (!cTokens.size) continue;
      let inter = 0;
      for (const t of qTokens) {
        if (cTokens.has(t)) inter++;
      }
      const overlap = inter / qTokens.size;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestStart = m.index;
        bestEnd = m.index + clause.length;
      }
    }

    if (bestOverlap >= 0.70 && bestStart !== -1) {
      // Trim surrounding whitespace from highlight while maintaining exact slices
      const rawMatch = pageText.slice(bestStart, bestEnd);
      const matchLeading = rawMatch.match(/^\s*/)?.[0] || "";
      const matchTrailing = rawMatch.match(/\s*$/)?.[0] || "";
      const actualStart = bestStart + matchLeading.length;
      const actualEnd = bestEnd - matchTrailing.length;
      const matched = pageText.slice(actualStart, actualEnd);

      return {
        found: true,
        hasMatch: true,
        isApproximate: true,
        before: pageText.slice(0, actualStart),
        highlighted: matched,
        matched,
        after: pageText.slice(actualEnd),
      };
    }
  }

  return {
    found: false,
    hasMatch: false,
    isApproximate: false,
    text: pageText,
    reason: "The exact quote was not found on this page. Showing full page text.",
  };
}

/**
 * Formats an ISO date string or date-only string without timezone drift.
 * Invalid date-only values are returned unchanged rather than normalized.
 * @param {string|null|undefined} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (typeof dateStr !== "string" || !dateStr.trim()) return "Date not specified";

  const trimmed = dateStr.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  let date;

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    date = new Date(year, month, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month ||
      date.getDate() !== day
    ) {
      return trimmed;
    }
  } else {
    const dateTimeMatch = /^(\d{4})-(\d{2})-(\d{2})(?:T|\s)/.exec(trimmed);
    if (
      dateTimeMatch &&
      !isValidLocalDate(
        Number(dateTimeMatch[1]),
        Number(dateTimeMatch[2]) - 1,
        Number(dateTimeMatch[3])
      )
    ) {
      return trimmed;
    }
    date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return trimmed;
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isValidLocalDate(year, month, day) {
  const date = new Date(year, month, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
  );
}

/**
 * Computes calendar countdown metrics relative to a local calendar day.
 * @param {string|null|undefined} dateStr - Target ISO date or date-time.
 * @param {Date} [referenceDate] - Baseline date for countdown calculation.
 * @returns {{ daysRemaining: number, label: string, urgency: "critical"|"urgent"|"warning"|"normal"|"overdue", isOverdue: boolean } | null}
 */
export function getCountdownDetails(dateStr, referenceDate = new Date()) {
  if (typeof dateStr !== "string" || !dateStr.trim()) return null;

  const trimmed = dateStr.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
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
    const dateTimeMatch = /^(\d{4})-(\d{2})-(\d{2})(?:T|\s)/.exec(trimmed);
    if (
      dateTimeMatch &&
      !isValidLocalDate(
        Number(dateTimeMatch[1]),
        Number(dateTimeMatch[2]) - 1,
        Number(dateTimeMatch[3])
      )
    ) {
      return null;
    }
    const parsedDate = new Date(trimmed);
    if (Number.isNaN(parsedDate.getTime())) return null;
    targetDate = new Date(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate()
    );
  }

  const referenceMidnight = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const daysRemaining = Math.round(
    (targetDate.getTime() - referenceMidnight.getTime()) / (1000 * 60 * 60 * 24)
  );
  const isOverdue = daysRemaining < 0;

  if (isOverdue) {
    const daysOverdue = Math.abs(daysRemaining);
    return {
      daysRemaining,
      label:
        daysOverdue === 1
          ? "Overdue by 1 day"
          : `Overdue by ${daysOverdue} days`,
      urgency: "overdue",
      isOverdue,
    };
  }

  if (daysRemaining === 0) {
    return {
      daysRemaining: 0,
      label: "Due today",
      urgency: "critical",
      isOverdue,
    };
  }

  if (daysRemaining === 1) {
    return {
      daysRemaining,
      label: "Due tomorrow (1 day left)",
      urgency: "urgent",
      isOverdue,
    };
  }

  if (daysRemaining <= 3) {
    return {
      daysRemaining,
      label: `${daysRemaining} days left`,
      urgency: "urgent",
      isOverdue,
    };
  }

  if (daysRemaining <= 7) {
    return {
      daysRemaining,
      label: `${daysRemaining} days left`,
      urgency: "warning",
      isOverdue,
    };
  }

  return {
    daysRemaining,
    label: `${daysRemaining} days left`,
    urgency: "normal",
    isOverdue,
  };
}
