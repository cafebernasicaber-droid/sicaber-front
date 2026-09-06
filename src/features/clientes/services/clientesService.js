import { clientesApi, authApi, setToken } from '../../../shared/services/api';

const clientesService = {
  getAll:       ()         => clientesApi.getAll(),
  getById:      (id)       => clientesApi.getById(id),
  update:       (id, d)    => clientesApi.update(id, d),
  remove:       (id)       => clientesApi.remove(id),
  toggleEstado: (id)       => clientesApi.toggleEstado(id),

  register: async (datos) => {
    try {
      const data = await authApi.registroCliente(datos);
      return { data: data.cliente };
    } catch (e) {
      return { error: e.message || 'Error al registrar' };
    }
  },

  loginCliente: async (correo, password) => {
    try {
      const data = await authApi.loginCliente(correo, password);
      setToken(data.token);
      return { data: data.cliente };
    } catch (e) {
      return { error: e.message || 'Correo o contraseña incorrectos.' };
    }
  },
};

export default clientesService;
