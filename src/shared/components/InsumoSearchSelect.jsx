import React, { useMemo } from 'react';
import SearchSelect from './SearchSelect';

const SIN_EXCLUIDOS = new Set();

// ─────────────────────────────────────────────────────────────
//  InsumoSearchSelect — selector de insumo reutilizable.
//
//  batch 9 item 5 — antes tenía su propio desplegable (más bajo,
//  sin navegación por teclado, opciones de una sola línea). Ahora
//  es una CAPA FINA sobre <SearchSelect>, el mismo componente que
//  usa Compras, para que el selector se vea y se comporte idéntico
//  en Compras, Toppings, Adiciones y Ficha Técnica:
//   · desplegable más alto (5–6 opciones visibles a la vez)
//   · cada opción con el nombre y, debajo, su unidad de medida
//   · scroll interno con aire respecto del borde
//   · estados de "Cargando…" y "Sin resultados"
//   · resaltado al pasar el mouse + navegación con ↑/↓/Enter
//
//  La única diferencia con SearchSelect es la interfaz: acá se
//  reciben `insumos` (objetos completos) y `onSelect` devuelve el
//  insumo completo elegido (no solo el id), porque los callers
//  necesitan además su `unidadMedida`.
//
//  `excludeIds` (Set de ids string): insumos ya usados en OTRA fila
//  de la misma lista, que no deben ofrecerse — salvo el que ya está
//  elegido en ESTE campo (`value`), que nunca se oculta ni aunque
//  esté inactivo, para no perder su nombre al editar.
// ─────────────────────────────────────────────────────────────
export default function InsumoSearchSelect({
  insumos = [],
  value,
  onSelect,
  placeholder,
  hasError,
  excludeIds,
  loading = false,
  disabled = false,
}) {
  const excluidos = excludeIds || SIN_EXCLUIDOS;

  const options = useMemo(() => {
    const disponibles = insumos.filter(i =>
      String(i.id) === String(value) ||
      (i.estado !== 'Inactivo' && i.estado !== false && !excluidos.has(String(i.id)))
    );
    // El insumo ya elegido siempre presente (aunque esté inactivo o excluido).
    if (value != null && value !== '' && !disponibles.some(i => String(i.id) === String(value))) {
      const sel = insumos.find(i => String(i.id) === String(value));
      if (sel) disponibles.unshift(sel);
    }
    return disponibles.map(i => ({
      value: String(i.id),
      label: i.nombre,
      sub: i.unidadMedida || i.unidad_medida || '',
      subPlaceholder: 'sin unidad definida',
    }));
  }, [insumos, value, excluidos]);

  return (
    <SearchSelect
      value={value == null ? '' : String(value)}
      options={options}
      onChange={(v) => {
        const found = insumos.find(i => String(i.id) === String(v));
        if (found) onSelect(found);
      }}
      placeholder={placeholder || 'Buscar insumo por nombre…'}
      loading={loading}
      disabled={disabled}
      hasError={hasError}
      emptyMessage="No hay insumos disponibles."
    />
  );
}
