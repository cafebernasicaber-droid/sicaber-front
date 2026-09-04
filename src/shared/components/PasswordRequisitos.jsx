import React from 'react';
import { requisitosPassword } from '../utils/passwordPolicy';

// ─────────────────────────────────────────────────────────────────────────────
//  Checklist de requisitos de contraseña, en vivo
// ─────────────────────────────────────────────────────────────────────────────
// Se muestra debajo de cualquier campo de contraseña para que el usuario VEA
// qué se le está pidiendo y qué le falta MIENTRAS escribe. Antes las reglas
// solo aparecían como un mensaje de error después de intentar guardar (y
// además cada pantalla pedía una regla distinta).
//
// Uso:
//   <PasswordRequisitos password={form.password} />
//
// `mostrarSiempre`: por defecto la checklist aparece solo cuando el usuario
// ya empezó a escribir, para no llenar el formulario de avisos en rojo antes
// de que haya tecleado nada. Con `mostrarSiempre` se ve desde el inicio.
const PasswordRequisitos = ({ password, mostrarSiempre = false, compacto = false }) => {
  const vacia = !password;
  if (vacia && !mostrarSiempre) return null;

  const requisitos = requisitosPassword(password);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginTop: 6,
        display: 'grid',
        gridTemplateColumns: compacto ? '1fr' : '1fr 1fr',
        gap: '2px 10px',
      }}
    >
      {requisitos.map(r => (
        <div
          key={r.clave}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            lineHeight: 1.5,
            // Antes de escribir nada, todo en gris neutro: son instrucciones,
            // no errores.
            color: vacia ? 'var(--text-muted)' : (r.cumple ? '#2E7D32' : '#E53935'),
          }}
        >
          <span aria-hidden="true" style={{ flexShrink: 0, fontWeight: 700, width: 10, textAlign: 'center' }}>
            {vacia ? '•' : (r.cumple ? '✓' : '×')}
          </span>
          <span>{r.texto}</span>
        </div>
      ))}
    </div>
  );
};

export default PasswordRequisitos;
