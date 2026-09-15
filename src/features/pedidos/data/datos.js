export const PRODUCTOS = [
  { id: 1,  nombre: 'Cold Brew Reserve',   cat: 'Café',       precio: 9500  },
  { id: 2,  nombre: 'Espresso Doble',       cat: 'Café',       precio: 7000  },
  { id: 3,  nombre: 'Latte de Coco',        cat: 'Café',       precio: 10500 },
  { id: 4,  nombre: 'Cappuccino Clásico',   cat: 'Café',       precio: 8000  },
  { id: 5,  nombre: 'Americano',            cat: 'Café',       precio: 6000  },
  { id: 6,  nombre: 'Café con Leche',       cat: 'Café',       precio: 7500  },
  { id: 7,  nombre: 'Macchiato',            cat: 'Café',       precio: 8500  },
  { id: 8,  nombre: 'Flat White',           cat: 'Café',       precio: 9000  },
  { id: 9,  nombre: 'Preentreno Natural',   cat: 'Energético', precio: 12000 },
  { id: 10, nombre: 'Preentreno Tropical',  cat: 'Energético', precio: 13000 },
  { id: 11, nombre: 'Fresas & Crema',       cat: 'Especialidad', precio: 9000 },
  { id: 12, nombre: 'Matcha Latte',         cat: 'Especialidad', precio: 11500 },
  { id: 13, nombre: 'Chai Latte',           cat: 'Especialidad', precio: 10000 },
  { id: 14, nombre: 'Chocolate Caliente',   cat: 'Especialidad', precio: 8500  },
  { id: 15, nombre: 'Malteada Café',        cat: 'Malteadas',  precio: 11000 },
  { id: 16, nombre: 'Malteada Vainilla',    cat: 'Malteadas',  precio: 10500 },
  { id: 17, nombre: 'Malteada Fresa',       cat: 'Malteadas',  precio: 10500 },
  { id: 18, nombre: 'Bowl Tropical',        cat: 'Bowls',      precio: 9500  },
  { id: 19, nombre: 'Bowl Antioxidante',    cat: 'Bowls',      precio: 10000 },
  { id: 20, nombre: 'Croissant',            cat: 'Comida',     precio: 6000  },
  { id: 21, nombre: 'Sandwich de Pollo',    cat: 'Comida',     precio: 14000 },
  { id: 22, nombre: 'Tostada Aguacate',     cat: 'Comida',     precio: 11000 },
  { id: 23, nombre: 'Muffin Arándanos',     cat: 'Comida',     precio: 5500  },
  { id: 24, nombre: 'Brownie Chocolate',    cat: 'Comida',     precio: 6500  },
];

export const EMPLEADOS_INIT = [
  { id: 1, nombre: 'María García',    cargo: 'Barista',       activo: true  },
  { id: 2, nombre: 'Carlos López',    cargo: 'Barista',       activo: true  },
  { id: 3, nombre: 'Ana Martínez',    cargo: 'Cajero',        activo: true  },
  { id: 4, nombre: 'Luis Rodríguez',  cargo: 'Domiciliario',  activo: true  },
  { id: 5, nombre: 'Pedro Sánchez',   cargo: 'Domiciliario',  activo: false },
];

export const PEDIDOS_INIT = [
  {
    id: '0001', cliente: 'Juan Pérez', tipo: 'local', pago: 'efectivo',
    barista: 'María García', domiciliario: '',
    productos: [{ id: 1, nombre: 'Cold Brew Reserve', precio: 9500, cantidad: 1 }],
    total: 9500, hora: '09:15', estado: 'entregado',
  },
  {
    id: '0002', cliente: 'Sofía Torres', tipo: 'domicilio', pago: 'nequi',
    barista: 'Carlos López', domiciliario: 'Luis Rodríguez',
    productos: [
      { id: 9, nombre: 'Preentreno Natural', precio: 12000, cantidad: 1 },
      { id: 11, nombre: 'Fresas & Crema', precio: 9000, cantidad: 1 },
    ],
    total: 21000, hora: '10:30', estado: 'en_proceso',
  },
];

// Ronda 22 / C1 — un solo nombre por estado en TODAS las vistas: esta
// tabla ahora se DERIVA de `pedidoEstados.js` (fuente única compartida con
// Cajero y con la vista del cliente), en vez de mantener etiquetas propias
// que se fueron separando ("En Proceso" vs "En proceso", etc.). Para la
// etiqueta que depende del tipo de entrega ('en_camino' → "En camino" /
// "Listo para recoger") usa `configEstadoPedido(estado, tipo)`.
import { ESTADO_PEDIDO_CFG } from '../../../shared/utils/pedidoEstados';

// Solo los estados del PEDIDO (no los de la venta: 'pagado'/'devuelto'),
// con las mismas etiquetas/colores que Cajero y Cliente.
export const ESTADO_CONFIG = {
  pendiente_verificacion: ESTADO_PEDIDO_CFG.pendiente_verificacion,
  pendiente:  ESTADO_PEDIDO_CFG.pendiente,
  en_proceso: ESTADO_PEDIDO_CFG.en_proceso,
  en_camino:  ESTADO_PEDIDO_CFG.en_camino,
  entregado:  ESTADO_PEDIDO_CFG.entregado,
  cancelado:  ESTADO_PEDIDO_CFG.cancelado,
  anulado:    ESTADO_PEDIDO_CFG.anulado,
};
