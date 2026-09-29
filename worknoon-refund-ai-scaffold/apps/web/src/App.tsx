import { NavLink, Route, Routes } from 'react-router-dom';
import { CustomerRefundPage } from './pages/CustomerRefundPage';
import { AdminPage } from './pages/AdminPage';

export default function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">R</span>
          <strong>RefundOps</strong>
        </div>
        <nav aria-label="Main">
          <NavLink to="/" end>
            Refund Assistant
          </NavLink>
          <NavLink to="/admin">Support Dashboard</NavLink>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<CustomerRefundPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}
