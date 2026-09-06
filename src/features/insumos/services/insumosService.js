import { insumosApi } from '../../../shared/services/api';

const insumosService = {
  getAll:  ()        => insumosApi.getAll(),
  getById: (id)      => insumosApi.getById(id),
  create:  (data)    => insumosApi.create(data),
  update:  (id, d)   => insumosApi.update(id, d),
  remove:  (id)      => insumosApi.remove(id),
  toggleEstado: (id)      => insumosApi.toggleEstado(id),
};

export default insumosService;