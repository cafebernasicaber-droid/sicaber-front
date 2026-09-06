// ─────────────────────────────────────────────────────────────
//  src/features/proveedores/services/ciudadesService.js
//  Wrapper delgado sobre ciudadesApi — mismo patrón exacto que
//  tiposPresentacionService.js (Compras).
// ─────────────────────────────────────────────────────────────
import { ciudadesApi } from '../../../shared/services/api';

const ciudadesService = {
  getAll:       ()       => ciudadesApi.getAll(),
  create:       (data)   => ciudadesApi.create(data),
  update:       (id, d)  => ciudadesApi.update(id, d),
  toggleEstado: (id)     => ciudadesApi.toggleEstado(id),
};

export default ciudadesService;