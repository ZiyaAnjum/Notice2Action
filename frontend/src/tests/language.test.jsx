import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { LanguageProvider } from "../context/LanguageContext";
import { WorkspacePreferencesProvider } from "../context/WorkspacePreferencesContext";
import { InstitutionalLayout } from "../components/InstitutionalLayout";
import { SettingsPage } from "../pages/SettingsPage";

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.dir = "ltr";
  document.documentElement.lang = "en";
  vi.unstubAllGlobals();
});

function renderLanguageSettings() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <AuthProvider>
          <WorkspacePreferencesProvider>
            <SettingsPage />
            <InstitutionalLayout>
              <div />
            </InstitutionalLayout>
          </WorkspacePreferencesProvider>
        </AuthProvider>
      </LanguageProvider>
    </MemoryRouter>
  );
}

describe("regional language preference", () => {
  it("uses English by default and persists a Kannada selection across remounts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: "healthy" }),
      }))
    );

    const user = userEvent.setup();
    const firstRender = renderLanguageSettings();
    const languageSelect = screen.getByRole("combobox", { name: "Interface language" });

    expect(languageSelect).toHaveValue("en");
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();

    await user.selectOptions(languageSelect, "kn");

    expect(localStorage.getItem("notice2action-language")).toBe("kn");
    expect(screen.getByRole("combobox", { name: "ಇಂಟರ್ಫೇಸ್ ಭಾಷೆ" })).toHaveValue("kn");
    expect(screen.getByRole("link", { name: "ಮುಖ್ಯ ಫಲಕ" })).toBeInTheDocument();
    firstRender.unmount();

    renderLanguageSettings();
    expect(screen.getByRole("combobox", { name: "ಇಂಟರ್ಫೇಸ್ ಭಾಷೆ" })).toHaveValue("kn");
  });

  it("sets Urdu to right-to-left and restores left-to-right for English", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: "healthy" }),
      }))
    );

    const user = userEvent.setup();
    renderLanguageSettings();
    const languageSelect = screen.getByRole("combobox", { name: "Interface language" });

    await user.selectOptions(languageSelect, "ur");
    expect(document.documentElement.dir).toBe("rtl");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "انٹرفیس کی زبان" }),
      "en"
    );
    expect(document.documentElement.dir).toBe("ltr");
  });
});
