import { useState, useCallback, useEffect } from 'react';
import ciudadesService from '../services/ciudadesService';

// Mismo patrón que useCategoriasInsumos (Insumos). Sin `remove`: una
// ciudad nunca se elimina, solo se activa/desactiva.
const useCiudades = () => {
  const [ciudades, setCiudades] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    ciudadesService.getAll()
      .then(data => setCiudades(Array.isArray(data) ? data : []))
      .catch(() => setCiudades([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (d) => { const r = await ciudadesService.create(d); refresh(); return r; }, [refresh]);
  const update = useCallback(async (id, d) => { const r = await ciudadesService.update(id, d); refresh(); return r; }, [refresh]);
  const toggleEstado = useCallback(async (id) => { const r = await ciudadesService.toggleEstado(id); refresh(); return r; }, [refresh]);

  return { ciudades, loading, refresh, create, update, toggleEstado };
};

export default useCiudades;
