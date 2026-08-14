import React from 'react';
import Tooltip from './Tooltip';

// Botón "Anular" único y reutilizable para todo el sistema — antes cada
// módulo (Insumos, Proveedores, Fichas Técnicas, Pedidos, Usuarios,
// Productos, Categorías, Adiciones, Toppings, Combos, Compras, ...)
// reimplementaba a mano el mismo ícono de papelera + Tooltip, algunos con
// texto visible ("Anular"/"Eliminar") y otros sin él. Este componente es el
// único lugar que define el ícono y el texto del tooltip: nunca muestra
// texto permanente, solo el ícono, con "Anular" (o `label`, para el único
// caso legítimo de explicar por qué está deshabilitado) al pasar el cursor.
const IconPapelera = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

export default function AnularButton({
  onClick,
  disabled = false,
  label = 'Anular',
  className = 'btn-anular',
  size = 16,
  style,
  position,
}) {
  return (
    <Tooltip label={label} position={position}>
      <button
        type="button"
        className={className}
        onClick={onClick}
        disabled={disabled}
        style={style}
      >
        <IconPapelera width={size} height={size} />
      </button>
    </Tooltip>
  );
}
