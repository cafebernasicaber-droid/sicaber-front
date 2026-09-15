// ─────────────────────────────────────────────────────────────
//  src/shared/constants/insumoTipos.js
//
//  Punto único donde viven los supuestos del frontend sobre la
//  API para todo lo relacionado con el ESTADO DE STOCK y los
//  TIPOS DE USO de un insumo (cambios 1, 2, 4 y 5).
//
//  Si el backend usa otros nombres de campo, se ajusta AQUÍ y
//  todo el resto del frontend queda alineado. Ver también
//  API_ASSUMPTIONS.md en la raíz del repo.
// ─────────────────────────────────────────────────────────────

// ── Estado de stock calculado por la API (ronda 22, sección A) ──────
// `GET /insumos` devuelve, en CADA entrada de `porLocal` y en
// `GET /insumos?local_id=`, el campo `estadoStock` (dato, no texto
// formateado) con UNO de estos 4 valores — contrato documentado por el
// backend en CAMBIOS.md:
//   agotado     → stock = 0
//   bajo_minimo → 0 < stock < stockMinimo          (POR DEBAJO DEL MÍNIMO — crítico)
//   agotandose  → stock > 0 y stock ≤ stockMinimo × 1.2  ("stock bajo": aviso temprano)
//   ok          → el resto
// El estado se calcula SIEMPRE por local, nunca sumando locales.
export const STOCK_OK           = 'ok';
export const STOCK_AGOTANDOSE   = 'agotandose';   // "stock bajo" — aviso temprano
export const STOCK_BAJO_MINIMO  = 'bajo_minimo';  // por debajo del mínimo — más crítico
export const STOCK_AGOTADO      = 'agotado';      // stock = 0

// Alias legados: código escrito antes de que el backend expusiera los 4
// estados. `STOCK_SIN` = agotado; `STOCK_BAJO` = agotándose (el aviso
// temprano). El estado "bajo mínimo" no tenía equivalente antiguo.
export const STOCK_SIN  = STOCK_AGOTADO;
export const STOCK_BAJO = STOCK_AGOTANDOSE;

// ¿Este estado necesita que el usuario reaccione (comprar / reponer)?
// Los 3 que no son 'ok'.
export const STOCK_ESTADOS_ALERTA = [STOCK_AGOTADO, STOCK_BAJO_MINIMO, STOCK_AGOTANDOSE];

// Lee el estado de stock de un insumo / fila-por-local tal como lo
// entrega la API. Orden de preferencia: estadoStock (camelCase) →
// estado_stock (snake) → variantes. Si la API no lo trae, se deriva de
// stock/stockMinimo con las MISMAS bandas del backend, para que la UI
// degrade con gracia.
export function estadoStockDe(insumo) {
  if (!insumo) return STOCK_OK;
  const raw =
    insumo.estadoStock ??
    insumo.estado_stock ??
    insumo.estadoDeStock ??
    insumo.stockEstado ??
    null;
  if (raw != null && raw !== '') {
    const v = String(raw).toLowerCase().replace(/[\s-]+/g, '_');
    if (v === 'agotado' || v === 'sin_stock' || v === 'sinstock') return STOCK_AGOTADO;
    if (v === 'bajo_minimo' || v === 'bajominimo') return STOCK_BAJO_MINIMO;
    if (v === 'agotandose' || v === 'agotándose' || v === 'stock_bajo' || v === 'bajo' || v === 'low') return STOCK_AGOTANDOSE;
    return STOCK_OK;
  }
  const actual = Number(insumo.stockActual ?? insumo.stock_actual ?? insumo.stock ?? 0);
  const minimo = Number(insumo.stockMinimo ?? insumo.stock_minimo ?? 0);
  if (actual <= 0) return STOCK_AGOTADO;
  if (minimo > 0 && actual < minimo) return STOCK_BAJO_MINIMO;
  if (minimo > 0 && actual <= minimo * 1.2) return STOCK_AGOTANDOSE;
  return STOCK_OK;
}

// ── Desglose de stock por local (batch 3, entidad insumo_local) ──────
// La API expone, en la respuesta consolidada de GET /insumos, el desglose
// por local de cada insumo bajo la llave `porLocal` (ver GET /insumos en
// sicaber-back/src/routes/index.js). Cada fila del backend:
//   { localId, localNombre, localEstado, stock, stockMinimo, activo,
//     estadoStock }
// OJO: el stock viene como `stock` (no `stockActual`), y cada fila trae
// `activo` — el backend crea una fila insumo_local por CADA local (para
// que el insumo nunca dé error donde aún no se ha comprado) pero marca
// activo=true SOLO en los locales donde el insumo realmente se ofrece.
// Aceptamos varias grafías por robustez ante despliegues distintos.
export function desglosePorLocal(insumo) {
  const arr =
    insumo?.porLocal ||
    insumo?.locales ||
    insumo?.stockPorLocal ||
    insumo?.insumoLocal ||
    insumo?.insumo_local ||
    insumo?.stock_por_local ||
    [];
  if (!Array.isArray(arr)) return [];
  return arr.map(r => ({
    localId:     String(r.localId ?? r.local_id ?? r.idLocal ?? r.id ?? ''),
    localNombre: r.localNombre ?? r.local_nombre ?? r.nombre ?? r.nombreLocal ?? '',
    stockActual: Number(r.stockActual ?? r.stock_actual ?? r.stock ?? 0),
    stockMinimo: Number(r.stockMinimo ?? r.stock_minimo ?? 0),
    estadoStock: (r.estadoStock ?? r.estado_stock) || null,
    // Si el backend no manda `activo` (deploy viejo), se asume true para
    // no ocultar filas por un dato ausente.
    activo: r.activo === undefined || r.activo === null
      ? true
      : (r.activo === true || r.activo === 1 || r.activo === '1' || r.activo === 'true'),
  }));
}

// Devuelve una VISTA del insumo para el local `localId`:
//  - 'todos' / null / '' → el consolidado tal cual, con `desglose` adjunto.
//  - un id de local       → stockActual/stockMinimo/estadoStock resueltos
//    para ESE local (0 / 0 / 'sin_stock' si el insumo no tiene fila
//    insumo_local ahí — nunca se omite de la lista). `_sinMovimientos`
//    marca ese caso para la UI.
export function insumoEnLocal(insumo, localId) {
  const desglose = desglosePorLocal(insumo);
  if (!localId || localId === 'todos') {
    return { ...insumo, _consolidado: true, desglose };
  }
  const fila = desglose.find(f => String(f.localId) === String(localId));
  return {
    ...insumo,
    stockActual: fila ? fila.stockActual : 0,
    stockMinimo: fila ? fila.stockMinimo : 0,
    estadoStock: fila ? (fila.estadoStock || undefined) : STOCK_SIN,
    _consolidado: false,
    _sinMovimientos: !fila,
    desglose,
  };
}

// ── Pertenencia de un insumo a un local (batch 9 item 1 / batch 10) ───
// Un insumo "pertenece" (se OFRECE) en un local solo si su fila
// insumo_local para ese local tiene `activo === true`. NO basta con que
// exista la fila: el backend crea una fila por CADA local (en 0 e
// inactiva) para no dar error donde aún no se ha comprado — filtrar solo
// por "tiene fila" hacía que el insumo saliera en TODAS las pestañas de
// local. Si el backend NO manda ningún desglose (deploy viejo) se cae a
// la lista de ids explícita, y si tampoco hay eso, no se puede excluir.
export function perteneceALocal(insumo, localId) {
  if (!localId || localId === 'todos') return true;
  const desg = desglosePorLocal(insumo);
  if (desg.length) {
    const fila = desg.find(f => String(f.localId) === String(localId));
    return !!fila && fila.activo === true;
  }
  const ids =
    insumo?.localesIds || insumo?.locales_ids ||
    insumo?.localIds  || insumo?.local_ids || null;
  if (Array.isArray(ids) && ids.length) {
    return ids.some(x => String(x) === String(localId));
  }
  return true;
}

// Stock/mínimo "efectivos" del insumo para el local activo (cambio 2).
// Se asume que, al pedir GET /insumos?local=<id>, la API ya devuelve
// stockActual/stockMinimo/estadoStock referidos a ese local. Cuando
// se ve el consolidado ("Todos") no se manda `local` y estos campos
// son los globales. Este helper solo centraliza el acceso por si el
// backend anida los datos por local en un sub-objeto.
export function stockDeLocal(insumo, localId) {
  if (!insumo) return { stockActual: 0, stockMinimo: 0 };
  if (localId && Array.isArray(insumo.stockPorLocal)) {
    const row = insumo.stockPorLocal.find(
      s => String(s.localId ?? s.local_id ?? s.id) === String(localId)
    );
    if (row) {
      return {
        stockActual: Number(row.stockActual ?? row.stock_actual ?? 0),
        stockMinimo: Number(row.stockMinimo ?? row.stock_minimo ?? 0),
      };
    }
  }
  return {
    stockActual: Number(insumo.stockActual ?? insumo.stock_actual ?? 0),
    stockMinimo: Number(insumo.stockMinimo ?? insumo.stock_minimo ?? 0),
  };
}

// ── Validación de cantidades según unidad de medida (batch 3, item 3) ──
// "unidad" → solo enteros. Cualquier otra (kg, g, lb, L, mL, oz) → admite
// decimales. Aplica en Stock actual y Stock mínimo, y por cada local.
export function permiteDecimales(unidadMedida) {
  return String(unidadMedida || '').toLowerCase() !== 'unidad';
}
export function errorCantidad(valor, unidadMedida, { min = 0, obligatorio = true } = {}) {
  if (valor === '' || valor === null || valor === undefined) {
    return obligatorio ? 'Requerido' : '';
  }
  if (isNaN(valor)) return 'Número inválido';
  const n = Number(valor);
  if (n < min) return `Debe ser ${min} o mayor`;
  if (!permiteDecimales(unidadMedida) && !Number.isInteger(n)) {
    return 'Esta unidad de medida solo admite números enteros';
  }
  return '';
}

// Cambio 1 (edición de insumos por local) — `localesStockPayload` mandaba
// una fila de stock por CADA local al PUT /insumos/:id global; se eliminó
// junto con la tabla "Stock por local" de los 4 en InsumoForm.jsx. La
// edición ahora manda un único local al endpoint dedicado
// (PUT /insumos/:id/locales/:localId, ver insumosApi.updateLocal) — no
// hace falta un armador de payload aparte para eso, el body es directo:
// `{ stockMinimo, activo }`.

// ── Tipos de uso de un insumo (cambio 4) ─────────────────────
// Selección múltiple: un insumo puede ser normal, y/o topping (el
// cliente lo agrega gratis), y/o adición (el cliente lo agrega con
// costo). Al MENOS uno. Ver TIPO_USO_LABELS para el mapeo flag→texto.
//
// Nombres de flag para el PAYLOAD (POST/PUT /insumos): snake_case,
// tal como los pidió el backend:  es_insumo, es_adicion_sin_costo,
// es_topping.
// Al LEER la respuesta aceptamos también camelCase por si el
// backend transforma la salida como hace con el resto de campos.
export const TIPO_USO = {
  INSUMO:            'es_insumo',
  ADICION_SIN_COSTO: 'es_adicion_sin_costo',
  TOPPING:           'es_topping',
};

// Cambio 2 (batch 3) — SOLO se corrige el TEXTO visible; los flags y su
// semántica de costo NO cambian (el backend ya está alineado, no invertir
// dos veces). Mapeo definitivo:
//   es_adicion_sin_costo  → se muestra como "Topping"  → GRATIS
//   es_topping            → se muestra como "Adición"  → CON COSTO
export const TIPO_USO_LABELS = {
  es_insumo:            'Insumo normal',
  es_adicion_sin_costo: 'Topping',
  es_topping:           'Adición',
};

// Descripción larga para el formulario (checkboxes).
export const TIPO_USO_OPCIONES = [
  { key: 'es_insumo',            label: 'Insumo normal', hint: 'Solo receta / ficha técnica' },
  { key: 'es_adicion_sin_costo', label: 'Topping',       hint: 'El cliente puede agregarlo sin pagar' },
  { key: 'es_topping',           label: 'Adición',       hint: 'El cliente la agrega y tiene costo adicional' },
];

// Lee los 3 flags de un insumo (respuesta de la API) y los devuelve
// SIEMPRE con las claves snake_case canónicas.
export function tiposUsoDe(insumo) {
  if (!insumo) return { es_insumo: true, es_adicion_sin_costo: false, es_topping: false };
  const pick = (snake, camel) => {
    const v = insumo[snake] ?? insumo[camel];
    return v === true || v === 1 || v === '1' || v === 'true';
  };
  const esTopping          = pick('es_topping', 'esTopping');
  const esAdicionSinCosto  = pick('es_adicion_sin_costo', 'esAdicionSinCosto');
  // Un insumo viejo (antes de este cambio) no trae ningún flag: se
  // asume "normal" salvo que ya estuviera marcado como topping.
  const traeAlguno =
    insumo.es_insumo != null || insumo.esInsumo != null ||
    insumo.es_adicion_sin_costo != null || insumo.esAdicionSinCosto != null ||
    insumo.es_topping != null || insumo.esTopping != null;
  const esInsumo = traeAlguno ? pick('es_insumo', 'esInsumo') : true;
  return {
    es_insumo: esInsumo,
    es_adicion_sin_costo: esAdicionSinCosto,
    es_topping: esTopping,
  };
}

// Construye el fragmento de payload con los 3 flags para enviar al
// backend. Manda snake_case (canónico) y también camelCase +
// `esTopping` por compatibilidad con el código actual que aún lo lee.
export function tiposUsoPayload({ es_insumo, es_adicion_sin_costo, es_topping }) {
  return {
    es_insumo: !!es_insumo,
    es_adicion_sin_costo: !!es_adicion_sin_costo,
    es_topping: !!es_topping,
    esInsumo: !!es_insumo,
    esAdicionSinCosto: !!es_adicion_sin_costo,
    esTopping: !!es_topping,
  };
}

// ── Insumo + cantidad por uso, para los listados de Toppings/Adiciones ──
// (batch 9 items 3 y 4). Devuelve p. ej. "Crema batida — 15 g", o solo el
// nombre si no hay cantidad, o null si el topping/adición no tiene insumo.
// `entidad` es el topping o la adición; `insumos` el catálogo completo.
export function insumoUsoLabel(entidad, insumos) {
  if (!entidad) return null;
  const insumoId = entidad.insumo_id ?? entidad.insumoId ?? entidad.insumo?.id;
  if (insumoId == null || insumoId === '') return null;
  const ins = (insumos || []).find(i => String(i.id) === String(insumoId));
  const nombre = ins?.nombre || entidad.insumo?.nombre || entidad.insumo_nombre;
  if (!nombre) return null;
  const cant =
    entidad.cantidad ?? entidad.cantidad_uso ?? entidad.cantidadUso ??
    entidad.cantidad_por_uso ?? entidad.cantidadPorUso ?? null;
  const unidad =
    ins?.unidadMedida || ins?.unidad_medida ||
    entidad.insumo?.unidadMedida || entidad.unidad_medida || '';
  if (cant == null || cant === '' || Number(cant) === 0) return nombre;
  return `${nombre} — ${cant} ${unidad}`.trim();
}

// Valor de `?tipo=` para los selectores filtrados de Ficha Técnica /
// Toppings / Adiciones (cambio 5).
export const TIPO_QUERY = {
  TOPPING:            'topping',
  ADICION_SIN_COSTO:  'adicion_sin_costo',
  INSUMO:             'insumo',
};
