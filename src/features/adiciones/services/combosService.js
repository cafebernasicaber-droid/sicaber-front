import { combosApi } from '../../../shared/services/api';

const combosService = {
  getActivos:    ()        => combosApi.getActivos(),
  getAll:        ()        => combosApi.getAll(),
  create:        (data)    => combosApi.create(data),
  update:        (id, d)   => combosApi.update(id, d),
  toggleEstado:  (id)      => combosApi.toggleEstado(id),
  remove:        (id)      => combosApi.remove(id),
};

export default combosService;
