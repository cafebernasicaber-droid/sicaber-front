import { permiteDecimales } from '../../../shared/constants/insumoTipos';

// Tope de Observaciones propio de este formulario (el backend admite hasta
// LIMITES.DESCRIPCION = 500; acá se es más estricto).
export const DESCRIPCION_INSUMO_MAX = 200;

// ─────────────────────────────────────────────────────────────
//  construirPayloadInsumo — arma el body EXACTO de POST/PUT
//  /insumos a partir del estado del formulario.
//
//  Es una función PURA (sin estado ni efectos) para poder testearla
//  de forma aislada.
//
//  CONTRATO REAL del backend (verificado con curl contra
//  sicaber-back/src/routes/index.js — `insRouter.post('/')`):
//    · localesSeleccionados  → array de ids de local. Al CREAR un insumo
//      se registra para UN solo local de partida → la lista lleva un
//      único id.
//    · todosLosLocales       → booleano. Al crear va SIEMPRE false (ya no
//      existe la opción "todos los locales").
//    · stockActual           → LA CANTIDAD INICIAL REAL. El backend solo
//      lee esta llave; "stockInicial"/"stock_inicial" NUNCA se leyeron
//      (por eso el stock inicial no se guardaba: iba un 0 fijo en
//      stockActual y la cantidad de verdad en una llave muerta).
//    · local_id              → el local que recibe el stock inicial. Con
//      un solo local es el mismo id de localesSeleccionados; se manda
//      explícito igual, para que no dependa de que el backend lo infiera.
//  Una sola llave por concepto: nada de snake_case + camelCase del mismo
//  dato. El backend destructura por el nombre camelCase.
//
//  EDICIÓN — Cambio 1 (edición de insumos por local): el insumo sigue
//  siendo un catálogo global (nombre/categoría/unidad/estado/descripción,
//  arriba), pero YA NO se edita "en qué locales está activo" ni el stock
//  de los 4 a la vez. Se edita SOLO el local activo de la pestaña del
//  listado (`localActivoId`): su stock mínimo y si el insumo está activo
//  ahí. Esos 3 datos van en `localId`/`localStockMinimo`/`localActivo` —
//  claves DISTINTAS a las columnas globales de arriba, para que
//  `useInsumos.update()` pueda separarlas fácilmente y mandarlas al
//  endpoint correcto (PUT /insumos/:id/locales/:localId, nunca al PUT
//  global — ver el comentario largo en insumosApi.updateLocal).
// ─────────────────────────────────────────────────────────────
export function construirPayloadInsumo({
  form,
  isEditing = false,
  // CREACIÓN: el único local de partida (obligatorio).
  localCreacionId = '',
  stockInicial = { cantidad: '' },
  // EDICIÓN: el local activo (fijo, no se elige acá) + sus 3 datos.
  localActivoId = '',
  localEdicion = { activo: true, stockActual: '0', stockMinimo: '' },
}) {
  const dec = permiteDecimales(form.unidadMedida);
  const num = (v) => (dec ? Number(v) : Math.round(Number(v))) || 0;
  const toId = (v) => (isNaN(Number(v)) ? v : Number(v));

  // El insumo se guarda SIN proveedor (batch 7) y SIN flags de
  // topping/adición (batch 8): esos campos NO se incluyen a propósito.
  const payload = {
    nombre: (form.nombre || '').trim(),
    categoria: form.categoria,
    categoriaId: form.categoriaId,
    unidadMedida: form.unidadMedida,
    estado: form.estado,
    descripcion: (form.descripcion || '').trim().slice(0, DESCRIPCION_INSUMO_MAX),
    tamanoOz: form.unidadMedida === 'oz' && form.tamanoOz !== '' ? Number(form.tamanoOz) : null,
  };

  if (!isEditing) {
    // ── CREAR: un solo local de partida ────────────────────────────────
    const localId = toId(localCreacionId);
    payload.todosLosLocales = false;
    payload.localesSeleccionados = [localId];
    payload.local_id = localId;

    const min = dec
      ? Math.max(1, Number(form.stockMinimo) || 1)
      : Math.max(1, Math.round(Number(form.stockMinimo) || 1));
    payload.stockMinimo = min;

    // Stock inicial: la cantidad va DIRECTO en stockActual, y solo si hay
    // una cantidad real (> 0). Si no, se omite el campo (== "sin stock").
    const cantNum = Number(stockInicial.cantidad);
    const hayCantidad =
      String(stockInicial.cantidad).trim() !== '' && !isNaN(cantNum) && cantNum > 0;
    if (hayCantidad) {
      payload.stockActual = num(stockInicial.cantidad);
    }
  } else {
    // ── EDITAR: SOLO el local activo (Cambio 1) ─────────────────────────
    // No se manda `localesSeleccionados`/`todosLosLocales`/stock de otros
    // locales — ni falta: el PUT global (arriba) ya no los procesa, y el
    // PUT por local (abajo) es imposible que toque un local que no sea
    // `localId`, porque va en la URL, no en el body.
    if (localActivoId != null && localActivoId !== '') {
      payload.localId = toId(localActivoId);
      payload.localStockMinimo = num(localEdicion.stockMinimo);
      payload.localActivo = !!localEdicion.activo;
    }
  }

  return payload;
}
