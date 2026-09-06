import React, { useState, useEffect } from 'react';
import localesService from '../services/localesService';

// Selector de local para las vistas de Administración (Pedidos, Ventas,
// Devoluciones, Dashboard). Mismo criterio de acceso que ya usan CajeroPage
// y BartenderPage: sede='Ambos' (Administrador/Superadministrador) puede ver
// "Todos los locales" o acotar a uno; cualquier otra sede queda bloqueada a
// su propio local, sin poder ver los demás.
//
// Antes: <option value="Local 1">/<option value="Local 2"> fijos en el
// código — no reflejaban los locales reales (GET /locales), así que
// seguían apareciendo aunque esos locales ya no existieran en el backend.
export default function LocalFiltro({ value, onChange, sedeUsuario, style }) {
  const puedeVerTodos = sedeUsuario === 'Ambos';

  const [locales, setLocales] = useState([]);
  useEffect(() => {
    if (!puedeVerTodos) return; // el resto de sedes no necesita el listado, solo muestra la propia
    localesService.getActivos()
      .then(d => setLocales(Array.isArray(d) ? d : []))
      .catch(() => setLocales([]));
  }, [puedeVerTodos]);

  if (!puedeVerTodos) {
    return (
      <span
        title="Solo puedes ver la información de tu propio local"
        style={{
          padding: '9px 14px', border: '1.5px solid var(--border-input)', borderRadius: 8,
          fontSize: 13, background: 'var(--bg-hover)', color: 'var(--text-secondary)',
          fontWeight: 600, whiteSpace: 'nowrap', ...style,
        }}
      >
        Local: {sedeUsuario || '—'}
      </span>
    );
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      title="Filtrar por local"
      style={{
        padding: '9px 14px', border: '1.5px solid var(--border-input)', borderRadius: 8,
        fontSize: 13, outline: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)',
        ...style,
      }}
    >
      <option value="todos">Todos los locales</option>
      {locales.map(l => <option key={l.id} value={l.nombre}>{l.nombre}</option>)}
    </select>
  );
}
