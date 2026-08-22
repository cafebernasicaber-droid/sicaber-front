import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Autorización por permisos, punto 3: además de exigir sesión (como antes),
// ahora puede exigir un permiso concreto sobre un módulo. `modulo` es la
// misma clave que usa el backend en requierePermiso(modulo, accion) — ej.
// modulo="usuarios" — y `accion` es 'ver' por defecto (la mayoría de las
// rutas protegidas son la pantalla principal de un módulo). Si el usuario
// tiene sesión pero no ese permiso, se redirige a /acceso-no-autorizado en
// vez de dejarlo pasar (antes: cualquier usuario logueado podía entrar a
// cualquier ruta /admin/*, sin importar su rol o sus permisos reales).
const PrivateRoute = ({ children, modulo, accion = 'ver' }) => {
  const { user, checkingSession, hasPermiso } = useAuth();

  // Evita renderizar el Dashboard (y disparar sus peticiones) con una
  // sesión que todavía no fue confirmada contra el backend.
  if (checkingSession) return null; // o un spinner si prefieres

  if (!user) return <Navigate to="/" replace />;

  // BUG CRÍTICO (2026-08-22): Administrador quedaba redirigido a
  // /acceso-no-autorizado apenas iniciaba sesión porque el backend dejó de
  // mandar `permisos` (ver el mismo comentario, más detallado, en
  // AuthContext.hasPermiso). Esta línea es la protección explícita que se
  // pidió acá además del fix de fondo en hasPermiso/hasAnyPermiso: el
  // Administrador SIEMPRE pasa, sin importar qué traiga (o no traiga)
  // `user.permisos` — nunca debe poder auto-bloquearse por una falla de
  // sincronización de nombres de permisos que no depende de él.
  if (user.esAdmin) return children;

  if (modulo && !hasPermiso(modulo, accion)) return <Navigate to="/acceso-no-autorizado" replace />;

  return children;
};

export default PrivateRoute;
