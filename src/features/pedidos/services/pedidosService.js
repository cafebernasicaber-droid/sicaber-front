import { pedidosApi } from '../../../shared/services/api';

const pedidosService = {
  getAll:        (sede)       => pedidosApi.getAll(sede),
  getStats:      ()           => pedidosApi.getStats(),
  getById:       (id)         => pedidosApi.getById(id),
  cambiarEstado: (id, estado) => pedidosApi.cambiarEstado(id, estado),
  tomar:         (id)         => pedidosApi.tomar(id),
  remove:        (id)         => pedidosApi.remove(id),
  aprobarComprobante:  (id)   => pedidosApi.aprobarComprobante(id),
  rechazarComprobante: (id)   => pedidosApi.rechazarComprobante(id),
  confirmarPago:       (id)   => pedidosApi.confirmarPago(id),

  // Mapea la estructura del frontend al schema del backend
  create: (data) => pedidosApi.create({
    cliente_id: data.clienteId || null,
    mesa:       data.tipo === 'local' ? (data.mesa || 'Mostrador') : `Domicilio - ${data.cliente}`,
    total:      data.total || 0,
    items:      data.productos || [],
    // "Atendido por" y "domiciliario" — antes no se enviaban en absoluto
    // (ni siquiera en _meta), así que aunque el formulario los pedía y
    // validaba, esa información nunca llegaba a guardarse.
    barista:      data.barista || null,
    domiciliario: data.domiciliario || null,
    // Local al que pertenece el pedido ('Local 1' / 'Local 2'). Lo manda
    // el cajero (su propio local) o el admin (lo elige en el formulario).
    sede:         data.sede || null,
    // Local físico de recogida elegido por el cliente en la Landing (tabla
    // `locales`, GET /locales) — distinto de `sede` arriba. Solo aplica a
    // pedidos tipo:'local' (recoger en tienda), no a domicilio.
    local_id:     data.localId || null,
    // Campos extra que el backend guarda en items o ignora
    _meta: {
      numero:              data.numero,
      cliente:             data.cliente,
      tipo:                data.tipo,
      pago:                data.pago,
      hora:                data.hora,
      estado:              data.estado,
      comprobante:         data.comprobante,
      comprobanteImg:      data.comprobanteImg,
      origen:              data.origen,
      direccionAlternativa: data.direccionAlternativa,
      barista:             data.barista,
      domiciliario:        data.domiciliario,
      sede:                data.sede,
      localId:             data.localId,
      // Nombre ya resuelto para que el historial/resumen del cliente no
      // dependa de otro join — mismo patrón que `cliente` (nombre) al lado
      // de `clienteId` arriba.
      localNombre:         data.localNombre,
    },
  }),

  // Edición de un pedido ya creado (cliente, tipo, pago, productos/total,
  // personal asignado, dirección alternativa). No crea un pedido nuevo.
  update: (id, data) => pedidosApi.update(id, {
    cliente:      data.cliente,
    tipo:         data.tipo,
    pago:         data.pago,
    total:        data.total,
    items:        data.productos,
    barista:      data.barista || null,
    domiciliario: data.domiciliario || null,
    direccion_alternativa: data.direccionAlternativa,
    sede:         data.sede || null,
    // 3 — antes no se reenviaba al editar (solo al crear), así que cambiar
    // el local de recogida de un pedido ya creado no quedaba guardado.
    local_id:     data.localId || null,
  }),
};

export default pedidosService;
