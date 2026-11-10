import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
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
    expect(screen.getAllByRole("button", { name: /Add to Calendar/i })).toHaveLength(2);
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

  it("renders Add to Calendar button and toggles download/web options", async () => {
    const singleDeadline = [
      {
        description: "Pay municipal property tax",
        iso_date: "2026-12-31",
        original_wording: "Payment due by 31-12-2026",
        role: "primary",
        status: "found",
      },
    ];

    render(
      <DeadlineCard
        deadlines={singleDeadline}
        noticeTitle="Property Tax Demand"
        noticeId="notice-123"
      />
    );

    const calendarBtn = screen.getByRole("button", { name: /Add to Calendar/i });
    expect(calendarBtn).toBeInTheDocument();

    // Click to open calendar options menu
    const user = userEvent.setup();
    await user.click(calendarBtn);

    expect(screen.getByText(/Download \.ics File/i)).toBeInTheDocument();
    expect(screen.getByText(/Google Calendar/i)).toBeInTheDocument();
    // Escape should close the menu
await user.keyboard("{Escape}");
expect(screen.queryByRole("menu")).not.toBeInTheDocument();

// Outside click should also close the menu
await user.click(calendarBtn);
await user.click(document.body);
expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
    it("hides Add to Calendar for conflicting, ambiguous, and uncertain deadlines", () => {
    const deadlines = [
      {
        description: "Conflicting deadline",
        iso_date: "2026-11-18",
        status: "conflicting",
      },
      {
        description: "Ambiguous deadline",
        iso_date: "2026-11-20",
        status: "found",
        is_ambiguous: true,
      },
      {
        description: "Uncertain deadline",
        iso_date: "2026-11-25",
        status: "uncertain",
      },
    ];

    render(<DeadlineCard deadlines={deadlines} />);

    expect(
      screen.queryByRole("button", { name: /Add to Calendar/i })
    ).not.toBeInTheDocument();
  });
  it("hides countdowns for conflicting, ambiguous, and uncertain deadlines", () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);
  const dateStr = futureDate.toISOString().split("T")[0];

  const deadlines = [
    {
      description: "Conflicting deadline",
      iso_date: dateStr,
      status: "conflicting",
    },
    {
      description: "Ambiguous deadline",
      iso_date: dateStr,
      status: "found",
      is_ambiguous: true,
    },
    {
      description: "Uncertain deadline",
      iso_date: dateStr,
      status: "uncertain",
    },
  ];

  render(<DeadlineCard deadlines={deadlines} />);

  expect(
    screen.queryByText(/days left|due today|tomorrow|overdue/i)
  ).not.toBeInTheDocument();
});
  it("renders countdown pill next to deadline date", () => {
    // Generate date 5 days in the future from current real time
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const dateStr = futureDate.toISOString().split("T")[0];

    const deadlines = [
      {
        description: "Scholarship verification",
        iso_date: dateStr,
        original_wording: "Submit documents online within window",
        role: "primary",
        status: "found",
      },
    ];

    render(<DeadlineCard deadlines={deadlines} />);

    expect(screen.getByText(/5 days left/i)).toBeInTheDocument();
  });

  it("triggers onRemind and onShowSource callback buttons", async () => {
    const mockRemind = vi.fn();
    const mockShowSource = vi.fn();

    const deadlines = [
      {
        description: "Disconnection cutoff",
        iso_date: "2026-11-25",
        original_wording: "Must pay before cutoff",
        source_page: 2,
        evidence_quote: "Must pay before cutoff",
        status: "found",
      },
    ];

    render(
      <DeadlineCard
        deadlines={deadlines}
        onRemind={mockRemind}
        onShowSource={mockShowSource}
      />
    );

    const remindBtn = screen.getByRole("button", { name: /Remind Me/i });
    const user = userEvent.setup();
    await user.click(remindBtn);
    expect(mockRemind).toHaveBeenCalledWith(expect.objectContaining({ description: "Disconnection cutoff" }));

    const sourceBtn = screen.getByRole("button", { name: /Show Source/i });
    await user.click(sourceBtn);
    expect(mockShowSource).toHaveBeenCalledWith(2, "Must pay before cutoff");
  });
});
