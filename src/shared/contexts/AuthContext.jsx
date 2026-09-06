import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi, setToken, removeToken, getToken } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const s = localStorage.getItem('sicaber_session');
    return s ? JSON.parse(s) : null;
  });
  // Mientras se valida el token contra el backend, no dejamos pasar
  // a las rutas privadas para evitar el "flash" del dashboard viejo
  // con datos en 401.
  const [checkingSession, setCheckingSession] = useState(true);

  const logout = () => {
    setUser(null);
    removeToken();
    localStorage.removeItem('sicaber_session');
  };

  // ── Validar el token real al cargar la app ────────────────────
  // Antes: si existía "sicaber_session" en localStorage, se confiaba
  // en él para siempre, sin importar si el JWT ya había expirado
  // (expira a las 8h). Esto hacía que el Dashboard se renderizara
  // como si el usuario estuviera logueado, pero todas las peticiones
  // a la API fallaran con 401 en bucle.
  // Ahora: si hay una sesión guardada, se confirma contra /auth/me.
  //
  // Autorización por permisos, punto 5: antes esta llamada se usaba solo
  // como "ping" (si tira 401, cierra sesión) y se descartaba la respuesta
  // — así que `user.permisos` se quedaba congelado con lo que trajo el
  // login, y un cambio de rol/permisos desde el panel de Roles solo se
  // reflejaba si el usuario volvía a iniciar sesión. Ahora la respuesta de
  // /auth/me (siempre los permisos ACTUALES del rol, ver backend
  // middleware/permisos.js) se usa para refrescar el usuario en memoria y
  // en localStorage cada vez que la app carga — nunca se reutilizan los
  // permisos viejos.
  useEffect(() => {
    const validar = async () => {
      const session = localStorage.getItem('sicaber_session');
      const token = getToken();
      if (session && token) {
        try {
          const data = await authApi.me(); // si el token expiró/inválido, tira 401
          setUser(prev => {
            if (!prev) return prev;
            const fresco = {
              ...prev,
              role:     data.rol ?? prev.role,
              esAdmin:  (data.rol ?? prev.role) === 'Administrador',
              sede:     data.sede ?? prev.sede,
              permisos: Array.isArray(data.permisos) ? data.permisos : [],
            };
            localStorage.setItem('sicaber_session', JSON.stringify(fresco));
            return fresco;
          });
        } catch (e) {
          logout();
        }
      } else if (session && !token) {
        // Sesión "fantasma": hay usuario guardado pero no hay token.
        logout();
      }
      setCheckingSession(false);
    };
    validar();
  }, []);

  // ── Reaccionar a un 401 detectado en cualquier petición ───────
  // api.js emite este evento cuando el backend responde 401.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('sicaber:unauthorized', onUnauthorized);
    return () => window.removeEventListener('sicaber:unauthorized', onUnauthorized);
  }, []);

  const login = async (username, password) => {
    try {
      const data = await authApi.loginAdmin(username, password);
      setToken(data.token);
      const u = {
        username: data.usuario.username,
        nombre:   data.usuario.nombre,
        role:     data.usuario.rol,
        esAdmin:  data.usuario.rol === 'Administrador',
        // Local al que pertenece el usuario (nombre real del local, ej.
        // "Local Villa Liliam" — o 'Ambos' para el Administrador). Se usa
        // para que cada cajero y bartender solo vea los pedidos de su
        // propio local. Sin fallback fijo: un local inventado aquí no
        // coincidiría con ningún local real y dejaría al usuario sin ver
        // ningún pedido en vez de fallar de forma visible.
        sede:     data.usuario.sede || '',
        // Permisos REALES del rol actual (backend: middleware/permisos.js,
        // GET /auth/login y GET /auth/me devuelven siempre la lista
        // vigente, nunca cacheada). Con esto arma el sidebar dinámico y el
        // gating de acciones (ver hasPermiso más abajo) — antes este campo
        // ni siquiera se guardaba, así que todo lo que dependía de él
        // (nada, hasta ahora) se habría quedado sin datos.
        permisos: Array.isArray(data.usuario.permisos) ? data.usuario.permisos : [],
      };
      setUser(u);
      localStorage.setItem('sicaber_session', JSON.stringify(u));
      const rol = u.role.toLowerCase();
      const redirectTo = rol.includes('bartender') ? '/bartender'
        : rol.includes('cajero') ? '/cajero'
        : '/admin/dashboard';
      return { success: true, redirectTo };
    } catch (e) {
      return { success: false, error: e.message || 'Credenciales inválidas' };
    }
  };

  // Autorización por permisos — misma convención que el backend
  // (middleware/permisos.js: clavePermiso(modulo, accion) = `${accion}_${modulo}`,
  // ej. hasPermiso('usuarios','eliminar') → 'eliminar_usuarios').
  //
  // BUG CRÍTICO (2026-08-22): Admin_Sicaber quedaba redirigido a
  // /acceso-no-autorizado apenas iniciaba sesión. Causa raíz real (no era
  // un desalineo de nombres ni una ruta sin modulo/accion — esos dos
  // estaban correctos): el backend dejó de devolver `permisos` en
  // /auth/login y /auth/me para TODO usuario, de cualquier rol —
  // sicaber-back-main/src/middleware/permisos.js ya no existe en disco y
  // routes/auth.js volvió a la versión sin permisos, así que
  // `user.permisos` llega `[]` incluso para el Administrador con sus 62
  // permisos intactos en la tabla `roles`. El fix de fondo es restaurar
  // eso en el backend (fuera de este repo) — mientras tanto, este atajo
  // evita que Administrador pueda auto-bloquearse por una falla de
  // sincronización que no depende de él. Si `user.permisos` alguna vez
  // vuelve a llegar completo, este atajo simplemente deja de hacer nada
  // (Administrador ya tendría los 62 permisos reales de todas formas).
  //
  // A propósito, el atajo es SOLO por `esAdmin` (rol === 'Administrador'),
  // nunca por "permisos ausente/null" en general — un Cajero o Bartender
  // con permisos vacíos por la misma falla del backend debe seguir viendo
  // exactamente nada, no "todo por accidente".
  const hasPermiso = (modulo, accion) => {
    if (!user) return false;
    if (user.esAdmin) return true;
    if (!Array.isArray(user.permisos)) return false;
    return user.permisos.includes(`${accion}_${modulo}`);
  };

  // Para el sidebar: un módulo se muestra si el usuario tiene AL MENOS un
  // permiso sobre él (ver/crear/editar/eliminar/gestionar/anular...), sin
  // importar cuál específicamente. Mismo atajo de Administrador que
  // hasPermiso — si no, el Administrador pasaría PrivateRoute pero vería
  // el sidebar completamente vacío (inutilizable) mientras el backend siga
  // sin mandar permisos.
  const hasAnyPermiso = modulo => {
    if (!user) return false;
    if (user.esAdmin) return true;
    if (!Array.isArray(user.permisos)) return false;
    return user.permisos.some(p => p.endsWith(`_${modulo}`));
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, hasPermiso, hasAnyPermiso, checkingSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
};