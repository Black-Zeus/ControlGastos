import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { CatalogsPage } from '@/pages/CatalogsPage'
import { ExpensesPage } from '@/pages/ExpensesPage'
import { IncomesPage } from '@/pages/IncomesPage'
import { PeriodsPage } from '@/pages/PeriodsPage'
import { HelpPage } from '@/pages/HelpPage'
import { ShoppingListsPage } from '@/pages/ShoppingListsPage'
import { ShoppingListDetailPage } from '@/pages/ShoppingListDetailPage'
import { AdminLoginPage } from '@/pages/admin/AdminLoginPage'
import { AdminForceChangePwdPage } from '@/pages/admin/AdminForceChangePwdPage'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage'
import { AdminCategoriesPage } from '@/pages/admin/AdminCategoriesPage'
import { AdminIncomeTypesPage } from '@/pages/admin/AdminIncomeTypesPage'
import { AdminTokensPage } from '@/pages/admin/AdminTokensPage'
import { AdminSettingsPage } from '@/pages/admin/AdminSettingsPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { ReporteComparacionPage } from '@/pages/reports/ReporteComparacionPage'
import { ReporteTendenciaPage }   from '@/pages/reports/ReporteTendenciaPage'
import { ReporteCategoriasPage }  from '@/pages/reports/ReporteCategoriasPage'

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
    </div>
  )
}

// Requiere sesión de usuario (is_admin=false).
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <LoadingSpinner />
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

// Permite acceso solo si hay sesión admin (para la página de cambio forzado).
function AdminChangePwdRoute() {
  const { admin, isLoading } = useAdminAuth()
  if (isLoading) return <LoadingSpinner />
  return admin ? <AdminForceChangePwdPage /> : <Navigate to="/admin/login" replace />
}

// Requiere sesión de administrador (is_admin=true, token de admin).
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { admin, isLoading, mustChangePwd } = useAdminAuth()
  if (isLoading) return <LoadingSpinner />
  if (!admin) return <Navigate to="/admin/login" replace />
  if (mustChangePwd) return <Navigate to="/admin/change-password" replace />
  return <>{children}</>
}

export function AppRouter() {
  return (
    <Routes>
      {/* ── Rutas públicas de autenticación ─────────────────────── */}
      <Route path="/login"           element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password"  element={<ResetPasswordPage />} />

      {/* ── Login de administrador (acceso separado) ──────────────── */}
      <Route path="/admin/login" element={<AdminLoginPage />} />

      {/* ── Cambio forzado de contraseña — requiere token pero no panel completo ── */}
      <Route path="/admin/change-password" element={<AdminChangePwdRoute />} />

      {/* ── Módulo admin — layout y auth propios ─────────────────── */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="usuarios"       element={<AdminUsersPage />} />
        <Route path="categorias"     element={<AdminCategoriesPage />} />
        <Route path="tipos-ingreso"  element={<AdminIncomeTypesPage />} />
        <Route path="tokens"         element={<AdminTokensPage />} />
        <Route path="configuracion"  element={<AdminSettingsPage />} />
      </Route>

      {/* ── Módulo usuario ────────────────────────────────────────── */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="egresos"    element={<ExpensesPage />} />
        <Route path="ingresos"   element={<IncomesPage />} />
        <Route path="listas-compra"     element={<ShoppingListsPage />} />
        <Route path="listas-compra/:id" element={<ShoppingListDetailPage />} />
        <Route path="reportes">
          <Route index element={<Navigate to="comparacion" replace />} />
          <Route path="comparacion" element={<ReporteComparacionPage />} />
          <Route path="tendencia"   element={<ReporteTendenciaPage />} />
          <Route path="categorias"  element={<ReporteCategoriasPage />} />
        </Route>
        <Route path="catalogos"  element={<CatalogsPage />} />
        <Route path="periodos"   element={<PeriodsPage />} />
        <Route path="perfil"     element={<ProfilePage />} />
        <Route path="ayuda"      element={<HelpPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
