import React from 'react';
import './PageTransitionOverlay.css';

/**
 * Overlay de transición de página: difumina el fondo, barre una cortina
 * diagonal verde y muestra una taza de café animada mientras se completa
 * una acción (login, registro, verificación, navegación, etc).
 *
 * Se monta/desmonta su contenido interno controlado por `active`, y cada
 * vez que `runId` cambia se vuelve a montar (key) para reiniciar todas
 * las animaciones desde cero, incluso si se dispara dos veces seguidas.
 */
export default function PageTransitionOverlay({ active, runId, label }) {
  return (
    <div className={`pto${active ? ' pto--active' : ''}`} aria-hidden={!active}>
      {active && (
        <div className="pto__run" key={runId}>
          <div className="pto__blur" />
          <div className="pto__panel" />
          <div className="pto__content">
            <div className="pto__cup">
              <div className="pto__steam"><span /><span /><span /></div>
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 24h34v14a13 13 0 0 1-13 13H25a13 13 0 0 1-13-13V24z" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
                <path d="M46 27h4a6 6 0 0 1 0 12h-4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="8" y1="56" x2="56" y2="56" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </div>
            {label && <div className="pto__label">{label}</div>}
          </div>
        </div>
      )}
    </div>
  );
}