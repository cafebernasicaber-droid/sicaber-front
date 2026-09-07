import { comprasApi } from '../../../shared/services/api';

const comprasService = {
  getAll:       (localId)    => comprasApi.getActivas(localId), // alias usado por el Dashboard
  getActivas:   (localId)    => comprasApi.getActivas(localId),
  getHistorial: (localId)    => comprasApi.getHistorial(localId),
  getById:      (id)         => comprasApi.getById(id),
  create:       (data)       => comprasApi.create(data),
  anular:       (id, motivo) => comprasApi.anular(id, motivo),
};

export default comprasService;