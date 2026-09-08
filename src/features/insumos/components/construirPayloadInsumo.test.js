import { construirPayloadInsumo } from './construirPayloadInsumo';

// Cuatro locales activos de ejemplo.
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

describe('construirPayloadInsumo — los 4 casos de creación', () => {
  test('1) sin stock inicial, UN local marcado', () => {
    const p = construirPayloadInsumo({
      form: FORM_BASE,
      isEditing: false,
      locales: LOCALES,
      todosLocales: false,
      localesActivos: ['1'],
      stockInicialAbierto: false,
      stockInicial: { cantidad: '', localId: '' },
      localInicialEfectivo: '1', // 1 candidato → es ese
    });
    expect(p.locales_ids).toEqual([1]);
    expect(p.todos_locales).toBe(false);
    expect(p.stockActual).toBe(0);
    expect(p.stock_inicial).toBe(0);
    expect(p).not.toHaveProperty('local_inicial_id'); // no hay cantidad → no va local
    expect(p).not.toHaveProperty('stockActual', ''); // nunca string vacío
  });

  test('2) sin stock inicial, VARIOS locales marcados', () => {
    const p = construirPayloadInsumo({
      form: FORM_BASE,
      isEditing: false,
      locales: LOCALES,
      todosLocales: false,
      localesActivos: ['1', '2'],
      stockInicialAbierto: false,
      stockInicial: { cantidad: '', localId: '' },
      localInicialEfectivo: '',
    });
    expect(p.locales_ids).toEqual([1, 2]);
    expect(p.stock_inicial).toBe(0);
    expect(p).not.toHaveProperty('local_inicial_id');
  });

  test('3) con stock inicial en un local marcado', () => {
    const p = construirPayloadInsumo({
      form: FORM_BASE,
      isEditing: false,
      locales: LOCALES,
      todosLocales: false,
      localesActivos: ['1'],
      stockInicialAbierto: true,
      stockInicial: { cantidad: '50', localId: '' }, // localId manual vacío…
      localInicialEfectivo: '1',                     // …pero el derivado resuelve
    });
    expect(p.locales_ids).toEqual([1]);
    expect(p.stock_inicial).toBe(50);
    expect(p.local_inicial_id).toBe(1); // numérico, resuelto
    expect(p.localInicialId).toBe(1);
  });

  test('4) con "Todos los locales" y stock inicial en el local elegido', () => {
    const p = construirPayloadInsumo({
      form: { ...FORM_BASE, stockMinimo: '3' },
      isEditing: false,
      locales: LOCALES,
      todosLocales: true,
      localesActivos: [],
      stockInicialAbierto: true,
      stockInicial: { cantidad: '30', localId: '2' },
      localInicialEfectivo: '2',
    });
    expect(p.locales_ids).toEqual([1, 2, 3, 4]);
    expect(p.todos_locales).toBe(true);
    expect(p.stock_minimo).toBe(3);
    expect(p.stock_inicial).toBe(30);
    expect(p.local_inicial_id).toBe(2);
  });

  test('nunca envía stockActual como cadena vacía, ni flags de topping/adición', () => {
    const p = construirPayloadInsumo({
      form: { ...FORM_BASE, descripcion: 'x'.repeat(400) },
      isEditing: false,
      locales: LOCALES,
      todosLocales: true,
      localesActivos: [],
      localInicialEfectivo: '1',
    });
    expect(typeof p.stockActual).toBe('number');
    expect(p.descripcion.length).toBeLessThanOrEqual(200);
    expect(p).not.toHaveProperty('es_topping');
    expect(p).not.toHaveProperty('es_adicion_sin_costo');
    expect(p).not.toHaveProperty('esTopping');
  });

  test('panel abierto pero SIN cantidad → no manda local ni cantidad', () => {
    const p = construirPayloadInsumo({
      form: FORM_BASE,
      isEditing: false,
      locales: LOCALES,
      todosLocales: false,
      localesActivos: ['1'],
      stockInicialAbierto: true,
      stockInicial: { cantidad: '', localId: '' },
      localInicialEfectivo: '1',
    });
    expect(p.stock_inicial).toBe(0);
    expect(p).not.toHaveProperty('local_inicial_id');
  });
});
