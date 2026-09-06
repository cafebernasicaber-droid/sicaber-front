// ─────────────────────────────────────────────────────────────
//  src/shared/components/PedidoProgreso.jsx
//
//  Línea de progreso del pedido, del lado del cliente.
//  Recorre los estados: Pedido recibido → Pago en verificación →
//  Pago confirmado → Preparando pedido → Pedido listo →
//  En camino (solo domicilio) → Entregado.
//
//  El paso "Pago en verificación" solo aparece si el método de pago
//  no es efectivo (con efectivo no hay comprobante que verificar).
//  El paso "En camino" solo aparece si el pedido es a domicilio.
//
//  Se apoya en el campo `estado` que ya maneja el resto del sistema
//  (pendiente, pendiente_verificacion, en_proceso, listo, en_camino,
//  entregado, cancelado) — no introduce estados nuevos que rompan el
//  flujo operativo de cocina/domicilios ya existente.
// ─────────────────────────────────────────────────────────────

import React from 'react';

const ORDEN_ESTADOS = ['pendiente_verificacion', 'pendiente', 'en_proceso', 'listo', 'en_camino', 'entregado'];

function construirPasos({ pago, tipo }) {
  const esEfectivo = pago === 'efectivo';
  const esDomicilio = tipo === 'domicilio';
  const pasos = [
    { key: 'recibido', label: 'Pedido recibido', icon: '📝' },
  ];
  if (!esEfectivo) pasos.push({ key: 'pendiente_verificacion', label: 'Pago en verificación', icon: '🔍' });
  pasos.push({ key: 'confirmado', label: 'Pago confirmado', icon: '✓' });
  pasos.push({ key: 'en_proceso', label: 'Preparando pedido', icon: '☕' });
  pasos.push({ key: 'listo', label: 'Pedido listo', icon: '📦' });
  if (esDomicilio) pasos.push({ key: 'en_camino', label: 'En camino', icon: '🛵' });
  pasos.push({ key: 'entregado', label: 'Entregado', icon: '🎉' });
  return pasos;
}

// Devuelve el índice (dentro de `pasos`) hasta el cual el pedido ya avanzó.
function indiceActual(pasos, estado) {
  if (estado === 'cancelado' || estado === 'anulado') return -1;
  // "pendiente" (efectivo) y "en_proceso" en adelante ya superaron la
  // verificación de pago, así que "confirmado" queda cubierto también
  // por esos estados aunque no exista como valor propio de `estado`.
  const mapaCobertura = {
    pendiente_verificacion: ['recibido', 'pendiente_verificacion'],
    pendiente:              ['recibido', 'confirmado'],
    en_proceso:             ['recibido', 'pendiente_verificacion', 'confirmado', 'en_proceso'],
    listo:                  ['recibido', 'pendiente_verificacion', 'confirmado', 'en_proceso', 'listo'],
    en_camino:              ['recibido', 'pendiente_verificacion', 'confirmado', 'en_proceso', 'listo', 'en_camino'],
    entregado:              ['recibido', 'pendiente_verificacion', 'confirmado', 'en_proceso', 'listo', 'en_camino', 'entregado'],
  };
  const cubiertos = mapaCobertura[estado] || ['recibido'];
  let idx = -1;
  pasos.forEach((p, i) => { if (cubiertos.includes(p.key)) idx = i; });
  return idx;
}

/**
 * @param {object} props
 * @param {string} props.estado — estado actual del pedido (pendiente_verificacion, pendiente, en_proceso, listo, en_camino, entregado, cancelado)
 * @param {string} props.pago   — método de pago (efectivo, nequi, transferencia)
 * @param {string} props.tipo   — 'domicilio' | 'local'
 * @param {'horizontal'|'vertical'} [props.orientacion]
 */
export default function PedidoProgreso({ estado, pago, tipo, orientacion = 'vertical' }) {
  const pasos = construirPasos({ pago, tipo });
  const idxActual = indiceActual(pasos, estado);
  const cancelado = estado === 'cancelado' || estado === 'anulado';

  if (cancelado) {
    return (
      <div className="pp-cancelado">
        <span className="pp-cancelado__icon">✕</span>
        <span>Pedido cancelado</span>
      </div>
    );
  }

  return (
    <div className={`pp-root pp-root--${orientacion}`}>
      {pasos.map((p, i) => {
        const completado = i < idxActual;
        const activo = i === idxActual;
        const pendiente = i > idxActual;
        return (
          <div key={p.key} className={`pp-item ${completado ? 'pp-item--done' : ''} ${activo ? 'pp-item--active' : ''} ${pendiente ? 'pp-item--pending' : ''}`}>
            <div className="pp-item__marker">
              <span className="pp-item__dot">{completado ? '✓' : p.icon}</span>
              {i < pasos.length - 1 && <span className="pp-item__line" />}
            </div>
            <div className="pp-item__label">{p.label}</div>
          </div>
        );
      })}
    </div>
  );
}
