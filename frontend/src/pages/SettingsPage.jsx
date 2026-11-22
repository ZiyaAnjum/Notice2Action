import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  Palette,
  Save,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { API_BASE_URL } from "../api/client";
import { SUPPORTED_CATEGORIES, OUT_OF_SCOPE_CATEGORY } from "../utils/categories";
import { useAuth } from "../context/useAuth";
import { useWorkspacePreferences } from "../context/useWorkspacePreferences";
import { PageHeader } from "../components/PageHeader";

export function SettingsPage() {
  const [health, setHealth] = useState(null);
  const [checkingHealth, setCheckingHealth] = useState(true);
  const navigate = useNavigate();
  const {
    user,
    logout,
    endDemoSession,
    updateProfile,
    changePassword,
    deleteAccount,
    resendVerification,
  } = useAuth();
  const { focusCategories, setFocusCategories } = useWorkspacePreferences();

  // Profile edit state
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [preferredLang, setPreferredLang] = useState(user?.preferred_language || "en");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Change password state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  // Delete account modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Resend verification state
  const [resendStatus, setResendStatus] = useState("");

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
      setPreferredLang(user.preferred_language || "en");
    }
  }, [user]);

  useEffect(() => {
    async function checkBackendHealth() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        if (response.ok) {
          setHealth(await response.json());
        } else {
          setHealth({ status: "offline" });
        }
      } catch {
        setHealth({ status: "offline" });
      } finally {
        setCheckingHealth(false);
      }
    }
    checkBackendHealth();
  }, []);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage("");
    setProfileSuccess(false);
    try {
      if (updateProfile) {
        await updateProfile({
          full_name: fullName.trim(),
          preferred_language: preferredLang,
        });
      }
      setProfileSuccess(true);
      setProfileMessage("Profile updated successfully!");
      setTimeout(() => setProfileMessage(""), 4000);
    } catch (err) {
      setProfileSuccess(false);
      setProfileMessage(err?.message || "Failed to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwSaving(true);
    setPwMessage("");
    setPwSuccess(false);

    if (newPw !== confirmPw) {
      setPwMessage("New passwords do not match.");
      setPwSaving(false);
      return;
    }

    if (newPw.length < 8) {
      setPwMessage("Password must be at least 8 characters long.");
      setPwSaving(false);
      return;
    }

    try {
      if (changePassword) {
        await changePassword({
          current_password: currentPw,
          new_password: newPw,
        });
      }
      setPwSuccess(true);
      setPwMessage("Password changed successfully!");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setTimeout(() => setPwMessage(""), 4000);
    } catch (err) {
      setPwSuccess(false);
      setPwMessage(err?.message || "Failed to update password.");
    } finally {
      setPwSaving(false);
    }
  };

  const handleResend = async () => {
    setResendStatus("sending");
    try {
      if (resendVerification) {
        await resendVerification();
      }
      setResendStatus("sent");
      setTimeout(() => setResendStatus(""), 4000);
    } catch (err) {
      setResendStatus("error");
      setTimeout(() => setResendStatus(""), 4000);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") {
      setDeleteError("Please type DELETE in all capitals to confirm.");
      return;
    }
    setIsDeleting(true);
    setDeleteError("");
    try {
      if (deleteAccount) {
        await deleteAccount();
      }
      navigate("/login", { replace: true });
    } catch (err) {
      setDeleteError(err?.message || "Failed to delete account.");
      setIsDeleting(false);
    }
  };

  const handleLogout = () => {
    if (logout) {
      logout();
    } else if (endDemoSession) {
      endDemoSession();
    }
    navigate("/login", { replace: true });
  };

  const toggleFocusCategory = (categoryKey) => {
    const next = focusCategories.includes(categoryKey)
      ? focusCategories.filter((key) => key !== categoryKey)
      : [...focusCategories, categoryKey];
    setFocusCategories(next);
  };

  return (
    <main className="page-shell max-w-5xl space-y-6">
      <PageHeader
        icon={Settings}
        eyebrow="Workspace preferences"
        title="Settings"
        description="Manage your account profile, security credentials, preferences, and connected services."
      />

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
        {/* Profile & Account Section */}
        <section className="surface-card p-5 sm:p-6" aria-labelledby="profile-title">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="profile-title" className="text-base font-extrabold text-navy-950">
                Profile & account
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Personal identity and language preferences.
              </p>
            </div>
          </div>

          {profileMessage && (
            <div
              role="alert"
              className={`mt-4 rounded-xl border p-3 text-xs leading-5 ${
                profileSuccess
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              {profileMessage}
            </div>
          )}

          <form onSubmit={handleProfileSave} className="mt-5 space-y-4">
            <div>
              <label htmlFor="settings-name" className="mb-1 block text-xs font-semibold text-slate-700">
                Full name
              </label>
              <input
                id="settings-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={user?.is_demo || profileSaving}
                className="focus-ring h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-navy-950 disabled:bg-slate-50"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="settings-email" className="block text-xs font-semibold text-slate-700">
                  Email address
                </label>
                {user?.is_demo ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    Demo Account
                  </span>
                ) : user?.is_verified ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" /> Verified
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendStatus === "sending"}
                    className="text-[10px] font-bold text-purple-700 hover:underline"
                  >
                    {resendStatus === "sending"
                      ? "Sending..."
                      : resendStatus === "sent"
                      ? "Verification sent!"
                      : "Resend verification"}
                  </button>
                )}
              </div>
              <input
                id="settings-email"
                type="email"
                value={user?.email || ""}
                disabled
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-500"
              />
            </div>

            <div>
              <label htmlFor="settings-lang" className="mb-1 block text-xs font-semibold text-slate-700">
                Preferred language
              </label>
              <select
                id="settings-lang"
                value={preferredLang}
                onChange={(e) => setPreferredLang(e.target.value)}
                disabled={user?.is_demo || profileSaving}
                className="focus-ring h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-navy-950 disabled:bg-slate-50"
              >
                <option value="en">English</option>
                <option value="hi">हिंदी (Hindi)</option>
                <option value="kn">ಕನ್ನಡ (Kannada)</option>
              </select>
            </div>

            {!user?.is_demo && (
              <button
                type="submit"
                disabled={profileSaving}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-purple-700 px-3.5 text-xs font-bold text-white shadow-glow hover:bg-purple-800 disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                {profileSaving ? "Saving..." : "Save changes"}
              </button>
            )}
          </form>
        </section>

        {/* Security & Password Section */}
        <section className="surface-card p-5 sm:p-6" aria-labelledby="security-title">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="security-title" className="text-base font-extrabold text-navy-950">
                Security & password
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Update password and manage session credentials.
              </p>
            </div>
          </div>

          {pwMessage && (
            <div
              role="alert"
              className={`mt-4 rounded-xl border p-3 text-xs leading-5 ${
                pwSuccess
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              {pwMessage}
            </div>
          )}

          {user?.is_demo ? (
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-700">Protected demo account</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                The password for the shared demo account cannot be changed. Sign up for a personal account to set and manage credentials.
              </p>
            </div>
          ) : (
            <form onSubmit={handleChangePassword} className="mt-5 space-y-3.5">
              <div>
                <label htmlFor="current-pw" className="mb-1 block text-xs font-semibold text-slate-700">
                  Current password
                </label>
                <div className="relative">
                  <input
                    id="current-pw"
                    type={showCurrentPw ? "text" : "password"}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    required
                    autoComplete="current-password"
                    disabled={pwSaving}
                    className="focus-ring h-10 w-full rounded-xl border border-slate-200 bg-white px-3 pr-10 text-xs text-navy-950"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-slate-600"
                  >
                    {showCurrentPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="new-pw" className="mb-1 block text-xs font-semibold text-slate-700">
                  New password (min 8 characters)
                </label>
                <div className="relative">
                  <input
                    id="new-pw"
                    type={showNewPw ? "text" : "password"}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    disabled={pwSaving}
                    className="focus-ring h-10 w-full rounded-xl border border-slate-200 bg-white px-3 pr-10 text-xs text-navy-950"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-slate-600"
                  >
                    {showNewPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirm-new-pw" className="mb-1 block text-xs font-semibold text-slate-700">
                  Confirm new password
                </label>
                <input
                  id="confirm-new-pw"
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={pwSaving}
                  className="focus-ring h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-navy-950"
                />
              </div>

              <button
                type="submit"
                disabled={pwSaving}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-purple-700 px-3.5 text-xs font-bold text-white shadow-glow hover:bg-purple-800 disabled:opacity-60"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {pwSaving ? "Updating..." : "Update password"}
              </button>
            </form>
          )}
        </section>

        {/* Notifications */}
        <section className="surface-card p-5 sm:p-6" aria-labelledby="notifications-title">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-800">
              <Bell className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="notifications-title" className="text-base font-extrabold text-navy-950">
                Notification preferences
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                In-app reminder tracking and deadline notifications.
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-800">In-app reminder tracking active</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Saved reminders can be reviewed on the Calendar and Reminders views. Reminders notify you inside the web app; external email notifications can be enabled via SMTP settings.
            </p>
          </div>
        </section>

        {/* Connected Service */}
        <section className="surface-card p-5 sm:p-6" aria-labelledby="backend-status-title">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-950 text-cyan-200">
                <Server className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="backend-status-title" className="text-base font-extrabold text-navy-950">
                  Connected service
                </h2>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{API_BASE_URL}</p>
              </div>
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                checkingHealth
                  ? "bg-slate-100 text-slate-600"
                  : health?.status === "healthy"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${
                checkingHealth
                  ? "bg-slate-400"
                  : health?.status === "healthy"
                    ? "bg-emerald-500"
                    : "bg-rose-500"
              }`} />
              {checkingHealth ? "Checking…" : health?.status === "healthy" ? "Healthy" : "Offline"}
            </span>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-600">
            Backend API processes notice PDFs, manages secure sessions, and enforces data isolation.
          </p>
        </section>
      </div>

      {/* Danger Zone: Delete Account */}
      <section className="rounded-2xl border border-red-200 bg-red-50/40 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-red-950">Danger zone</h2>
              <p className="mt-1 text-xs leading-5 text-red-800/80">
                Permanently delete your account, notices, checklist items, and uploaded PDFs.
              </p>
            </div>
          </div>
          {user?.is_demo ? (
            <span className="rounded-lg bg-red-100/60 px-3 py-1.5 text-xs font-semibold text-red-800">
              Demo account protected
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-red-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete account
            </button>
          )}
        </div>
      </section>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-elevated">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-base font-extrabold text-navy-950">Confirm account deletion</h3>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600">
              This action is permanent and cannot be undone. All your uploaded notices, extracted data, checklist items, and reminder records will be erased immediately.
            </p>
            <p className="mt-3 text-xs font-semibold text-slate-800">
              Type <strong className="font-mono text-red-600">DELETE</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="focus-ring mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-xs uppercase text-navy-950"
            />
            {deleteError && (
              <p className="mt-2 text-xs font-semibold text-red-600">{deleteError}</p>
            )}
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText("");
                  setDeleteError("");
                }}
                disabled={isDeleting}
                className="focus-ring rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== "DELETE" || isDeleting}
                className="focus-ring rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {isDeleting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Focus Categories */}
      <section className="surface-card p-5 sm:p-6" aria-labelledby="focus-categories-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="focus-categories-title" className="text-base font-extrabold text-navy-950">
              Focus categories
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Highlight categories you deal with most often across the workspace. Stored locally; does not change how documents are processed.
            </p>
          </div>
          {focusCategories.length > 0 && (
            <button
              type="button"
              onClick={() => setFocusCategories([])}
              className="focus-ring self-start rounded-lg px-2.5 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-50"
            >
              Clear selection
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SUPPORTED_CATEGORIES.map((category) => (
            <label
              key={category.key}
              className="flex min-h-12 cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition hover:border-purple-200 hover:bg-purple-50/40"
            >
              <input
                type="checkbox"
                checked={focusCategories.includes(category.key)}
                onChange={() => toggleFocusCategory(category.key)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-purple-700 focus:ring-purple-500"
              />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-800">{category.label}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{category.description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <p className="flex items-center gap-2 text-xs leading-5 text-slate-500">
        <ShieldCheck className="h-4 w-4 shrink-0 text-purple-700" aria-hidden="true" />
        <span>
          <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
          Notice2Action stores your notices privately and encrypts all account session data.
        </span>
      </p>
    </main>
  );
}