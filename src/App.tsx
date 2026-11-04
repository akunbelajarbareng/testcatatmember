import React from 'react';
import { BrowserRouter, Routes, Route, Outlet, useParams } from 'react-router-dom';
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
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/print/batch" element={<PrintBatchPage />} />
        
        <Route element={<Layout />}>
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
      </Routes>
    </BrowserRouter>
  );
}

