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

// ── Estado de stock calculado por la API (cambios 1 y 2) ──────
// Se asume que GET /insumos devuelve, por cada insumo, un campo
// con el estado ya calculado en el backend. Aceptamos varias
// grafías por robustez; el valor se normaliza a minúsculas.
export const STOCK_OK       = 'ok';
export const STOCK_BAJO     = 'bajo';
export const STOCK_SIN      = 'sin_stock';

// Lee el estado de stock de un insumo tal como lo entrega la API.
// Orden de preferencia de campos: estadoStock (camelCase, patrón
// actual del front) → estado_stock (snake_case) → variantes.
// Si la API no lo trae, se deriva de stockActual/stockMinimo para
// que la UI degrade con gracia.
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
    if (v === STOCK_SIN || v === 'sinstock' || v === 'agotado') return STOCK_SIN;
    if (v === STOCK_BAJO || v === 'low' || v === 'stock_bajo')  return STOCK_BAJO;
    return STOCK_OK;
  }
  const actual = Number(insumo.stockActual ?? insumo.stock_actual ?? 0);
  const minimo = Number(insumo.stockMinimo ?? insumo.stock_minimo ?? 0);
  if (actual <= 0) return STOCK_SIN;
  if (minimo > 0 && actual <= minimo) return STOCK_BAJO;
  return STOCK_OK;
}

// ── Desglose de stock por local (batch 3, entidad insumo_local) ──────
// La API expone, en la respuesta consolidada de GET /insumos, el desglose
// por local de cada insumo. Aceptamos varias grafías del arreglo y de sus
// campos. Cada fila: { localId, localNombre, stockActual, stockMinimo,
// estadoStock }.
export function desglosePorLocal(insumo) {
  const arr =
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
    stockActual: Number(r.stockActual ?? r.stock_actual ?? 0),
    stockMinimo: Number(r.stockMinimo ?? r.stock_minimo ?? 0),
    estadoStock: (r.estadoStock ?? r.estado_stock) || null,
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

// Payload de stock por local para PUT /insumos/:id (edición): una fila por
// local con su stock actual y su mínimo. El backend hace upsert en
// insumo_local. Se envía snake y camel por robustez.
export function localesStockPayload(filas) {
  const norm = (filas || []).map(f => ({
    local_id: f.localId,
    localId: f.localId,
    stock_actual: Number(f.stockActual) || 0,
    stockActual: Number(f.stockActual) || 0,
    stock_minimo: Number(f.stockMinimo) || 0,
    stockMinimo: Number(f.stockMinimo) || 0,
  }));
  return { locales_stock: norm, localesStock: norm };
}

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

// Valor de `?tipo=` para los selectores filtrados de Ficha Técnica /
// Toppings / Adiciones (cambio 5).
export const TIPO_QUERY = {
  TOPPING:            'topping',
  ADICION_SIN_COSTO:  'adicion_sin_costo',
  INSUMO:             'insumo',
};
