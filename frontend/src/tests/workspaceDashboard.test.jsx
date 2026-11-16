import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../pages/DashboardPage";
import { WorkspacePreferencesProvider } from "../context/WorkspacePreferencesContext";
import * as api from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    listNotices: vi.fn(),
    getUpcomingReminders: vi.fn(),
    updateReminder: vi.fn(),
  };
});

function localDateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <WorkspacePreferencesProvider>
        <DashboardPage />
      </WorkspacePreferencesProvider>
    </MemoryRouter>
  );
}

describe("workspace dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("summarises actual notice categories, priorities, and reminder states", async () => {
    localStorage.setItem("notice2action-focus-categories", "bank");
    api.listNotices.mockResolvedValueOnce([
      {
        id: "notice-1",
        title: "Account review",
        category: "bank",
        status: "processed",
        priority: "high",
        source_organisation: "Regional Bank",
        created_at: "2026-10-28T10:00:00Z",
      },
      {
        id: "notice-2",
        title: "Service advisory",
        category: "utility",
        status: "processed",
        needs_verification: true,
        created_at: "2026-10-27T10:00:00Z",
      },
    ]);
    api.getUpcomingReminders.mockResolvedValueOnce([
      { id: "reminder-1", notice_id: "notice-1", note: "Submit documents", remind_on: localDateOffset(3), done: false },
      { id: "reminder-2", notice_id: "notice-2", note: "Review service letter", remind_on: localDateOffset(-2), done: false },
      { id: "reminder-3", note: "Completed action", remind_on: localDateOffset(1), done: true },
    ]);

    renderDashboard();

    expect(await screen.findAllByText("Account review")).toHaveLength(2);
    expect(screen.getAllByText("Service advisory")).toHaveLength(2);
    expect(screen.getAllByText("Regional Bank")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "High-priority notices" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Needs your review" })).toBeInTheDocument();

    const total = screen.getByText("Total notices").closest("article");
    const pending = screen.getByText("Pending actions").closest("article");
    const upcoming = screen.getByText("Upcoming deadlines").closest("article");
    const overdue = screen.getByText("Overdue actions").closest("article");
    expect(within(total).getByText("2")).toBeInTheDocument();
    expect(within(pending).getByText("2")).toBeInTheDocument();
    expect(within(upcoming).getByText("1")).toBeInTheDocument();
    expect(within(overdue).getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Banking & financial services 1/ })).toBeInTheDocument();
  });

  it("keeps successful data available when one service endpoint fails", async () => {
    api.listNotices.mockRejectedValueOnce(new Error("Notice service unavailable"));
    api.getUpcomingReminders.mockResolvedValueOnce([
      { id: "reminder-1", note: "Follow up", remind_on: localDateOffset(1), done: false },
    ]);

    renderDashboard();

    expect(await screen.findByText("Some workspace data is unavailable.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Notice service unavailable")).toBeInTheDocument();
    });
    const total = screen.getByText("Total notices").closest("article");
    const pending = screen.getByText("Pending actions").closest("article");
    expect(within(total).getByText("—")).toBeInTheDocument();
    expect(within(pending).getByText("1")).toBeInTheDocument();
  });
});
