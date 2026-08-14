import { empleadosApi } from '../../../shared/services/api';

const empleadosService = {
  getAll:  ()        => empleadosApi.getAll(),
  getById: (id)      => empleadosApi.getById(id),
  create:  (data)    => empleadosApi.create(data),
  update:  (id, d)   => empleadosApi.update(id, d),
  remove:  (id)      => empleadosApi.remove(id),
  toggleEstado: (id)      => empleadosApi.toggleEstado(id),
};

export default empleadosService;