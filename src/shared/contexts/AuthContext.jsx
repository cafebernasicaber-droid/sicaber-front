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
  useEffect(() => {
    const validar = async () => {
      const session = localStorage.getItem('sicaber_session');
      const token = getToken();
      if (session && token) {
        try {
          await authApi.me(); // si el token expiró/inválido, tira 401
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
        // Local al que pertenece el usuario ('Local 1' / 'Local 2' /
        // 'Ambos' para el Administrador). Se usa para que cada cajero y
        // bartender solo vea los pedidos de su propio local.
        sede:     data.usuario.sede || 'Local 1',
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

  const hasPermiso = pid => {
    if (!user) return false;
    if (user.esAdmin || user.permisos === null) return true;
    return Array.isArray(user.permisos) && user.permisos.includes(pid);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, hasPermiso, checkingSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
};