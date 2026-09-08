import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './SearchSelect.css';

// ─────────────────────────────────────────────────────────────
//  SearchSelect — un solo desplegable reutilizable con buscador
//  integrado. Se ve como un select normal: al hacer clic muestra
//  toda la lista; además se puede ESCRIBIR para filtrar.
//
//  Usado en: Categoría de Insumo, Ciudad de Proveedor, Proveedor
//  de Compras, Insumo de Compras (vía InsumoSearchSelect), etc.
//
//  batch 9.5 item 2 — el desplegable se renderiza en un PORTAL sobre
//  <body> con posición `fixed`, así NUNCA lo recorta el `overflow`
//  de un panel o el scroll de un modal (antes, dentro del panel
//  "Configurar insumo a añadir" de Registrar Compra, se veía una
//  sola fila cortada por el borde del card). Se reposiciona al
//  hacer scroll o redimensionar, y se voltea hacia arriba si no
//  cabe abajo.
//
//  Props:
//   · value        valor seleccionado (string | number)
//   · options      [{ value, label, sub? , subPlaceholder? }]
//   · onChange(v)  se llama con el value elegido
//   · placeholder / disabled / loading / emptyMessage / hasError
//   · onManage / manageLabel  enlace opcional ENCIMA del campo
//   · autoFocus / name
//
//  Teclado: ↑/↓ mueven el resaltado, Enter elige, Esc cierra.
// ─────────────────────────────────────────────────────────────
export default function SearchSelect({
  value,
  options = [],
  onChange,
  placeholder = 'Seleccionar…',
  disabled = false,
  loading = false,
  emptyMessage = 'No hay opciones disponibles.',
  hasError = false,
  onManage,
  manageLabel = 'Añadir',
  autoFocus = false,
  name,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(-1);
  const [pos, setPos] = useState(null); // { left, top, width, maxHeight, drop:'down'|'up' }
  const wrapRef = useRef(null);
  const controlRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const dropRef = useRef(null);

  const selected = useMemo(
    () => options.find(o => String(o.value) === String(value)) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(q) || (o.sub && String(o.sub).toLowerCase().includes(q))
    );
  }, [options, query]);

  // ── Posicionamiento del portal ───────────────────────────────
  const recalcPos = useCallback(() => {
    const el = controlRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const GAP = 4;
    const spaceBelow = vh - r.bottom - GAP;
    const spaceAbove = r.top - GAP;
    const DESIRED = 340;
    const dropUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(DESIRED, dropUp ? spaceAbove : spaceBelow));
    setPos({
      left: r.left,
      width: r.width,
      top: dropUp ? undefined : r.bottom + GAP,
      bottom: dropUp ? vh - r.top + GAP : undefined,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    recalcPos();
    const onScroll = () => recalcPos();
    const onResize = () => recalcPos();
    // capture:true → también atrapa el scroll de contenedores internos
    // (el cuerpo del modal de Registrar Compra, por ejemplo).
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, recalcPos]);

  // Cierre al hacer clic fuera — se comprueba tanto el campo como el
  // desplegable (que vive en otro punto del árbol, en el portal).
  useEffect(() => {
    const onDoc = (e) => {
      const inWrap = wrapRef.current?.contains(e.target);
      const inDrop = dropRef.current?.contains(e.target);
      if (!inWrap && !inDrop) { setOpen(false); setQuery(''); setActiveIdx(-1); }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Al abrir, resalta la opción ya seleccionada (o la primera).
  useEffect(() => {
    if (!open) return;
    const i = selected ? filtered.findIndex(o => String(o.value) === String(selected.value)) : -1;
    setActiveIdx(i >= 0 ? i : (filtered.length ? 0 : -1));
  }, [open]); // eslint-disable-line

  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[activeIdx];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const abrir = () => {
    if (disabled) return;
    setOpen(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };
  const elegir = (opt) => {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
    setActiveIdx(-1);
  };
  const onKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActiveIdx(i => Math.min((i < 0 ? -1 : i) + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && activeIdx >= 0 && filtered[activeIdx]) {
        e.preventDefault();
        elegir(filtered[activeIdx]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const dropdown = open && !disabled && pos && createPortal(
    <div
      ref={dropRef}
      className="ss-dropdown ss-dropdown--portal"
      style={{
        position: 'fixed',
        left: pos.left,
        width: pos.width,
        top: pos.top,
        bottom: pos.bottom,
        maxHeight: pos.maxHeight,
        zIndex: 99999,
      }}
    >
      {loading ? (
        <div className="ss-msg">Cargando…</div>
      ) : options.length === 0 ? (
        <div className="ss-msg">{emptyMessage}</div>
      ) : filtered.length === 0 ? (
        <div className="ss-msg">Sin resultados{query ? ` para "${query.trim()}"` : ''}.</div>
      ) : (
        <div ref={listRef} className="ss-list" role="listbox">
          {filtered.map((o, i) => (
            <div
              key={o.value}
              role="option"
              aria-selected={selected && String(selected.value) === String(o.value)}
              className={`ss-opt ${i === activeIdx ? 'is-active' : ''} ${selected && String(selected.value) === String(o.value) ? 'is-selected' : ''}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => { e.preventDefault(); elegir(o); }}
            >
              <span className="ss-opt__label">{o.label}</span>
              {o.sub
                ? <span className="ss-opt__sub">{o.sub}</span>
                : o.subPlaceholder
                  ? <span className="ss-opt__sub ss-opt__sub--empty">{o.subPlaceholder}</span>
                  : null}
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body
  );

  return (
    <div ref={wrapRef} className={`ss-wrap ${hasError ? 'ss-wrap--error' : ''} ${disabled ? 'ss-wrap--disabled' : ''}`}>
      {onManage && (
        <button type="button" className="ss-manage" onClick={onManage} tabIndex={-1}>
          {manageLabel}
        </button>
      )}
      <div className="ss-control" ref={controlRef}>
        <input
          ref={inputRef}
          name={name}
          type="text"
          className="ss-input"
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          value={open ? query : (selected ? selected.label : '')}
          placeholder={selected ? selected.label : placeholder}
          onFocus={abrir}
          onClick={abrir}
          onChange={e => { setQuery(e.target.value); if (!open) setOpen(true); setActiveIdx(0); }}
          onKeyDown={onKeyDown}
        />
        <svg className="ss-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {dropdown}
    </div>
  );
}
