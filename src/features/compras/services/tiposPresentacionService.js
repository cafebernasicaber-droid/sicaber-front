import { tiposPresentacionApi } from '../../../shared/services/api';

const tiposPresentacionService = {
  getAll:       ()      => tiposPresentacionApi.getAll(),
  create:       (data)  => tiposPresentacionApi.create(data),
  update:       (id, d) => tiposPresentacionApi.update(id, d),
  toggleEstado: (id)    => tiposPresentacionApi.toggleEstado(id),
};

export default tiposPresentacionService;