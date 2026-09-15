import { insumosApi } from '../../../shared/services/api';

const insumosService = {
  getAll:  (opts)    => insumosApi.getAll(opts),
  getById: (id)      => insumosApi.getById(id),
  create:  (data)    => insumosApi.create(data),
  update:  (id, d)   => insumosApi.update(id, d),
  // Cambio 1 (edición de insumos por local) — actualiza SOLO stock
  // actual/mínimo/activo de un local puntual (PUT /insumos/:id/locales/:localId,
  // ya existente en el backend). Separado de `update` a propósito: ese
  // sigue siendo solo para los campos GLOBALES (nombre/categoría/unidad/
  // estado/descripción), nunca para datos de un local.
  updateLocal: (id, localId, d) => insumosApi.updateLocal(id, localId, d),
  remove:  (id)      => insumosApi.remove(id),
  toggleEstado: (id)      => insumosApi.toggleEstado(id),
  getContadores: (localId) => insumosApi.getContadores(localId),
};

export default insumosService;