import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");

  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const storeError = useAuthStore((s) => s.error);
  const navigate = useNavigate();

  const error = localError || storeError || "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError("");
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch {
      // error already set in store
    }
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
          <h1 className="text-2xl font-bold text-white mb-1 text-center">Welcome back</h1>
          <p className="text-center text-sm mb-7" style={{ color: "#6B7FA8" }}>
            Sign in to VISION
          </p>

          {error && (
            <div
              className="rounded-lg px-4 py-3 mb-5 text-sm"
              style={{ background: "rgba(239,68,68,0.1)", color: "#F87171", border: "1px solid rgba(239,68,68,0.25)" }}
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
                style={{
                  background: "#121D30",
                  border: "1px solid rgba(255,255,255,0.09)",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#3B6FFF")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#A3B3CC" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-all"
                style={{
                  background: "#121D30",
                  border: "1px solid rgba(255,255,255,0.09)",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#3B6FFF")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}
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
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: "#6B7FA8" }}>
            No account?{" "}
            <Link
              to="/register"
              className="font-medium hover:underline"
              style={{ color: "#3B6FFF" }}
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
