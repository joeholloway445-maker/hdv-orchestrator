import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "./pages/Login";
import { RegisterPage } from "./pages/Register";
import { DashboardPage } from "./pages/Dashboard";
import { EditorPage } from "./pages/Editor";
import { MemoryPage } from "./pages/Memory";
import { CredentialsPage } from "./pages/Credentials";
import { VariablesPage } from "./pages/Variables";
import { ExecutionsPage } from "./pages/Executions";
import { ExecutionDetailPage } from "./pages/ExecutionDetail";
import { TokensPage } from "./pages/Tokens";
import { WebhooksPage } from "./pages/Webhooks";
import { TemplatesPage } from "./pages/Templates";
import { SchedulesPage } from "./pages/Schedules";
import { GpuMarketplacePage } from "./pages/GpuMarketplace";
import { PlanPage } from "./pages/Plan";
import { SubscriptionPage } from "./pages/Subscription";
import { CompanionPage } from "./pages/Companion";
import { AdminPage } from "./pages/Admin";
import { ExecutionHistoryPage } from "./pages/ExecutionHistory";
import { useAuthStore } from "./store/auth";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PlanProvider } from "./context/plan";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <PlanProvider>
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
              path="/dashboard"
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
              path="/editor/new"
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
              path="/history"
              element={
                <PrivateRoute>
                  <ExecutionHistoryPage />
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
              path="/executions/:id"
              element={
                <PrivateRoute>
                  <ExecutionDetailPage />
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
            <Route
              path="/gpu"
              element={
                <PrivateRoute>
                  <GpuMarketplacePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/plan"
              element={
                <PrivateRoute>
                  <PlanPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/subscription"
              element={
                <PrivateRoute>
                  <SubscriptionPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/companion"
              element={
                <PrivateRoute>
                  <CompanionPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PlanProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
