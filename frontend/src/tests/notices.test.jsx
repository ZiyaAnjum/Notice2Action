import { describe, expect, it } from "vitest";
import {
  getNoticeDeadlines,
  getNoticeField,
  getNoticePriority,
  isHighPriorityNotice,
} from "../utils/notices";

describe("notice metadata helpers", () => {
  it("reads only metadata provided by the list record or extracted result", () => {
    const notice = {
      title: "Water service update",
      category: "utility",
      result: {
        issuing_organisation: { value: "Regional Water Board", status: "found" },
        notice_type: "Service interruption",
        issue_date: { value: "2026-10-28", status: "found" },
      },
    };

    expect(getNoticeField(notice, ["title", "notice_title"])).toBe(
      "Water service update"
    );
    expect(
      getNoticeField(notice, ["source_organisation", "issuing_organisation"])
    ).toBe("Regional Water Board");
    expect(getNoticeField(notice, ["notice_type"])).toBe("Service interruption");
    expect(getNoticeField(notice, ["issue_date"])).toBe("2026-10-28");
    expect(getNoticeField(notice, ["priority"])).toBe("");
  });

  it("returns deadline information without inventing a date", () => {
    const notice = {
      result: {
        deadlines: [
          {
            label: "Verification window",
            original_text: "within seven working days",
            status: "ambiguous",
            iso_date: null,
          },
        ],
      },
    };

    expect(getNoticeDeadlines(notice)).toBe(
      "Verification window: within seven working days"
    );
  });

  it("treats a notice as high priority only when the service returns that rating", () => {
    expect(isHighPriorityNotice({ priority: "High" })).toBe(true);
    expect(isHighPriorityNotice({ priority: { value: "critical" } })).toBe(true);
    expect(isHighPriorityNotice({ needs_verification: true })).toBe(false);
    expect(getNoticePriority({ priority: null })).toBe("");
  });
});
