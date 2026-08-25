import React from 'react';
import './Tooltip.css';

// Tooltip reutilizable para botones de acción con solo ícono (Ver/Editar/
// Anular/etc. en toda la app). Envuelve el botón existente sin tocar su
// clase, color ni onClick — solo agrega un <span> posicionado con CSS que
// aparece al pasar el cursor (o al enfocar con teclado), y no ocupa
// espacio en el layout cuando no está visible.
export default function Tooltip({ label, children, position = 'top' }) {
  const child = React.isValidElement(children)
    ? React.cloneElement(children, { 'aria-label': children.props['aria-label'] || label })
    : children;
  return (
    <span className="sicaber-tip-wrap">
      {child}
      <span className={`sicaber-tip sicaber-tip--${position}`} role="tooltip">{label}</span>
    </span>
  );
}
