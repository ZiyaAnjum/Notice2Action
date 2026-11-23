import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  FileCheck2,
  GraduationCap,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../context/useAuth";

const AUTH_COPY = {
  login: {
    title: "Welcome back",
    description: "Sign in to access your notices, deadlines, and action plans.",
    action: "Sign in",
  },
  signup: {
    title: "Create your account",
    description: "Keep institutional notices and deadlines organized in one place.",
    action: "Create account",
  },
  "forgot-password": {
    title: "Forgot your password?",
    description: "Enter your registered email to request a secure password reset link.",
    action: "Request reset link",
  },
  "reset-password": {
    title: "Choose a new password",
    description: "Enter and confirm your new secure account password.",
    action: "Reset password",
  },
};

const inputClassName =
  "focus-ring h-12 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm font-medium text-navy-950 placeholder:text-slate-400 transition hover:border-purple-200 focus:border-purple-500 focus:bg-white";
const labelClassName = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700";

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
          className={`${inputClassName} pr-11`}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="focus-ring absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-xl text-slate-400 transition hover:text-purple-700"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Must be at least 8 characters.</p>
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
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-elevated lg:min-h-[660px] lg:grid-cols-[0.95fr_1.05fr]">
        {/* Left Hero Panel */}
        <section className="hero-gradient-bg relative hidden flex-col justify-between overflow-hidden p-9 text-white lg:flex xl:p-11">
          <div className="absolute -right-16 top-20 h-64 w-64 rounded-full bg-purple-500/25 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-cyan-200 shadow-glow">
                <GraduationCap className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-base font-extrabold tracking-tight">Notice2Action</p>
                <p className="text-[10px] font-semibold text-cyan-200/90 tracking-wide uppercase">
                  AI Action Engine
                </p>
              </div>
            </div>

            <div className="mt-20 max-w-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold tracking-wider uppercase text-cyan-300">
                <Sparkles className="h-3 w-3" />
                Read · Understand · Act
              </span>
              <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight xl:text-4xl">
                Every institutional notice, translated into clear actions.
              </h1>
              <p className="mt-4 text-xs sm:text-sm leading-relaxed text-slate-300">
                Notice2Action eliminates confusion from administrative circulars. Extract summaries, identify required documents, and track critical deadlines.
              </p>
            </div>
          </div>

          <div className="relative z-10 space-y-3 pt-6 border-t border-white/10">
            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-xs">
              <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
              <div>
                <p className="text-xs font-bold">From Complex Notices to Clear Actions</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-300">
                  Always check original PDF documents to verify extracted requirements.
                </p>
              </div>
            </div>
            <p className="text-[10px] font-medium tracking-wide text-slate-400">
              ANJUMAN INSTITUTE OF TECHNOLOGY AND MANAGEMENT, BHATKAL
            </p>
          </div>
        </section>

        {/* Right Form Panel */}
        <section className="flex items-center justify-center p-6 sm:p-9 lg:p-10 xl:p-12">
          <div className="w-full max-w-md">
            {/* Mobile Header */}
            <Link to="/login" className="mb-6 inline-flex items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-950 text-cyan-300">
                <GraduationCap className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-base font-extrabold text-navy-950">Notice2Action</span>
            </Link>

            <div className="mb-6">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-[11px] font-bold text-purple-700">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Student &amp; Faculty Portal
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-950">
                {copy.title}
              </h2>
              <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-slate-500">
                {copy.description}
              </p>
            </div>

            {message && (
              <div
                role="alert"
                className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950 ui-fade-in"
              >
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
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
                    placeholder="Enter your full name"
                    className={inputClassName}
                  />
                </div>
              )}

              {mode !== "reset-password" && (
                <div>
                  <label htmlFor="email" className={labelClassName}>
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    placeholder="student@aitm.ac.in"
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
                <div className="flex items-center justify-between gap-3 text-xs pt-1">
                  <label className="inline-flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    Remember preview session
                  </label>
                  <Link
                    to="/forgot-password"
                    className="font-bold text-purple-700 hover:text-purple-900"
                  >
                    Forgot password?
                  </Link>
                </div>
              )}

              <button
                type="submit"
                className="btn-primary w-full mt-2 shadow-purple"
              >
                <span>{copy.action}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>

            {mode === "login" && (
              <>
                <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  Instant Preview Access
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
                <button
                  type="button"
                  onClick={handleDemoEntry}
                  className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-purple-200 bg-purple-50/70 px-4 py-2.5 text-xs font-bold text-purple-900 transition hover:bg-purple-100 hover:border-purple-300 shadow-xs"
                >
                  Continue in clearly labeled demo mode
                </button>
              </>
            )}

            <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
              {mode === "login"
                ? "Real sign-in is not connected. Demo mode only creates a local frontend preview session and does not verify your credentials."
                : "This request is not connected to backend authentication. No account, email, or password will be changed."}
            </p>

            <div className="mt-5 text-center text-xs font-medium text-slate-600">
              {mode === "login" ? (
                <>
                  Need an account?{" "}
                  <Link to="/signup" className="font-bold text-purple-700 hover:text-purple-900">
                    Sign up
                  </Link>
                </>
              ) : (
                <Link to="/login" className="font-bold text-purple-700 hover:text-purple-900">
                  Back to sign in
                </Link>
              )}
            </div>

            {mode === "forgot-password" && (
              <p className="mt-2.5 text-center text-xs">
                <Link
                  to="/reset-password"
                  className="font-bold text-purple-700 hover:text-purple-900"
                >
                  Continue to the reset password form
                </Link>
              </p>
            )}

            <p className="mt-7 text-center text-[10px] font-semibold text-slate-400 tracking-wide">
              ANJUMAN INSTITUTE OF TECHNOLOGY AND MANAGEMENT, BHATKAL
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
