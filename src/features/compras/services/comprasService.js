import { comprasApi } from '../../../shared/services/api';

const comprasService = {
  getAll:       ()           => comprasApi.getActivas(), // alias usado por el Dashboard
  // localId opcional: filtra las compras por local (ver comprasApi).
  getActivas:   (localId)    => comprasApi.getActivas(localId),
  getHistorial: (localId)    => comprasApi.getHistorial(localId),
  getById:      (id)         => comprasApi.getById(id),
  create:       (data)       => comprasApi.create(data),
  anular:       (id, motivo) => comprasApi.anular(id, motivo),
};

export default comprasService;