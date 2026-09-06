import { categoriasApi } from '../../../shared/services/api';

const categoriasService = {
  getAll:       ()        => categoriasApi.getAll(),
  create:       (data)    => categoriasApi.create(data),
  update:       (id, d)   => categoriasApi.update(id, d),
  remove:       (id)      => categoriasApi.remove(id),
  toggleEstado: (id)      => categoriasApi.toggleEstado(id),
};

export default categoriasService;