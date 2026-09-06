// ─────────────────────────────────────────────────────────────
//  src/shared/components/PermisoDeniedToast.jsx
//
//  Aviso global para las respuestas 403 del backend (Tarea 1, punto 4).
//
//  El backend es quien bloquea de verdad: cuando cierra un hueco de
//  protección que el frontend todavía muestra (ej. un botón "Anular" que
//  aparece aunque el rol no tenga el permiso), la petición devuelve 403.
//  Antes eso "fallaba en silencio" — cada pantalla lo tragaba a su manera
//  (`.catch(() => setX([]))`) o dejaba una promesa sin capturar.
//
//  api.js ahora emite el evento 'sicaber:forbidden' en CADA 403; este
//  componente, montado una sola vez sobre el enrutador, lo escucha y
//  muestra un toast con el mensaje del propio backend. No decide nada de
//  permisos — solo comunica lo que el backend ya respondió.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';

const DURACION_MS = 5000;

export default function PermisoDeniedToast() {
  const [aviso, setAviso] = useState(null); // { message } | null
  const timerRef = useRef(null);
  // Evita repetir el MISMO mensaje si varias peticiones fallan casi a la vez
  // (ej. una pantalla que dispara 3 GET protegidos al montarse).
  const ultimoRef = useRef({ message: '', ts: 0 });

  useEffect(() => {
    const onForbidden = (e) => {
      const message = (e.detail && e.detail.message) || 'No tienes permiso para realizar esta acción.';
      const ahora = Date.now();
      if (message === ultimoRef.current.message && ahora - ultimoRef.current.ts < DURACION_MS) return;
      ultimoRef.current = { message, ts: ahora };
      setAviso({ message });
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setAviso(null), DURACION_MS);
    };
    window.addEventListener('sicaber:forbidden', onForbidden);
    return () => {
      window.removeEventListener('sicaber:forbidden', onForbidden);
      clearTimeout(timerRef.current);
    };
  }, []);

  if (!aviso) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)',
        zIndex: 99999, maxWidth: 'min(92vw, 460px)',
        display: 'flex', alignItems: 'flex-start', gap: 10,
        background: '#B71C1C', color: '#fff',
        padding: '12px 16px', borderRadius: 12,
        boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
        fontSize: 13.5, lineHeight: 1.45,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
        <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      </svg>
      <span style={{ flex: 1 }}>
        <strong style={{ display: 'block', marginBottom: 2 }}>Acción no permitida</strong>
        {aviso.message}
      </span>
      <button
        type="button"
        onClick={() => setAviso(null)}
        aria-label="Cerrar aviso"
        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0, opacity: 0.85 }}
      >
        ✕
      </button>
    </div>
  );
}
