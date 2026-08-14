import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const PrivateRoute = ({ children }) => {
  const { user, checkingSession } = useAuth();

  // Evita renderizar el Dashboard (y disparar sus peticiones) con una
  // sesión que todavía no fue confirmada contra el backend.
  if (checkingSession) return null; // o un spinner si prefieres

  return user ? children : <Navigate to="/" replace />;
};

export default PrivateRoute;