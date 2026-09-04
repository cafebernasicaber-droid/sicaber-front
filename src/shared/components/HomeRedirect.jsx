// ─────────────────────────────────────────────────────────────
//  src/shared/components/HomeRedirect.jsx
//
//  Decide a dónde va el usuario después de iniciar sesión.
//  AuthContext.login() manda a '/admin', que renderiza este componente.
//
//  · Administrador → Dashboard. Tiene acceso a todo, así que no hay nada
//    que calcular: siempre entra por el mismo sitio.
//
//  · Cualquier otro rol → el PRIMER módulo del sidebar sobre el que tenga
//    permiso. Se recorre NAV_GROUPS (importado de Layout, no se duplica la
//    lista) EN SU MISMO ORDEN, así que el módulo al que aterriza es el
//    mismo que aparece primero en su menú.
//
//  Antes de esto, login() devolvía '/admin/dashboard' fijo para cualquier
//  rol del panel: un rol sin permiso de Dashboard caía en
//  /acceso-no-autorizado apenas iniciaba sesión, con una pantalla de error
//  como primera impresión del sistema.
//
//  Caso límite que queda abierto: un rol SIN ningún permiso sigue cayendo
//  en /acceso-no-autorizado. Es correcto en el sentido de que no tiene a
//  dónde ir, pero no le explica que el problema es su rol y no su cuenta.
//  Si alguna vez molesta, el arreglo es un mensaje más claro en
//  AccesoNoAutorizado, no una pantalla intermedia.
// ─────────────────────────────────────────────────────────────
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { NAV_GROUPS } from './Layout';

export default function HomeRedirect() {
  const { user, hasAnyPermiso, checkingSession } = useAuth();

  // Mientras se valida la sesión contra el backend, no decidir nada.
  if (checkingSession) return null;
  if (!user) return <Navigate to="/" replace />;

  if (user.esAdmin) return <Navigate to="/admin/dashboard" replace />;

  const primerItem = NAV_GROUPS
    .flatMap(g => g.items)
    .find(item => hasAnyPermiso(item.modulo));

  return <Navigate to={primerItem ? primerItem.path : '/acceso-no-autorizado'} replace />;
}
