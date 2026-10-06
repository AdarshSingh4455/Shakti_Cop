
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';

import { AuthProvider, useAuth } from './lib/auth';

import Shell from './components/Shell';
import Login from './pages/Login';
import Board from './pages/Board';
import Complaints from './pages/Complaints';
import ComplaintDetail from './pages/ComplaintDetail';
import Services from './pages/Services';
import Officers from './pages/Officers';
import Analytics from './pages/Analytics';

import './styles/tokens.css';

function Private({ children }) {
  const { admin, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          padding: 40,
          color: 'var(--ink-3)',
        }}
      >
        लोड हो रहा है...
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function Placeholder({ title }) {
  return (
    <>
      <div className="page-head">
        <h1>{title}</h1>
      </div>

      <div className="card empty">
        <strong>यह हिस्सा अभी बन रहा है</strong>
        <div>
          इस section का बाकी integration आगे जोड़ा जाएगा।
        </div>
      </div>
    </>
  );
}

ReactDOM.createRoot(
  document.getElementById('root')
).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>

          <Route
            path="/login"
            element={<Login />}
          />

          <Route
            element={
              <Private>
                <Shell />
              </Private>
            }
          >
            <Route
              index
              element={<Board />}
            />

            <Route
              path="complaints"
              element={<Complaints />}
            />

            <Route
              path="complaints/:id"
              element={<ComplaintDetail />}
            />

            <Route
              path="officers"
              element={<Officers />}
            />

            <Route
              path="analytics"
              element={<Analytics />}
            />

            <Route
              path="services"
              element={<Services />}
            />
          </Route>

          <Route
            path="*"
            element={
              <Navigate
                to="/"
                replace
              />
            }
          />

        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);