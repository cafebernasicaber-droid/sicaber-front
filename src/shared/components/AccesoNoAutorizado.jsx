// ─────────────────────────────────────────────────────────────
//  src/shared/components/AccesoNoAutorizado.jsx
//
//  Autorización por permisos, punto 3: página a la que PrivateRoute
//  redirige cuando el usuario SÍ tiene sesión pero NO tiene el permiso
//  que exige la ruta — antes esto no existía porque PrivateRoute solo
//  verificaba "¿hay sesión?", nunca "¿puede entrar acá?".
// ─────────────────────────────────────────────────────────────
import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function AccesoNoAutorizado() {
  const navigate = useNavigate();
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      background: 'var(--bg-app, #f5f5f0)', padding: 24, textAlign: 'center',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%', background: 'rgba(229,57,53,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E53935',
      }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
      </div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary, #1c1108)' }}>
        Acceso no autorizado
      </h1>
      <p style={{ margin: 0, maxWidth: 420, fontSize: 14, color: 'var(--text-secondary, #666)' }}>
        Tu cuenta no tiene permiso para entrar a este módulo. Si crees que deberías tenerlo,
        pídele a un administrador que revise el rol asignado.
      </p>
      <button
        onClick={() => navigate(-1)}
        style={{
          marginTop: 8, padding: '10px 22px', borderRadius: 10, border: 'none',
          background: 'linear-gradient(135deg, #4CAF50, #388E3C)', color: 'white',
          fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(76,175,80,0.3)',
        }}
      >
        ← Volver
      </button>
    </div>
  );
}
