import { construirPayloadInsumo } from './construirPayloadInsumo';

const LOCALES = [
  { id: 1, nombre: 'Local Villa Liliam' },
  { id: 2, nombre: 'Local Centro' },
  { id: 3, nombre: 'Local Norte' },
  { id: 4, nombre: 'Local Sur' },
];

const FORM_BASE = {
  nombre: 'Leche entera',
  categoria: 'Lácteos',
  categoriaId: '3',
  unidadMedida: 'kg',
  estado: 'Activo',
  stockMinimo: '5',
  descripcion: '',
  tamanoOz: '',
};

// Contrato REAL, verificado con curl contra insRouter.post('/'):
//   localesSeleccionados (array, un único id al crear) / todosLosLocales
//   (false al crear) / stockActual (la cantidad inicial real, sin un
//   "stockInicial" aparte) / local_id (el mismo id, explícito).
describe('construirPayloadInsumo — creación (un solo local de partida)', () => {
  test('sin stock inicial: localesSeleccionados=[id] + local_id, SIN stockActual', () => {
    const p = construirPayloadInsumo({
      form: FORM_BASE,
      isEditing: false,
      locales: LOCALES,
      localCreacionId: '3',
      stockInicial: { cantidad: '' },
    });
    expect(p.localesSeleccionados).toEqual([3]);
    expect(p.local_id).toBe(3);
    expect(p.todosLosLocales).toBe(false);
    expect(p.stockMinimo).toBe(5);
    expect(p).not.toHaveProperty('stockActual');
    // llaves viejas que el backend nunca leyó: no deben existir más
    for (const k of ['locales_ids', 'localesIds', 'todos_locales', 'stockInicial',
      'stock_inicial', 'localInicialId', 'local_inicial_id', 'categoria_id',
      'stock_minimo', 'stock_actual', 'proveedor', 'proveedorId']) {
      expect(p).not.toHaveProperty(k);
    }
  });

  test('con stock inicial 5000: la cantidad va DIRECTO en stockActual', () => {
    const p = construirPayloadInsumo({
      form: FORM_BASE,
      isEditing: false,
      locales: LOCALES,
      localCreacionId: 1,
      stockInicial: { cantidad: '5000' },
    });
    expect(p.localesSeleccionados).toEqual([1]);
    expect(p.local_id).toBe(1);
    expect(p.stockActual).toBe(5000);
    expect(p).not.toHaveProperty('stockInicial');
  });

  test('unidad "unidad": el stock inicial se redondea a entero', () => {
    const p = construirPayloadInsumo({
      form: { ...FORM_BASE, unidadMedida: 'unidad', stockMinimo: '2' },
      isEditing: false,
      locales: LOCALES,
      localCreacionId: 2,
      stockInicial: { cantidad: '12.7' },
    });
    expect(p.stockActual).toBe(13);
    expect(p.stockMinimo).toBe(2);
  });

  test('panel de stock abierto pero SIN cantidad → no manda stockActual', () => {
    const p = construirPayloadInsumo({
      form: FORM_BASE,
      isEditing: false,
      locales: LOCALES,
      localCreacionId: '4',
      stockInicial: { cantidad: '' },
    });
    expect(p).not.toHaveProperty('stockActual');
    expect(p.local_id).toBe(4);
  });

  test('cantidad 0 explícita → tampoco manda stockActual (== sin stock)', () => {
    const p = construirPayloadInsumo({
      form: FORM_BASE,
      isEditing: false,
      locales: LOCALES,
      localCreacionId: '4',
      stockInicial: { cantidad: '0' },
    });
    expect(p).not.toHaveProperty('stockActual');
  });

  test('una sola llave por concepto + descripción recortada a 200', () => {
    const p = construirPayloadInsumo({
      form: { ...FORM_BASE, descripcion: 'x'.repeat(400) },
      isEditing: false,
      locales: LOCALES,
      localCreacionId: '1',
      stockInicial: { cantidad: '' },
    });
    expect(p.descripcion.length).toBeLessThanOrEqual(200);
    for (const k of ['es_topping', 'es_adicion_sin_costo', 'esTopping']) {
      expect(p).not.toHaveProperty(k);
    }
  });
});

// Cambio 1 (edición de insumos por local) — contrato NUEVO: la edición ya
// no manda ni "en qué locales está activo" (checkboxes de los 4) ni una
// fila de stock por cada local — eso vivía en un payload que el backend
// (PUT /insumos/:id) nunca leyó de todas formas (verificado leyendo el
// propio handler: solo toca columnas globales). Ahora se manda un único
// local (`localId`/`localStockMinimo`/`localActivo`), para que
// useInsumos.update() lo separe y lo mande al endpoint POR LOCAL
// (PUT /insumos/:id/locales/:localId) — nunca al PUT global.
describe('construirPayloadInsumo — edición (catálogo global) + un solo local', () => {
  test('manda localId/localStockMinimo/localActivo del local activo, nada de los otros', () => {
    const p = construirPayloadInsumo({
      form: FORM_BASE,
      isEditing: true,
      locales: LOCALES,
      localActivoId: '3',
      localEdicion: { activo: true, stockActual: '0', stockMinimo: '7' },
    });
    expect(p.localId).toBe(3);
    expect(p.localStockMinimo).toBe(7);
    expect(p.localActivo).toBe(true);
    // Ya no existen — eran del contrato viejo, multi-local:
    for (const k of ['localesSeleccionados', 'todosLosLocales', 'localesStock', 'locales_stock']) {
      expect(p).not.toHaveProperty(k);
    }
    // Los campos GLOBALES siguen yendo igual que siempre:
    expect(p.nombre).toBe('Leche entera');
    expect(p.categoriaId).toBe('3');
    expect(p.unidadMedida).toBe('kg');
  });

  test('insumo desactivado en ese local → localActivo:false', () => {
    const p = construirPayloadInsumo({
      form: FORM_BASE,
      isEditing: true,
      locales: LOCALES,
      localActivoId: 1,
      localEdicion: { activo: false, stockActual: '10', stockMinimo: '2' },
    });
    expect(p.localId).toBe(1);
    expect(p.localActivo).toBe(false);
  });

  test('sin local activo (caso imposible hoy, salvaguarda): no manda ningún dato de local', () => {
    const p = construirPayloadInsumo({
      form: FORM_BASE,
      isEditing: true,
      locales: LOCALES,
      localActivoId: '',
      localEdicion: { activo: true, stockActual: '0', stockMinimo: '5' },
    });
    expect(p).not.toHaveProperty('localId');
    expect(p).not.toHaveProperty('localStockMinimo');
    expect(p).not.toHaveProperty('localActivo');
  });
});
