import { insumosApi } from '../../../shared/services/api';

const insumosService = {
  // opts: { local, tipo } — ver insumosApi.getAll en api.js
  getAll:  (opts)    => insumosApi.getAll(opts),
  getByTipo: (tipo)  => insumosApi.getByTipo(tipo),
  getById: (id)      => insumosApi.getById(id),
  create:  (data)    => insumosApi.create(data),
  update:  (id, d)   => insumosApi.update(id, d),
  remove:  (id)      => insumosApi.remove(id),
  toggleEstado: (id)      => insumosApi.toggleEstado(id),
};

export default insumosService;