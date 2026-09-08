import React from 'react';
import './DateRangeFilter.css';

// ─────────────────────────────────────────────────────────────
//  DateRangeFilter — filtro de rango de fechas reutilizable.
//
//  Un solo componente para TODOS los filtros "desde / hasta" de
//  listados (Usuarios, Ventas, Combos, Categorías, Historial de
//  compras, etc.). Reglas comunes, aplicadas una sola vez acá:
//
//   · El campo "hasta" no deja elegir (ni en el calendario) una
//     fecha anterior al "desde" ya seleccionado — atributo `min`.
//   · El campo "desde" no deja elegir una fecha posterior al
//     "hasta" ya seleccionado — atributo `max`.
//   · Si ya hay rango y se mueve el "desde" más allá del "hasta"
//     (o se teclea a mano saltándose el calendario), se limpia el
//     "hasta" en vez de dejar un rango imposible. Y a la inversa.
//   · `maxToday` / `max` topan ambos campos (p. ej. no permitir
//     fechas futuras en un histórico).
//
//  Props:
//   · desde, hasta      strings 'YYYY-MM-DD' | ''
//   · onChange({ desde, hasta })   siempre recibe el par completo
//   · label             texto opcional a la izquierda
//   · maxToday          bool — topa ambos campos en la fecha de hoy
//   · max               ISO explícito para topar ambos campos
//   · showClear         (def. true) muestra la ✕ para limpiar
//   · title             title del contenedor
//   · inputClassName    clase extra para los <input> (ej. 'filtro-select')
// ─────────────────────────────────────────────────────────────
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function DateRangeFilter({
  desde = '',
  hasta = '',
  onChange,
  label,
  maxToday = false,
  max,
  showClear = true,
  title = 'Filtrar por rango de fechas',
  inputClassName = '',
  size = 'md',
}) {
  const topeMax = max || (maxToday ? todayISO() : undefined);

  const handleDesde = (v) => {
    // Rango imposible: nuevo "desde" posterior al "hasta" → se limpia "hasta".
    if (v && hasta && v > hasta) onChange({ desde: v, hasta: '' });
    else onChange({ desde: v, hasta });
  };
  const handleHasta = (v) => {
    // Rango imposible: nuevo "hasta" anterior al "desde" → se limpia "desde".
    if (v && desde && v < desde) onChange({ desde: '', hasta: v });
    else onChange({ desde, hasta: v });
  };
  const limpiar = () => onChange({ desde: '', hasta: '' });

  const cls = `drf-input drf-input--${size} ${inputClassName}`.trim();

  return (
    <div className="drf" title={title}>
      {label && <span className="drf__label">{label}</span>}
      <input
        type="date"
        className={cls}
        value={desde}
        max={hasta || topeMax || undefined}
        onChange={(e) => handleDesde(e.target.value)}
        aria-label={label ? `${label} — desde` : 'Fecha desde'}
      />
      <span className="drf__sep">–</span>
      <input
        type="date"
        className={cls}
        value={hasta}
        min={desde || undefined}
        max={topeMax || undefined}
        onChange={(e) => handleHasta(e.target.value)}
        aria-label={label ? `${label} — hasta` : 'Fecha hasta'}
      />
      {showClear && (desde || hasta) && (
        <button
          type="button"
          className="drf__clear"
          title="Limpiar filtro de fechas"
          aria-label="Limpiar filtro de fechas"
          onClick={limpiar}
        >
          ✕
        </button>
      )}
    </div>
  );
}
