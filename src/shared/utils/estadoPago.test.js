import {
  estadoPagoDe, pagoFueRechazado, etiquetaMetodoPago,
  ESTADOS_PAGO_VALIDOS,
} from './pedidoEstados';

// Contrato del backend (CAMBIOS.md, Ronda 22 / C4): `estado_pago` es un
// campo propio, SEPARADO de `estado`, con 4 valores.
describe('estadoPagoDe — campo estado_pago separado de estado', () => {
  test('usa el campo estado_pago del backend tal cual', () => {
    for (const v of ESTADOS_PAGO_VALIDOS) {
      expect(estadoPagoDe({ estado: 'cancelado', estado_pago: v })).toBe(v);
    }
  });

  test('"rechazado" y "cancelado normal" NO se confunden', () => {
    // Rechazo de comprobante: estado cancelado + estado_pago rechazado.
    expect(pagoFueRechazado({ estado: 'cancelado', estado_pago: 'rechazado' })).toBe(true);
    // Cancelación por cualquier otra razón: estado cancelado + estado_pago pendiente.
    expect(pagoFueRechazado({ estado: 'cancelado', estado_pago: 'pendiente' })).toBe(false);
  });

  test('respaldo sin estado_pago: deriva igual que calcularEstadoPago del backend', () => {
    expect(estadoPagoDe({ estado: 'cancelado', comprobante_motivo_rechazo: 'Total no coincide' })).toBe('rechazado');
    expect(estadoPagoDe({ estado: 'cancelado' })).toBe('pendiente');
    expect(estadoPagoDe({ estado: 'pendiente_verificacion' })).toBe('pendiente_verificacion');
    expect(estadoPagoDe({ estado: 'en_proceso', pago_confirmado: true })).toBe('aprobado');
    expect(estadoPagoDe({ estado: 'pendiente' })).toBe('pendiente');
  });
});

describe('etiquetaMetodoPago — B1: solo cambia el texto visible', () => {
  test('transferencia se muestra como "Llave Bancolombia"', () => {
    expect(etiquetaMetodoPago('transferencia')).toBe('Llave Bancolombia');
    expect(etiquetaMetodoPago('nequi')).toBe('Nequi');
    expect(etiquetaMetodoPago('efectivo')).toBe('Efectivo');
  });
});
