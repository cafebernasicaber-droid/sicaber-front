import { proveedoresApi } from '../../../shared/services/api';

const proveedoresService = {
  getAll:        ()        => proveedoresApi.getAll(),
  getById:       (id)      => proveedoresApi.getById(id),
  create:        (data)    => proveedoresApi.create(data),
  update:        (id, d)   => proveedoresApi.update(id, d),
  remove:        (id)      => proveedoresApi.remove(id),
  toggleEstado:  (id)      => proveedoresApi.toggleEstado(id),
};

export default proveedoresService;
