import { toppingsApi } from '../../../shared/services/api';

const toppingsService = {
  getAll:  ()        => toppingsApi.getAll(),
  create:  (data)    => toppingsApi.create(data),
  update:  (id, d)   => toppingsApi.update(id, d),
  remove:  (id)      => toppingsApi.remove(id),
  toggleEstado: (id)      => toppingsApi.toggleEstado(id),
};

export default toppingsService;