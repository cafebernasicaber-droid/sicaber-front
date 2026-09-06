import { empleadosApi } from '../../../shared/services/api';

// El backend lee `local_id` (snake_case) del body — ver POST/PUT /empleados
// en sicaber-back-main. El formulario (EmpleadoModal) trabaja con
// `localId` (camelCase, mismo criterio que el resto del frontend), así que
// hay que traducirlo acá antes de mandarlo; si no, el campo llega como
// `localId` (que el backend ignora) y el empleado se guarda sin local real
// asignado aunque se haya elegido uno.
const conLocalId = data => {
  const { localId, ...resto } = data;
  return { ...resto, local_id: localId || null };
};

const empleadosService = {
  getAll:  ()        => empleadosApi.getAll(),
  getById: (id)      => empleadosApi.getById(id),
  create:  (data)    => empleadosApi.create(conLocalId(data)),
  update:  (id, d)   => empleadosApi.update(id, conLocalId(d)),
  remove:  (id)      => empleadosApi.remove(id),
  toggleEstado: (id)      => empleadosApi.toggleEstado(id),
};

export default empleadosService;