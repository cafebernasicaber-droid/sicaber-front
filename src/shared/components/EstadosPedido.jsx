// ─────────────────────────────────────────────────────────────
//  Badges de estado de un pedido — FUENTE ÚNICA para cliente, cajero y admin
//
//  Ronda 22 / C5: `estado_pedido` y `estado_pago` son DOS datos distintos
//  del backend y se muestran SIEMPRE como dos badges separados, nunca
//  combinados en un solo texto. Este componente es el único lugar donde se
//  define cómo se ven, para que las 3 vistas sean idénticas.
// ─────────────────────────────────────────────────────────────
import React from 'react';
import {
  configEstadoPedido,
  configEstadoPago,
  estadoPagoDe,
  configEstadoDevolucion,
} from '../utils/pedidoEstados';

const baseChip = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '2px 9px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1.5,
  whiteSpace: 'nowrap',
};

// Badge del ESTADO DEL PEDIDO (pendiente / en proceso / en camino / …).
export function EstadoPedidoBadge({ estado, tipo, style }) {
  const cfg = configEstadoPedido(estado, tipo);
  return (
    <span style={{ ...baseChip, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`, ...style }}>
      {cfg.label}
    </span>
  );
}

// Badge del ESTADO DEL PAGO (pendiente / verificando / aprobado / rechazado).
// `soloSiRelevante`: con method 'efectivo' + pago pendiente el badge no
// aporta nada — se puede ocultar pasando true.
export function EstadoPagoBadge({ pedido, style, soloSiRelevante = false }) {
  const ep = estadoPagoDe(pedido);
  if (soloSiRelevante && ep === 'pendiente') return null;
  const cfg = configEstadoPago(pedido);
  return (
    <span
      title={ep === 'rechazado' && (pedido?.comprobante_motivo_rechazo || pedido?.comprobanteMotivoRechazo)
        ? `Motivo: ${pedido.comprobante_motivo_rechazo || pedido.comprobanteMotivoRechazo}`
        : undefined}
      style={{ ...baseChip, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`, ...style }}
    >
      {cfg.label}
    </span>
  );
}

// Badge del ESTADO DE LA DEVOLUCIÓN — se omite del todo si no hay
// devolución aprobada ('ninguna'), para no ensuciar la fila con un chip
// vacío en el caso normal (la inmensa mayoría de los pedidos).
export function EstadoDevolucionBadge({ pedido, style }) {
  const cfg = configEstadoDevolucion(pedido);
  if (!cfg) return null;
  return (
    <span style={{ ...baseChip, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`, ...style }}>
      {cfg.label}
    </span>
  );
}

// Los tres juntos, en fila — el layout estándar para las 3 vistas.
export default function EstadosPedido({ pedido, estado, tipo, gap = 6, wrap = true, pagoSoloSiRelevante = false, style }) {
  const est = estado ?? pedido?.estado;
  const tp = tipo ?? pedido?.tipo;
  return (
    <span style={{ display: 'inline-flex', flexWrap: wrap ? 'wrap' : 'nowrap', gap, alignItems: 'center', ...style }}>
      <EstadoPedidoBadge estado={est} tipo={tp} />
      <EstadoPagoBadge pedido={pedido} soloSiRelevante={pagoSoloSiRelevante} />
      <EstadoDevolucionBadge pedido={pedido} />
    </span>
  );
}
