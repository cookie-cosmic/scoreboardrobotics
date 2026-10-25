import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { CompetitionPage, ControllerPage, DashboardPage, DisplayPage, LoginPage, NewCompetitionPage, ResetPasswordPage, SetupPage } from './pages';
import './styles.css';

function Guard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="login-main" style={{ minHeight: '100vh' }}>Checking secure session…</div>;
  return user ? <>{children}</> : <Navigate to="/" replace />;
}

function Router() {
  return <Routes>
    <Route path="/" element={<LoginPage/>}/>
    <Route path="/setup" element={<SetupPage/>}/>
    <Route path="/reset-password" element={<ResetPasswordPage/>}/>
    <Route path="/app" element={<Guard><AppLayout/></Guard>}>
      <Route index element={<DashboardPage/>}/>
      <Route path="competitions" element={<DashboardPage/>}/>
      <Route path="competitions/new" element={<NewCompetitionPage/>}/>
      <Route path="competitions/:id" element={<CompetitionPage/>}/>
      <Route path="*" element={<DashboardPage/>}/>
    </Route>
    <Route path="/controller/:id" element={<ControllerPage/>}/>
    <Route path="/display/:id" element={<DisplayPage/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><AuthProvider><Router/></AuthProvider></BrowserRouter></StrictMode>);
