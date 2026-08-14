import { categoriasInsumosApi } from '../../../shared/services/api';

const categoriasInsumosService = {
  getAll:       ()        => categoriasInsumosApi.getAll(),
  getById:      (id)      => categoriasInsumosApi.getById(id),
  create:       (data)    => categoriasInsumosApi.create(data),
  update:       (id, d)   => categoriasInsumosApi.update(id, d),
  remove:       (id)      => categoriasInsumosApi.remove(id),
  toggleEstado: (id)      => categoriasInsumosApi.toggleEstado(id),
  recategorizar:(id, d)   => categoriasInsumosApi.recategorizar(id, d),
};

export default categoriasInsumosService;
