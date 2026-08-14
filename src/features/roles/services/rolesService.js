import { rolesApi } from '../../../shared/services/api';

const COLORES = [
  '#E53935','#FB8C00','#FDD835','#43A047','#00ACC1',
  '#1E88E5','#5E35B1','#8E24AA','#F06292','#6D4C41',
];

const COLOR_POR_ROL = {
  'Administrador': '#E53935',
  'Cajero':        '#FB8C00',
  'Bartender':     '#43A047',
  'Cliente':       '#00ACC1',   // 👈 nuevo, color propio
};

const ICONO_POR_ROL = {
  'Administrador': '🛡️',
  'Cajero':        '🛡️',
  'Bartender':     '🛡️',
  'Cliente':       '👤',        // 👈 ícono distinto (persona, no escudo)
};

const MODULOS_PERMISOS = [
  { modulo: 'Dashboard',    permisos: [{ id:'ver_dashboard',    label:'Ver dashboard' }] },
  { modulo: 'Usuarios',     permisos: [{ id:'ver_usuarios',     label:'Ver' },{ id:'crear_usuarios',  label:'Crear' },{ id:'editar_usuarios', label:'Editar' },{ id:'eliminar_usuarios',label:'Eliminar' }] },
  { modulo: 'Roles',        permisos: [{ id:'ver_roles',        label:'Ver' },{ id:'crear_roles',     label:'Crear' },{ id:'editar_roles',    label:'Editar' },{ id:'eliminar_roles',   label:'Eliminar' }] },
  { modulo: 'Clientes',     permisos: [{ id:'ver_clientes',     label:'Ver' },{ id:'editar_clientes', label:'Editar' },{ id:'eliminar_clientes',label:'Eliminar' }] },
  { modulo: 'Empleados',    permisos: [{ id:'ver_empleados',    label:'Ver' },{ id:'crear_empleados', label:'Crear' },{ id:'editar_empleados',label:'Editar' },{ id:'eliminar_empleados',label:'Eliminar' }] },
  { modulo: 'Productos',    permisos: [{ id:'ver_productos',    label:'Ver' },{ id:'crear_productos', label:'Crear' },{ id:'editar_productos',label:'Editar' },{ id:'eliminar_productos',label:'Eliminar' }] },
  { modulo: 'Categorías',   permisos: [{ id:'ver_categorias',   label:'Ver' },{ id:'crear_categorias',label:'Crear' },{ id:'editar_categorias',label:'Editar'},{ id:'eliminar_categorias',label:'Eliminar'}] },
  { modulo: 'Combos',       permisos: [{ id:'ver_combos',       label:'Ver' },{ id:'crear_combos',    label:'Crear' },{ id:'editar_combos',   label:'Editar' },{ id:'eliminar_combos',  label:'Eliminar' }] },
  { modulo: 'Toppings',     permisos: [{ id:'ver_toppings',     label:'Ver' },{ id:'crear_toppings',  label:'Crear' },{ id:'editar_toppings', label:'Editar' },{ id:'eliminar_toppings',label:'Eliminar' }] },
  { modulo: 'Adiciones',    permisos: [{ id:'ver_adiciones',    label:'Ver' },{ id:'crear_adiciones', label:'Crear' },{ id:'editar_adiciones',label:'Editar' },{ id:'eliminar_adiciones',label:'Eliminar'}] },
  { modulo: 'Proveedores',  permisos: [{ id:'ver_proveedores',  label:'Ver' },{ id:'crear_proveedores',label:'Crear'},{ id:'editar_proveedores',label:'Editar'},{ id:'eliminar_proveedores',label:'Eliminar'}] },
  { modulo: 'Insumos',      permisos: [{ id:'ver_insumos',      label:'Ver' },{ id:'crear_insumos',   label:'Crear' },{ id:'editar_insumos',  label:'Editar' },{ id:'eliminar_insumos', label:'Eliminar' }] },
  { modulo: 'Compras',      permisos: [{ id:'ver_compras',      label:'Ver' },{ id:'crear_compras',   label:'Crear' },{ id:'anular_compras',  label:'Anular' }] },
  { modulo: 'Pedidos',      permisos: [{ id:'ver_pedidos',      label:'Ver' },{ id:'gestionar_pedidos',label:'Gestionar'},{ id:'eliminar_pedidos',label:'Eliminar'}] },
  { modulo: 'Ventas',       permisos: [{ id:'ver_ventas',       label:'Ver' },{ id:'gestionar_ventas', label:'Gestionar' }] },
  { modulo: 'Devoluciones', permisos: [{ id:'ver_devoluciones', label:'Ver' },{ id:'gestionar_devoluciones',label:'Gestionar'}] },
  { modulo: 'Fichas técnicas', permisos: [{ id:'ver_fichas',   label:'Ver' },{ id:'crear_fichas',    label:'Crear' },{ id:'editar_fichas',   label:'Editar' },{ id:'eliminar_fichas',  label:'Eliminar' }] },
];

const TODOS_LOS_PERMISOS = MODULOS_PERMISOS.flatMap(m => m.permisos.map(p => p.id));

const rolesService = {
  COLORES,

  getAll:   ()        => rolesApi.getAll(),
  getById:  (id)      => rolesApi.getById(id),   // retorna Promise
  create:   (data)    => rolesApi.create(data),
  update:   (id, d)   => rolesApi.update(id, d),
  remove:   (id)      => rolesApi.remove(id),

  getTodosLosPermisos: () => TODOS_LOS_PERMISOS,
  getModulosPermisos:  () => MODULOS_PERMISOS,
  getColor: (nombre)   => COLOR_POR_ROL[nombre] || COLORES[5],
  getIcon:  (nombre)   => ICONO_POR_ROL[nombre] || '🛡️',
  esFijo:   ()         => false,
};

export default rolesService;