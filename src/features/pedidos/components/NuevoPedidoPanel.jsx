import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../../shared/contexts/AuthContext';
import pedidosService     from '../services/pedidosService';
import productosService    from '../../productos/services/productosService';
import adicionesService    from '../../adiciones/services/adicionesService';
import toppingsService     from '../../toppings/services/toppingsService';
import clientesService     from '../../clientes/services/clientesService';
import empleadosService    from '../../empleados/services/empleadosService';
import localesService      from '../../../shared/services/localesService';
import { toppingsParaProducto } from '../../../shared/utils/toppings';
// El catálogo + carrito reutilizan exactamente los mismos estilos `cj-*`
// que la vista del Cajero — se importa su hoja para tenerlos disponibles.
import '../../cajero/pages/CajeroPage.css';

const fmt = n =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);

// ── Selector de Cliente / Mesa (idéntico al del Cajero) ──────────────────
// `onSeleccionCliente` — item 7: cuando el pedido es para alguien que SÍ
// está registrado, además del nombre (para mostrar en la tarjeta) hay que
// guardar su `clienteId` real, para que el pedido quede vinculado a esa
// cuenta (aparezca en su propio historial, `cliente_id` en la BD, etc.) en
// vez de guardar solo un nombre suelto que por casualidad coincide. Antes
// `seleccionarCliente` solo llamaba `onChange(c.nombre)` — elegir un
// cliente de la lista terminaba guardando exactamente lo mismo que
// escribirlo a mano en "Escribir". Cualquier edición manual del nombre, o
// un cambio de pestaña, limpia el id (ya no se puede garantizar que siga
// siendo esa persona).
//
// Punto 4 del pedido del usuario (ronda siguiente): antes había DOS campos
// para un cliente sin cuenta — "Cliente" (nombre) y, debajo, un "Alias"
// aparte para distinguir a dos clientes con el mismo nombre mientras ambos
// tienen un pedido activo. Se unificaron en uno solo: el alias que el
// backend exige (aliasEnUso, ver POST/PUT /pedidos) se sigue mandando, pero
// se arma solo — nombre + un sufijo invisible (Date.now()) — en vez de
// pedírselo al cajero. Se verificó antes de unificar que el alias NUNCA se
// muestra en el listado de Pedidos ni en la tarjeta del bartender (solo se
// usa puertas adentro para esa validación de unicidad), así que quitar el
// campo no le resta ninguna distinción visible a esas pantallas — hoy dos
// "Juan" activos ya se ven idénticos ahí, con o sin alias visible acá.
// `modo` se sigue reportando al padre (`onModoChange`) porque decide cómo
// arma el alias invisible al guardar (ver `aliasFinal` en handleCrear).
function ClienteSelector({ value, onChange, onSeleccionCliente, onModoChange }) {
  const [todosClientes, setTodosClientes] = useState([]);
  useEffect(() => {
    clientesService.getAll().then(d => setTodosClientes(Array.isArray(d) ? d : [])).catch(()=>{});
  }, []);
  const [modo, setModo]         = useState('libre');
  const [query, setQuery]       = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const MESAS = ['Mesa 1','Mesa 2','Mesa 3','Mesa 4','Mesa 5','Mesa 6','Mesa 7','Mesa 8','Mesa 9','Mesa 10'];
  const clientesFiltrados = useMemo(() => {
    const lista = Array.isArray(todosClientes) ? todosClientes : [];
    if (!query.trim()) return lista.slice(0, 8);
    const q = query.toLowerCase();
    return lista.filter(c => (c.nombre||'').toLowerCase().includes(q)||(c.telefono||'').includes(q)||(c.correo||'').toLowerCase().includes(q)).slice(0, 8);
  }, [todosClientes, query]);
  const cambiarModo = m => { setModo(m); onModoChange?.(m); onChange(''); onSeleccionCliente?.(null); setQuery(''); };
  const seleccionarCliente = c => { onChange(c.nombre); onSeleccionCliente?.(c); setQuery(c.nombre); setShowDrop(false); };
  const copiar = async t => { try { await navigator.clipboard.writeText(t); } catch {} };
  return (
    <div className="cj-cliente-selector">
      <div className="cj-cliente-tabs">
        <button className={`cj-cliente-tab ${modo==='libre'?'active':''}`} onClick={() => cambiarModo('libre')} type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Escribir
        </button>
        <button className={`cj-cliente-tab ${modo==='buscar'?'active':''}`} onClick={() => cambiarModo('buscar')} type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          Cliente registrado
        </button>
        <button className={`cj-cliente-tab ${modo==='mesa'?'active':''}`} onClick={() => cambiarModo('mesa')} type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          Mesa
        </button>
      </div>
      {/* Punto 4 — un solo campo, opcional: el nombre del cliente. Ya no
          pide un alias aparte (ver el comentario largo de arriba) — la
          nota de "el pedido no queda anónimo" desapareció porque el campo
          es honestamente opcional (handleCrear ya usa "Cliente mostrador"
          si queda vacío) y el alias que el backend necesita se arma solo. */}
      {modo === 'libre' && (
        <div className="cj-cliente-input-wrap">
          <input value={value} onChange={e => { onChange(e.target.value); onSeleccionCliente?.(null); }} placeholder="Ej: Juan García / Domicilio #5... (opcional)" className="cj-cliente-input"/>
          {value && <button className="cj-cliente-copy" title="Copiar" type="button" onClick={() => copiar(value)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>}
        </div>
      )}
      {modo === 'buscar' && (
        <div className="cj-cliente-search-wrap">
          <div className="cj-cliente-input-wrap">
            <input value={query} onChange={e => { setQuery(e.target.value); onChange(e.target.value); onSeleccionCliente?.(null); setShowDrop(true); }} onFocus={() => setShowDrop(true)} placeholder="Buscar por nombre, teléfono o correo..." className="cj-cliente-input cj-cliente-input--search"/>
            {query && <button className="cj-cliente-copy" type="button" onClick={() => { setQuery(''); onChange(''); onSeleccionCliente?.(null); }}>✕</button>}
          </div>
          {showDrop && (
            <div className="cj-cliente-drop">
              {todosClientes.length === 0
                ? <div className="cj-cliente-drop__empty">No hay clientes registrados</div>
                : clientesFiltrados.length === 0
                  ? <div className="cj-cliente-drop__empty">Sin resultados para "{query}"</div>
                  : clientesFiltrados.map(c => (
                    <div key={c.id} className={`cj-cliente-drop__item ${value===c.nombre?'selected':''}`} onClick={() => seleccionarCliente(c)}>
                      <div className="cj-cliente-drop__avatar">{(c.nombre||'?').charAt(0).toUpperCase()}</div>
                      <div className="cj-cliente-drop__info">
                        <span className="cj-cliente-drop__name">{c.nombre}</span>
                        {(c.telefono||c.correo) && <span className="cj-cliente-drop__meta">{c.telefono||c.correo}</span>}
                      </div>
                      {value===c.nombre && <span className="cj-status-check">✓</span>}
                    </div>
                  ))
              }
              <div className="cj-cliente-drop__footer" onClick={() => setShowDrop(false)}>Cerrar</div>
            </div>
          )}
        </div>
      )}
      {modo === 'mesa' && (
        <div className="cj-mesa-wrap">
          <div className="cj-mesa-chips">
            {MESAS.map(m => (
              <button key={m} type="button" className={`cj-mesa-chip ${value===m?'active':''}`} onClick={() => onChange(value===m?'':m)}>
                {m}{value===m&&' ✓'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Punto 3 — convierte los items YA guardados de un pedido (forma plana del
// backend: {id, nombre, precio, cantidad, adiciones, toppings, ...}, bajo
// "productos" o "items" según de dónde venga) a la forma interna que usa
// el carrito de este panel ({producto:{id,nombre,precio}, adiciones,
// toppings, cantidad, _cartKey}) — mismo cálculo de precio unitario que ya
// usa `itemPrecio` (precio base + suma de adiciones), para que quitar/subir
// cantidad de una línea ya existente se comporte igual que una agregada de
// cero en esta misma sesión.
const construirCarritoDesdeEdicion = (pedido) => {
  if (!pedido) return [];
  const items = Array.isArray(pedido.productos) ? pedido.productos : (Array.isArray(pedido.items) ? pedido.items : []);
  return items.map((it, i) => ({
    producto: { id: it.id, nombre: it.nombre || it.name, precio: it.precio },
    adiciones: it.adiciones || [],
    toppings: it.toppings || [],
    cantidad: it.cantidad || it.qty || 1,
    _cartKey: `edit-${it.id}-${i}`,
  }));
};

// ── Panel de creación de pedido (catálogo + carrito lateral) ─────────────
// Un solo componente para Cajero y Admin. Diferencias resueltas con props:
//  · modo="cajero" (default): el pedido queda con el local (sede) y el
//    usuario del cajero, sin selectores extra.
//  · modo="admin": el admin elige el LOCAL destino y quién lo ATIENDE;
//    ambos obligatorios antes de poder crear.
//
// Punto 3 del pedido del usuario: "Editar pedido" debe usar EL MISMO
// formulario que "Nuevo pedido" (mismo catálogo, mismo carrito, mismos
// controles de cantidad) en vez de un formulario aparte que fue
// divergiendo del real con el tiempo (era, literalmente, el 6º caso del
// patrón de "componentes gemelos" de este proyecto — ver
// sicaber-verificar-componente-real). `pedidoEditar` activa el modo
// edición: precarga el carrito con lo que el pedido ya tenía y OCULTA
// cliente/local/atendido-por/tipo de entrega — el pedido pidió
// explícitamente "limitado a agregar o quitar productos del carrito, nada
// más debe poder cambiarse". Al guardar, se manda SOLO {productos, total}
// a pedidosService.update(): el PUT /pedidos/:id del backend ya actualiza
// por COALESCE (edición parcial, ver rondaindex.js) — no enviar el resto
// de campos es suficiente para que ninguno se toque, sin necesitar un
// endpoint nuevo.
export default function NuevoPedidoPanel({ modo = 'cajero', onCreated, showToast, onCartChange, pedidoEditar = null }) {
  const esAdmin = modo === 'admin';
  const modoEdicion = !!pedidoEditar;
  const { user } = useAuth();
  const [productos, setProductos] = useState([]);
  const [toppings, setToppings]   = useState([]);
  const [adiciones, setAdiciones] = useState([]);
  const [locales, setLocales]     = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [empleadosCargando, setEmpleadosCargando] = useState(false);
  useEffect(() => {
    productosService.getActivos().then(d => setProductos(Array.isArray(d) ? d : [])).catch(() => setProductos([]));
    toppingsService.getAll().then(d => setToppings(Array.isArray(d) ? d.filter(t => t.estado === 'Activo') : [])).catch(() => setToppings([]));
    adicionesService.getAll().then(d => setAdiciones(Array.isArray(d) ? d.filter(a => a.estado === 'Activo') : [])).catch(() => setAdiciones([]));
    if (esAdmin) {
      localesService.getActivos().then(d => setLocales(Array.isArray(d) ? d.filter(l => l.estado !== false && l.estado !== 'Inactivo') : [])).catch(() => setLocales([]));
    }
  }, [esAdmin]);

  const categorias = useMemo(() => ['Todas', ...new Set((Array.isArray(productos)?productos:[]).map(p => p.categoria))], [productos]);
  const [catSel, setCatSel]         = useState('Todas');
  const [busqueda, setBusqueda]     = useState('');
  // Punto 3 — en modo edición, el carrito arranca con lo que el pedido ya
  // tenía (no vacío); `useState(fn)` lo calcula una sola vez (al montar),
  // igual que cualquier otro estado inicial derivado de props.
  const [carrito, setCarrito]       = useState(() => construirCarritoDesdeEdicion(pedidoEditar));
  const [cliente, setCliente]       = useState('');
  // item 7 — id real del cliente cuando se eligió de "Cliente registrado"
  // (null si es nombre libre o mesa: no hay cuenta a la cual vincular).
  const [clienteId, setClienteId]   = useState(null);
  // Punto 4 (siguiente ronda) — qué pestaña del ClienteSelector está activa
  // ('libre' | 'buscar' | 'mesa'); lo reporta el propio selector
  // (onModoChange). Ya NO decide si "hace falta alias" (ese campo
  // desapareció de la UI) — solo decide CÓMO se arma el alias invisible que
  // el backend igual exige (ver `aliasFinal` en handleCrear). El
  // seguimiento de "alias en uso" (aliasActivos/aliasDuplicado) también
  // desapareció: ya no tiene sentido detectar duplicados de algo que nadie
  // escribe — el sufijo `Date.now()` garantiza que nunca choque.
  const [clienteModo, setClienteModo] = useState('libre');
  const [notas, setNotas]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [prodSel, setProdSel]       = useState(null);
  const [adicsSelec, setAdicsSelec] = useState([]);
  const [toppingsSelec, setToppingsSelec] = useState([]);
  const [cantSel, setCantSel]       = useState(1);
  // admin — local destino + quién atiende
  const [localSel, setLocalSel]     = useState('');
  const [atendidoPor, setAtendidoPor] = useState('');
  // usuario_id real del empleado elegido (FK a `usuarios`) — ver por qué
  // más abajo, junto al efecto que llena `empleados`.
  const [atendidoPorId, setAtendidoPorId] = useState(null);
  const [errAdmin, setErrAdmin]     = useState('');
  // Punto 2 — "Atendido por" ya no lista TODOS los empleados activos: se
  // filtra a los CAJEROS de ESE local (GET /empleados?local_id=, ya lo
  // soporta el backend), para que el admin no pueda asignar un pedido a
  // alguien que no trabaja ahí. Se refresca cada vez que cambia el local
  // elegido, y limpia la selección previa (podría ya no pertenecer al
  // local nuevo). `empleado.usuario_id` (FK real a `usuarios`, ver schema)
  // es lo que de verdad se manda como `atendido_por` — antes solo viajaba
  // el nombre en texto libre (`barista`), sin ningún vínculo real a la
  // cuenta que atendió.
  useEffect(() => {
    setAtendidoPor(''); setAtendidoPorId(null);
    if (!esAdmin || !localSel) { setEmpleados([]); return; }
    setEmpleadosCargando(true);
    empleadosService.getAll(localSel)
      // usuario_id != null: un cajero sin cuenta de acceso vinculada no
      // puede quedar como "atendido_por" (esa FK apunta a `usuarios`, no a
      // `empleados`) — no debería pasar en la práctica (Cajero siempre
      // crea su cuenta al registrarse, ver CARGOS_CON_LOGIN en el backend),
      // pero se filtra por si acaso en vez de ofrecer una opción rota.
      .then(d => setEmpleados(Array.isArray(d) ? d.filter(e => e.estado === 'Activo' && e.cargo === 'Cajero' && e.usuario_id != null) : []))
      .catch(() => setEmpleados([]))
      .finally(() => setEmpleadosCargando(false));
  }, [esAdmin, localSel]);

  // item 6 — tipo de entrega. Por defecto sigue siendo el pedido de
  // mostrador de siempre ('mostrador': recoge/consume en el local, sin
  // dirección); "A domicilio" es la única opción nueva y exige dirección +
  // la misma verificación de cobertura EN VIVO que ya usa el checkout del
  // cliente (Landing.jsx) — mismo criterio: solo comuna 8 y 9 de Medellín,
  // geocodificada contra POST /pedidos/verificar-cobertura.
  const [tipoEntrega, setTipoEntrega] = useState('mostrador');
  const esDomicilio = tipoEntrega === 'domicilio';
  const [direccion, setDireccion]     = useState('');
  const [direccionTocada, setDireccionTocada] = useState(false);
  const direccionValida = direccion.trim().length >= 8;
  const [cobertura, setCobertura] = useState({ estado: 'idle' }); // idle|checking|ok|fuera|error
  const coberturaTimeoutRef = useRef(null);
  useEffect(() => {
    if (!esDomicilio || !direccionValida) { setCobertura({ estado: 'idle' }); return; }
    setCobertura({ estado: 'checking' });
    if (coberturaTimeoutRef.current) clearTimeout(coberturaTimeoutRef.current);
    coberturaTimeoutRef.current = setTimeout(async () => {
      try {
        const r = await pedidosService.verificarCobertura(direccion.trim());
        setCobertura(r.cubierto ? { estado: 'ok', sede: r.sede } : { estado: 'fuera' });
      } catch (e) {
        setCobertura({ estado: 'error', mensaje: e.message });
      }
    }, 700);
    return () => clearTimeout(coberturaTimeoutRef.current);
  }, [direccion, direccionValida, esDomicilio]);

  // Avisa al contenedor (modal) si el carrito tiene ítems, para pedir
  // confirmación antes de cerrar.
  useEffect(() => { onCartChange?.(carrito.length > 0); }, [carrito, onCartChange]);

  const adicsParaProd = useMemo(() => prodSel ? adiciones : [], [prodSel, adiciones]);
  const toppingsParaProd = useMemo(() => toppingsParaProducto(toppings, prodSel?.id), [prodSel, toppings]);
  const filtrados = useMemo(() => {
    let p = catSel === 'Todas' ? productos : productos.filter(x => x.categoria === catSel);
    if (busqueda.trim()) p = p.filter(x => x.nombre.toLowerCase().includes(busqueda.toLowerCase()));
    return p;
  }, [productos, catSel, busqueda]);
  const itemPrecio = item => item.producto.precio + (item.adiciones||[]).reduce((s,a)=>s+a.precio,0);
  const total = carrito.reduce((s,i)=>s+itemPrecio(i)*i.cantidad, 0);

  const seleccionarProd = prod => {
    const enCart = carrito.find(i => i.producto.id === prod.id);
    setProdSel(prod);
    setAdicsSelec(enCart?.adiciones||[]);
    setToppingsSelec(enCart ? (enCart.toppings||[]) : toppingsParaProducto(toppings, prod.id));
    setCantSel(enCart?.cantidad||1);
  };
  const toggleAdic    = a => setAdicsSelec(prev => prev.find(x=>x.id===a.id) ? prev.filter(x=>x.id!==a.id) : [...prev,a]);
  const toggleTopping = t => setToppingsSelec(prev => prev.find(x=>x.id===t.id) ? prev.filter(x=>x.id!==t.id) : [...prev,t]);
  const confirmarAgregar = () => { setCarrito(prev => [...prev, { producto: prodSel, adiciones: adicsSelec, toppings: toppingsSelec, cantidad: cantSel, _cartKey: `${prodSel.id}-${Date.now()}` }]); setProdSel(null); setAdicsSelec([]); setToppingsSelec([]); setCantSel(1); };
  const cerrarPanel   = () => { setProdSel(null); setAdicsSelec([]); setToppingsSelec([]); setCantSel(1); };
  const removeFromCart = k => setCarrito(prev => prev.filter(i => i._cartKey !== k));
  const changeQty      = (k, d) => setCarrito(prev => prev.map(i => i._cartKey===k ? {...i,cantidad:Math.max(1,i.cantidad+d)} : i));

  // Punto 3 — en modo edición, NINGUNA de estas validaciones aplica: no hay
  // local/atendido-por/alias/dirección que elegir porque esos campos ni
  // siquiera se muestran (están fijos, tal como ya estaban en el pedido).
  // Lo único que se valida es que el carrito no quede vacío.
  const handleCrear = () => {
    if (carrito.length === 0) { showToast?.('Agrega al menos un producto'); return; }
    if (!modoEdicion && esAdmin) {
      if (!localSel) { setErrAdmin('Selecciona el local del pedido'); return; }
      if (!atendidoPor) { setErrAdmin('Selecciona quién atiende el pedido'); return; }
    }
    if (!modoEdicion && esDomicilio) {
      setDireccionTocada(true);
      if (!direccionValida) { setErrAdmin('Escribe la dirección de entrega para continuar'); return; }
      if (cobertura.estado === 'checking') { setErrAdmin('Espera a que se verifique la dirección'); return; }
      if (cobertura.estado !== 'ok') { setErrAdmin('Esa dirección está fuera de nuestra zona de cobertura (comuna 8 y 9 de Medellín).'); return; }
    }
    setErrAdmin('');
    setSaving(true);

    // Modo edición: se manda SOLO {productos, total} — pedidosService.update
    // arma el resto de campos como `undefined`, que JSON.stringify()
    // elimina del body, y el PUT /pedidos/:id del backend usa COALESCE
    // columna por columna — sin esas claves, nada más se toca. No hace
    // falta duplicar aquí el resto del payload de creación.
    if (modoEdicion) {
      const productosEditados = carrito.map(i => ({ id: i.producto.id, nombre: i.producto.nombre, precio: i.producto.precio, adiciones: i.adiciones||[], toppings: i.toppings||[], precioTotal: itemPrecio(i), cantidad: i.cantidad }));
      pedidosService.update(pedidoEditar.id, { productos: productosEditados, total })
        .then(() => { showToast?.(`✓ Pedido #${pedidoEditar.id} actualizado — ${fmt(total)}`); onCreated?.(); })
        .catch(e => showToast?.('✕ Error al actualizar el pedido: ' + e.message))
        .finally(() => setSaving(false));
      return;
    }
    const now = new Date();
    const hora = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const locObj = locales.find(l => String(l.id) === String(localSel));
    const clienteFinal = cliente.trim() || 'Cliente mostrador';
    // Punto 4 (siguiente ronda) — el backend exige alias SIEMPRE que no haya
    // cliente_id, sin importar el modo. Ya no se le pide al cajero/admin en
    // NINGÚN modo sin cuenta ("Escribir" y "Mesa" por igual) — se genera
    // solo, invisible, con Date.now() para que nunca choque con otro pedido
    // activo. "Cliente registrado" (con clienteId real) no necesita alias.
    const aliasFinal = clienteModo !== 'buscar' ? `${clienteFinal} · ${Date.now()}` : null;
    const nuevoPedido = {
      cliente: clienteFinal,
      // item 7 — vincula el pedido a la cuenta real cuando se eligió de
      // "Cliente registrado" (null si es nombre libre o mesa).
      clienteId: clienteId || null,
      alias: aliasFinal,
      productos: carrito.map(i => ({ id: i.producto.id, nombre: i.producto.nombre, precio: i.producto.precio, adiciones: i.adiciones||[], toppings: i.toppings||[], precioTotal: itemPrecio(i), cantidad: i.cantidad })),
      total, notas: notas.trim()||null, estado: 'pendiente',
      origen: esAdmin ? 'admin' : 'cajero',
      hora, tipo: tipoEntrega,
      // item 6 — dirección de entrega, solo para domicilio (mismo campo
      // que ya manda el checkout del cliente: pedidosService la reenvía
      // como `direccion_alternativa`).
      direccionAlternativa: esDomicilio ? direccion.trim() : null,
      sede: esAdmin ? (locObj ? locObj.nombre : '') : (user?.sede || ''),
      // Punto 2 — `atendidoPorId` es el usuario_id real del cajero elegido
      // (FK a `usuarios`, ver PEDIDO_SELECT/atendidoPorNombre en el
      // backend); `barista` (texto libre) se conserva para no romper nada
      // de lo que ya lo lee, pero ahora el pedido queda vinculado de
      // verdad a la cuenta, no solo a un nombre suelto.
      ...(esAdmin ? { localId: localSel, localNombre: locObj ? locObj.nombre : '', barista: atendidoPor, atendidoPorId } : { barista: user?.nombre || user?.username || '' }),
    };
    setTimeout(async () => {
      try {
        await pedidosService.create(nuevoPedido);
        showToast?.(`✓ Pedido creado — ${fmt(total)}`);
        setCarrito([]); setCliente(''); setClienteId(null); setNotas('');
        setTipoEntrega('mostrador'); setDireccion(''); setDireccionTocada(false);
        onCreated?.();
      } catch (e) {
        // El alias ya no puede chocar (Date.now() lo hace único), así que
        // el único 409 real de "alias en uso" que quedaba posible antes
        // desapareció con él — ya no hace falta refrescar nada especial
        // acá, el mensaje de error genérico de abajo cubre cualquier otro
        // fallo (red, validación, etc.).
        showToast?.('✕ Error al crear el pedido: ' + e.message);
      } finally {
        setSaving(false);
      }
    }, 400);
  };

  return (
    <div className="cj-nuevo">
      <div className="cj-nuevo__catalog">
        <div className="cj-nuevo__search-row">
          <div className="cj-search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className="cj-search-input" placeholder="Buscar producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)}/>
            {busqueda && <button className="cj-search-clear" onClick={() => setBusqueda('')}>✕</button>}
          </div>
        </div>
        <div className="cj-cat-chips">
          {categorias.map(c => <button key={c} className={`cj-cat-chip ${catSel===c?'cj-cat-chip--on':''}`} onClick={() => setCatSel(c)}>{c}</button>)}
        </div>
        <div className="cj-prod-grid">
          {filtrados.length === 0 ? <div className="cj-prod-empty">Sin productos</div> : filtrados.map(prod => {
            const enCart = carrito.find(i => i.producto.id === prod.id);
            const activo = prodSel?.id === prod.id;
            return (
              <div key={prod.id} className={`cj-prod-card ${enCart?'cj-prod-card--in-cart':''} ${activo?'cj-prod-card--active':''}`} onClick={() => seleccionarProd(prod)}>
                <div className="cj-prod-card__img">
                  {prod.imagen && !prod.imagen.startsWith('PEGAR') ? <img src={prod.imagen} alt={prod.nombre} onError={e => e.target.style.display='none'}/> : <span>☕</span>}
                  {enCart && <div className="cj-prod-card__qty-badge">{enCart.cantidad}</div>}
                </div>
                <div className="cj-prod-card__body">
                  <div className="cj-prod-card__cat">{prod.categoria}</div>
                  <div className="cj-prod-card__name">{prod.nombre}</div>
                  <div className="cj-prod-card__price">{fmt(prod.precio)}</div>
                </div>
                <button className="cj-prod-card__add"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
              </div>
            );
          })}
        </div>
        {prodSel && (
          <div className="cj-add-panel">
            <div className="cj-add-panel__head">
              <div><div className="cj-add-panel__prod-name">{prodSel.nombre}</div><div className="cj-add-panel__prod-price">Base: {fmt(prodSel.precio)}</div></div>
              <button className="cj-add-panel__close" onClick={cerrarPanel}>✕</button>
            </div>
            {adicsParaProd.length > 0 ? (
              <div className="cj-add-panel__section">
                <div className="cj-add-panel__label">Adiciones disponibles</div>
                <div className="cj-add-chips">
                  {adicsParaProd.map(a => { const sel = adicsSelec.find(x=>x.id===a.id); return (<button key={a.id} onClick={() => toggleAdic(a)} className={`cj-add-chip${sel?' cj-add-chip--sel':''}`}>{a.nombre}<span className="cj-add-chip__price"> +{fmt(a.precio)}</span>{sel&&<span> ✓</span>}</button>); })}
                </div>
              </div>
            ) : <p className="cj-add-panel__empty">Sin adiciones para esta categoría.</p>}
            {toppingsParaProd.length > 0 && (
              <div className="cj-add-panel__section">
                <div className="cj-add-panel__label">Toppings (gratis)</div>
                <div className="cj-add-chips">
                  {toppingsParaProd.map(t => { const sel = toppingsSelec.find(x=>x.id===t.id); return (<button key={t.id} onClick={() => toggleTopping(t)} className={`cj-add-chip${sel?' cj-add-chip--sel':''}`}>{t.nombre}{sel&&<span> ✓</span>}</button>); })}
                </div>
              </div>
            )}
            <div className="cj-add-panel__footer">
              <div className="cj-add-panel__qty">
                <span className="cj-add-panel__label">Cantidad</span>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <button className="cj-qty-btn" onClick={() => setCantSel(c=>Math.max(1,c-1))}>−</button>
                  <span className="cj-qty-val">{cantSel}</span>
                  <button className="cj-qty-btn" onClick={() => setCantSel(c=>c+1)}>+</button>
                </div>
              </div>
              <div className="cj-add-panel__total">Total: <strong>{fmt((prodSel.precio+adicsSelec.reduce((s,a)=>s+a.precio,0))*cantSel)}</strong></div>
              <div className="cj-add-panel__actions">
                <button className="cj-btn cj-btn--ghost" onClick={cerrarPanel}>Cancelar</button>
                <button className="cj-btn cj-btn--primary" onClick={confirmarAgregar}>Agregar al pedido</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="cj-nuevo__cart">
        <div className="cj-cart__head"><h3>Carrito</h3><span className="cj-cart__count">{carrito.reduce((s,i)=>s+i.cantidad,0)} ítem{carrito.length!==1?'s':''}</span></div>

        {/* Punto 3 — en edición no hay nada que elegir (cliente/local/tipo
            de entrega quedan como ya estaban), pero tampoco tiene sentido
            esconder del todo esa información — un resumen de solo lectura
            deja claro DE QUÉ pedido se trata mientras se agregan/quitan
            productos. */}
        {modoEdicion && (
          <div style={{margin:'0 18px 12px',padding:'10px 12px',borderRadius:8,background:'var(--cj-surface-2,#F3F4F6)',fontSize:12.5,color:'var(--cj-text-2,#555)'}}>
            <div style={{fontWeight:700,marginBottom:2}}>Editando pedido #{pedidoEditar.id}</div>
            <div>{pedidoEditar.cliente || 'Cliente mostrador'} · {pedidoEditar.tipo === 'domicilio' ? '🛵 Domicilio' : '🏬 En el local'}{pedidoEditar.sede ? ` · ${pedidoEditar.sede}` : ''}</div>
            <div style={{marginTop:4,color:'var(--cj-text-3,#888)'}}>Solo puedes agregar o quitar productos — el resto de los datos del pedido no cambia aquí.</div>
          </div>
        )}

        <div className="np-cart-body">
        {!modoEdicion && esAdmin && (
          <div className="np-cart-sticky">
            <div className="cj-cart__field">
              <label>Local <span style={{color:'#EF5350'}}>*</span></label>
              <select value={localSel} onChange={e => { setLocalSel(e.target.value); setErrAdmin(''); }}
                style={{width:'100%',padding:'9px 10px',borderRadius:8,border:'1.5px solid var(--border-input,#ccc)',fontSize:13}}>
                <option value="">— Seleccionar local —</option>
                {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </div>
            <div className="cj-cart__field">
              <label>Atendido por <span style={{color:'#EF5350'}}>*</span></label>
              {/* Punto 2 — sin local elegido todavía no tiene sentido listar
                  cajeros de "ninguno"; con local elegido pero SIN cajeros
                  asignados, un desplegable vacío no explica nada — se
                  reemplaza por un aviso claro en vez de dejarlo en blanco. */}
              {!localSel ? (
                <div style={{fontSize:12.5,color:'var(--cj-text-3)',padding:'9px 10px',border:'1.5px dashed var(--border-input,#ccc)',borderRadius:8}}>
                  Elige primero el local para ver sus cajeros.
                </div>
              ) : empleadosCargando ? (
                <div style={{fontSize:12.5,color:'var(--cj-text-3)',padding:'9px 10px'}}>Cargando cajeros…</div>
              ) : empleados.length === 0 ? (
                <div style={{fontSize:12.5,color:'#C9A227',padding:'9px 10px',border:'1.5px dashed #C9A227',borderRadius:8,background:'rgba(201,162,39,0.08)'}}>
                  ⚠ Este local no tiene cajeros asignados. Asigna uno desde Empleados antes de crear el pedido.
                </div>
              ) : (
                <select value={atendidoPorId ?? ''} onChange={e => {
                    const id = e.target.value;
                    const emp = empleados.find(x => String(x.usuario_id) === id);
                    setAtendidoPorId(id ? Number(id) : null);
                    setAtendidoPor(emp ? emp.nombre : '');
                    setErrAdmin('');
                  }}
                  style={{width:'100%',padding:'9px 10px',borderRadius:8,border:'1.5px solid var(--border-input,#ccc)',fontSize:13}}>
                  <option value="">— Seleccionar —</option>
                  {empleados.map(e => <option key={e.id} value={e.usuario_id ?? ''}>{e.nombre}</option>)}
                </select>
              )}
            </div>
          </div>
        )}

        {/* item 6 — tipo de entrega. "En el local" es el pedido de mostrador
            de siempre (default); "A domicilio" pide la dirección y la
            verifica contra la misma zona de cobertura (comuna 8/9) que ya
            usa el checkout del cliente.
            Punto 3 — en edición, el tipo de entrega ya quedó fijo desde que
            se creó el pedido (cambiarlo aquí podría dejarlo sin dirección o
            sin domiciliario); todo este bloque se oculta. */}
        {!modoEdicion && (
        <div className="cj-cart__field">
          <label>Entrega</label>
          <div className="pb-toggle" style={{display:'flex',gap:8}}>
            <button type="button"
              className={`pb-toggle__btn ${!esDomicilio?'pb-toggle__btn--on':''}`}
              style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'8px 10px',borderRadius:8,border:'1.5px solid var(--border-input,#ccc)',cursor:'pointer',fontSize:12.5,fontWeight:600,background:!esDomicilio?'rgba(76,175,80,0.12)':'transparent',color:!esDomicilio?'#3A7D44':'inherit'}}
              onClick={() => { setTipoEntrega('mostrador'); setErrAdmin(''); }}>
              🏬 En el local
            </button>
            <button type="button"
              className={`pb-toggle__btn ${esDomicilio?'pb-toggle__btn--on':''}`}
              style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'8px 10px',borderRadius:8,border:'1.5px solid var(--border-input,#ccc)',cursor:'pointer',fontSize:12.5,fontWeight:600,background:esDomicilio?'rgba(76,175,80,0.12)':'transparent',color:esDomicilio?'#3A7D44':'inherit'}}
              onClick={() => { setTipoEntrega('domicilio'); setErrAdmin(''); }}>
              🛵 A domicilio
            </button>
          </div>
        </div>
        )}
        {!modoEdicion && esDomicilio && (
          <div className="cj-cart__field">
            <label>Dirección de entrega <span style={{color:'#EF5350'}}>*</span></label>
            <input className="cj-input" value={direccion}
              onChange={e => { setDireccion(e.target.value); setErrAdmin(''); }}
              onBlur={() => setDireccionTocada(true)}
              placeholder="Ej: Calle 45 #23-10, apto 301"
              style={(direccionTocada && !direccionValida) || cobertura.estado === 'fuera' ? { borderColor: '#EF5350' } : undefined}/>
            {direccionTocada && !direccionValida && (
              <div style={{fontSize:11.5,color:'#EF5350',marginTop:4}}>Escribe la dirección completa (mínimo 8 caracteres).</div>
            )}
            {direccionValida && cobertura.estado === 'checking' && (
              <div style={{fontSize:11.5,color:'var(--cj-text-3)',marginTop:4}}>Verificando cobertura…</div>
            )}
            {cobertura.estado === 'ok' && (
              <div style={{fontSize:11.5,color:'#3A7D44',marginTop:4}}>✓ Cubierta{cobertura.sede ? ` — se sugiere ${cobertura.sede}` : ''}</div>
            )}
            {cobertura.estado === 'fuera' && (
              <div style={{fontSize:11.5,color:'#EF5350',marginTop:4}}>⚠ Fuera de la zona de cobertura (comuna 8 y 9 de Medellín).</div>
            )}
            {cobertura.estado === 'error' && (
              <div style={{fontSize:11.5,color:'#EF5350',marginTop:4}}>No se pudo verificar la dirección. Intenta de nuevo.</div>
            )}
          </div>
        )}

        {/* Punto 4 (siguiente ronda) — un solo campo de cliente (sin alias
            aparte, ver el comentario largo junto a ClienteSelector); los 3
            botones siguen siendo el selector real de "¿qué tipo de cliente
            es?".
            Punto 3 — en edición el cliente ya quedó fijo, ver el resumen de
            solo lectura de más arriba; este selector se oculta. */}
        {!modoEdicion && (
        <div className="cj-cart__field">
          <label>Cliente / Mesa <span style={{color:'var(--cj-text-3)',fontWeight:400}}>(opcional)</span></label>
          <ClienteSelector
            value={cliente} onChange={setCliente}
            onSeleccionCliente={c => setClienteId(c ? c.id : null)}
            onModoChange={setClienteModo}
          />
        </div>
        )}
        <div className="cj-cart__items">
          {carrito.length === 0 ? (
            <div className="cj-cart__empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg><p>Selecciona productos del catálogo</p></div>
          ) : carrito.map(item => (
            <div key={item._cartKey||item.producto.id} className="cj-cart__item">
              <div className="cj-cart__item-info">
                <div className="cj-cart__item-name">{item.producto.nombre}</div>
                {item.adiciones?.length > 0 && <div style={{fontSize:10,color:'var(--text-muted)',marginTop:1}}>{item.adiciones.map(a=>a.nombre).join(', ')}</div>}
                {item.toppings?.length > 0 && <div style={{fontSize:10,color:'var(--text-muted)',marginTop:1}}>🧋 {item.toppings.map(t=>t.nombre).join(', ')}</div>}
                <div className="cj-cart__item-price">{fmt(itemPrecio(item))} c/u</div>
              </div>
              <div className="cj-cart__item-ctrl">
                <button className="cj-qty-btn" onClick={() => changeQty(item._cartKey||item.producto.id,-1)}>−</button>
                <span className="cj-qty-val">{item.cantidad}</span>
                <button className="cj-qty-btn" onClick={() => changeQty(item._cartKey||item.producto.id,+1)}>+</button>
              </div>
              <div className="cj-cart__item-sub">{fmt(itemPrecio(item)*item.cantidad)}</div>
              <button className="cj-cart__item-del" onClick={() => removeFromCart(item._cartKey||item.producto.id)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>
        {/* Punto 3 — la nota no es "un producto del carrito", es un campo
            aparte que este modo no envía (update() solo manda
            productos/total) — mostrarla en edición dejaría escribir algo
            que después no se guarda, así que se oculta en vez de fingir
            que sí aplica. */}
        {!modoEdicion && carrito.length > 0 && (
          <div className="cj-cart__field">
            <label>Nota para el bartender <span style={{color:'var(--text-muted)',fontWeight:400}}>(opcional)</span></label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: Sin azúcar, extra caliente..." rows={2}/>
          </div>
        )}
        {errAdmin && <div style={{color:'#EF5350',fontSize:12.5,fontWeight:600,padding:'6px 18px 0'}}>⚠ {errAdmin}</div>}
        </div>{/* /np-cart-body */}
        <div className="cj-cart__foot">
          {carrito.length > 0 && <div className="cj-cart__total-row"><span>Total</span><strong>{fmt(total)}</strong></div>}
          <button className="cj-btn cj-btn--primary cj-btn--full" onClick={handleCrear} disabled={carrito.length===0||saving}>
            {saving
              ? (modoEdicion ? 'Guardando cambios...' : 'Creando pedido...')
              : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> {modoEdicion ? 'Guardar cambios' : 'Crear pedido'} · {fmt(total)}</>}
          </button>
          {carrito.length > 0 && <button className="cj-btn cj-btn--ghost cj-btn--full" onClick={() => setCarrito([])}>Limpiar carrito</button>}
        </div>
      </div>
    </div>
  );
}
