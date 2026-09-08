import { permiteDecimales, localesStockPayload } from '../../../shared/constants/insumoTipos';

// Tope de Observaciones propio de este formulario (el backend admite hasta
// LIMITES.DESCRIPCION = 500; acá se es más estricto).
export const DESCRIPCION_INSUMO_MAX = 200;

// ─────────────────────────────────────────────────────────────
//  construirPayloadInsumo — arma el body EXACTO de POST/PUT
//  /insumos a partir del estado del formulario.
//
//  Es una función PURA (sin estado ni efectos) para poder testearla
//  de forma aislada y para que el payload no dependa nunca de una
//  carrera de `useEffect` (esa carrera dejaba `local_inicial_id`
//  vacío aunque la UI mostrara el local ya resuelto → 400).
//
//  `localInicialEfectivo` es el local del stock inicial YA resuelto
//  por el componente (valor derivado: si hay un solo local marcado
//  es ese; si hay varios, el que el usuario eligió; si ninguno
//  aplica, cadena vacía).
// ─────────────────────────────────────────────────────────────
export function construirPayloadInsumo({
  form,
  isEditing = false,
  locales = [],
  todosLocales = true,
  localesActivos = [],
  stockInicialAbierto = false,
  stockInicial = { cantidad: '', localId: '' },
  localInicialEfectivo = '',
  localesStock = [],
}) {
  const dec = permiteDecimales(form.unidadMedida);
  const num = (v) => (dec ? Number(v) : Math.round(Number(v))) || 0;

  // El insumo se guarda SIN proveedor (batch 7) y SIN flags de
  // topping/adición (batch 8): esos campos NO se incluyen a propósito.
  const payload = {
    nombre: (form.nombre || '').trim(),
    categoria: form.categoria,
    categoriaId: form.categoriaId,
    categoria_id: isNaN(Number(form.categoriaId)) ? form.categoriaId : Number(form.categoriaId),
    unidadMedida: form.unidadMedida,
    estado: form.estado,
    descripcion: (form.descripcion || '').trim().slice(0, DESCRIPCION_INSUMO_MAX),
    tamanoOz: form.unidadMedida === 'oz' && form.tamanoOz !== '' ? Number(form.tamanoOz) : null,
    proveedor: null,
    proveedorId: null,
  };

  // Locales donde EXISTE el insumo.
  const localesIds = (todosLocales ? locales.map(l => String(l.id)) : localesActivos)
    .map(id => (isNaN(Number(id)) ? id : Number(id)));
  if (localesIds.length) {
    payload.locales_ids = localesIds;
    payload.localesIds = localesIds;
    payload.todos_locales = todosLocales;
  }

  if (!isEditing) {
    const min = dec
      ? Math.max(1, Number(form.stockMinimo) || 1)
      : Math.max(1, Math.round(Number(form.stockMinimo) || 1));
    payload.stockMinimo = min;
    payload.stock_minimo = min;

    // El stock arranca en 0 en todos los locales; la cantidad existente
    // (si la hay) va aparte. Nunca se manda '' (era lo que rompía el POST).
    payload.stockActual = 0;
    payload.stock_actual = 0;

    // Stock inicial: SOLO si el panel está abierto, hay una cantidad real
    // (> 0) y quedó resuelto un local. Si no: 0 y NINGÚN local.
    const cantNum = Number(stockInicial.cantidad);
    const hayCantidad =
      stockInicialAbierto &&
      String(stockInicial.cantidad).trim() !== '' &&
      !isNaN(cantNum) && cantNum > 0;
    if (hayCantidad && localInicialEfectivo) {
      const q = num(stockInicial.cantidad);
      const localNum = isNaN(Number(localInicialEfectivo))
        ? localInicialEfectivo
        : Number(localInicialEfectivo);
      payload.stockInicial = q;
      payload.stock_inicial = q;
      payload.localInicialId = localNum;
      payload.local_inicial_id = localNum;
    } else {
      payload.stockInicial = 0;
      payload.stock_inicial = 0;
    }
  } else {
    const filas = localesStock.map(r => ({
      localId: r.localId,
      stockActual: num(r.stockActual),
      stockMinimo: num(r.stockMinimo),
    }));
    Object.assign(payload, localesStockPayload(filas));
    payload.stockMinimo = filas.length ? filas[0].stockMinimo : Number(form.stockMinimo) || 0;
  }

  return payload;
}
