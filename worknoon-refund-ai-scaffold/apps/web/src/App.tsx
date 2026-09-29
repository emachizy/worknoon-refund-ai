import { NavLink, Route, Routes } from 'react-router-dom';
import { CustomerPage } from './pages/CustomerPage';
import { AdminPage } from './pages/AdminPage';

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div><strong>RefundOps AI</strong><span>Policy-first refund support</span></div>
        <nav><NavLink to="/">Customer</NavLink><NavLink to="/admin">Admin</NavLink></nav>
      </header>
      <main><Routes><Route path="/" element={<CustomerPage />} /><Route path="/admin" element={<AdminPage />} /></Routes></main>
    </div>
  );
}
