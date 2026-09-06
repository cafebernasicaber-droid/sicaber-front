import { comprasApi } from '../../../shared/services/api';

const comprasService = {
  getAll:       ()           => comprasApi.getActivas(), // alias usado por el Dashboard
  getActivas:   ()           => comprasApi.getActivas(),
  getHistorial: ()           => comprasApi.getHistorial(),
  getById:      (id)         => comprasApi.getById(id),
  create:       (data)       => comprasApi.create(data),
  anular:       (id, motivo) => comprasApi.anular(id, motivo),
};

export default comprasService;