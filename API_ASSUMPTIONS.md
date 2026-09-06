# Supuestos de contrato con la API — cambios de Insumos / Locales / Ficha Técnica / Compras / Empaques

El frontend se implementó **sin acceso al backend en ejecución**, así que los
nombres de campo de abajo son la mejor conjetura siguiendo los patrones que ya
usa el resto de la app (respuestas en camelCase: `stockActual`, `stockMinimo`,
`unidadMedida`, `precioUnitario`, `fechaCreacion`…).

Todos los accesos están centralizados para poder ajustarlos en un solo lugar:

| Tema | Archivo a tocar si el backend difiere |
|------|----------------------------------------|
| Estado de stock, stock por local, tipos de uso | `src/shared/constants/insumoTipos.js` |
| Rutas HTTP | `src/shared/services/api.js` |

---

## 1 + 2 — Estado de stock calculado y stock por local

- `GET /insumos` devuelve cada insumo con **`estadoStock`** (o `estado_stock`):
  uno de `"ok"` \| `"bajo"` \| `"sin_stock"`.
  - Fallback si no viene: se deriva de `stockActual` vs `stockMinimo`.
  - Lector: `estadoStockDe(insumo)` en `insumoTipos.js`.
- **Stock por local:** `GET /insumos?local=<idLocal>` devuelve `stockActual`,
  `stockMinimo` y `estadoStock` **referidos a ese local**.
  - Sin `?local=` → valores consolidados/globales.
  - Alternativa soportada por el lector `stockDeLocal()`: un arreglo
    `insumo.stockPorLocal: [{ localId, stockActual, stockMinimo }]`.
- Pestañas de locales (cambio 2): se generan desde `GET /locales`
  (`localesApi.getActivos()` — ya existente). El local activo se persiste en el
  query param `?local=` de la URL.

## 3 — Vista de Locales (módulo Empleados)

- `GET /locales/todos` (`localesApi.getAll()`) devuelve por cada local:
  `id`, `nombre`, `direccion`, `telefono`, `estado`,
  **`empleadosAsignados`** (número) y **`insumosCount`** (número).
  - Se aceptan variantes: `cantidadEmpleados`/`empleados_count`,
    `cantidadInsumos`/`insumos_count`.

## 4 — Tipo de uso del insumo

- Flags en el **payload** de `POST`/`PUT /insumos` (snake_case, confirmado por el
  usuario): `es_insumo`, `es_adicion_sin_costo`, `es_topping`.
  - Se envían además en camelCase + `esTopping` por compatibilidad.
- Validación de front: al menos uno de los tres marcado.
- En la respuesta se leen con `tiposUsoDe(insumo)` (acepta snake y camel).

## 5 — Selectores filtrados

- `GET /insumos?tipo=topping` → solo insumos con `es_topping`.
- `GET /insumos?tipo=adicion_sin_costo` → solo `es_adicion_sin_costo`.
- Ruta nueva: `insumosApi.getByTipo(tipo)` / `insumosService.getByTipo(tipo)`.

## 6 — Empaques (fase 1b, pendiente)

- `GET/POST/PUT/DELETE /empaques` — entidad de vasos / pitillos / desechables.
- `GET /empaques?local=<id>` o `empaque.stockPorLocal` para stock por local.
- Config producto→vaso: `GET/PUT /productos/:id/empaque`
  (`{ vasoId, tamano, llevaPitillo, pitilloId }`) — **por confirmar**.
- El formulario de Insumos deja de ofrecer la categoría "Empaques" y maneja el
  `422` del backend con un mensaje que enlaza a la sección de Empaques.

## Batch 3 — Insumos por local (entidad `insumo_local`)

- `GET /insumos` (consolidado) devuelve por cada insumo:
  - `stockActual` = **suma** de todos los locales.
  - `locales: [{ localId, localNombre, stockActual, stockMinimo, estadoStock }]`
    (se aceptan `stockPorLocal`, `insumo_local`, y campos snake_case).
  - Un insumo sin fila `insumo_local` en un local → ese local **no aparece**
    en el arreglo; el frontend lo muestra como `0 / 0 / sin_stock`
    (`insumoEnLocal()` en `insumoTipos.js`).
- `estadoStock` por local: `"ok" | "bajo" | "sin_stock"`, calculado por la API.
  El ⚠️/tooltips de la fila se evalúan **por local activo**, nunca sumando.
- **Stock mínimo es por local** (columna `stock_minimo` en `insumo_local`).
- **Crear insumo** (`POST /insumos`): además de los campos actuales,
  - `stock_minimo` — mínimo base aplicado a todos los locales al crear.
  - `stock_inicial` + `local_inicial_id` — solo si se usa "¿Ya hay cantidad
    existente?"; el resto de locales queda en 0. Si no, ambos ausentes/0.
- **Editar insumo** (`PUT /insumos/:id`): `locales_stock: [{ local_id,
  stock_actual, stock_minimo }]` — una fila por local; backend hace upsert
  en `insumo_local`. (helper `localesStockPayload`).
- Pestañas de local en Gestión de Insumos: `localesApi.getActivos()`
  (`GET /locales`, solo activos). El local activo se persiste en `?local=<id>`.
- Validación cantidades (`errorCantidad`): unidad `"unidad"` → enteros;
  `kg/g/lb/L/mL/oz` → decimales.

## 7 — Compras: selector de local (fase 1c)

- `POST /compras` acepta **`localId`** (obligatorio) en el payload.
- `GET /compras?local=<id>` y `GET /compras/historial?local=<id>` para filtrar.
- Tras registrar la compra se refresca el stock del local afectado sin recargar
  la página (re-fetch de `GET /insumos?local=<id>`).
