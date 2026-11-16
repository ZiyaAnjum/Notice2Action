import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { WorkspacePreferencesProvider } from "../context/WorkspacePreferencesContext";
import { SettingsPage } from "../pages/SettingsPage";

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("workspace settings", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: "healthy" }),
      }))
    );
  });

  it("saves selected focus categories locally for dashboard use", async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <WorkspacePreferencesProvider>
            <SettingsPage />
          </WorkspacePreferencesProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    const category = screen.getByRole("checkbox", {
      name: /Education & student funding/,
    });
    await userEvent.click(category);

    expect(category).toBeChecked();
    expect(localStorage.getItem("notice2action-focus-categories")).toBe(
      "scholarship_or_college"
    );
    expect(
      screen.getByText(/does not change how documents are processed/i)
    ).toBeInTheDocument();
  });
});
