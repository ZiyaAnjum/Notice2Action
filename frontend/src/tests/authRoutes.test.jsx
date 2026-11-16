import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../App";
import { AuthProvider } from "../context/AuthContext";
import { WorkspacePreferencesProvider } from "../context/WorkspacePreferencesContext";

function renderApplication(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <WorkspacePreferencesProvider>
          <AppRoutes />
        </WorkspacePreferencesProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("authentication routes", () => {
  it("opens on the login screen and protects institutional routes", () => {
    const { unmount } = renderApplication("/");
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();

    unmount();
    renderApplication("/calendar");
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });

  it("provides navigation among sign-up, password recovery, and reset screens", () => {
    renderApplication("/");

    act(() => {
      fireEvent.click(screen.getByRole("link", { name: "Sign up" }));
    });
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole("link", { name: "Back to sign in" }));
    });
    act(() => {
      fireEvent.click(screen.getByRole("link", { name: "Forgot password?" }));
    });
    expect(screen.getByRole("heading", { name: "Forgot your password?" })).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole("link", { name: "Continue to the reset password form" }));
    });
    expect(screen.getByRole("heading", { name: "Choose a new password" })).toBeInTheDocument();
  });

  it("enters only the labeled frontend demo and exits back to login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => [],
      }))
    );
    renderApplication("/");

    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /continue in clearly labeled demo mode/i })
      );
    });
    expect(
      await screen.findByRole("heading", {
        name: "Turn complex notices into clear next steps.",
      })
    ).toBeInTheDocument();
    expect(localStorage.getItem("notice2action-demo-session")).toBeNull();
    expect(sessionStorage.getItem("notice2action-demo-session")).toBe("active");

    act(() => {
      fireEvent.click(screen.getAllByRole("button", { name: "Exit demo session" })[0]);
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    });
    expect(sessionStorage.getItem("notice2action-demo-session")).toBeNull();
  });
});
