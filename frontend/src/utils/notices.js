function readText(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return "";

  for (const key of ["value", "text", "label", "level"]) {
    if (typeof value[key] === "string" && value[key].trim()) {
      return value[key].trim();
    }
  }
  return "";
}

export function getNoticeField(notice, keys) {
  const result =
    notice?.result && typeof notice.result === "object" ? notice.result : {};

  for (const record of [notice, result]) {
    for (const key of keys) {
      const text = readText(record?.[key]);
      if (text) return text;
    }
  }

  return "";
}

export function getNoticeDeadlines(notice) {
  const result =
    notice?.result && typeof notice.result === "object" ? notice.result : {};
  const summary =
    getNoticeField(notice, ["deadline_summary", "deadline_text"]);

  if (summary) return summary;

  const deadlines = Array.isArray(result.deadlines) ? result.deadlines : [];
  return deadlines
    .map((deadline) => {
      const label = readText(deadline?.label || deadline?.description);
      const date = readText(deadline?.iso_date || deadline?.date);
      const wording = readText(deadline?.original_text || deadline?.wording);
      return [label, date || wording].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .join(" · ");
}

export function getNoticePriority(notice) {
  return getNoticeField(notice, ["priority", "priority_level", "urgency"]);
}

export function isHighPriorityNotice(notice) {
  return ["high", "urgent", "critical"].includes(
    getNoticePriority(notice).toLowerCase()
  );
}
