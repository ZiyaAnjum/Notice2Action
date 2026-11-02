import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DeadlineCard } from "../components/DeadlineCard";

describe("DeadlineCard Component", () => {
  it("renders scholarship-style staged deadlines without conflict flag", () => {
    const stagedDeadlines = [
      {
        description: "Application submission without late fee",
        iso_date: "2026-11-30",
        original_wording: "Last date of submission without fine is 30 November 2026",
        role: "primary",
        is_ambiguous: false,
        status: "found",
      },
      {
        description: "Submission with late fee of Rs. 100",
        iso_date: "2026-12-15",
        original_wording: "Submission with late fee of Rs. 100 allowed until 15 December 2026",
        role: "extended",
        is_ambiguous: false,
        status: "found",
      },
    ];

    render(<DeadlineCard deadlines={stagedDeadlines} />);

    // Primary deadline is labelled as Primary Deadline
    expect(screen.getByText("Primary Deadline")).toBeInTheDocument();

    // Extended deadline is labelled as a later date with a fee
    expect(screen.getByText("Later date with fee")).toBeInTheDocument();

    // Conflict and ambiguous badges must NOT be displayed
    expect(screen.queryByText(/Check which date applies/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ambiguous Deadline/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/conflicting/i)).not.toBeInTheDocument();
  });

  it("renders electricity-style two primary dates with 'Check which date applies' message", () => {
    const conflictReason =
      "The notice gives two different dates (2026-11-18 for Last date without surcharge, 2026-11-20 for Bill due date). Please check which one applies to you.";

    const conflictingDeadlines = [
      {
        description: "Last date without surcharge",
        iso_date: "2026-11-18",
        role: "primary",
        status: "conflicting",
        is_ambiguous_or_conflicting: true,
        ambiguity_reason: conflictReason,
      },
      {
        description: "Bill due date",
        iso_date: "2026-11-20",
        role: "primary",
        status: "conflicting",
        is_ambiguous_or_conflicting: true,
        ambiguity_reason: conflictReason,
      },
    ];

    render(<DeadlineCard deadlines={conflictingDeadlines} />);

    // Should display 'Check which date applies' badge rather than 'conflicting'
    const conflictBadges = screen.getAllByText("Check which date applies");
    expect(conflictBadges.length).toBe(2);

    // Should display the explanation message naming both dates and asking user to check
    expect(
      screen.getAllByText((content) =>
        content.includes("The notice gives two different dates") &&
        content.includes("Please check which one applies to you")
      ).length
    ).toBeGreaterThanOrEqual(1);

    // Literal 'conflicting' label should NOT be shown in the UI badge
    expect(screen.queryByText(/^conflicting$/i)).not.toBeInTheDocument();
  });

  it("renders empty state when no deadlines are present", () => {
    render(<DeadlineCard deadlines={[]} />);
    expect(screen.getByText("No deadline was found in this notice.")).toBeInTheDocument();
  });
});

