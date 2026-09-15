import { metodosPagoApi } from './api';

const metodosPagoService = {
  getActivos:   ()        => metodosPagoApi.getActivos(),
  getAll:       ()        => metodosPagoApi.getAll(),
  getById:      (id)      => metodosPagoApi.getById(id),
  create:       (data)    => metodosPagoApi.create(data),
  update:       (id, d)   => metodosPagoApi.update(id, d),
  updateQr:     (id, url) => metodosPagoApi.updateQr(id, url),
  toggleEstado: (id)      => metodosPagoApi.toggleEstado(id),
};

export default metodosPagoService;
