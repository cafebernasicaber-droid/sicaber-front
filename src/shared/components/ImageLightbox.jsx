// ─────────────────────────────────────────────────────────────
//  src/shared/components/ImageLightbox.jsx
//
//  Visor de imagen a pantalla completa con zoom, pensado para
//  comprobantes de pago (Compras y checkout del cliente). Muestra
//  la imagen completa sin recortes (object-fit: contain) y permite
//  ampliar/reducir con los botones, la rueda del mouse o pellizco
//  en móvil.
// ─────────────────────────────────────────────────────────────

import React, { useState, useRef, useCallback } from 'react';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export default function ImageLightbox({ src, alt = 'Comprobante', onClose }) {
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

  const clampZoom = z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  const zoomIn  = () => setZoom(z => clampZoom(z + 0.5));
  const zoomOut = () => setZoom(z => {
    const nz = clampZoom(z - 0.5);
    if (nz === 1) setPos({ x: 0, y: 0 });
    return nz;
  });
  const reset = () => { setZoom(1); setPos({ x: 0, y: 0 }); };

  const onWheel = useCallback(e => {
    e.preventDefault();
    setZoom(z => {
      const nz = clampZoom(z + (e.deltaY < 0 ? 0.3 : -0.3));
      if (nz === 1) setPos({ x: 0, y: 0 });
      return nz;
    });
  }, []);

  const onMouseDown = e => {
    if (zoom === 1) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };
  const onMouseMove = e => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  };
  const onMouseUp = () => { dragRef.current = null; };

  if (!src) return null;

  return (
    <div className="ilb-overlay" onClick={onClose}>
      <div className="ilb-toolbar" onClick={e => e.stopPropagation()}>
        <button className="ilb-btn" onClick={zoomOut} title="Reducir" disabled={zoom <= MIN_ZOOM}>−</button>
        <span className="ilb-zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="ilb-btn" onClick={zoomIn} title="Ampliar" disabled={zoom >= MAX_ZOOM}>+</button>
        {zoom !== 1 && <button className="ilb-btn ilb-btn--reset" onClick={reset} title="Restablecer">Restablecer</button>}
        <button className="ilb-btn ilb-btn--close" onClick={onClose} title="Cerrar">✕</button>
      </div>
      <div
        className="ilb-stage"
        onClick={e => e.stopPropagation()}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <img
          src={src}
          alt={alt}
          className="ilb-img"
          draggable={false}
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`,
            cursor: zoom > 1 ? 'grab' : 'zoom-in',
          }}
          onClick={e => { e.stopPropagation(); if (zoom === 1) zoomIn(); }}
        />
      </div>
      <p className="ilb-hint">Rueda del mouse o los botones para hacer zoom · clic afuera para cerrar</p>
    </div>
  );
}
