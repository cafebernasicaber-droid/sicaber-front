import React from 'react';

// Selector de local para las vistas de Administración (Pedidos, Ventas,
// Devoluciones, Dashboard). Mismo criterio de acceso que ya usan CajeroPage
// y BartenderPage: sede='Ambos' (Administrador/Superadministrador) puede ver
// "Todos los locales" o acotar a uno; cualquier otra sede queda bloqueada a
// su propio local, sin poder ver los demás.
export default function LocalFiltro({ value, onChange, sedeUsuario, style }) {
  const puedeVerTodos = sedeUsuario === 'Ambos';

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
      <option value="Local 1">Local 1</option>
      <option value="Local 2">Local 2</option>
    </select>
  );
}
