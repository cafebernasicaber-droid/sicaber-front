import { usuariosApi } from '../../../shared/services/api';

const usuariosService = {
  getAll:        ()        => usuariosApi.getAll(),
  getById:       (id)      => usuariosApi.getById(id),
  create:        (data)    => usuariosApi.create(data),
  update:        (id, d)   => usuariosApi.update(id, d),
  remove:        (id)      => usuariosApi.remove(id),
  toggleEstado:  (id)      => usuariosApi.toggleEstado(id),
};

export default usuariosService;
