import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState("");

  const register = useAuthStore((s) => s.register);
  const isLoading = useAuthStore((s) => s.isLoading);
  const storeError = useAuthStore((s) => s.error);
  const navigate = useNavigate();

  const error = localError || storeError || "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError("");

    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setLocalError("Passwords do not match.");
      return;
    }

    try {
      await register(email, password);
      navigate("/dashboard");
    } catch {
      // error already set in store
    }
  }

  const inputStyle = {
    background: "#121D30",
    border: "1px solid rgba(255,255,255,0.09)",
  } as React.CSSProperties;

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = "#3B6FFF";
  }
  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)";
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#060A14" }}
    >
      <div className="w-full max-w-md">
        {/* Logo mark */}
        <div className="flex justify-center mb-8">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center border-2"
            style={{ borderColor: "#3B6FFF", background: "rgba(59,111,255,0.12)" }}
          >
            <svg viewBox="0 0 40 40" width="28" height="28" fill="none">
              <circle cx="20" cy="20" r="12" stroke="#3B6FFF" strokeWidth="3" />
              <circle cx="20" cy="20" r="4.5" fill="#3B6FFF" />
            </svg>
          </div>
        </div>

        <div
          className="rounded-2xl p-8 shadow-2xl"
          style={{ background: "#0D1526", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <h1 className="text-2xl font-bold text-white mb-1 text-center">Create account</h1>
          <p className="text-center text-sm mb-7" style={{ color: "#6B7FA8" }}>
            Get started with VISION
          </p>

          {error && (
            <div
              className="rounded-lg px-4 py-3 mb-5 text-sm"
              style={{
                background: "rgba(239,68,68,0.1)",
                color: "#F87171",
                border: "1px solid rgba(239,68,68,0.25)",
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#A3B3CC" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-all"
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#A3B3CC" }}>
                Password
                <span className="ml-1 text-xs font-normal" style={{ color: "#4A5E7A" }}>
                  (min 8 characters)
                </span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-all"
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#A3B3CC" }}>
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                className="w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-all"
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 mt-2"
              style={{
                background: isLoading ? "rgba(59,111,255,0.5)" : "#3B6FFF",
                cursor: isLoading ? "not-allowed" : "pointer",
              }}
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="rgba(255,255,255,0.3)"
                      strokeWidth="3"
                    />
                    <path
                      d="M12 2a10 10 0 0 1 10 10"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                  Creating account…
                </>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: "#6B7FA8" }}>
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium hover:underline"
              style={{ color: "#3B6FFF" }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
