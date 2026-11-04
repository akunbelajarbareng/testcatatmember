import React from 'react';
import { BrowserRouter, Routes, Route, Outlet, useParams, Navigate } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import DashboardPage from '@/app/page';
import LoginPage from '@/app/login/page';
import IdentitiesPage from '@/app/identities/page';
import IdentityDetailPage from '@/app/identities/[id]/page';
import OutletsPage from '@/app/outlets/page';
import CouponsPage from '@/app/coupons/page';
import StatementsPage from '@/app/statements/page';
import SingleStatementPage from '@/app/statements/[identityId]/[bulan]/page';
import PrintBatchPage from '@/app/print/batch/page';
import ImportPage from '@/app/import/page';
import WastePurchasesPage from '@/app/waste-purchases/page';
import SettingsPage from '@/app/settings/page';
import ApprovalsPage from '@/app/approvals/page';
import AliasesPage from '@/app/aliases/page';

/**
 * ErrorBoundary — Menangkap error render React dan mencegah layar putih (blank screen)
 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[React ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: '#070e1b',
            color: '#fff',
            fontFamily: 'Inter, system-ui, sans-serif',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              maxWidth: 480,
              width: '100%',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: 32,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: 24,
              }}
            >
              ⚠
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#f87171' }}>
              Terjadi Kendala Memuat Halaman
            </h2>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, lineHeight: 1.5 }}>
              {this.state.error?.message || 'Aplikasi mendeteksi kendala pada tampilan.'}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                style={{
                  padding: '9px 18px',
                  background: '#d4af37',
                  color: '#070e1b',
                  fontWeight: 700,
                  fontSize: 13,
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Muat Ulang
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('crm_session_user');
                  window.location.href = '/login';
                }}
                style={{
                  padding: '9px 18px',
                  background: 'transparent',
                  color: '#e2e8f0',
                  fontSize: 13,
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Masuk Ulang (Login)
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * ProtectedRoute — Memeriksa session login dari localStorage.
 * Jika belum login, diarahkan otomatis ke halaman /login.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = localStorage.getItem('crm_session_user');
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/**
 * PublicOnlyRoute — Jika sudah login, redirect langsung ke /
 */
function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const user = localStorage.getItem('crm_session_user');
  if (user) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function Layout() {
  return (
    <div className="min-h-screen flex print:block print:min-h-0 print:bg-white print:overflow-visible">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 print:overflow-visible print:block print:w-full print:h-auto">
        <Outlet />
      </div>
    </div>
  );
}

function IdentityDetailWrapper() {
  const { id = '' } = useParams<{ id: string }>();
  return <IdentityDetailPage params={Promise.resolve({ id })} />;
}

function SingleStatementWrapper() {
  const { identityId = '', bulan = '' } = useParams<{ identityId: string; bulan: string }>();
  return <SingleStatementPage params={Promise.resolve({ identityId, bulan })} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public / Auth Route */}
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />

          {/* Protected Batch Print Route */}
          <Route
            path="/print/batch"
            element={
              <ProtectedRoute>
                <PrintBatchPage />
              </ProtectedRoute>
            }
          />

          {/* Main Protected Application Layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/identities" element={<IdentitiesPage />} />
            <Route path="/identities/:id" element={<IdentityDetailWrapper />} />
            <Route path="/outlets" element={<OutletsPage />} />
            <Route path="/coupons" element={<CouponsPage />} />
            <Route path="/statements" element={<StatementsPage />} />
            <Route path="/statements/:identityId/:bulan" element={<SingleStatementWrapper />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/waste-purchases" element={<WastePurchasesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/aliases" element={<AliasesPage />} />
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
