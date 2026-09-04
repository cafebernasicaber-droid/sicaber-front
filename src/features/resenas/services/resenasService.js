import { resenasApi } from '../../../shared/services/api';

const resenasService = {
  getAprobadas: ()     => resenasApi.getAprobadas(),
  getAll:       ()     => resenasApi.getAll(),
  // Mapea los campos del frontend al schema del backend
  create: (data) => resenasApi.create({
    cliente_id:   data.clienteId || null,
    texto:        data.texto,
    calificacion: data.estrellas || 5,
  }),
  aprobar: (id)  => resenasApi.aprobar(id),
  remove:  (id)  => resenasApi.remove(id),
  // yaReseño: comprueba en el array ya cargado
  yaReseño: (clienteId, resenas = []) =>
    resenas.some(r => r.cliente_id === clienteId),
};

export default resenasService;
