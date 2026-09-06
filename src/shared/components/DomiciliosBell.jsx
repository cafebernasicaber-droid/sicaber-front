// ─────────────────────────────────────────────────────────────
//  src/shared/components/DomiciliosBell.jsx
//
//  Campana de notificaciones de DOMICILIOS para el header.
//  Se usa tanto en el panel Admin (Layout.jsx) como en el
//  panel Cajero (CajeroPage.jsx). Siempre visible en el header,
//  incluso cuando no hay domicilios activos.
//
//  Muestra, por cada domicilio activo:
//    - Para quién es (nombre del cliente)
//    - Para dónde es (dirección)
//    - Qué es el domicilio (detalle de los productos)
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import pedidosService from '../../features/pedidos/services/pedidosService';
import './DomiciliosBell.css';

const ESTADOS_ACTIVOS = ['pendiente_verificacion', 'pendiente', 'en_proceso', 'en_preparacion', 'listo', 'en_camino'];

const ESTADO_LABEL = {
  pendiente_verificacion: 'Por verificar pago',
  pendiente:      'Pendiente',
  en_proceso:     'Preparando',
  en_preparacion: 'En preparación',
  listo:          'Listo para salir',
  en_camino:      'En camino',
};

const fmtProductos = (productos) => {
  if (!Array.isArray(productos) || productos.length === 0) return 'Sin detalle de productos';
  return productos.map(p => `${p.cantidad ? `${p.cantidad}x ` : ''}${p.nombre}`).join(', ');
};

/**
 * @param {object}   props
 * @param {function} [props.onVerTodos] — acción al pulsar "Ver todos los pedidos".
 *                                        Por defecto navega a /pedidos.
 */
const DomiciliosBell = ({ onVerTodos }) => {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState([]);
  const [open, setOpen]       = useState(false);
  const wrapRef = useRef(null);

  const refresh = useCallback(() => {
    pedidosService.getAll()
      .then(d => setPedidos(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const domicilios = pedidos
    .filter(p => p.tipo === 'domicilio' && ESTADOS_ACTIVOS.includes(p.estado))
    .sort((a, b) => Number(b.id) - Number(a.id));

  const handleVerTodos = () => {
    setOpen(false);
    if (onVerTodos) onVerTodos();
    else navigate('/pedidos');
  };

  return (
    <div className="dmb-wrap" ref={wrapRef}>
      <button
        className={`dmb-bell ${domicilios.length > 0 ? 'dmb-bell--activo' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Notificaciones de domicilios"
        aria-label="Notificaciones de domicilios"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
        {domicilios.length > 0 && (
          <span className="dmb-badge">{domicilios.length > 9 ? '9+' : domicilios.length}</span>
        )}
      </button>

      {open && (
        <div className="dmb-panel">
          <div className="dmb-panel__head">
            <span>🛵 Domicilios activos</span>
            <span className="dmb-panel__count">{domicilios.length}</span>
          </div>

          <div className="dmb-panel__list">
            {domicilios.length === 0 ? (
              <div className="dmb-empty">
                <span className="dmb-empty__icon">🛵</span>
                <p>No hay domicilios activos por el momento.</p>
              </div>
            ) : (
              domicilios.map(p => (
                <div key={p.id} className="dmb-item">
                  <div className="dmb-item__top">
                    <span className="dmb-item__cliente">👤 {p.cliente || 'Cliente sin nombre'}</span>
                    <span className={`dmb-item__estado dmb-item__estado--${p.estado}`}>
                      {ESTADO_LABEL[p.estado] || p.estado}
                    </span>
                  </div>
                  <div className="dmb-item__row">
                    <span className="dmb-item__label">Dirección:</span>
                    <span className="dmb-item__val">{p.direccionAlternativa || 'Sin dirección registrada'}</span>
                  </div>
                  <div className="dmb-item__row">
                    <span className="dmb-item__label">Pedido:</span>
                    <span className="dmb-item__val">{fmtProductos(p.productos)}</span>
                  </div>
                  {p.domiciliario && (
                    <div className="dmb-item__row">
                      <span className="dmb-item__label">Domiciliario:</span>
                      <span className="dmb-item__val">{p.domiciliario}</span>
                    </div>
                  )}
                  <div className="dmb-item__foot">
                    <span>#{p.id}</span>
                    {p.hora && <span>{p.hora}</span>}
                  </div>
                </div>
              ))
            )}
          </div>

          <button className="dmb-panel__foot" onClick={handleVerTodos}>
            Ver todos los pedidos →
          </button>
        </div>
      )}
    </div>
  );
};

export default DomiciliosBell;
