import React, { useState, useEffect } from 'react';

const IconLupa = (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;

const SIN_EXCLUIDOS = new Set();

// Buscador con lupa reutilizable para elegir un insumo — se usó primero en
// el formulario de Ficha Técnica ("Insumos requeridos" y "Toppings") y
// también en el formulario de Topping (selector de insumo asociado), para
// no duplicar este componente en cada módulo. Filtra en el frontend (no
// pagina, así que no hace falta pegarle a GET /insumos?q= por cada tecla) y
// muestra un desplegable de coincidencias por nombre. Al elegir una opción,
// entrega el insumo completo (no solo el id) para que el caller pueda tomar
// también su unidad de medida u otros campos.
//
// `excludeIds` (Set de ids en string) son insumos que NO deben ofrecerse
// como sugerencia porque ya se usaron en OTRA fila de la misma lista — el
// insumo actualmente elegido en ESTE campo (`value`) nunca se excluye, ni
// aunque esté Inactivo, para no perder su nombre visible al editar un
// registro ya guardado.
//
// `preferidos` (opcional): catálogo reducido que se muestra como sugerencia
// inicial mientras el campo está vacío de texto (ej. solo insumos marcados
// como "es para topping"). En cuanto el usuario escribe algo, la búsqueda
// deja de estar restringida a `preferidos` y corre sobre `insumos`
// (catálogo completo) — la lista filtrada es solo el punto de partida, no
// un límite de lo que se puede buscar/elegir. Si no se pasa `preferidos`,
// se usa siempre `insumos`, igual que antes.
export default function InsumoSearchSelect({ insumos, preferidos, value, onSelect, placeholder, hasError, excludeIds }) {
  const [query, setQuery] = useState('');
  // La lista de sugerencias se filtra sobre `debouncedQuery`, no sobre
  // `query` directamente — así el <input> sigue respondiendo al instante
  // mientras se escribe, pero las filas del desplegable (y por lo tanto
  // sus posiciones en pantalla) solo se recalculan ~180ms después de la
  // última tecla. Antes se recalculaban en cada tecla: si el usuario
  // tocaba un resultado justo después de que apareciera, un re-render a
  // mitad del toque podía correr esa fila de lugar entre el mousedown/
  // touchstart y el click, y el toque terminaba sin seleccionar nada (o
  // seleccionando la fila equivocada) — esto es lo que se reportaba como
  // fallo intermitente al tocar un resultado recién aparecido.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen]   = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 180);
    return () => clearTimeout(t);
  }, [query]);
  const seleccionado = insumos.find(i => String(i.id) === String(value));
  const excluidos = excludeIds || SIN_EXCLUIDOS;
  const q = debouncedQuery.trim().toLowerCase();
  // Sin texto: catálogo preferido (si se definió uno); con texto: el
  // catálogo completo, para que buscar nunca quede limitado a `preferidos`.
  const base = q || !preferidos ? insumos : preferidos;
  // Catálogo ofrecido: activos y no usados ya en otra fila — salvo el
  // propio valor elegido en este campo, que siempre se mantiene.
  const disponibles = base.filter(i =>
    String(i.id) === String(value) || (i.estado !== 'Inactivo' && !excluidos.has(String(i.id)))
  );
  // Si el valor ya elegido no está en `base` (ej. quedó fuera de
  // `preferidos` porque no está marcado como topping), lo agregamos igual
  // al principio para que la fila siga mostrando con qué insumo quedó.
  if (value && !disponibles.some(i => String(i.id) === String(value)) && seleccionado) {
    disponibles.unshift(seleccionado);
  }
  // 1/2/4 — sin texto (recién abierto, o borrado) se muestra el catálogo
  // disponible; al escribir, se filtra en vivo sobre ese mismo catálogo
  // (nunca se vacía la lista de origen).
  const filtrados = q ? disponibles.filter(i => i.nombre.toLowerCase().includes(q)) : disponibles;

  return (
    <div style={{position:'relative'}}>
      <div style={{position:'relative'}}>
        <span style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)',pointerEvents:'none'}}><IconLupa/></span>
        <input
          type="text"
          value={open ? query : (seleccionado?.nombre || '')}
          // 1 — se abre con el catálogo disponible apenas el campo recibe
          // foco (clic o Tab), sin esperar a que el usuario escriba nada.
          // debouncedQuery se limpia aquí también (no solo query) para que
          // el catálogo completo aparezca de inmediato, en vez de esperar
          // los 180ms del debounce mostrando todavía el filtro anterior.
          onFocus={() => { setQuery(''); setDebouncedQuery(''); setOpen(true); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onClick={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder || 'Buscar insumo por nombre...'}
          title="Haz clic para ver el catálogo, o escribe para buscar por nombre"
          style={{width:'100%',padding:'9px 10px 9px 30px',border:`1.5px solid ${hasError?'#EF5350':'var(--border-input)'}`,borderRadius:8,fontSize:12,outline:'none',background:'var(--bg-input)',color:'var(--text-primary)'}}/>
      </div>
      {open && (
        // 3 — altura máxima fija con scroll interno: varios ítems visibles
        // a la vez sin empujar el resto del formulario hacia abajo.
        <div style={{position:'absolute',zIndex:30,top:'calc(100% + 3px)',left:0,right:0,maxHeight:280,overflowY:'auto',background:'var(--bg-surface)',border:'1.5px solid var(--border-input)',borderRadius:8,boxShadow:'0 8px 24px rgba(0,0,0,.25)'}}>
          {filtrados.length === 0 ? (
            <div style={{padding:'10px 12px',fontSize:12,color:'var(--text-muted)'}}>{disponibles.length === 0 ? 'No hay insumos disponibles' : 'Sin coincidencias'}</div>
          ) : filtrados.map(i => (
            // preventDefault: evita que el mousedown/touchstart le quite el
            // foco al <input> ANTES de que el clic se resuelva contra esta
            // fila — sin esto, en touch el navegador puede alcanzar a
            // correr el blur (que cierra el desplegable) a mitad del toque.
            // minHeight+boxSizing: objetivo de toque de tamaño fijo y
            // consistente entre filas, en vez de una altura que depende
            // del contenido.
            <div key={i.id}
              onMouseDown={(e) => { e.preventDefault(); onSelect(i); setQuery(''); setDebouncedQuery(''); setOpen(false); }}
              style={{padding:'8px 12px',minHeight:40,boxSizing:'border-box',display:'flex',alignItems:'center',fontSize:12,cursor:'pointer',color:'var(--text-primary)',background:String(i.id)===String(value)?'var(--bg-hover)':'transparent'}}>
              {/* Insumos marcados "esTopping" (InsumoForm) se destacan acá
                  para encontrarlos rápido — es solo una pista visual, no
                  cambia el filtrado. */}
              {i.esTopping && <span title="Marcado como insumo para toppings">🧋 </span>}{i.nombre}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
