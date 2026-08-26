import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "./pages/Login";
import { RegisterPage } from "./pages/Register";
import { DashboardPage } from "./pages/Dashboard";
import { EditorPage } from "./pages/Editor";
import { MemoryPage } from "./pages/Memory";
import { CredentialsPage } from "./pages/Credentials";
import { VariablesPage } from "./pages/Variables";
import { ExecutionsPage } from "./pages/Executions";
import { TokensPage } from "./pages/Tokens";
import { WebhooksPage } from "./pages/Webhooks";
import { TemplatesPage } from "./pages/Templates";
import { SchedulesPage } from "./pages/Schedules";
import { useAuthStore } from "./store/auth";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <DashboardPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/workflow/:id"
          element={
            <PrivateRoute>
              <EditorPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/memory"
          element={
            <PrivateRoute>
              <MemoryPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/credentials"
          element={
            <PrivateRoute>
              <CredentialsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/variables"
          element={
            <PrivateRoute>
              <VariablesPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/executions"
          element={
            <PrivateRoute>
              <ExecutionsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/tokens"
          element={
            <PrivateRoute>
              <TokensPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/webhooks"
          element={
            <PrivateRoute>
              <WebhooksPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/templates"
          element={
            <PrivateRoute>
              <TemplatesPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/schedules"
          element={
            <PrivateRoute>
              <SchedulesPage />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
