import { localesApi } from './api';

const localesService = {
  getActivos:   ()        => localesApi.getActivos(),
  getAll:       ()        => localesApi.getAll(),
  getById:      (id)      => localesApi.getById(id),
  create:       (data)    => localesApi.create(data),
  update:       (id, d)   => localesApi.update(id, d),
  remove:       (id)      => localesApi.remove(id),
  toggleEstado: (id)      => localesApi.toggleEstado(id),
};

export default localesService;
