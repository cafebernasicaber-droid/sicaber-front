import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';

const IconLupa = (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;

const SIN_EXCLUIDOS = new Set();

// Alto máximo "deseado" del desplegable. El alto REAL se recorta al espacio
// disponible en pantalla (arriba o abajo del input) para que nunca quede
// cortado — ver `calcularPos`.
const MAX_ALTO_DROPDOWN = 320;
const ALTO_FILA = 52;

// Buscador con lupa reutilizable para elegir un insumo — se usó primero en
// el formulario de Ficha Técnica ("Insumos requeridos" y "Toppings") y
// también en el formulario de Topping (selector de insumo asociado), para
// no duplicar este componente en cada módulo. Filtra en el frontend (no
// pagina) y muestra un desplegable de coincidencias. Al elegir una opción
// entrega el insumo completo (no solo el id).
//
// El desplegable se renderiza con un PORTAL a <body> y posición `fixed`:
// así NUNCA lo recorta el `overflow-y:auto` del modal de Ficha Técnica (que
// además es más corto que la pantalla). Se abre hacia abajo o hacia arriba
// según dónde haya más sitio, y su alto se acota a ese espacio.
//
// IMPORTANTE (por diseño del backend, ver Tarea 2): puede haber varios
// insumos con el MISMO nombre — no son duplicados por error, cada uno
// pertenece a un LOCAL distinto y tiene su propio stock. Por eso cada fila
// muestra el local ("Café molido — Local Villa Liliam") además de la unidad
// y la categoría, para distinguirlos sin ambigüedad. `GET /insumos`
// (insumosService.getAll) ya expone `localNombre`, `unidadMedida` y
// `categoria` en cada insumo.
//
// `excludeIds` (Set de ids en string) son insumos que NO deben ofrecerse
// como sugerencia porque ya se usaron en OTRA fila de la misma lista — el
// insumo actualmente elegido en ESTE campo (`value`) nunca se excluye.
//
// `preferidos` (opcional): catálogo reducido que se muestra como sugerencia
// inicial mientras el campo está vacío. Al escribir, la búsqueda pasa a
// `insumos` (catálogo completo).
export default function InsumoSearchSelect({ insumos, preferidos, value, onSelect, placeholder, hasError, excludeIds }) {
  const [query, setQuery] = useState('');
  // La lista de sugerencias se filtra sobre `debouncedQuery` (no `query`)
  // para que el <input> responda al instante pero las filas del desplegable
  // solo se recalculen ~180ms después de la última tecla — antes, un
  // re-render a mitad de un toque podía correr la fila y el toque terminaba
  // sin seleccionar nada.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen]   = useState(false);
  // Índice resaltado para navegación con teclado (flechas + Enter).
  const [activo, setActivo] = useState(0);
  // Posición y alto calculados del desplegable (portal, fixed).
  const [pos, setPos] = useState(null); // { left, width, top?, bottom?, maxHeight }
  const inputRef = useRef(null);
  const itemRefs = useRef([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  const seleccionado = insumos.find(i => String(i.id) === String(value));
  const excluidos = excludeIds || SIN_EXCLUIDOS;
  const q = debouncedQuery.trim().toLowerCase();
  const base = q || !preferidos ? insumos : preferidos;

  const { opciones, hayDisponibles } = useMemo(() => {
    // Catálogo ofrecido: activos y no usados en otra fila — salvo el propio
    // valor de este campo, que siempre se mantiene.
    const disponibles = base.filter(i =>
      String(i.id) === String(value) || (i.estado !== 'Inactivo' && !excluidos.has(String(i.id)))
    );
    if (value && !disponibles.some(i => String(i.id) === String(value)) && seleccionado) {
      disponibles.unshift(seleccionado);
    }
    // Al escribir se busca por nombre Y por local (teclear el nombre del
    // local ayuda a acotar entre insumos homónimos).
    const lista = q
      ? disponibles.filter(i =>
          i.nombre.toLowerCase().includes(q) ||
          String(i.localNombre || '').toLowerCase().includes(q))
      : disponibles;
    return { opciones: lista, hayDisponibles: disponibles.length > 0 };
  }, [base, value, excluidos, seleccionado, q]);

  // Recalcula posición/alto del desplegable según el espacio disponible.
  const calcularPos = useCallback(() => {
    const r = inputRef.current?.getBoundingClientRect();
    if (!r) return;
    const margen = 8;
    const espacioAbajo  = window.innerHeight - r.bottom - margen;
    const espacioArriba = r.top - margen;
    const abajo = espacioAbajo >= Math.min(MAX_ALTO_DROPDOWN, espacioArriba) || espacioAbajo >= 180;
    const disponible = abajo ? espacioAbajo : espacioArriba;
    const maxHeight = Math.max(120, Math.min(MAX_ALTO_DROPDOWN, disponible));
    setPos(abajo
      ? { left: r.left, width: r.width, top: r.bottom + 3, maxHeight }
      : { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 3, maxHeight });
  }, []);

  // Reajusta el índice resaltado cuando cambia la lista.
  useEffect(() => { setActivo(opciones.length ? 0 : -1); }, [q, open, opciones.length]);

  // Mantiene visible la fila resaltada al navegar con flechas.
  useEffect(() => {
    if (!open || activo < 0) return;
    const el = itemRefs.current[activo];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [activo, open]);

  // Mientras está abierto: recalcula posición al montar y en cada scroll/
  // resize (el modal puede scrollear por dentro).
  useEffect(() => {
    if (!open) { setPos(null); return; }
    calcularPos();
    const onMove = () => calcularPos();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, calcularPos]);

  const abrir = () => { setQuery(''); setDebouncedQuery(''); setOpen(true); };

  const elegir = (insumo) => {
    if (!insumo) return;
    onSelect(insumo);
    setQuery(''); setDebouncedQuery(''); setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { abrir(); return; }
      setActivo(i => Math.min((i < 0 ? -1 : i) + 1, opciones.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo(i => Math.max((i <= 0 ? opciones.length : i) - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && opciones[activo]) { e.preventDefault(); elegir(opciones[activo]); }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setOpen(false); }
    }
  };

  const detalle = (i) => [i.unidadMedida, i.categoria].filter(Boolean).join(' · ');

  return (
    <div style={{position:'relative'}}>
      <span style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)',pointerEvents:'none',zIndex:1}}><IconLupa/></span>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        value={open ? query : (seleccionado?.nombre || '')}
        onFocus={abrir}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onClick={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder={placeholder || 'Buscar insumo por nombre o local...'}
        title="Haz clic para ver el catálogo, o escribe para buscar por nombre o local. Flechas ↑ ↓ y Enter para elegir."
        style={{width:'100%',padding:'9px 10px 9px 30px',border:`1.5px solid ${hasError?'#EF5350':'var(--border-input)'}`,borderRadius:8,fontSize:12,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}/>

      {open && pos && createPortal(
        <div
          role="listbox"
          style={{
            position:'fixed', zIndex:99998,
            left:pos.left, width:pos.width,
            ...(pos.top != null ? { top:pos.top } : { bottom:pos.bottom }),
            maxHeight:pos.maxHeight, overflowY:'auto',
            background:'var(--bg-surface)', border:'1.5px solid var(--border-input)',
            borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,.25)',
          }}>
          {opciones.length === 0 ? (
            <div style={{padding:'10px 12px',fontSize:12,color:'var(--text-muted)'}}>
              {hayDisponibles ? 'Sin coincidencias' : 'No hay insumos disponibles'}
            </div>
          ) : opciones.map((i, idx) => (
            <div key={i.id}
              ref={el => itemRefs.current[idx] = el}
              role="option"
              aria-selected={idx === activo}
              onMouseDown={(e) => { e.preventDefault(); elegir(i); }}
              onMouseEnter={() => setActivo(idx)}
              style={{
                padding:'8px 12px', minHeight:ALTO_FILA, boxSizing:'border-box',
                display:'flex', flexDirection:'column', justifyContent:'center', gap:2,
                fontSize:12, cursor:'pointer', color:'var(--text-primary)',
                background: (idx === activo || String(i.id)===String(value)) ? 'var(--bg-hover)' : 'transparent',
              }}>
              <span style={{display:'flex',alignItems:'center',gap:4,fontWeight:600}}>
                {i.esTopping && <span title="Marcado como insumo para toppings">🧋</span>}
                {i.nombre}
                {/* El local: clave para distinguir insumos homónimos de
                    locales distintos (por diseño del backend). */}
                {i.localNombre && (
                  <span style={{fontWeight:400,color:'var(--text-secondary)'}}>— {i.localNombre}</span>
                )}
              </span>
              {detalle(i) && (
                <span style={{fontSize:11,color:'var(--text-muted)'}}>{detalle(i)}</span>
              )}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
