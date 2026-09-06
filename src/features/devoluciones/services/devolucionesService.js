import { devolucionesApi } from '../../../shared/services/api';

const devolucionesService = {
  getAll:        (sede)          => devolucionesApi.getAll(sede),
  create:        (data)          => devolucionesApi.create(data),
  cambiarEstado: (id, estado, motivoRechazo) => devolucionesApi.cambiarEstado(id, estado, motivoRechazo),
  // No hay endpoint /devoluciones/stats en el backend, así que lo calculamos
  // aquí mismo a partir del listado completo (usado por el Dashboard).
  getStats: async (sede) => {
    const data = await devolucionesApi.getAll(sede);
    const lista = Array.isArray(data) ? data : [];
    const pendiente = lista.filter(d => (d.estado || '').toLowerCase() === 'pendiente').length;
    return { pendiente };
  },
};

export default devolucionesService;