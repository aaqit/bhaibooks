import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import Layout from './components/Layout.jsx';
import { Loading, Button, Icon } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import CompanySelect from './pages/CompanySelect.jsx';
import Dashboard from './pages/Dashboard.jsx';
import VoucherForm from './pages/VoucherForm.jsx';
import Daybook from './pages/Daybook.jsx';
import Masters from './pages/Masters.jsx';
import Reports from './pages/Reports.jsx';
import GST from './pages/GST.jsx';
import Admin from './pages/Admin.jsx';
import Settings from './pages/Settings.jsx';
import InvoicePrint from './pages/InvoicePrint.jsx';

function Guard({ cap, desktop, children }) {
  const { loading, user, companyId, hasCap, isWeb } = useAuth();
  const location = useLocation();

  if (loading) return <div className="guard-screen"><Loading label="Session check ho raha hai..." /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!companyId) return <Navigate to="/select-company" replace />;
  if (desktop && isWeb) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <div className="lock-icon"><Icon name="lock" size={28} /></div>
          <h2>Ye feature sirf PC Desktop app me hai</h2>
          <p>Web / Mobile par sirf <strong>Dashboard</strong> aur <strong>Voucher Entry</strong> allowed hai. Reports, Masters, GST aur Admin ke liye PC par BahiBooks kholo.</p>
          <Button variant="primary" icon="dashboard" onClick={() => { window.location.href = '/'; }}>Dashboard par jao</Button>
        </div>
      </div>
    );
  }
  if (cap && !hasCap(cap)) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <div className="lock-icon"><Icon name="shield" size={28} /></div>
          <h2>Access nahi hai</h2>
          <p>Aapke role ke paas is screen ki permission nahi hai. Super Admin ya Shop Owner se access mangwao.</p>
          <Button variant="primary" icon="dashboard" onClick={() => { window.location.href = '/'; }}>Dashboard par jao</Button>
        </div>
      </div>
    );
  }
  return children;
}

function AppRoutes() {
  const { loading, user } = useAuth();

  if (loading) return <div className="guard-screen"><Loading label="BahiBooks load ho raha hai..." /></div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/print/voucher/:id" element={<InvoicePrint />} />
      <Route element={<GuardedLayout />}>
        <Route index element={<Guard cap="dashboard"><Dashboard /></Guard>} />
        <Route path="/select-company" element={user ? <CompanySelect /> : <Navigate to="/login" replace />} />
        <Route path="/vouchers/new/:type" element={<Guard cap="voucher:create"><VoucherForm /></Guard>} />
        <Route path="/vouchers/new" element={<Guard cap="voucher:create"><VoucherForm /></Guard>} />
        <Route path="/vouchers/:id/edit" element={<Guard cap="voucher:create" desktop><VoucherForm /></Guard>} />
        <Route path="/daybook" element={<Guard cap="daybook" desktop><Daybook /></Guard>} />
        <Route path="/masters/:tab" element={<Guard cap="master:read" desktop><Masters /></Guard>} />
        <Route path="/masters" element={<Navigate to="/masters/ledgers" replace />} />
        <Route path="/reports/trial-balance" element={<Guard cap="reports:financial" desktop><Reports mode="trial-balance" /></Guard>} />
        <Route path="/reports/profit-loss" element={<Guard cap="reports:financial" desktop><Reports mode="profit-loss" /></Guard>} />
        <Route path="/reports/balance-sheet" element={<Guard cap="reports:financial" desktop><Reports mode="balance-sheet" /></Guard>} />
        <Route path="/reports/stock-summary" element={<Guard cap="stock" desktop><Reports mode="stock-summary" /></Guard>} />
        <Route path="/reports/ledger-book" element={<Guard cap="reports" desktop><Reports mode="ledger-book" /></Guard>} />
        <Route path="/reports/cash-flow" element={<Guard cap="reports:financial" desktop><Reports mode="cash-flow" /></Guard>} />
        <Route path="/reports/funds-flow" element={<Guard cap="reports:financial" desktop><Reports mode="funds-flow" /></Guard>} />
        <Route path="/reports/bill-wise" element={<Guard cap="reports:financial" desktop><Reports mode="bill-wise" /></Guard>} />
        <Route path="/reports/expiry-alerts" element={<Guard cap="stock" desktop><Reports mode="expiry-alerts" /></Guard>} />
        <Route path="/reports/brs" element={<Guard cap="brs" desktop><Reports mode="brs" /></Guard>} />
        <Route path="/gst" element={<Guard cap="gst" desktop><GST /></Guard>} />
        <Route path="/admin/users" element={<Guard cap="users" desktop><Admin mode="users" /></Guard>} />
        <Route path="/admin/audit" element={<Guard cap="audit" desktop><Admin mode="audit" /></Guard>} />
        <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
        <Route path="/settings" element={<Guard cap="settings" desktop><Settings /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function GuardedLayout() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}
