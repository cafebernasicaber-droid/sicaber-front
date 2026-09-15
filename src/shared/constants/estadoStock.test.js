import {
  estadoStockDe,
  STOCK_OK, STOCK_AGOTANDOSE, STOCK_BAJO_MINIMO, STOCK_AGOTADO,
} from './insumoTipos';

// Contrato del backend (CAMBIOS.md, Ronda 22 / sección A): GET /insumos
// devuelve `estadoStock` con uno de estos 4 valores, calculado por local.
describe('estadoStockDe — mapea el contrato real del backend', () => {
  test('los 4 valores del backend se mapean 1:1', () => {
    expect(estadoStockDe({ estadoStock: 'agotado' })).toBe(STOCK_AGOTADO);
    expect(estadoStockDe({ estadoStock: 'bajo_minimo' })).toBe(STOCK_BAJO_MINIMO);
    expect(estadoStockDe({ estadoStock: 'agotandose' })).toBe(STOCK_AGOTANDOSE);
    expect(estadoStockDe({ estadoStock: 'ok' })).toBe(STOCK_OK);
  });

  test('"bajo mínimo" y "agotándose" son estados DISTINTOS (no se colapsan)', () => {
    expect(STOCK_BAJO_MINIMO).not.toBe(STOCK_AGOTANDOSE);
    expect(estadoStockDe({ estadoStock: 'bajo_minimo' }))
      .not.toBe(estadoStockDe({ estadoStock: 'agotandose' }));
  });

  test('fallback sin estadoStock: deriva con las mismas bandas del backend', () => {
    expect(estadoStockDe({ stock: 0, stockMinimo: 10 })).toBe(STOCK_AGOTADO);
    expect(estadoStockDe({ stock: 9, stockMinimo: 10 })).toBe(STOCK_BAJO_MINIMO);   // < mínimo
    expect(estadoStockDe({ stock: 11, stockMinimo: 10 })).toBe(STOCK_AGOTANDOSE);   // ≤ mínimo × 1.2
    expect(estadoStockDe({ stock: 13, stockMinimo: 10 })).toBe(STOCK_OK);
    expect(estadoStockDe({ stockActual: 10, stockMinimo: 10 })).toBe(STOCK_AGOTANDOSE); // exacto al mínimo
  });

  test('acepta grafías legadas y snake/camel', () => {
    expect(estadoStockDe({ estado_stock: 'sin_stock' })).toBe(STOCK_AGOTADO);
    expect(estadoStockDe({ estadoStock: 'BAJO_MINIMO' })).toBe(STOCK_BAJO_MINIMO);
    expect(estadoStockDe(null)).toBe(STOCK_OK);
  });
});
