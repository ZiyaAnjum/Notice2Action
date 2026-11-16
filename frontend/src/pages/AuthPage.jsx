import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  FileCheck2,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../context/useAuth";

const AUTH_COPY = {
  login: {
    title: "Welcome back",
    description: "Sign in to continue managing notices and deadlines.",
    action: "Sign in",
  },
  signup: {
    title: "Create your account",
    description: "Set up an account to keep notices and actions organised.",
    action: "Create account",
  },
  "forgot-password": {
    title: "Forgot your password?",
    description: "Enter your email address to request a password reset.",
    action: "Request reset link",
  },
  "reset-password": {
    title: "Choose a new password",
    description: "Enter and confirm your new account password.",
    action: "Reset password",
  },
};

const inputClassName =
  "focus-ring h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-navy-950 placeholder:text-slate-400 transition focus:border-purple-400";
const labelClassName = "mb-1.5 block text-sm font-semibold text-slate-700";

function PasswordField({ id, label, value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required
          minLength={8}
          className={`${inputClassName} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="focus-ring absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-xl text-slate-500 hover:text-purple-800"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">Use at least 8 characters.</p>
    </div>
  );
}

export function AuthPage({ mode }) {
  const copy = AUTH_COPY[mode] || AUTH_COPY.login;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [message, setMessage] = useState("");
  const { startDemoSession } = useAuth();
  const navigate = useNavigate();
  const hasPassword = mode === "login" || mode === "signup" || mode === "reset-password";

  const handleSubmit = (event) => {
    event.preventDefault();
    setMessage("");

    if ((mode === "signup" || mode === "reset-password") && password !== confirmation) {
      setMessage("The passwords do not match. Please check both fields.");
      return;
    }

    setMessage(
      "Authentication is not connected to a backend yet. No sign-in, account creation, email, or password reset was performed."
    );
  };

  const handleDemoEntry = () => {
    startDemoSession(rememberMe);
    navigate("/dashboard", { replace: true });
  };

  return (
    <main className="mesh-gradient-canvas flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:py-12">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-elevated lg:min-h-[690px] lg:grid-cols-[0.92fr_1.08fr]">
        <section className="hero-gradient-bg relative hidden flex-col justify-between overflow-hidden p-9 text-white lg:flex xl:p-12">
          <div className="absolute -right-20 top-28 h-72 w-72 rounded-full bg-purple-500/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-cyan-100">
                <GraduationCap className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-extrabold tracking-wide">Notice2Action</p>
                <p className="mt-0.5 text-[11px] text-slate-300">Institutional workspace</p>
              </div>
            </div>
            <div className="mt-24 max-w-md">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">
                Read · Understand · Act
              </p>
              <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight xl:text-[2.75rem]">
                Every notice, organised around what matters next.
              </h1>
              <p className="mt-5 max-w-sm text-sm leading-7 text-slate-300">
                Keep institutional notices, key dates, reminders, and action steps together in one workspace.
              </p>
            </div>
          </div>

          <div className="relative space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold">A clearer path from notice to action</p>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  Review extracted details and check the original document before acting.
                </p>
              </div>
            </div>
            <p className="max-w-sm text-[11px] leading-5 text-slate-400">
              ANJUMAN INSTITUTE OF TECHNOLOGY AND MANAGEMENT, BHATKAL
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-8 lg:p-10 xl:p-14">
          <div className="w-full max-w-md">
            <Link to="/login" className="mb-8 inline-flex items-center gap-2 lg:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-950 text-cyan-200">
                <GraduationCap className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-extrabold text-navy-950">Notice2Action</span>
            </Link>

            <div className="mb-7">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-100 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-800">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Institutional notice management
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-navy-950">
                {copy.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{copy.description}</p>
            </div>

            {message && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900"
              >
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <label htmlFor="full-name" className={labelClassName}>
                    Full name
                  </label>
                  <input
                    id="full-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    className={inputClassName}
                  />
                </div>
              )}

              {mode !== "reset-password" && (
                <div>
                  <label htmlFor="email" className={labelClassName}>
                    Institutional email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className={inputClassName}
                  />
                </div>
              )}

              {hasPassword && (
                <PasswordField
                  id="password"
                  label={mode === "reset-password" ? "New password" : "Password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              )}

              {(mode === "signup" || mode === "reset-password") && (
                <PasswordField
                  id="password-confirmation"
                  label="Confirm password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="new-password"
                />
              )}

              {mode === "login" && (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <label className="inline-flex items-center gap-2 text-slate-700">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-purple-700 focus:ring-purple-500"
                    />
                    Remember demo session
                  </label>
                  <Link
                    to="/forgot-password"
                    className="font-semibold text-purple-700 hover:text-purple-900"
                  >
                    Forgot password?
                  </Link>
                </div>
              )}

              <button
                type="submit"
                className="focus-ring mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-purple-700 px-4 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-purple-800"
              >
                {copy.action}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>

            {mode === "login" && (
              <>
                <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  Preview access
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
                <button
                  type="button"
                  onClick={handleDemoEntry}
                  className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-navy-900 transition hover:border-purple-200 hover:bg-purple-50"
                >
                  Continue in clearly labeled demo mode
                </button>
              </>
            )}

            <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-600">
              {mode === "login"
                ? "Real sign-in is not connected. Demo mode only creates a local frontend preview session and does not verify your credentials."
                : "This request is not connected to backend authentication. No account, email, or password will be changed."}
            </p>

            <div className="mt-5 text-center text-sm text-slate-600">
              {mode === "login" ? (
                <>
                  Need an account?{" "}
                  <Link to="/signup" className="font-semibold text-purple-700 hover:text-purple-900">
                    Sign up
                  </Link>
                </>
              ) : (
                <Link to="/login" className="font-semibold text-purple-700 hover:text-purple-900">
                  Back to sign in
                </Link>
              )}
            </div>
            {mode === "forgot-password" && (
              <p className="mt-3 text-center text-sm">
                <Link
                  to="/reset-password"
                  className="font-semibold text-purple-700 hover:text-purple-900"
                >
                  Continue to the reset password form
                </Link>
              </p>
            )}

            <p className="mt-8 text-center text-[10px] font-semibold leading-5 tracking-wide text-slate-500">
              ANJUMAN INSTITUTE OF TECHNOLOGY AND MANAGEMENT, BHATKAL
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
