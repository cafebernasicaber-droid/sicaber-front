// ─────────────────────────────────────────────────────────────
//  src/shared/data/productos.js
//
//  12 productos — Café Don Berna
//  URLs de Cloudinary actualizadas.
//  Los 7 productos especiales fueron movidos a Adiciones.
// ─────────────────────────────────────────────────────────────

export const MENU_PRODUCTOS = [

  // ── BEBIDAS CALIENTES ─────────────────────────────────────────
  {
    id: 1,
    nombre: 'Café Don Berna',          name: 'Café Don Berna',
    cat: 'Bebidas Calientes',          categoria: 'Bebidas Calientes',
    precio: 6500,                       price: 6500,
    descripcion: 'Café con chocolate, leche, masmelo y canela. La firma de la casa.',
    badge: 'Favorito',
    img:    '',
    imagen: '',
  },
  {
    id: 2,
    nombre: 'Capuchino',               name: 'Capuchino',
    cat: 'Bebidas Calientes',          categoria: 'Bebidas Calientes',
    precio: 4500,                       price: 4500,
    descripcion: 'Café, leche, canela, esencia y aperitivo de tu preferencia.',
    badge: null,
    img:    'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389047/sicaber/mloszeqahnjtheg3aooa.png',
    imagen: 'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389047/sicaber/mloszeqahnjtheg3aooa.png',
  },
  {
    id: 3,
    nombre: 'Carajillo',               name: 'Carajillo',
    cat: 'Bebidas Calientes',          categoria: 'Bebidas Calientes',
    precio: 4500,                       price: 4500,
    descripcion: 'Café y aperitivo de tu preferencia. Clásico y reconfortante.',
    badge: null,
    img:    'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389061/sicaber/ik2arcfgvm7efoi2k16p.png',
    imagen: 'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389061/sicaber/ik2arcfgvm7efoi2k16p.png',
  },
  {
    id: 4,
    nombre: 'Café con Leche',          name: 'Café con Leche',
    cat: 'Bebidas Calientes',          categoria: 'Bebidas Calientes',
    precio: 2000,                       price: 2000,
    descripcion: 'Café y leche. Simple, clásico y delicioso.',
    badge: null,
    img:    'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389096/sicaber/xjcc8cvk0s8ixhh0ngt2.png',
    imagen: 'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389096/sicaber/xjcc8cvk0s8ixhh0ngt2.png',
  },
  {
    id: 5,
    nombre: 'Perico',                  name: 'Perico',
    cat: 'Bebidas Calientes',          categoria: 'Bebidas Calientes',
    precio: 1600,                       price: 1600,
    descripcion: 'Café y leche. Pequeño y perfecto para cualquier momento del día.',
    badge: null,
    img:    'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389115/sicaber/r9scl2sb4qvqgfuelaad.png',
    imagen: 'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389115/sicaber/r9scl2sb4qvqgfuelaad.png',
  },
  {
    id: 6,
    nombre: 'Tinto',                   name: 'Tinto',
    cat: 'Bebidas Calientes',          categoria: 'Bebidas Calientes',
    precio: 1300,                       price: 1300,
    descripcion: 'Café negro puro. El favorito del día a día.',
    badge: null,
    img:    'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389181/sicaber/egogd6gtwzuxolt0mrkw.png',
    imagen: 'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389181/sicaber/egogd6gtwzuxolt0mrkw.png',
  },

  // ── BEBIDAS FRÍAS ─────────────────────────────────────────────
  {
    id: 7,
    nombre: 'Café Don Berna Frío',     name: 'Café Don Berna Frío',
    cat: 'Bebidas Frías',              categoria: 'Bebidas Frías',
    precio: 9000,                       price: 9000,
    descripcion: 'Café granizado con cacao, leche, salsa de chocolate, crema chantilly, chispas y barquillo cubierto de chocolate.',
    badge: 'Top',
    img:    '',
    imagen: '',
  },
  {
    id: 8,
    nombre: 'Frappé',                  name: 'Frappé',
    cat: 'Bebidas Frías',              categoria: 'Bebidas Frías',
    precio: 8000,                       price: 8000,
    descripcion: 'Café granizado, leche, arequipe, crema chantilly y chocolates en forma de café.',
    badge: null,
    img:    'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389206/sicaber/zi4vimjlrlphmkjezwww.png',
    imagen: 'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389206/sicaber/zi4vimjlrlphmkjezwww.png',
  },
  {
    id: 9,
    nombre: 'Capuchino Helado',        name: 'Capuchino Helado',
    cat: 'Bebidas Frías',              categoria: 'Bebidas Frías',
    precio: 7000,                       price: 7000,
    descripcion: 'Café, leche, canela, esencia, salsa de chocolate y aperitivo de tu preferencia. Versión helada.',
    badge: null,
    img:    'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389310/sicaber/altjtp1ji6m6mvrsmrj2.png',
    imagen: 'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389310/sicaber/altjtp1ji6m6mvrsmrj2.png',
  },
  {
    id: 10,
    nombre: 'Amaretto',                name: 'Amaretto',
    cat: 'Bebidas Frías',              categoria: 'Bebidas Frías',
    precio: 6500,                       price: 6500,
    descripcion: 'Café, leche, salsa de chocolate y amaretto coctel de almendras.',
    badge: null,
    img:    'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389238/sicaber/xft4y4meujiutgxz47af.png',
    imagen: 'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389238/sicaber/xft4y4meujiutgxz47af.png',
  },
  {
    id: 11,
    nombre: 'Granizado de Café',       name: 'Granizado de Café',
    cat: 'Bebidas Frías',              categoria: 'Bebidas Frías',
    precio: 6000,                       price: 6000,
    descripcion: 'Café granizado, leche y salsa de chocolate. Refrescante y cremoso.',
    badge: null,
    img:    'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389258/sicaber/uccigsodxqrfyhohxss2.png',
    imagen: 'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389258/sicaber/uccigsodxqrfyhohxss2.png',
  },
  {
    id: 12,
    nombre: 'Café Helado',             name: 'Café Helado',
    cat: 'Bebidas Frías',              categoria: 'Bebidas Frías',
    precio: 5500,                       price: 5500,
    descripcion: 'Café, leche y salsa de chocolate. Frío, suave y delicioso.',
    badge: null,
    img:    'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389329/sicaber/m0pb8lyybgxtlugey6xy.png',
    imagen: 'https://res.cloudinary.com/dwkdxelo4/image/upload/v1779389329/sicaber/m0pb8lyybgxtlugey6xy.png',
  },
];