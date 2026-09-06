import { adicionesApi } from '../../../shared/services/api';

const adicionesService = {
  getAll:  ()        => adicionesApi.getAll(),
  create:  (data)    => adicionesApi.create(data),
  update:  (id, d)   => adicionesApi.update(id, d),
  remove:  (id)      => adicionesApi.remove(id),
  toggleEstado: (id)      => adicionesApi.toggleEstado(id),
};

export default adicionesService;