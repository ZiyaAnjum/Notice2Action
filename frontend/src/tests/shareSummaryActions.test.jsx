import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareSummaryActions } from "../components/ShareSummaryActions";

const completeSections = [
  { key: "what_is_this", question: "What is this notice about?", displayContent: "Electricity disconnection notice", isMissing: false },
  { key: "why_it_matters", question: "Why might it matter to me?", displayContent: "Power supply may be disconnected", isMissing: false },
  { key: "what_to_do", question: "What do I need to do?", displayContent: "Pay the outstanding bill", isMissing: false },
  { key: "where_to_do_it", question: "Where should I do it?", displayContent: "Local electricity office", isMissing: false },
  { key: "if_deadline_missed", question: "What happens if I miss the deadline?", displayContent: "A late fee may be charged", isMissing: false },
];

function setClipboard(writeText) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

function setNativeShare(share) {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });
}

beforeEach(() => {
  setClipboard(vi.fn(async () => {}));
  setNativeShare(undefined);
  Object.defineProperty(window, "print", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  document.body.className = "";
});

afterEach(() => {
  cleanup();
  document.body.className = "";
  vi.restoreAllMocks();
});

describe("ShareSummaryActions", () => {
  it("copies the complete summary with heading and all five sections", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    setClipboard(writeText);

    render(
      <ShareSummaryActions sections={completeSections} hasReadableSummary />
    );

    await user.click(screen.getByRole("button", { name: "Copy notice summary" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0];
    expect(text).toContain("Notice2Action – Plain Language Summary");
    expect(text).toContain("What is this notice about?\nElectricity disconnection notice");
    expect(text).toContain("Why might it matter to me?\nPower supply may be disconnected");
    expect(text).toContain("What do I need to do?\nPay the outstanding bill");
    expect(text).toContain("Where should I do it?\nLocal electricity office");
    expect(text).toContain("What happens if I miss the deadline?\nA late fee may be charged");
    expect(screen.getByRole("status")).toHaveTextContent("Summary copied to clipboard.");
  });

  it("shows an accessible error when clipboard copying fails", async () => {
    const user = userEvent.setup();
    setClipboard(vi.fn(async () => {
      throw new Error("Denied");
    }));

    render(
      <ShareSummaryActions sections={completeSections} hasReadableSummary />
    );

    await user.click(screen.getByRole("button", { name: "Copy notice summary" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Could not copy the summary.");
  });

  it("shares the summary through the native Web Share API", async () => {
    const user = userEvent.setup();
    const share = vi.fn(async () => {});
    setNativeShare(share);

    render(
      <ShareSummaryActions sections={completeSections} hasReadableSummary />
    );

    await user.click(screen.getByRole("button", { name: "Share notice summary" }));

    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      title: "Notice2Action – Plain Language Summary",
      text: expect.stringContaining("What is this notice about?"),
    }));
    expect(share.mock.calls[0][0].text).toContain("Electricity disconnection notice");
    expect(screen.getByRole("status")).toHaveTextContent("Summary shared.");
  });

  it("falls back to copying when native sharing is unavailable", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    setClipboard(writeText);
    setNativeShare(undefined);

    render(
      <ShareSummaryActions sections={completeSections} hasReadableSummary />
    );

    await user.click(screen.getByRole("button", { name: "Share notice summary" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("Notice2Action – Plain Language Summary");
    expect(screen.getByRole("status")).toHaveTextContent("copied to clipboard for sharing");
  });

  it("handles native share cancellation without an error", async () => {
    const user = userEvent.setup();
    setNativeShare(vi.fn(async () => {
      const error = new Error("Cancelled");
      error.name = "AbortError";
      throw error;
    }));

    render(
      <ShareSummaryActions sections={completeSections} hasReadableSummary />
    );

    await user.click(screen.getByRole("button", { name: "Share notice summary" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Sharing cancelled.");
  });

  it("opens printing with the temporary print class and cleans it afterprint", async () => {
    const user = userEvent.setup();

    render(
      <ShareSummaryActions sections={completeSections} hasReadableSummary />
    );

    await user.click(screen.getByRole("button", { name: "Print notice summary" }));

    expect(window.print).toHaveBeenCalledTimes(1);
    expect(document.body).toHaveClass("printing-notice-summary");

    window.dispatchEvent(new Event("afterprint"));

    expect(document.body).not.toHaveClass("printing-notice-summary");
  });

  it("preserves missing answers and keeps actions available when one section is readable", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    setClipboard(writeText);
    const mixedSections = completeSections.map((section, index) =>
      index === 2
        ? { ...section, displayContent: "Not stated in the notice", isMissing: true }
        : section
    );

    render(
      <ShareSummaryActions sections={mixedSections} hasReadableSummary />
    );

    await user.click(screen.getByRole("button", { name: "Copy notice summary" }));

    expect(writeText.mock.calls[0][0]).toContain("What do I need to do?\nNot stated in the notice");
  });

  it("disables actions and handles empty summaries safely", () => {
    render(
      <ShareSummaryActions sections={[]} hasReadableSummary={false} />
    );

    expect(screen.getByRole("button", { name: "Copy notice summary" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Share notice summary" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Print notice summary" })).toBeDisabled();
  });
});
