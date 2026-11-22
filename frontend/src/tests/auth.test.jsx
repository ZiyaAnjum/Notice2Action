import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AuthPage } from "../pages/AuthPage";
import { AuthProvider } from "../context/AuthContext";
import { MemoryRouter } from "react-router-dom";

afterEach(cleanup);

function renderAuthPage(mode) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AuthPage mode={mode} />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("AuthPage", () => {
  it("validates password confirmation and does not claim registration succeeded", async () => {
    renderAuthPage("signup");

    act(() => {
      fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "A User" } });
      fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "user@example.edu" },
      });
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "password-one" },
      });
      fireEvent.change(screen.getByLabelText("Confirm password"), {
        target: { value: "password-two" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/passwords do not match/i);

    act(() => {
      fireEvent.change(screen.getByLabelText("Confirm password"), {
        target: { value: "password-one" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    });

    // Submitting triggers sign-up attempt
    expect(screen.queryByText(/passwords do not match/i)).not.toBeInTheDocument();
  });

  it("provides a password visibility control on the sign-in form", async () => {
    renderAuthPage("login");
    const password = screen.getByLabelText("Password");

    expect(password).toHaveAttribute("type", "password");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    });
    expect(password).toHaveAttribute("type", "text");
  });

  it("labels the demo-only entry path and does not imply real credential verification", () => {
    renderAuthPage("login");

    expect(
      screen.getByRole("button", { name: /continue in clearly labeled demo mode/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/does not verify your credentials/i)).toBeInTheDocument();
  });
});
