import { create } from "zustand";
import { persist } from "zustand/middleware";
import axios from "axios";

interface User {
  id: string;
  email: string;
  isAdmin?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  /** Legacy helper kept for backward compat with any callers */
  setAuth: (token: string, user: User) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  init: () => void;
}

// Standalone axios instance for auth endpoints — avoids circular dep with api/client.ts
const authHttp = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:4000",
});

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

function apiError(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: string } } }).response?.data?.error || fallback
  );
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,

      setAuth: (token, user) => {
        set({ token, user, error: null });
      },

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await authHttp.post<{ token: string; user: User }>(
            "/auth/login",
            { email, password }
          );
          set({ token: data.token, user: data.user, isLoading: false, error: null });
        } catch (err) {
          const msg = apiError(err, "Login failed");
          set({ isLoading: false, error: msg });
          throw err;
        }
      },

      register: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await authHttp.post<{ token: string; user: User }>(
            "/auth/register",
            { email, password }
          );
          set({ token: data.token, user: data.user, isLoading: false, error: null });
        } catch (err) {
          const msg = apiError(err, "Registration failed");
          set({ isLoading: false, error: msg });
          throw err;
        }
      },

      logout: () => {
        set({ token: null, user: null, error: null, isLoading: false });
      },

      init: () => {
        const { token } = get();
        if (token && isTokenExpired(token)) {
          set({ token: null, user: null });
        }
      },
    }),
    { name: "wf-auth" }
  )
);
