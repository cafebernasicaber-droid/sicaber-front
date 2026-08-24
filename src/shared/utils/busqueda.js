export const BUSQUEDA_MAX = 70;

export const filtrarBusqueda = (valor) => valor.replace(/^\s+/, '').slice(0, BUSQUEDA_MAX);