import { disponibilidadApi } from './api';

const disponibilidadService = {
  getAll: () => disponibilidadApi.getAll(),
};

export default disponibilidadService;
