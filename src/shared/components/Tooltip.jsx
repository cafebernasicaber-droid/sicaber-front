import React from 'react';
import './Tooltip.css';

// Tooltip reutilizable para botones de solo ícono (Ver/Editar/Anular/etc. en
// toda la app) y para avisos de estado (stock bajo/agotado). Envuelve el
// elemento existente sin tocar su clase, color ni onClick — solo agrega un
// <span> posicionado con CSS que aparece al pasar el cursor (o al enfocar
// con teclado), y no ocupa espacio en el layout cuando no está visible.
// `tone` colorea el acento y la flechita para que la gravedad del aviso se
// note de un vistazo, sin tener que leer el texto: 'danger' (rojo, crítico),
// 'warning' (ámbar, aviso temprano) o el neutro por defecto.
export default function Tooltip({ label, children, position = 'top', tone = 'default' }) {
  const child = React.isValidElement(children)
    ? React.cloneElement(children, { 'aria-label': children.props['aria-label'] || label })
    : children;
  return (
    <span className="sicaber-tip-wrap">
      {child}
      <span className={`sicaber-tip sicaber-tip--${position} sicaber-tip--${tone}`} role="tooltip">{label}</span>
    </span>
  );
}
