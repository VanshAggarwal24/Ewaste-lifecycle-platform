import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Public
import LoginPage from './pages/LoginPage';

// User
import UserDashboard from './pages/user/UserDashboard';
import SubmitEwaste  from './pages/user/SubmitEwaste';
import TrackItem     from './pages/user/TrackItem';
import MyItems       from './pages/user/MyItems';

// Agent
import AgentDashboard from './pages/agent/AgentDashboard';

// Center
import CenterDashboard from './pages/center/CenterDashboard';

// Recycler
import RecyclerDashboard from './pages/recycler/RecyclerDashboard';

// Admin
import AdminDashboard from './pages/admin/AdminDashboard';

function Unauthorized() {
  return (
    <div style={{ background: 'var(--color-bg)', color: 'var(--color-text)', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 48 }}>🚫</p>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Access Denied</h1>
      <p style={{ color: 'var(--color-muted)' }}>You do not have permission to view this page.</p>
      <a href="/login" style={{ color: 'var(--color-primary-light)', textDecoration: 'none' }}>← Go to Login</a>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="/"             element={<Navigate to="/login" replace />} />

          {/* User */}
          <Route path="/dashboard"  element={<ProtectedRoute roles={['USER']}><UserDashboard /></ProtectedRoute>} />
          <Route path="/submit"     element={<ProtectedRoute roles={['USER']}><SubmitEwaste /></ProtectedRoute>} />
          <Route path="/my-items"   element={<ProtectedRoute roles={['USER']}><MyItems /></ProtectedRoute>} />
          <Route path="/track/:id"  element={<ProtectedRoute roles={['USER', 'ADMIN']}><TrackItem /></ProtectedRoute>} />
          <Route path="/track"      element={<ProtectedRoute roles={['USER', 'ADMIN']}><MyItems /></ProtectedRoute>} />

          {/* Agent */}
          <Route path="/agent/dashboard" element={<ProtectedRoute roles={['COLLECTION_AGENT']}><AgentDashboard /></ProtectedRoute>} />
          <Route path="/agent/pickups"   element={<ProtectedRoute roles={['COLLECTION_AGENT']}><AgentDashboard /></ProtectedRoute>} />

          {/* Center */}
          <Route path="/center/dashboard" element={<ProtectedRoute roles={['CENTER_STAFF']}><CenterDashboard /></ProtectedRoute>} />
          <Route path="/center/incoming"  element={<ProtectedRoute roles={['CENTER_STAFF']}><CenterDashboard /></ProtectedRoute>} />
          <Route path="/center/inspect"   element={<ProtectedRoute roles={['CENTER_STAFF']}><CenterDashboard /></ProtectedRoute>} />
          <Route path="/center/batches"   element={<ProtectedRoute roles={['CENTER_STAFF']}><CenterDashboard /></ProtectedRoute>} />

          {/* Recycler */}
          <Route path="/recycler/dashboard" element={<ProtectedRoute roles={['RECYCLER']}><RecyclerDashboard /></ProtectedRoute>} />
          <Route path="/recycler/batches"   element={<ProtectedRoute roles={['RECYCLER']}><RecyclerDashboard /></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin/dashboard" element={<ProtectedRoute roles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute roles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
