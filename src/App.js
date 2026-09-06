import React, { useEffect } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from './shared/contexts/AuthContext';
import { ThemeProvider } from './shared/contexts/ThemeContext';
import { TransitionProvider } from './shared/contexts/TransitionContext';
import AppRoutes from './routes';
import './shared/styles/global.css';

const ScrollManager = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    const isPublic = pathname === '/' || pathname === '/login';
    document.documentElement.style.overflow = isPublic ? 'auto' : 'hidden';
    document.documentElement.style.height = isPublic ? 'auto' : '100%';
    document.body.style.overflow = isPublic ? 'auto' : 'hidden';
    document.body.style.height = isPublic ? 'auto' : '100%';
  }, [pathname]);
  return null;
};

const App = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <ThemeProvider>
      <AuthProvider>
        <TransitionProvider>
          <ScrollManager />
          <AppRoutes />
        </TransitionProvider>
      </AuthProvider>
    </ThemeProvider>
  </BrowserRouter>
);

export default App;