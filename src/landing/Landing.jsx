import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/contexts/AuthContext';
import { useTheme } from '../shared/contexts/ThemeContext';
import { useTransition } from '../shared/contexts/TransitionContext';
import clientesService from '../features/clientes/services/clientesService';
import { clientesApi } from '../shared/services/api';
import productosService, { descuentoVigente, calcPrecioFinal, esIdCombo } from '../features/productos/services/productosService';
import toppingsService from '../features/toppings/services/toppingsService';
import adicionesService from '../features/adiciones/services/adicionesService';
import pedidosService from '../features/pedidos/services/pedidosService';
import localesService from '../shared/services/localesService';
import categoriasService from '../features/categorias/services/categoriasService';
import resenasService from '../features/resenas/services/resenasService';
import combosService from '../features/adiciones/services/combosService';
import ventasService from '../features/ventas/services/ventasService';
import devolucionesService from '../features/devoluciones/services/devolucionesService';
import notificacionesService from '../features/notificaciones/services/notificacionesService';
import disponibilidadService from '../shared/services/disponibilidadService';
import { validarComprobanteCliente, procesarComprobante, totalDentroDeTolerancia } from '../shared/services/ocrService';
import { toppingsParaProducto } from '../shared/utils/toppings';
import PedidoProgreso from '../shared/components/PedidoProgreso';
import '../shared/components/PedidoProgreso.css';
import ImageLightbox from '../shared/components/ImageLightbox';
import '../shared/components/ImageLightbox.css';
import './Landing.css';

const fmt = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n||0);

// La columna fecha_inicio/fecha_fin es tipo timestamp en Postgres — pg la
// devuelve como fecha+hora completa ("2026-08-19T05:00:00.000Z"), no como
// "YYYY-MM-DD" plano. Cortar a los primeros 10 caracteres antes de separar
// evita que la hora se cuele como si fuera el día (mismo helper que ya usa
// el panel admin de Combos).
const soloFecha = (iso) => iso ? String(iso).slice(0, 10) : '';
const formatFecha = (iso) => {
  const f = soloFecha(iso);
  if (!f) return null;
  const [y, m, d] = f.split('-');
  if (!y || !m || !d) return null;
  return `${d}/${m}/${y}`;
};

function CartThumb({ src, alt }) {
  const [err, setErr] = React.useState(false);
  const noImg = !src || err;
  return noImg
    ? <div style={{width:58,height:58,borderRadius:10,flexShrink:0,background:'rgba(76,175,80,0.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,color:'#4CAF50'}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="1.5"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg></div>
    : <img src={src} alt={alt} onError={()=>setErr(true)} style={{width:58,height:58,objectFit:'cover',borderRadius:10,flexShrink:0,display:'block'}}/>;
}

function LxPersonalizar({ producto, toppings, adiciones, onAdd, onClose }) {
  // Los toppings vienen seleccionados por defecto; el cliente puede
  // desactivarlos haciendo clic si no los quiere.
  const [topsSelec, setTops]   = useState(() => toppings);
  const [adicsSelec, setAdics] = useState([]);
  // Los toppings nunca tienen costo (la tabla "toppings" no tiene columna
  // "precio" — ver schema.sql), así que solo las adiciones suman al total.
  // Number(...): node-postgres devuelve las columnas NUMERIC como string —
  // sin esto, "s+a.precio" concatena texto en vez de sumar (ej. total "$
  // NaN" más adelante al mezclarse con otras operaciones).
  const extraTotal  = adicsSelec.reduce((s,a)=>s+(Number(a.precio)||0),0);
  const toggleTop  = t => setTops(p  => p.find(x=>x.id===t.id) ? p.filter(x=>x.id!==t.id) : [...p,t]);
  const toggleAdic = a => setAdics(p => p.find(x=>x.id===a.id) ? p.filter(x=>x.id!==a.id) : [...p,a]);

  return (
    <div style={{display:'flex', gap:0, minHeight:480}}>
      {/* ── Panel izquierdo: foto + info + resumen ── */}
      <div style={{width:220, flexShrink:0, background:'rgba(76,175,80,0.06)', borderRight:'1px solid rgba(0,0,0,0.08)', borderRadius:'16px 0 0 16px', display:'flex', flexDirection:'column', overflow:'hidden'}}>
        {/* Foto */}
        <div style={{width:'100%', height:160, flexShrink:0, overflow:'hidden', background:'#1a1a1a'}}>
          {producto.imagen
            ? <img src={producto.imagen} alt={producto.nombre} style={{width:'100%', height:'100%', objectFit:'cover'}}/>
            : <div style={{width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:40}}>☕</div>
          }
        </div>
        {/* Info */}
        <div style={{padding:'14px 14px 10px'}}>
          <div style={{fontSize:15, fontWeight:800, color:'var(--lx-text)', marginBottom:4}}>{producto.nombre}</div>
          {producto.descripcion && <div style={{fontSize:12, color:'var(--lx-muted)', lineHeight:1.5, marginBottom:8}}>{producto.descripcion}</div>}
          <div style={{fontSize:13, fontWeight:700, color:'var(--lx-green)'}}>{fmt(producto.precio)}</div>
        </div>
        {/* Resumen selección */}
        <div style={{flex:1, overflowY:'auto', padding:'0 14px 14px'}}>
          {(topsSelec.length > 0 || adicsSelec.length > 0) && (
            <>
              <div style={{fontSize:10, fontWeight:700, letterSpacing:1, textTransform:'uppercase', color:'var(--lx-muted)', marginBottom:8, marginTop:4}}>Tu pedido</div>
              {topsSelec.map(t => (
                <div key={t.id} style={{fontSize:12, color:'var(--lx-text)', display:'flex', justifyContent:'space-between', marginBottom:4, alignItems:'center'}}>
                  <span>· {t.nombre}</span>
                  <span style={{color:'var(--lx-green)', fontWeight:600, fontSize:11}}>Gratis</span>
                </div>
              ))}
              {adicsSelec.map(a => (
                <div key={a.id} style={{fontSize:12, color:'var(--lx-text)', display:'flex', justifyContent:'space-between', marginBottom:4, alignItems:'center'}}>
                  <span>· {a.nombre}</span>
                  <span style={{color:'#E65100', fontWeight:600, fontSize:11}}>+{fmt(a.precio)}</span>
                </div>
              ))}
              <div style={{borderTop:'1px solid rgba(0,0,0,0.1)', marginTop:8, paddingTop:8, display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:800}}>
                <span>Total</span>
                <span style={{color:'var(--lx-green)'}}>{fmt(Number(producto.precio||0) + extraTotal)}</span>
              </div>
            </>
          )}
          {(topsSelec.length === 0 && adicsSelec.length === 0) && (
            <div style={{fontSize:12, color:'var(--lx-muted)', textAlign:'center', marginTop:16, lineHeight:1.6}}>
              Selecciona toppings o adiciones →
            </div>
          )}
        </div>
      </div>

      {/* ── Panel derecho: opciones ── */}
      <div style={{flex:1, padding:'24px 24px 20px', display:'flex', flexDirection:'column', overflowY:'auto', maxHeight:'80vh'}}>
        {toppings.length > 0 && (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:12, fontWeight:700, letterSpacing:1, textTransform:'uppercase', color:'var(--lx-muted)', marginBottom:10}}>
              Toppings <span style={{fontWeight:400}}>(gratis)</span>
            </div>
            <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
              {toppings.map(t => {
                const sel = topsSelec.find(x=>x.id===t.id);
                return (
                  <button key={t.id} onClick={() => toggleTop(t)} style={{padding:'8px 16px', borderRadius:100, fontSize:12, fontWeight:600, cursor:'pointer', border:`1.5px solid ${sel?'var(--gold)':'rgba(14,12,7,.14)'}`, background:sel?'rgba(76,175,80,0.15)':'var(--bg-hover)', color:sel?'var(--lx-text)':'var(--lx-muted)', transition:'all .2s'}}>
                    {t.nombre}
                    {sel && <span style={{marginLeft:5, color:'var(--gold)'}}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {adiciones.length > 0 && (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:12, fontWeight:700, letterSpacing:1, textTransform:'uppercase', color:'var(--lx-muted)', marginBottom:10}}>Adiciones</div>
            <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
              {adiciones.map(a => {
                const sel = adicsSelec.find(x=>x.id===a.id);
                return (
                  <button key={a.id} onClick={() => toggleAdic(a)} style={{padding:'8px 16px', borderRadius:100, fontSize:12, fontWeight:600, cursor:'pointer', border:`1.5px solid ${sel?'#b8924a':'rgba(14,12,7,.14)'}`, background:sel?'rgba(255,179,0,0.15)':'var(--bg-hover)', color:sel?'var(--lx-text)':'var(--lx-muted)', transition:'all .2s'}}>
                    {a.nombre} <span style={{color:'var(--gold)', marginLeft:4}}>+{fmt(a.precio)}</span>
                    {sel && <span style={{marginLeft:5, color:'var(--gold)'}}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div style={{marginTop:'auto'}}>
          <button className="lx-btn lx-btn--full" onClick={() => onAdd(producto, topsSelec, adicsSelec)}>
            Agregar al carrito · {fmt(Number(producto.precio||0) + extraTotal)}
          </button>
        </div>
      </div>
    </div>
  );
}

// Número de WhatsApp del negocio (sin +, sin espacios) — indicativo de
// Colombia (57) + 3003296202.
const WA_NUMERO = '573003296202';

function PasarelaPago({ cart, total, cliente, onClose, onSuccess, onCerrarFinal }) {
  const [step, setStep] = useState(1);
  const [tipoEntrega, setTipoEntrega] = useState('');
  const [direccionAlternativa, setDireccionAlternativa] = useState('');
  // Local físico donde el cliente recogerá su pedido (GET /locales) —
  // solo aplica cuando tipoEntrega === 'local'. Se carga una sola vez al
  // abrir la pasarela, igual que el resto de catálogos de este flujo.
  const [locales, setLocales] = useState([]);
  const [localesError, setLocalesError] = useState('');
  const [localId, setLocalId] = useState('');
  useEffect(() => {
    // 6 — getActivos() (GET /locales) ya solo trae los locales activos por
    // parte del backend; no hace falta filtrar de nuevo acá.
    localesService.getActivos()
      .then(d => setLocales(Array.isArray(d) ? d : []))
      .catch(() => setLocalesError('No se pudo cargar la lista de locales. Intenta de nuevo.'));
  }, []);
  // 6 — si solo hay un local activo, se preselecciona solo (no tiene
  // sentido obligar a elegir entre una sola opción) y el aviso de abajo
  // avisa cuál es.
  useEffect(() => {
    if (locales.length === 1 && !localId) setLocalId(locales[0].id);
  }, [locales, localId]);
  const localSel = locales.find(l => String(l.id) === String(localId));
  const [metodo, setMetodo] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [zoomComprobante, setZoomComprobante] = useState(false);
  const [loading, setLoading] = useState(false);
  const [totalConfirmado, setTotalConfirmado] = useState(0);
  const [numeroPedido] = useState(() => 'P-' + Date.now().toString().slice(-8));
  const [modoComprobante, setModoComprobante] = useState('');
  const [waSent, setWaSent] = useState(false);
  const [advertencias, setAdvertencias] = useState([]);
  const [errorPedido, setErrorPedido] = useState('');
  const fileRef = useRef();

  // Datos de cada método de pago. titular/num/tipoCuenta se muestran en el
  // paso de factura para que el cliente sepa exactamente a dónde transferir.
  // Cuando el negocio confirme sus cuentas oficiales, solo hay que editar
  // estos valores — el resto del flujo no cambia.
  const METODOS = [
    { id:'nequi',        label:'Nequi',        titular:'Café Don Berna S.A.S.', num:'300 000 0000', tipoCuenta:null, icon:'NQ' },
    { id:'transferencia', label:'Transferencia', titular:'Café Don Berna S.A.S.', num:'300 000 0000', tipoCuenta:'Ahorros', icon:'TR' },
    { id:'efectivo',     label:'Efectivo en caja', titular:null, num:'Pagar al retirar', tipoCuenta:null, icon:'EF' },
  ];
  const metodoSel = METODOS.find(m => m.id === metodo);
  const [numeroCopiado, setNumeroCopiado] = useState(false);
  const copiarNumero = async () => {
    if (!metodoSel?.num) return;
    try {
      await navigator.clipboard.writeText(metodoSel.num);
    } catch {
      // Fallback si el navegador bloquea la Clipboard API (ej. sin HTTPS).
      const ta = document.createElement('textarea');
      ta.value = metodoSel.num;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setNumeroCopiado(true);
    setTimeout(() => setNumeroCopiado(false), 2000);
  };

  const generarFilasFactura = () => {
    const filas = [];
    cart.forEach(i => {
      const precioBase = (i.precio || i.price) * i.qty;
      filas.push({ desc: `${i.nombre || i.name} x${i.qty}`, precio: precioBase, esBase: true });
      (i.toppings || []).forEach(t => {
        if ((t.precio || 0) > 0) filas.push({ desc: `  + ${t.nombre} x${i.qty}`, precio: t.precio * i.qty, esBase: false });
        else filas.push({ desc: `  + ${t.nombre} (gratis)`, precio: 0, esBase: false });
      });
      (i.adiciones || []).forEach(a => {
        filas.push({ desc: `  + ${a.nombre} x${i.qty}`, precio: a.precio * i.qty, esBase: false });
      });
    });
    return filas;
  };

  const generarTextoWA = () => {
    const filas = generarFilasFactura();
    const lineas = filas.map(f => f.precio > 0 ? `${f.desc}: ${fmt(f.precio)}` : f.desc).join('\n');
    const entregaTxt = tipoEntrega === 'domicilio' ? 'A domicilio 🛵' : `Recoger en el local 🏠${localSel ? ` — ${localSel.nombre}` : ''}`;
    const direccionTxt = tipoEntrega === 'domicilio'
      ? (direccionAlternativa || cliente?.direccion || 'No especificada')
      : null;
    return encodeURIComponent(
      `*Nuevo pedido — Café Don Berna*\n` +
      `Pedido: ${numeroPedido}\n` +
      `Cliente: ${cliente?.nombre || ''}\n` +
      `Método de entrega: ${entregaTxt}\n` +
      (direccionTxt ? `Dirección: ${direccionTxt}\n` : '') +
      `Método de pago: ${metodoSel?.label || ''}\n\n` +
      `*Productos:*\n${lineas}\n\n` +
      `*Total: ${fmt(total)}*\n\n` +
      (metodo !== 'efectivo' ? 'Adjunto el pantallazo del pago. ¡Gracias!' : '¡Gracias!')
    );
  };

  const abrirWhatsApp = () => {
    const url = `https://wa.me/${WA_NUMERO}?text=${generarTextoWA()}`;
    window.open(url, '_blank');
    setWaSent(true);
  };

  const imprimirFactura = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const filas = generarFilasFactura();
    const filasHtml = filas.map(f =>
      `<tr>
        <td style="${f.esBase ? '' : 'color:#666;padding-left:18px;font-size:12px;'}">${f.desc}</td>
        <td style="text-align:right;${f.esBase ? '' : 'color:#666;font-size:12px;'}">${f.precio > 0 ? fmt(f.precio) : f.desc.includes('gratis') ? 'Gratis' : ''}</td>
      </tr>`
    ).join('');
    w.document.write(`
      <html><head><title>Factura ${numeroPedido}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#222;padding:32px;max-width:480px;margin:0 auto;}
        h1{font-size:20px;margin-bottom:4px;color:#2E7D32;}
        .muted{color:#777;font-size:12px;margin-bottom:18px;}
        table{width:100%;border-collapse:collapse;margin-bottom:18px;}
        td{padding:5px 0;border-bottom:1px solid #f0f0f0;font-size:13px;}
        tr:last-child td{border-bottom:none;}
        .subtitulo{font-size:11px;font-weight:700;text-transform:uppercase;color:#999;letter-spacing:1px;padding:10px 0 4px;}
        .total-row{display:flex;justify-content:space-between;font-size:16px;font-weight:bold;border-top:2px solid #2E7D32;padding-top:10px;margin-top:6px;color:#2E7D32;}
        .pago{background:#f4f8f4;border:1px solid #cde3cd;border-radius:8px;padding:14px;margin-top:18px;}
        .pago b{display:block;margin-bottom:4px;color:#2E7D32;}
      </style></head>
      <body>
        <h1>☕ Café Don Berna</h1>
        <div class="muted">Factura N° ${numeroPedido} · Cliente: ${cliente?.nombre||''} · ${new Date().toLocaleDateString('es-CO')}</div>
        <div class="subtitulo">Detalle del pedido</div>
        <table>${filasHtml}</table>
        <div class="total-row"><span>Total a pagar</span><span>${fmt(total)}</span></div>
        <div class="pago">
          <b>Método de pago: ${metodoSel?.label}</b>
          ${metodoSel?.num}
        </div>
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const validarDisponibilidad = () => {
    const fichas = JSON.parse(localStorage.getItem('sicaber_fichas_tecnicas') || '[]');
    const insumos = JSON.parse(localStorage.getItem('sicaber_insumos') || '[]');
    const consumoAcum = {};
    const sinStock = new Set();

    cart.forEach(item => {
      const qty = item.qty || 1;
      const ficha = fichas.find(f => String(f.id_producto) === String(item.id) && f.estado);
      if (ficha) {
        (ficha.insumos || []).forEach(ins => {
          const id = String(ins.id_insumo);
          consumoAcum[id] = (consumoAcum[id] || 0) + Number(ins.cantidad) * qty;
        });
      }
    });

    Object.entries(consumoAcum).forEach(([idIns, consumo]) => {
      const ins = insumos.find(i => String(i.id) === idIns);
      if (ins && Number(ins.stockActual) < consumo) {
        cart.forEach(item => {
          const ficha = fichas.find(f => String(f.id_producto) === String(item.id) && f.estado);
          if (ficha && (ficha.insumos || []).some(ins2 => String(ins2.id_insumo) === idIns)) {
            sinStock.add(item.nombre || item.name);
          }
        });
      }
    });

    return [...sinStock];
  };

  const confirmar = async () => {
    if (!metodo) return;
    // 2 — respaldo: el botón "Continuar" del paso 2 ya bloquea avanzar sin
    // local elegido, esto es solo defensa adicional antes de confirmar.
    if (tipoEntrega === 'local' && !localId) return;
    if (metodo !== 'efectivo' && modoComprobante === 'archivo' && !archivo) return;
    // El OCR ya NO bloquea el envío del pedido (ver procesarArchivoSeleccionado
    // más abajo): es puramente informativo, la verificación final siempre la
    // hace un humano (Admin/Cajero) viendo la imagen. Basta con que el
    // cliente haya adjuntado un archivo — sin importar si el OCR lo pudo
    // leer, si coincidió el total, o si sigue procesando en segundo plano —
    // para que el pedido se registre y quede "pendiente_verificacion".
    if (metodo !== 'efectivo' && modoComprobante === 'whatsapp' && !waSent) return;
    if (metodo !== 'efectivo' && !modoComprobante) return;

    const sinDisponibilidad = validarDisponibilidad();
    if (sinDisponibilidad.length > 0) {
      setAdvertencias(sinDisponibilidad);
      return;
    }

    setErrorPedido('');
    setLoading(true);
    const productos = cart.map(i => ({
      id: i.id,
      nombre: i.nombre || i.name,
      precio: i.precio || i.price,
      cantidad: i.qty,
      toppings: i.toppings || [],
      adiciones: i.adiciones || [],
      precioFinal: i.precioFinal,
    }));
    const estadoInicial = metodo === 'efectivo' ? 'pendiente' : 'pendiente_verificacion';
    const comprobanteInfo = modoComprobante === 'whatsapp'
      ? 'Enviado por WhatsApp'
      : (archivo ? archivo.name : null);
    try {
      // Antes esta llamada no se esperaba (sin await) y sus errores no se
      // capturaban: si la API fallaba, el pedido nunca quedaba guardado
      // pero el cliente igual veía la pantalla de "¡Pedido recibido!".
      await pedidosService.create({
        numero: numeroPedido, cliente: cliente.nombre, clienteId: cliente.id,
        tipo: tipoEntrega, pago: metodo, productos, total,
        hora: new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}),
        estado: estadoInicial, comprobante: comprobanteInfo,
        comprobanteImg: modoComprobante === 'archivo' ? comprobanteB64 : null,
        comprobanteVerificadoOcr: modoComprobante === 'archivo' ? ocrOk : false,
        comprobanteTotalOcr: modoComprobante === 'archivo' ? ocrTotalDetectado : null,
        origen: 'landing',
        direccionAlternativa: tipoEntrega === 'domicilio' ? (direccionAlternativa || null) : null,
        // 3 — local elegido (solo aplica a tipo:'local'), va junto al
        // resto de datos del pedido.
        localId: tipoEntrega === 'local' ? localId : null,
        localNombre: tipoEntrega === 'local' ? (localSel?.nombre || null) : null,
      });

      // Envío automático de la información del pedido por WhatsApp al
      // número del negocio (número, cliente, productos, cantidades,
      // total, método de entrega y dirección si aplica). El navegador no
      // puede enviar el mensaje sin interacción del usuario (WhatsApp no
      // ofrece un envío 100% silencioso desde la web), así que lo máximo
      // automatizable es abrir el chat ya con todo el pedido redactado,
      // para cualquier pedido, no solo cuando se sube comprobante.
      try {
        window.open(`https://wa.me/${WA_NUMERO}?text=${generarTextoWA()}`, '_blank');
      } catch (e) { /* si el navegador bloquea el popup, el pedido igual queda guardado */ }

      setTotalConfirmado(total); setLoading(false); setStep(6); onSuccess(false);
    } catch (err) {
      setLoading(false);
      setErrorPedido(err.message || 'No se pudo registrar el pedido. Intenta de nuevo.');
    }
  };

  const [comprobanteB64, setComprobanteB64] = useState(null);
  // ── Verificación OCR del comprobante (cliente) ──────────────────────────
  // Reutiliza el mismo ocrService.js del módulo de Compras: calidad de
  // imagen, extracción de texto y detección del total por contexto.
  const [ocrProcesando, setOcrProcesando] = useState(false);
  const [ocrProgreso, setOcrProgreso]     = useState(0);
  // ocrError: solo para rechazos "duros" (formato/tamaño de archivo
  // inválido, ver validarComprobanteCliente) — esos SÍ siguen bloqueando,
  // no son parte de la verificación del contenido del comprobante.
  const [ocrError, setOcrError]           = useState('');
  // ocrAviso: mensaje informativo sobre lo que encontró (o no) el OCR en el
  // contenido del comprobante — NUNCA bloquea el envío del pedido, ver
  // confirmar() y el botón "Confirmar pedido" más abajo.
  const [ocrAviso, setOcrAviso]           = useState('');
  const [ocrOk, setOcrOk]                 = useState(false);
  const [ocrTotalDetectado, setOcrTotalDetectado] = useState(null);

  const handleFile = async e => {
    const f = e.target.files[0];
    if (f) await procesarArchivoSeleccionado(f);
  };

  const [arrastrando, setArrastrando] = useState(false);
  const handleDrop = async e => {
    e.preventDefault(); e.stopPropagation();
    setArrastrando(false);
    const f = e.dataTransfer.files?.[0];
    if (f) await procesarArchivoSeleccionado(f);
  };

  // OCR puramente informativo (ver ocrService.js): la verificación final del
  // comprobante siempre la hace un humano (Admin/Cajero) mirando la imagen
  // antes de aprobar o rechazar el pedido, así que nada de lo que pase acá
  // debe impedir que el pedido se registre. El archivo ya quedó adjunto
  // (setArchivo/comprobanteB64) apenas se elige, ANTES de correr el OCR —
  // si el análisis falla, tarda, o el total no coincide, el cliente igual
  // puede continuar y el pedido queda "pendiente_verificacion" para que el
  // equipo lo revise a simple vista.
  const procesarArchivoSeleccionado = async f => {
    setOcrError(''); setOcrAviso(''); setOcrOk(false); setOcrTotalDetectado(null);

    const check = validarComprobanteCliente(f);
    if (!check.valid) { setOcrError(check.error); return; }

    setArchivo(f);
    setPreview({ url: URL.createObjectURL(f), type: f.type });
    // Solo se aceptan imágenes en este flujo (JPG/JPEG/PNG/WEBP), así que
    // siempre podemos convertir a base64 para que el admin la vea después.
    const reader = new FileReader();
    reader.onload = () => setComprobanteB64(reader.result);
    reader.readAsDataURL(f);

    if (!total || total <= 0) {
      // Defensivo: no debería pasar aquí sin un total de pedido válido.
      setOcrAviso('No se pudo comparar el total automáticamente. Tu comprobante quedará pendiente de revisión manual.');
      return;
    }

    setOcrProcesando(true);
    setOcrProgreso(0);
    try {
      const resultado = await procesarComprobante(f, setOcrProgreso);
      if (!resultado.ok) {
        // No se pudo leer el comprobante con buena confianza (mala calidad,
        // formato inusual, total no identificado, etc.) — informativo, NO
        // un rechazo: el pedido sigue su curso normal hacia verificación
        // manual.
        setOcrAviso('No pudimos leer el comprobante automáticamente. No hay problema: tu pedido quedará pendiente de verificación y nuestro equipo lo revisará manualmente.');
        return;
      }
      setOcrTotalDetectado(resultado.total);
      if (!totalDentroDeTolerancia(resultado.total, total)) {
        // Discrepancia clara (fuera del margen de tolerancia por redondeo o
        // errores menores de lectura) — se le avisa al cliente, pero
        // tampoco bloquea: el Admin/Cajero decide con sus propios ojos.
        setOcrAviso('El total del comprobante no coincide con el total del pedido. No hay problema: quedará pendiente de revisión manual por nuestro equipo.');
        return;
      }
      setOcrOk(true);
    } catch (err) {
      setOcrAviso('No pudimos analizar el comprobante automáticamente. Tu pedido quedará pendiente de verificación manual.');
    } finally {
      setOcrProcesando(false);
    }
  };

  const filasFactura = generarFilasFactura();

  return (
    <div className="lx-modal-mask" onClick={onClose}>
      <div className="pay-modal" onClick={e => e.stopPropagation()}>
        <button className="pay-close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        {step === 6 ? (
          <div className="pay-success">
            {metodo === 'efectivo' ? (
              <div className="pay-success__icon">✓</div>
            ) : (
              <div className="pay-success__icon pay-success__icon--pending">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
            )}
            <h2>{metodo === 'efectivo' ? '¡Pedido recibido!' : 'Tu pago está en verificación'}</h2>
            <p>{metodo === 'efectivo'
              ? (tipoEntrega === 'domicilio'
                  ? 'Tu pedido fue registrado. Nos pondremos en contacto pronto para coordinar tu domicilio.'
                  : `Tu pedido fue registrado. Pasa por ${localSel ? localSel.nombre : 'el local'} a recogerlo cuando esté listo.`)
              : 'Recibimos tu comprobante. Por favor espera un momento mientras confirmamos que el pago fue exitoso — esto puede tardar unos minutos. En cuanto se verifique, comenzaremos a preparar tu pedido.'
            }</p>
            {metodo !== 'efectivo' && (
              <div className="pay-success__pending-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Pendiente de verificación
              </div>
            )}
            <div className="pay-success__total">Total: {fmt(totalConfirmado)}</div>
            <div style={{width:'100%',marginTop:22,textAlign:'left',background:'var(--lx-surface-2,#F7F7F7)',borderRadius:12,padding:'16px 18px'}}>
              <div style={{fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:1,color:'var(--lx-muted)',marginBottom:10}}>Estado de tu pedido</div>
              <PedidoProgreso
                estado={metodo === 'efectivo' ? 'pendiente' : 'pendiente_verificacion'}
                pago={metodo}
                tipo={tipoEntrega}
                orientacion="vertical"
              />
            </div>
            <button className="lx-btn lx-btn--full" onClick={() => (onCerrarFinal ? onCerrarFinal() : onSuccess())} style={{marginTop:16}}>Cerrar</button>
          </div>
        ) : (
          <>
            <div className="pay-header">
              <div className="pay-logo">
                <span className="lx-logo__s">
                  <img src="/img/Logotipo_blanco.png" alt="Café Don Berna" className="pay-logo__img" style={{width:30,height:30,objectFit:'contain',display:'block'}}/>
                </span>
                <span className="pay-logo__name">Café Don Berna</span>
              </div>
              <div className="pay-total-badge">{fmt(total)}</div>
            </div>

            <div className="pay-steps">
              {[1,2,3,4,5].map((n,idx) => (
                <React.Fragment key={n}>
                  {idx > 0 && <div className="pay-step-line"/>}
                  <div className={`pay-step ${step>=n?"pay-step--on":""}`}>{n}</div>
                </React.Fragment>
              ))}
            </div>
            <div className="pay-steps-labels">
              <span>Entrega</span><span>Dirección</span><span>Pago</span><span>Factura</span><span>Comprobante</span>
            </div>

            {step === 1 && (
              <div className="pay-body">
                <h3>¿Cómo quieres recibir tu pedido?</h3>
                <div className="pay-methods">
                  <button className={`pay-method ${tipoEntrega==='domicilio'?'pay-method--sel':''}`} onClick={() => setTipoEntrega('domicilio')}>
                    <span className="pay-method__icon">🛵</span>
                    <div><div className="pay-method__label">Domicilio</div><div className="pay-method__num">Te lo llevamos a tu dirección</div></div>
                    {tipoEntrega==='domicilio' && <span className="pay-method__check">✓</span>}
                  </button>
                  <button className={`pay-method ${tipoEntrega==='local'?'pay-method--sel':''}`} onClick={() => setTipoEntrega('local')}>
                    <span className="pay-method__icon">🏠</span>
                    <div><div className="pay-method__label">Recoger en el local</div><div className="pay-method__num">Recoge tu pedido en tienda</div></div>
                    {tipoEntrega==='local' && <span className="pay-method__check">✓</span>}
                  </button>
                </div>
                {/* Ambos caminos (domicilio y local) pasan ahora por el
                    paso 2 — para domicilio es la dirección alternativa, para
                    "Recoger en el local" es la elección obligatoria del
                    local (ver abajo). */}
                <button className="lx-btn lx-btn--full" disabled={!tipoEntrega} onClick={() => setStep(2)}>Continuar →</button>
              </div>
            )}

            {step === 2 && tipoEntrega === 'domicilio' && (
              <div className="pay-body">
                <div className="pay-coverage-alert">
                  <span className="pay-coverage-alert__icon">📍</span>
                  <p>Recuerda que por el momento nuestro servicio de domicilios <strong>solo cubre la comuna 8 y 9 de Medellín</strong>.</p>
                </div>
                <div className="pay-alt-address">
                  <label className="pay-alt-address__label">¿Deseas recibir el pedido en otra dirección? <span style={{fontWeight:400,color:'var(--lx-muted)'}}>(Opcional)</span></label>
                  <p className="pay-alt-address__hint">Si tu pedido debe entregarse en una dirección diferente a la que tienes registrada, puedes escribirla aquí.</p>
                  <input type="text" className="pay-alt-address__input" placeholder="Ej: Calle 45 #23-10, apto 301" value={direccionAlternativa} onChange={e => setDireccionAlternativa(e.target.value)}/>
                </div>
                <div style={{display:"flex",gap:12,marginTop:8}}>
                  <button className="btn-cancel" onClick={() => setStep(1)}>← Atrás</button>
                  <button className="lx-btn" style={{flex:1,justifyContent:"center"}} onClick={() => setStep(3)}>Continuar →</button>
                </div>
              </div>
            )}

            {step === 2 && tipoEntrega === 'local' && (
              <div className="pay-body">
                <h3>Elige tu local más cercano</h3>
                {localesError && (
                  <div style={{background:'rgba(229,57,53,0.12)',color:'#E53935',padding:'10px 14px',borderRadius:8,marginBottom:12,fontSize:13}}>
                    ⚠ {localesError}
                  </div>
                )}
                {/* 6 — si solo hay un local activo, se avisa arriba del
                    selector (que igual queda preseleccionado). */}
                {locales.length === 1 && (
                  <div style={{background:'var(--lx-green-bg)',border:'1.5px solid rgba(76,175,80,0.3)',borderRadius:10,padding:'10px 14px',marginBottom:12,fontSize:13,color:'var(--lx-text)'}}>
                    📍 Hoy solo estamos atendiendo en <strong>{locales[0].nombre}</strong>.
                  </div>
                )}
                {!localesError && locales.length === 0 ? (
                  <p style={{fontSize:13,color:'var(--lx-muted)'}}>Cargando locales...</p>
                ) : (
                  <div className="pay-methods">
                    {locales.map(l => (
                      <button key={l.id} className={`pay-method ${String(localId)===String(l.id)?'pay-method--sel':''}`} onClick={() => setLocalId(l.id)}>
                        <span className="pay-method__icon">🏠</span>
                        <div>
                          <div className="pay-method__label">{l.nombre}</div>
                          {l.direccion && <div className="pay-method__num">{l.direccion}</div>}
                        </div>
                        {String(localId)===String(l.id) && <span className="pay-method__check">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{display:"flex",gap:12,marginTop:8}}>
                  <button className="btn-cancel" onClick={() => setStep(1)}>← Atrás</button>
                  {/* Obligatorio: sin local elegido no se puede continuar. */}
                  <button className="lx-btn" style={{flex:1,justifyContent:"center"}} disabled={!localId} onClick={() => setStep(3)}>Continuar →</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="pay-body">
                <h3>Elige tu método de pago</h3>
                <div className="pay-methods">
                  {METODOS.map(m => (
                    <button key={m.id} className={`pay-method ${metodo===m.id?"pay-method--sel":""}`} onClick={() => setMetodo(m.id)}>
                      <span className="pay-method__icon" style={{background:"rgba(76,175,80,0.15)",color:"#4CAF50",borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:800}}>{m.icon}</span>
                      <div><div className="pay-method__label">{m.label}</div><div className="pay-method__num">{m.num}</div></div>
                      {metodo===m.id && <span className="pay-method__check">✓</span>}
                    </button>
                  ))}
                </div>
                <div className="pay-cart-summary">
                  <div className="pay-cart-title">Resumen del pedido</div>
                  {filasFactura.map((f,idx) => (
                    <div key={idx} className="pay-cart-row" style={f.esBase ? {} : {paddingLeft:14,opacity:0.8}}>
                      <span style={{fontSize: f.esBase ? 13 : 12}}>{f.desc}</span>
                      <span style={{fontSize: f.esBase ? 13 : 12, color: f.precio===0 ? '#4CAF50' : 'inherit'}}>
                        {f.precio > 0 ? fmt(f.precio) : f.desc.includes('gratis') ? 'Gratis' : ''}
                      </span>
                    </div>
                  ))}
                  {tipoEntrega === 'domicilio' && (
                    <div className="pay-cart-row" style={{opacity:0.85}}>
                      <span style={{fontSize:12}}>🛵 Valor del domicilio</span>
                      <span style={{fontSize:12,color:'#4CAF50',fontWeight:700}}>Gratis</span>
                    </div>
                  )}
                  {/* 4 — local elegido, visible en el resumen antes de
                      confirmar el pedido. */}
                  {tipoEntrega === 'local' && localSel && (
                    <div className="pay-cart-row" style={{opacity:0.85}}>
                      <span style={{fontSize:12}}>🏠 Recoger en</span>
                      <span style={{fontSize:12,fontWeight:700}}>{localSel.nombre}</span>
                    </div>
                  )}
                  <div className="pay-cart-total"><span>Total</span><strong>{fmt(total)}</strong></div>
                </div>
                {errorPedido && (
                  <div style={{background:'rgba(229,57,53,0.12)',color:'#E53935',padding:'10px 14px',borderRadius:8,marginTop:12,fontSize:13}}>
                    ⚠ {errorPedido}
                  </div>
                )}
                <div style={{display:"flex",gap:12,marginTop:8}}>
                  {/* Ahora "local" también pasa por el paso 2 (elegir
                      local), así que Atrás siempre vuelve ahí. */}
                  <button className="btn-cancel" onClick={() => setStep(2)}>← Atrás</button>
                  <button className="lx-btn" style={{flex:1,justifyContent:"center"}} disabled={!metodo||loading}
                    onClick={() => metodo==="efectivo" ? confirmar() : setStep(4)}>
                    {loading ? <span className="pay-spinner"/> : metodo==="efectivo" ? "Confirmar pedido →" : "Continuar →"}
                  </button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="pay-body">
                <h3>Factura — paga antes de continuar</h3>
                <p style={{fontSize:13,color:"var(--lx-muted)",marginBottom:16}}>
                  Realiza el pago por <strong>{metodoSel?.label}</strong> usando los datos de abajo. Cuando ya hayas pagado, envía tu comprobante en el siguiente paso.
                </p>
                <div className="pay-cart-summary">
                  <div className="pay-cart-title">Pedido {numeroPedido}</div>
                  {filasFactura.map((f,idx) => (
                    <div key={idx} className="pay-cart-row" style={f.esBase ? {} : {paddingLeft:14,opacity:0.75}}>
                      <span style={{fontSize: f.esBase ? 13 : 12}}>{f.desc}</span>
                      <span style={{fontSize: f.esBase ? 13 : 12, color: f.precio===0 ? '#4CAF50' : 'inherit'}}>
                        {f.precio > 0 ? fmt(f.precio) : f.desc.includes('gratis') ? 'Gratis' : ''}
                      </span>
                    </div>
                  ))}
                  <div className="pay-cart-total"><span>Total a pagar</span><strong>{fmt(total)}</strong></div>
                </div>
                <div style={{background:"var(--lx-green-bg)",border:"1.5px solid rgba(76,175,80,0.3)",borderRadius:12,padding:"14px 16px",marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"var(--lx-green-dd)",marginBottom:6}}>Paga con {metodoSel?.label}</div>
                  {metodoSel?.titular && (
                    <div style={{fontSize:12.5,color:"var(--lx-muted)",marginBottom:6}}>
                      Titular: <strong style={{color:"var(--lx-text)"}}>{metodoSel.titular}</strong>
                    </div>
                  )}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                    <div style={{fontSize:15,fontWeight:700,color:"var(--lx-text)"}}>{metodoSel?.num}</div>
                    {metodo!=='efectivo' && (
                      <button type="button" onClick={copiarNumero}
                        style={{display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:700,color:numeroCopiado?"#4CAF50":"var(--lx-green-dd)",background:"rgba(76,175,80,0.12)",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",whiteSpace:"nowrap"}}>
                        {numeroCopiado ? (
                          <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>¡Copiado!</>
                        ) : (
                          <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copiar número</>
                        )}
                      </button>
                    )}
                  </div>
                  {metodoSel?.tipoCuenta && (
                    <div style={{fontSize:12,color:"var(--lx-muted)",marginTop:6}}>Tipo de cuenta: {metodoSel.tipoCuenta}</div>
                  )}
                </div>
                <button type="button" onClick={imprimirFactura} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:600,color:"var(--lx-green-dd)",background:"none",border:"none",cursor:"pointer",padding:"8px 0",marginBottom:8}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
                  Descargar / imprimir factura en PDF
                </button>
                <div style={{display:"flex",gap:12,marginTop:8}}>
                  <button className="btn-cancel" onClick={() => setStep(3)}>← Atrás</button>
                  <button className="lx-btn" style={{flex:1,justifyContent:"center"}} onClick={() => setStep(5)}>
                    {metodo==='efectivo' ? 'Continuar →' : 'Ya realicé la transferencia →'}
                  </button>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="pay-body">
                <h3>Envía tu comprobante de pago</h3>
                <p style={{fontSize:13,color:"#888",marginBottom:16}}>
                  Mándanos el pantallazo de la transacción de {metodoSel?.label}. Puedes hacerlo por WhatsApp o subiendo el archivo aquí.
                </p>

                {advertencias.length > 0 && (
                  <div style={{background:"#FFF3E0",border:"1.5px solid #FFCC80",borderRadius:10,padding:"12px 14px",marginBottom:14,fontSize:13,color:"#E65100"}}>
                    <strong>⚠ Sin disponibilidad:</strong> los siguientes productos no tienen suficientes insumos:<br/>
                    {advertencias.map(a => <span key={a} style={{display:'block',marginTop:4}}>• {a}</span>)}
                    <span style={{display:'block',marginTop:8,fontSize:12}}>Por favor retira esos productos del carrito antes de confirmar.</span>
                  </div>
                )}

                <div className={`pay-comp-option ${modoComprobante==='whatsapp'?'pay-comp-option--sel':''}`}
                  onClick={() => setModoComprobante('whatsapp')}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:22}}>📱</span>
                    <div>
                      <div style={{fontWeight:700,fontSize:13}}>Enviar por WhatsApp</div>
                      <div style={{fontSize:12,color:"#888"}}>Se abre WhatsApp con los datos del pedido listos. Solo adjunta el pantallazo.</div>
                    </div>
                    {modoComprobante==='whatsapp' && <span style={{marginLeft:"auto",color:"#4CAF50",fontWeight:800}}>✓</span>}
                  </div>
                  {modoComprobante==='whatsapp' && (
                    <div style={{marginTop:12}}>
                      <button type="button" onClick={abrirWhatsApp}
                        style={{display:"flex",alignItems:"center",gap:8,background:"#25D366",color:"white",border:"none",borderRadius:10,padding:"10px 18px",fontWeight:700,fontSize:13,cursor:"pointer",width:"100%",justifyContent:"center"}}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.106 1.514 5.838L.057 23.215a.5.5 0 00.612.612l5.377-1.457A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.015-1.374l-.36-.214-3.733 1.013 1.012-3.727-.233-.374A9.818 9.818 0 0112 2.182c5.427 0 9.818 4.391 9.818 9.818S17.427 21.818 12 21.818z"/></svg>
                        {waSent ? '✓ WhatsApp abierto — ya puedes confirmar' : 'Abrir WhatsApp'}
                      </button>
                      {waSent && <p style={{fontSize:12,color:"#4CAF50",marginTop:8,textAlign:"center"}}>¡Listo! Ahora adjunta la captura en el chat de WhatsApp y da clic en Confirmar pedido.</p>}
                    </div>
                  )}
                </div>

                <div className={`pay-comp-option ${modoComprobante==='archivo'?'pay-comp-option--sel':''}`}
                  style={{marginTop:10}} onClick={() => setModoComprobante('archivo')}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:22}}>📎</span>
                    <div>
                      <div style={{fontWeight:700,fontSize:13}}>Subir imagen</div>
                      <div style={{fontSize:12,color:"#888"}}>Adjunta aquí el pantallazo del comprobante (JPG, PNG o WEBP).</div>
                    </div>
                    {modoComprobante==='archivo' && <span style={{marginLeft:"auto",color:"#4CAF50",fontWeight:800}}>✓</span>}
                  </div>
                  {modoComprobante==='archivo' && (
                    <div style={{marginTop:12}}>
                      <div className="pay-upload"
                        onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setArrastrando(true); }}
                        onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setArrastrando(false); }}
                        onDrop={handleDrop}
                        style={arrastrando ? { borderColor: 'var(--lx-green,#4CAF50)', background: 'rgba(76,175,80,0.06)' } : undefined}
                      >
                        {preview ? (
                          <div style={{position:'relative',width:'100%',height:'100%'}}>
                            <img src={preview.url} alt="comprobante" className="pay-upload__img"/>
                            <button type="button" className="ilb-zoom-trigger" title="Ver completo / Zoom"
                              onClick={e => { e.stopPropagation(); setZoomComprobante(true); }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                            </button>
                          </div>
                        ) : (
                          <div className="pay-upload__placeholder">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            <span>Arrastra tu comprobante aquí, o haz clic para subir</span>
                            <small>JPG, PNG o WEBP · máx. 5 MB</small>
                          </div>
                        )}
                      </div>
                      {preview && (
                        <button type="button" onClick={e => { e.stopPropagation(); setZoomComprobante(true); }}
                          style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,width:'100%',marginTop:8,padding:'7px 0',borderRadius:8,border:'1.5px solid var(--lx-border)',background:'transparent',color:'var(--lx-text)',fontWeight:600,fontSize:12,cursor:'pointer'}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                          Ver comprobante completo
                        </button>
                      )}
                      {zoomComprobante && preview && (
                        <ImageLightbox src={preview.url} alt="Comprobante de pago" onClose={() => setZoomComprobante(false)} />
                      )}
                      <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{display:"none"}} onChange={handleFile}/>

                      {ocrProcesando && (
                        <div style={{marginTop:12,padding:"12px 14px",borderRadius:10,background:"var(--lx-surface-2, #F5F5F5)",border:"1px solid rgba(0,0,0,.06)"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,fontWeight:600,color:"var(--lx-text)"}}>
                            <span className="pay-spinner" style={{width:14,height:14}}/>
                            Analizando comprobante... {ocrProgreso}%
                          </div>
                          <div style={{marginTop:8,height:6,borderRadius:4,background:"rgba(0,0,0,.08)",overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${ocrProgreso}%`,background:"var(--lx-green,#4CAF50)",transition:"width .2s"}}/>
                          </div>
                        </div>
                      )}

                      {!ocrProcesando && ocrError && (
                        <div style={{marginTop:12,padding:"12px 14px",borderRadius:10,background:"rgba(229,57,53,0.10)",border:"1px solid rgba(229,57,53,0.3)",color:"#E53935",fontSize:12.5,fontWeight:600,display:"flex",gap:8,alignItems:"flex-start"}}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0,marginTop:1}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          {ocrError}
                        </div>
                      )}

                      {/* Informativo, no bloqueante: el pedido puede confirmarse igual — ver
                          procesarArchivoSeleccionado. Estilo neutro (ámbar), no rojo de error,
                          para no dar la impresión de que el comprobante fue rechazado. */}
                      {!ocrProcesando && ocrAviso && (
                        <div style={{marginTop:12,padding:"12px 14px",borderRadius:10,background:"rgba(255,152,0,0.10)",border:"1px solid rgba(255,152,0,0.3)",color:"#B26A00",fontSize:12.5,fontWeight:600,display:"flex",gap:8,alignItems:"flex-start"}}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0,marginTop:1}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          {ocrAviso}
                        </div>
                      )}

                      {!ocrProcesando && ocrOk && (
                        <div style={{marginTop:12,padding:"14px 16px",borderRadius:10,background:"rgba(76,175,80,0.08)",border:"1px solid rgba(76,175,80,0.3)"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,color:"#4CAF50",fontWeight:700,fontSize:13,marginBottom:10}}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            El total coincide correctamente
                          </div>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:12.5,color:"var(--lx-muted)"}}>
                            <div style={{textAlign:"center"}}>
                              <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:.5}}>Comprobante</div>
                              <div style={{fontWeight:800,fontSize:15,color:"var(--lx-text)"}}>{fmt(ocrTotalDetectado)}</div>
                            </div>
                            <span style={{fontSize:11,fontWeight:700,color:"var(--lx-muted)"}}>VS</span>
                            <div style={{textAlign:"center"}}>
                              <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:.5}}>Pedido</div>
                              <div style={{fontWeight:800,fontSize:15,color:"var(--lx-text)"}}>{fmt(total)}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {errorPedido && (
                  <div style={{background:'rgba(229,57,53,0.12)',color:'#E53935',padding:'10px 14px',borderRadius:8,marginTop:16,fontSize:13}}>
                    ⚠ {errorPedido}
                  </div>
                )}

                <div style={{display:"flex",gap:12,marginTop:20}}>
                  <button className="btn-cancel" onClick={() => setStep(4)}>← Atrás</button>
                  <button className="lx-btn" style={{flex:1,justifyContent:"center"}}
                    // El OCR ya no condiciona este botón (ver confirmar() y
                    // procesarArchivoSeleccionado): solo se exige haber adjuntado
                    // el archivo. Se espera a que termine de procesar
                    // (ocrProcesando) únicamente para no enviar el pedido a mitad
                    // de la lectura, no porque el resultado deba ser positivo.
                    disabled={loading || ocrProcesando || !modoComprobante || (modoComprobante==='archivo' && !archivo) || (modoComprobante==='whatsapp' && !waSent)}
                    onClick={confirmar}>
                    {loading ? <span className="pay-spinner"/> : "Confirmar pedido →"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { login: adminLogin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [clienteSession, setClienteSession] = useState(() => {
    try { const s = localStorage.getItem("sicaber_cliente_session"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [authTab, setAuthTab] = useState("login");
  const [loginData, setLoginData] = useState({ correo:"", password:"" });
  const [regData, setRegData] = useState({ nombre:"", correo:"", telefono:"", tipoDoc:"Cédula de Ciudadanía", tipoDocOtro:"", numeroDoc:"", departamento:"Antioquia", municipio:"Medellín", comuna:"", direccion:"", password:"", confirm:"" });
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showRegPass, setShowRegPass]   = useState(false);
  const [showRegConf, setShowRegConf]   = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [activeCat, setActiveCat] = useState("Todos");
  const catScrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [toast, setToast] = useState("");
  const [pagoNotif, setPagoNotif] = useState(null); // notificación de pago aprobado/rechazado por mostrar
  const [showPasarela, setShowPasarela] = useState(false);
  const { playTransition } = useTransition();
  const [modalPersonalizar, setModalPersonalizar] = useState(null);
  const [modalDuplicar, setModalDuplicar] = useState(null);
  const [perfilTab, setPerfilTab] = useState("info");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const [editData, setEditData] = useState({});
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [resenas, setResenas] = useState([]);
  const [reviewForm, setReviewForm] = useState({ texto: '', estrellas: 0 });
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  const REVIEWS_PER_PAGE = 3;

  // Solicitud de devolución del cliente
  const [devPedido, setDevPedido] = useState(null);       // pedido sobre el que se solicita devolución
  const [devProductosSel, setDevProductosSel] = useState([]);
  const [devMotivo, setDevMotivo] = useState('');
  const [devError, setDevError] = useState('');
  const [devLoading, setDevLoading] = useState(false);
  const [devSuccess, setDevSuccess] = useState('');
  const [pedidosCliente, setPedidosCliente] = useState([]);
  const [clienteData, setClienteData] = useState(null);

  // ── Datos async desde la API ─────────────────────────────
  const [PRODUCTS,       setProducts]    = useState([]);
  const [COMBOS_ACTIVOS, setCombos]      = useState([]);
  const [CATEGORIAS_DATA,setCategorias]  = useState([]);
  const [TOPPINGS_DISP,  setToppings]    = useState([]);
  const [TODAS_ADICIONES,setAdiciones]   = useState([]);

  const PRODUCTOS_CON_DESCUENTO = PRODUCTS.filter(p => descuentoVigente(p) !== null);
  const ADICIONES_DISP = TODAS_ADICIONES;
  // La tabla "adiciones" en el backend nunca tuvo una columna "categoria"
  // (solo nombre/precio/estado — ver schema.sql y el whitelist del CRUD),
  // así que filtrar por a.categoria === prod.categoria siempre devolvía
  // un arreglo vacío: las adiciones nunca aparecían en el modal de
  // personalizar. Las adiciones aplican a cualquier producto.
  const getAdicionesPorProducto = (prod) => TODAS_ADICIONES;
  // Un topping con productos_ids vacío aplica a todos los productos (valor
  // por defecto); si tiene ids, solo aplica a esos productos específicos.
  // Antes esto nunca se filtraba: el modal de personalizar mostraba
  // TOPPINGS_DISP completo sin importar el producto, así que cualquier
  // topping configurado para otro producto aparecía igual en todos.
  const getToppingsPorProducto = (prod) => toppingsParaProducto(TOPPINGS_DISP, prod?.id);

  const [disponibilidad, setDisponibilidad] = useState(new Map());
  // Disponibilidad real por producto (antes esto se leía de localStorage
  // con claves que nunca se llenaban, así que la disponibilidad "real"
  // siempre daba true sin importar el stock actual, y después llamaba a
  // /insumos y /fichas-tecnicas, rutas protegidas que un visitante público
  // sin token nunca puede usar y que fallaban con 401 cada 8s). Ahora usa
  // /disponibilidad, la ruta pública que ya calcula el máximo producible en
  // el backend a partir del stock real. Se aísla en su propia función para
  // poder llamarla tanto al cargar la página como en el refresco periódico
  // de abajo, sin duplicar la petición.
  const refreshStock = () => {
    disponibilidadService.getAll()
      .then(d => setDisponibilidad(new Map(
        (Array.isArray(d) ? d : []).map(x => [String(x.id_producto), Number(x.stock_disponible)])
      )))
      .catch(() => setDisponibilidad(new Map()));
  };
  useEffect(() => {
    productosService.getActivos()
      .then(d => setProducts(Array.isArray(d) ? d : []))
      .catch(() => setProducts([]));
    combosService.getActivos()
      .then(d => setCombos(Array.isArray(d) ? d : []))
      .catch(() => setCombos([]));
    categoriasService.getAll()
      .then(d => setCategorias(Array.isArray(d) ? d.filter(c => c.estado === 'Activo') : []))
      .catch(() => setCategorias([]));
    toppingsService.getAll()
      .then(d => setToppings(Array.isArray(d) ? d.filter(t => t.estado === 'Activo') : []))
      .catch(() => setToppings([]));
    adicionesService.getAll()
      .then(d => setAdiciones(Array.isArray(d) ? d.filter(a => a.estado === 'Activo') : []))
      .catch(() => setAdiciones([]));
    refreshStock();
  }, []);
  // El máximo producible por producto depende del stock real de insumos —
  // sin este refresco periódico, un cliente que deja la pestaña abierta
  // seguía viendo el límite calculado con el inventario del momento en que
  // cargó la página, aunque el stock cambiara mientras tanto (otra venta,
  // una compra, etc.). Mismo patrón ya usado en CajeroPage.jsx para refrescar
  // pedidos cada 8s.
  useEffect(() => {
    const t = setInterval(refreshStock, 8000);
    return () => clearInterval(t);
  }, []);
  // ─────────────────────────────────────────────────────────

  // Máximo de unidades vendibles de un producto según el inventario real.
  // El backend (/disponibilidad) ya calcula esto a partir de la ficha
  // técnica y el stock de insumos; un producto ausente del mapa significa
  // que no tiene ficha técnica activa con ingredientes, es decir, sin
  // límite conocido.
  const maxDisponible = (prodId) => {
    const stock = disponibilidad.get(String(prodId));
    return stock === undefined ? Infinity : stock;
  };

  const productoDisponible = (prodId) => maxDisponible(prodId) > 0;
  const cats  = ["Todos", ...new Set(PRODUCTS.map(p => p.categoria))];
  const shown = activeCat === "Todos" ? PRODUCTS : PRODUCTS.filter(p => p.categoria === activeCat);

  useEffect(() => {
    const fn = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", fn, { passive:true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    resenasService.getAprobadas().then(data => setResenas(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  // Revisa si el admin o el cajero confirmaron/rechazaron una transferencia
  // y, si es así, le muestra al cliente una alerta. Se revisa al cargar,
  // cada pocos segundos (por si lo aprueban mientras el cliente tiene la
  // página abierta) y cuando otra pestaña del mismo navegador modifica el
  // localStorage (evento "storage").
  useEffect(() => {
    if (!clienteSession) return;
    const checkNotifs = () => {
      const pendientes = notificacionesService.getNoLeidas(clienteSession.id);
      if (pendientes.length > 0) {
        const ultima = pendientes[0];
        setPagoNotif(ultima);
        notificacionesService.marcarLeida(ultima.id);
      }
    };
    checkNotifs();
    const interval = setInterval(checkNotifs, 5000);
    window.addEventListener('storage', checkNotifs);
    return () => { clearInterval(interval); window.removeEventListener('storage', checkNotifs); };
  }, [clienteSession]);

  useEffect(() => {
    if (!pagoNotif) return;
    const t = setTimeout(() => setPagoNotif(null), 8000);
    return () => clearTimeout(t);
  }, [pagoNotif]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocClick = (e) => { if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [userMenuOpen]);

  useEffect(() => {
    if (!clienteSession) { setPedidosCliente([]); setClienteData(null); return; }
    pedidosService.getAll().then(items =>
      setPedidosCliente((items || []).filter(p => p.cliente_id === clienteSession.id || p.cliente === clienteSession.nombre).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
    ).catch(() => setPedidosCliente([]));
    clientesService.getById(clienteSession.id).then(c => setClienteData(c)).catch(() => {});
  }, [clienteSession]);

  // Recoge las intenciones dejadas por la página de historial de pedidos
  // (/mis-pedidos) para "Volver a comprar" o "Solicitar devolución": esas
  // acciones dependen del carrito y de los modales de esta pantalla, así
  // que la página de historial solo guarda el pedido en sessionStorage y
  // navega aquí; este efecto las ejecuta una sola vez al llegar.
  useEffect(() => {
    const repetir = sessionStorage.getItem('sicaber_repetir_pedido');
    if (repetir) {
      sessionStorage.removeItem('sicaber_repetir_pedido');
      try { volverAComprar(JSON.parse(repetir)); } catch {}
    }
    const devolucion = sessionStorage.getItem('sicaber_devolucion_pedido');
    if (devolucion) {
      sessionStorage.removeItem('sicaber_devolucion_pedido');
      try { abrirSolicitudDevolucion(JSON.parse(devolucion)); } catch {}
    }
  }, []);

  const updateCatScroll = () => {
    const el = catScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  const scrollCats = dir => {
    const el = catScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 180, behavior: 'smooth' });
    setTimeout(updateCatScroll, 350);
  };

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  // Cuando el token expira (8h) o queda inválido, api.js limpia la sesión y
  // deja este flag antes de que PrivateRoute redirija aquí. Antes eso dejaba
  // al administrador viendo el storefront público sin ninguna explicación
  // (parecía que Insumos/Fichas Técnicas "se rompían" con un 401). Ahora se
  // reabre el mismo modal de login que ya usa todo el flujo de admin, con
  // un mensaje claro de por qué se cerró la sesión.
  useEffect(() => {
    if (sessionStorage.getItem('sicaber_session_expired')) {
      sessionStorage.removeItem('sicaber_session_expired');
      setModal('auth'); setAuthTab('login');
      setAuthError('Tu sesión expiró. Inicia sesión nuevamente.');
    }
  }, []);

  const openPersonalizar = p => {
    if (!clienteSession) { setModal("auth"); setAuthTab("login"); showToast("Inicia sesión para agregar al carrito"); return; }
    setModalPersonalizar(p);
  };

  // 5 — dos líneas del carrito son "la misma configuración" solo si tienen
  // el mismo producto Y exactamente el mismo conjunto de toppings/adiciones
  // (comparado por id, sin importar el orden en que se marcaron). Se usa
  // para decidir si un nuevo "agregar" debe sumar cantidad a una línea ya
  // existente, o crear una línea aparte — antes SIEMPRE se creaba una línea
  // nueva, así que agregar el mismo producto sin cambiar nada duplicaba la
  // línea en vez de acumular cantidad.
  const mismosIds = (a, b) => {
    const idsA = [...new Set((a||[]).map(x => x.id))].sort();
    const idsB = [...new Set((b||[]).map(x => x.id))].sort();
    return idsA.length === idsB.length && idsA.every((id,i) => id === idsB[i]);
  };
  const buscarLineaMismaConfig = (prodId, toppings, adiciones) =>
    cart.find(i => i.id === prodId && mismosIds(i.toppings, toppings) && mismosIds(i.adiciones, adiciones));
  // Suma 1 a una línea existente respetando el máximo de inventario
  // disponible — mismo tope que ya usa updateQty al tocar "+" en el carrito.
  const sumarUnoALinea = (linea, prodId, nombreToast) => {
    const max = maxDisponible(prodId);
    if (linea.qty + 1 > max) {
      showToast(`Con el inventario actual solo es posible preparar un máximo de ${max} unidades de este producto.`);
      return false;
    }
    setCart(prev => prev.map(i => i._cartKey === linea._cartKey ? {...i, qty: i.qty + 1} : i));
    showToast(nombreToast);
    return true;
  };

  const addToCartWithExtras = (prod, toppings, adiciones) => {
    if (!clienteSession) { setModalPersonalizar(null); setModal("auth"); setAuthTab("login"); showToast("Inicia sesión para agregar al carrito"); return; }
    // Misma configuración (mismo producto + mismos toppings + mismas
    // adiciones) que una línea ya existente: suma cantidad ahí en vez de
    // crear una línea aparte. Configuración distinta (toppings quitados,
    // adiciones distintas, etc.) sí queda como línea independiente.
    const existente = buscarLineaMismaConfig(prod.id, toppings, adiciones);
    if (existente) {
      sumarUnoALinea(existente, prod.id, prod.nombre + " — cantidad actualizada");
      setModalPersonalizar(null);
      return;
    }
    // Number(...): igual que en LxPersonalizar — el backend puede devolver
    // las columnas NUMERIC como string, y "+" concatena en vez de sumar si
    // alguno de los operandos es texto.
    const extraTotal  = toppings.reduce((s,t) => s+(Number(t.precio)||0), 0) + adiciones.reduce((s,a) => s+(Number(a.precio)||0), 0);
    const precioFinal = Number(prod.precio||prod.price||0) + extraTotal;
    // Un combo no tiene "precio original con descuento" (ese dato es propio
    // de productos individuales) — evitamos pedirlo al backend con su id
    // sintético "combo-N".
    const prodOriginal = esIdCombo(prod.id) ? null : productosService.getById(prod.id);
    const precioOriginal = prodOriginal && descuentoVigente(prodOriginal) ? prodOriginal.precio : null;
    const cartKey = `${prod.id}-${Date.now()}`;
    setCart(prev => [...prev, {...prod, qty:1, toppings, adiciones, precioFinal, extraTotal, _precioOriginal: precioOriginal, _cartKey: cartKey}]);
    showToast(prod.nombre + " agregado al carrito");
    setModalPersonalizar(null);
  };

  const addToCart = p => {
    if (!clienteSession) { setModal("auth"); setAuthTab("login"); showToast("Inicia sesión para agregar al carrito"); return; }
    const existente = buscarLineaMismaConfig(p.id, [], []);
    const tieneOpciones = getToppingsPorProducto(p).length > 0 || getAdicionesPorProducto(p).length > 0;
    if (existente) {
      // Sin opciones de personalización no hay forma de que la próxima
      // unidad sea "distinta", así que sumamos cantidad directo sin
      // preguntar. Si el producto sí tiene opciones (se llegó aquí por un
      // acceso rápido que se saltó el personalizador), seguimos ofreciendo
      // elegir entre sumar una igual o personalizar la nueva distinto.
      if (!tieneOpciones) { sumarUnoALinea(existente, p.id, p.nombre + " — cantidad actualizada"); return; }
      setModalDuplicar(p);
      return;
    }
    // Ver comentario equivalente en addToCartWithExtras: un combo no tiene
    // precio original con descuento, así que no vale la pena consultarlo.
    const prodOriginal = esIdCombo(p.id) ? null : productosService.getById(p.id);
    const precioOriginal = prodOriginal && descuentoVigente(prodOriginal) ? prodOriginal.precio : null;
    const cartKey = `${p.id}-${Date.now()}`;
    setCart(prev => [...prev, {...p, qty:1, toppings:[], adiciones:[], precioFinal:p.precio||p.price, _precioOriginal: precioOriginal, _cartKey: cartKey}]);
    showToast(p.nombre + " agregado");
  };

  const updateQty  = (cartKey,d,prodId) => setCart(prev => prev.map(i => {
    if (i._cartKey !== cartKey) return i;
    const max = maxDisponible(prodId ?? i.id);
    const nueva = Math.max(0, i.qty + d);
    if (d > 0 && nueva > max) {
      showToast(`Con el inventario actual solo es posible preparar un máximo de ${max} unidades de este producto.`);
      return { ...i, qty: max };
    }
    return { ...i, qty: nueva };
  }).filter(i=>i.qty>0));
  // Cantidad escrita directamente por el cliente en el carrito.
  const setCartQty = (cartKey, valorTexto, prodId) => {
    if (valorTexto === '') { setCart(prev => prev.map(i => i._cartKey===cartKey?{...i,qty:''}:i)); return; }
    const n = Number(valorTexto);
    if (!Number.isInteger(n) || isNaN(n)) {
      showToast('Escribe una cantidad válida (solo números enteros).');
      return;
    }
    if (n < 1) {
      showToast('La cantidad mínima es 1.');
      setCart(prev => prev.map(i => i._cartKey===cartKey?{...i,qty:1}:i));
      return;
    }
    const max = maxDisponible(prodId);
    if (n > max) {
      showToast(`Con el inventario actual solo es posible preparar un máximo de ${max} unidades de este producto.`);
      setCart(prev => prev.map(i => i._cartKey===cartKey?{...i,qty:max}:i));
      return;
    }
    setCart(prev => prev.map(i => i._cartKey===cartKey?{...i,qty:n}:i));
  };
  const cartTotal  = cart.reduce((s,i) => s+(i.precioFinal||i.precio||i.price)*i.qty, 0);
  const cartCount  = cart.reduce((s,i) => s+i.qty, 0);

  // "Volver a comprar": toma los productos de un pedido anterior y los
  // vuelve a agregar al carrito actual, respetando cantidades. Si algún
  // producto ya no existe o está inactivo, se omite y se avisa.
  const volverAComprar = (pedido) => {
    if (!Array.isArray(pedido.productos) || pedido.productos.length === 0) {
      showToast("Este pedido no tiene productos para repetir");
      return;
    }
    let agregados = 0, omitidos = 0;
    const nuevosItems = [];
    pedido.productos.forEach(item => {
      const prodActual = productosService.getById(item.id);
      if (!prodActual || prodActual.estado === false || prodActual.estado === 'Inactivo') { omitidos++; return; }
      const cartKey = `${prodActual.id}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      nuevosItems.push({
        ...prodActual,
        qty: item.cantidad || 1,
        toppings: item.toppings || [],
        adiciones: item.adiciones || [],
        precioFinal: item.precioFinal || prodActual.precio,
        _cartKey: cartKey,
      });
      agregados++;
    });
    if (nuevosItems.length > 0) setCart(prev => [...prev, ...nuevosItems]);
    if (agregados > 0 && omitidos === 0) showToast(`${agregados} producto${agregados!==1?'s':''} agregado${agregados!==1?'s':''} al carrito`);
    else if (agregados > 0 && omitidos > 0) showToast(`${agregados} agregado${agregados!==1?'s':''}, ${omitidos} ya no disponible${omitidos!==1?'s':''}`);
    else showToast("Esos productos ya no están disponibles");
    setModal(null);
    setCartOpen(true);
  };

  // "Ver factura": abre una ventana imprimible con el detalle completo de
  // un pedido pasado (productos, toppings/adiciones, total y método de pago),
  // para que el cliente pueda confirmar exactamente qué y cuánto pagó.
  const METODOS_PAGO_LABEL = { nequi:'Nequi', transferencia:'Transferencia', efectivo:'Efectivo en caja' };
  const verFacturaPedido = (pedido) => {
    const w = window.open('', '_blank');
    if (!w) { showToast('Habilita las ventanas emergentes para ver la factura'); return; }
    const cliente = clienteData;
    const filas = [];
    (pedido.productos || []).forEach(i => {
      const cant = i.cantidad || 1;
      const precioBase = (i.precio || 0) * cant;
      filas.push({ desc: `${i.nombre} x${cant}`, precio: precioBase, esBase: true });
      (i.toppings || []).forEach(t => {
        if ((t.precio || 0) > 0) filas.push({ desc: `  + ${t.nombre} x${cant}`, precio: t.precio * cant, esBase: false });
        else filas.push({ desc: `  + ${t.nombre} (gratis)`, precio: 0, esBase: false });
      });
      (i.adiciones || []).forEach(a => {
        filas.push({ desc: `  + ${a.nombre} x${cant}`, precio: (a.precio || 0) * cant, esBase: false });
      });
    });
    const filasHtml = filas.map(f =>
      `<tr>
        <td style="${f.esBase ? '' : 'color:#666;padding-left:18px;font-size:12px;'}">${f.desc}</td>
        <td style="text-align:right;${f.esBase ? '' : 'color:#666;font-size:12px;'}">${f.precio > 0 ? fmt(f.precio) : (f.desc.includes('gratis') ? 'Gratis' : '')}</td>
      </tr>`
    ).join('');
    const fechaPedido = pedido.fechaCreacion ? new Date(pedido.fechaCreacion).toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'}) : '';
    const estadoLabelMap = { pendiente_verificacion:'Verificando pago', pendiente:'Pendiente', en_proceso:'En proceso', listo:'Listo', entregado:'Entregado', cancelado:'Cancelado' };
    w.document.write(`
      <html><head><title>Factura — Pedido #${pedido.id}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#222;padding:32px;max-width:480px;margin:0 auto;}
        h1{font-size:20px;margin-bottom:4px;color:#2E7D32;}
        .muted{color:#777;font-size:12px;margin-bottom:4px;}
        table{width:100%;border-collapse:collapse;margin:14px 0 18px;}
        td{padding:5px 0;border-bottom:1px solid #f0f0f0;font-size:13px;}
        tr:last-child td{border-bottom:none;}
        .subtitulo{font-size:11px;font-weight:700;text-transform:uppercase;color:#999;letter-spacing:1px;padding:10px 0 4px;}
        .total-row{display:flex;justify-content:space-between;font-size:16px;font-weight:bold;border-top:2px solid #2E7D32;padding-top:10px;margin-top:6px;color:#2E7D32;}
        .pago{background:#f4f8f4;border:1px solid #cde3cd;border-radius:8px;padding:14px;margin-top:18px;font-size:13px;line-height:1.6;}
        .pago b{display:block;margin-bottom:4px;color:#2E7D32;}
        .estado{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:100px;background:#eee;margin-top:6px;}
      </style></head>
      <body>
        <h1>☕ Café Don Berna</h1>
        <div class="muted">Factura · Pedido #${pedido.id}${pedido.numero ? ` (${pedido.numero})` : ''} · ${fechaPedido}</div>
        <div class="muted">Cliente: ${cliente?.nombre || pedido.cliente || ''}${cliente?.correo ? ` · ${cliente.correo}` : ''}</div>
        <span class="estado">${estadoLabelMap[pedido.estado] || pedido.estado || ''}</span>
        <div class="subtitulo">Detalle del pedido</div>
        <table>${filasHtml}</table>
        <div class="total-row"><span>Total</span><span>${fmt(pedido.total)}</span></div>
        <div class="pago">
          <b>Método de pago: ${METODOS_PAGO_LABEL[pedido.pago] || pedido.pago || '—'}</b>
          Entrega: ${pedido.tipo === 'domicilio' ? 'A domicilio' : 'Recogida en local'}
          ${pedido.direccionAlternativa ? `<br>Dirección: ${pedido.direccionAlternativa}` : ''}
        </div>
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  // ── Solicitud de devolución por parte del cliente ───────────────────────
  const abrirSolicitudDevolucion = (pedido) => {
    setDevError(''); setDevSuccess('');
    setDevPedido(pedido);
    setDevProductosSel(pedido.productos || []); // por defecto, todos seleccionados (devolución total)
  };

  const toggleDevProducto = (item) => {
    setDevProductosSel(prev => {
      const yaSel = prev.find(x => x.id === item.id);
      return yaSel ? prev.filter(x => x.id !== item.id) : [...prev, item];
    });
  };

  const confirmarSolicitudDevolucion = async () => {
    setDevError('');
    if (!devMotivo.trim() || devMotivo.trim().length < 10) {
      setDevError('Cuéntanos brevemente el motivo (mínimo 10 caracteres).');
      return;
    }
    if (devProductosSel.length === 0) {
      setDevError('Selecciona al menos un producto a devolver.');
      return;
    }
    // Buscar la venta asociada a este pedido (solo se puede devolver lo que ya fue vendido/entregado)
    const todasVentas = await ventasService.getAll();
    const venta = todasVentas.find(v => v.id_pedido === devPedido.id);
    if (!venta) {
      setDevError('Este pedido todavía no está listo para devolución. Espera a que sea entregado.');
      return;
    }
    setDevLoading(true);
    // Antes: faltaba `await`, así que `r` era una Promise y `r.error`
    // siempre daba `undefined` — el mensaje de éxito se mostraba aunque
    // la solicitud fallara en el backend. Además se enviaban campos
    // (id_venta/cliente/productos_devueltos/origen) que el backend nunca
    // lee; solo usa pedido_id/motivo/monto/items/tipo.
    const totalProductos = Array.isArray(devPedido.productos) ? devPedido.productos.length : 0;
    const esParcial = totalProductos >= 2 && devProductosSel.length < totalProductos;
    const monto = devProductosSel.reduce((s, p) => s + (p.precio || 0) * (p.cantidad || 1), 0);
    try {
      const r = await devolucionesService.create({
        pedido_id: venta.pedido_id ?? venta.id_pedido,
        motivo: devMotivo.trim(),
        items: devProductosSel,
        monto,
        tipo: esParcial ? 'parcial' : 'total',
      });
      setDevLoading(false);
      if (r && r.error) { setDevError(r.error); return; }
      setDevSuccess('¡Listo! Tu solicitud fue enviada. Te contactaremos pronto.');
      setTimeout(() => { setDevPedido(null); setDevMotivo(''); setDevProductosSel([]); setDevSuccess(''); }, 2200);
    } catch (err) {
      setDevLoading(false);
      setDevError(err.message || 'No se pudo enviar la solicitud');
    }
  };

  const abrirPerfil = async (tab = "info") => {
    playTransition(() => { setPerfilTab(tab); setEditError(""); setEditSuccess(""); setModal("perfil"); setUserMenuOpen(false); });
    try {
      const c = await clientesService.getById(clienteSession.id);
      if (c) {
        setClienteData(c);
        setEditData({ nombre: c.nombre, telefono: c.telefono||"", direccion: c.direccion||"", comuna: c.comuna||"", departamento: "Antioquia", municipio: "Medellín" });
      }
    } catch {}
};

  const handleEditPerfil = async e => {
    e.preventDefault(); setEditError(""); setEditSuccess("");
    if (!editData.nombre?.trim()) { setEditError("El nombre es obligatorio."); return; }
    setEditLoading(true);
    try {
      const r = await clientesApi.actualizarPerfil(editData);
      const updated = { ...clienteSession, nombre: r.nombre || editData.nombre };
      setClienteSession(updated);
      localStorage.setItem("sicaber_cliente_session", JSON.stringify(updated));
      setEditSuccess("¡Datos actualizados correctamente!"); setEditLoading(false);
    } catch(e) {
      setEditError(e.message || "Error al actualizar."); setEditLoading(false);
    }
  };

const handleLogin = async e => {
  e.preventDefault(); setAuthError("");
  if (!loginData.correo.trim()) { setAuthError("Ingresa tu correo o usuario."); return; }
  if (!loginData.password) { setAuthError("Ingresa tu contraseña."); return; }
  setAuthLoading(true);
  const adminResult = await adminLogin(loginData.correo, loginData.password);
  if (adminResult.success) {
    setAuthSuccess("¡Bienvenido al panel de administración!"); setAuthLoading(false);
    playTransition(() => { setModal(null); navigate(adminResult.redirectTo || '/admin/dashboard'); }, { message: '¡Bienvenido!' });
    return;
  }
  const r = await clientesService.loginCliente(loginData.correo, loginData.password);
  if (r.error) { setAuthError(r.error); setAuthLoading(false); return; }
  const session = { id:r.data.id, nombre:r.data.nombre, correo:r.data.correo };
  setClienteSession(session);
  setClienteData(r.data);
  localStorage.setItem("sicaber_cliente_session", JSON.stringify(session));
  setAuthSuccess("¡Bienvenido/a, " + r.data.nombre + "!"); setAuthLoading(false);
  playTransition(() => setModal(null), { message: `¡Bienvenido/a, ${r.data.nombre}!` });
};

  const handleRegister = async e => {
    e.preventDefault(); setAuthError("");
    const soloLetras = /^[A-Za-zÁÉÍÓÚÑÜáéíóúñü ]+$/;
    if (!regData.numeroDoc.trim()) { setAuthError("El número de documento es obligatorio."); return; }
    if (!/^[0-9]+$/.test(regData.numeroDoc)) { setAuthError("El número de documento solo puede contener números."); return; }
    if (regData.numeroDoc.length < 6) { setAuthError("El número de documento debe tener mínimo 6 dígitos."); return; }
    if (regData.tipoDoc === 'Otros' && !regData.tipoDocOtro.trim()) {
      setAuthError('Escribe el nombre del tipo de documento.');
      return;
    }
    if (regData.tipoDoc === 'Otros' && regData.tipoDocOtro.trim().length < 3) {
      setAuthError('El tipo de documento debe tener mínimo 3 caracteres.');
      return;
    }
    if (!regData.nombre.trim()) { setAuthError("El nombre es obligatorio."); return; }
    if (regData.nombre.trim().length < 3) { setAuthError("El nombre debe tener mínimo 3 caracteres."); return; }
    if (!soloLetras.test(regData.nombre.trim())) { setAuthError("El nombre solo puede contener letras y espacios."); return; }
    if (regData.telefono && !/^[0-9]+$/.test(regData.telefono)) { setAuthError("El teléfono solo puede contener números."); return; }
    if (regData.telefono && (regData.telefono.length < 7 || regData.telefono.length > 10)) { setAuthError("El teléfono debe tener entre 7 y 10 dígitos."); return; }
    if (!regData.correo.trim()) { setAuthError("El correo es obligatorio."); return; }
    if (!/\S+@\S+\.\S+/.test(regData.correo)) { setAuthError("Ingresa un correo electrónico válido."); return; }
    if (!regData.password) { setAuthError("La contraseña es obligatoria."); return; }
    if (regData.password.length < 8) { setAuthError("La contraseña debe tener mínimo 8 caracteres."); return; }
    if (!/[A-Z]/.test(regData.password)) { setAuthError("La contraseña debe tener al menos una letra mayúscula."); return; }
    if (!regData.confirm) { setAuthError("Debes confirmar la contraseña."); return; }
    if (regData.password !== regData.confirm) { setAuthError("Las contraseñas no coinciden."); return; }
    if (regData.municipio === 'Medellín' && regData.comuna && regData.comuna !== 'Comuna 8 - Villa Hermosa' && regData.comuna !== 'Comuna 9 - Buenos Aires') {
      setAuthError('Lo sentimos, el servicio de domicilios solo está disponible para las comunas 8 y 9 de Medellín. Si tu dirección es de otra zona, puedes visitarnos en nuestro punto físico.');
      return;
    }
    const tipoDocFinal = regData.tipoDoc === 'Otros' ? regData.tipoDocOtro.trim() : regData.tipoDoc;
    setAuthLoading(true);
    const r = await clientesService.register({ nombre:regData.nombre, correo:regData.correo, telefono:regData.telefono, tipoDoc:tipoDocFinal, numeroDoc:regData.numeroDoc, departamento:regData.departamento, municipio:regData.municipio, comuna:regData.comuna, direccion:regData.direccion, password:regData.password });
    if (r.error) { setAuthError(r.error); setAuthLoading(false); return; }
    setAuthLoading(false);
    playTransition(() => { setModal(null); navigate('/verificar-cuenta', { state: { correo: regData.correo } }); }, { message: '¡Cuenta creada!' });
  };

  const handleLogout = () => {
    setModal(null);
    playTransition(() => {
      setClienteSession(null);
      localStorage.removeItem("sicaber_cliente_session");
      showToast("Sesión cerrada");
    }, { message: '¡Muchas gracias! Te esperamos pronto ☕' });
  };
  const finalizarPedido = () => { if (!clienteSession) { setCartOpen(false); setModal("auth"); setAuthTab("login"); showToast("Inicia sesión para continuar"); return; } setCartOpen(false); playTransition(() => setShowPasarela(true)); };
  const onPedidoSuccess = (cerrar = true) => { if (cerrar) setShowPasarela(false); setCart([]); showToast("¡Pedido creado! Pronto nos comunicamos."); };

  const handleSubmitReview = async e => {
    e.preventDefault(); setReviewError(''); setReviewSuccess('');
    if (!clienteSession) { setModal('auth'); setAuthTab('login'); return; }
    if (!reviewForm.texto.trim()) { setReviewError('Escribe tu experiencia antes de enviar la reseña.'); return; }
    if (!reviewForm.estrellas || reviewForm.estrellas < 1) { setReviewError('Selecciona una calificación en estrellas.'); return; }
    setReviewLoading(true);
    const r = await resenasService.create({ clienteId: clienteSession.id, nombre: clienteSession.nombre, rol: 'Cliente verificado', texto: reviewForm.texto, estrellas: reviewForm.estrellas });
    setReviewLoading(false);
    if (r.error) { setReviewError(r.error); return; }
    resenasService.getAprobadas().then(data => setResenas(Array.isArray(data) ? data : []));
    setReviewSuccess('¡Gracias por tu reseña!');
    setReviewForm({ texto: '', estrellas: 0 });
    setTimeout(() => { setShowReviewForm(false); setReviewSuccess(''); }, 2000);
  };

  return (
    <div className="lx">
      {toast && <div className="lx-toast">{toast}</div>}
      {pagoNotif && (
        <div className="lx-paynotif" role="alert">
          <div className="lx-paynotif__icon" style={(pagoNotif.tipo==='pago_rechazado'||pagoNotif.tipo==='pedido_anulado')?{background:'#FFEBEE',color:'#EF5350'}:{background:'#E8F5E9',color:'#2E7D32'}}>
            {(pagoNotif.tipo==='pago_rechazado'||pagoNotif.tipo==='pedido_anulado') ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            )}
          </div>
          <div className="lx-paynotif__body">
            <strong>{pagoNotif.tipo==='pago_rechazado' ? 'Pago rechazado' : pagoNotif.tipo==='pedido_anulado' ? 'Pedido anulado' : '¡Pago confirmado!'}</strong>
            <p>{pagoNotif.mensaje}</p>
          </div>
          <button className="lx-paynotif__x" onClick={() => setPagoNotif(null)} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}
      {showPasarela && clienteSession && (
        <PasarelaPago cart={cart} total={cartTotal} cliente={clienteSession} onClose={() => setShowPasarela(false)} onSuccess={onPedidoSuccess} onCerrarFinal={() => playTransition(() => onPedidoSuccess())}/>
      )}

      {/* ── Navbar ── */}
      <nav className={`lx-nav ${scrollY>60?"lx-nav--solid":""}`}>
        <div className="lx-nav__in">
          <div className="lx-logo" onClick={() => window.scrollTo({top:0,behavior:"smooth"})}>
            <span className="lx-logo__s"><img src="/img/Logotipo_blanco.png" alt="Café Don Berna" style={{width:32,height:32,objectFit:'contain',display:'block',transition:'filter 0.3s ease'}}/></span><span className="lx-logo__rest" style={{fontSize:11,letterSpacing:2}}>Café Don Berna</span>
          </div>
          <div className="lx-nav__links">
            {[['#menu','Menú'],['#nosotros','Nosotros'],['#contacto','Contacto']].map(([id,label]) => (
              <a key={id} href={id} onClick={e => {
                e.preventDefault();
                const el = document.querySelector(id);
                if (!el) return;
                const start = window.scrollY;
                const end = el.getBoundingClientRect().top + window.scrollY - 72;
                const dist = end - start;
                const dur = Math.min(900, Math.max(500, Math.abs(dist) * 0.4));
                let startTime = null;
                const easeInOutCubic = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
                const step = ts => {
                  if (!startTime) startTime = ts;
                  const prog = Math.min((ts - startTime) / dur, 1);
                  window.scrollTo(0, start + dist * easeInOutCubic(prog));
                  if (prog < 1) requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
              }}>{label}</a>
            ))}
          </div>
          <div className="lx-nav__right">
            {clienteSession ? (
              <div className="lx-user-info" ref={userMenuRef} style={{position:'relative'}}>
                <button className="lx-user-avatar lx-user-avatar--btn" onClick={() => setUserMenuOpen(o => !o)}>{clienteSession.nombre.charAt(0).toUpperCase()}</button>
                <div className="lx-user-text" style={{cursor:"pointer"}} onClick={() => setUserMenuOpen(o => !o)}>
                  <span className="lx-user-welcome">Hola,</span>
                  <span className="lx-user-name">{clienteSession.nombre.split(" ")[0]}</span>
                </div>
                <svg className="lx-user-chevron" style={{transform: userMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform .2s'}} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" onClick={() => setUserMenuOpen(o => !o)}><polyline points="6 9 12 15 18 9"/></svg>

                {userMenuOpen && (
                  <div className="lx-user-dropdown" onClick={e => e.stopPropagation()}>
                    <div className="lx-user-dropdown__head">
                      <div className="lx-user-dropdown__avatar">{clienteSession.nombre.charAt(0).toUpperCase()}</div>
                      <div>
                        <div className="lx-user-dropdown__name">{clienteSession.nombre}</div>
                        <div className="lx-user-dropdown__email">{clienteSession.correo}</div>
                      </div>
                    </div>
                    <div className="lx-user-dropdown__divider"/>
                    <button className="lx-user-dropdown__item" onClick={() => abrirPerfil("info")}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      <span>Mi perfil</span>
                    </button>
                    <button className="lx-user-dropdown__item" onClick={() => { setUserMenuOpen(false); navigate('/mis-pedidos'); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      <span>Historial</span>
                    </button>
                    <button className="lx-user-dropdown__item" onClick={() => abrirPerfil("editar")}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      <span>Editar datos</span>
                    </button>
                    <div className="lx-user-dropdown__divider"/>
                    <button className="lx-user-dropdown__item lx-user-dropdown__item--danger" onClick={() => { setUserMenuOpen(false); setModal("logout"); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      <span>Cerrar sesión</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button className="lx-nav__ghost" onClick={() => { setModal("auth"); setAuthTab("login"); }}>Ingresar</button>
                <button className="lx-nav__cta" onClick={() => { setModal("auth"); setAuthTab("register"); }}>Registrarse</button>
              </>
            )}
            <button className="lx-theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'} aria-label="Cambiar tema">
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
            {clienteSession && (
              <button className="lx-cart-icon" onClick={() => setCartOpen(true)}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                {cartCount > 0 && <span className="lx-cart-icon__n">{cartCount}</span>}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
{PRODUCTOS_CON_DESCUENTO.length > 0 ? (() => {
  const pd = PRODUCTOS_CON_DESCUENTO[0];
  const precioDesc = calcPrecioFinal(pd);
  const bgImg = pd.imagen && !pd.imagen.startsWith('PEGAR') ? pd.imagen : null;
  const descuentoPct = pd.descuento;
  const ahorras = (pd.precio || 0) - precioDesc;
  return (
    <section className="lx-hero">
{bgImg && <div className="lx-hero__bg-ambient"><img src={bgImg} alt=""/></div>}
<div className="lx-hero__grain"/>
<div className="lx-hero__fade"/>
{bgImg && <div className="lx-hero__product-frame"><img src={bgImg} alt={pd.nombre}/></div>}
      <div className="lx-hero__content">
        {/* Pill de oferta */}
        <div className="lx-hero__pill" style={{background:'rgba(229,57,53,0.15)',borderColor:'rgba(229,57,53,0.45)',color:'#FF8A80',marginBottom:20}}>
          <svg width="7" height="7" viewBox="0 0 8 8" style={{animation:'pulse 1.5s ease-in-out infinite'}}>
            <circle cx="4" cy="4" r="4" fill="currentColor"/>
          </svg>
          Oferta especial · Solo por tiempo limitado
        </div>

        {/* Nombre del producto */}
        <h1 className="lx-hero__h1" style={{marginBottom:12}}>{pd.nombre}</h1>
        {pd.descripcion && (
          <p className="lx-hero__p" style={{marginBottom:28,maxWidth:480}}>{pd.descripcion}</p>
        )}

        {/* Bloque de precio moderno */}
        <div style={{
          display:'flex', alignItems:'center', gap:16,
          marginBottom:32, flexWrap:'wrap'
        }}>
          {/* Badge descuento */}
          <div style={{
            background:'linear-gradient(135deg,#E53935,#B71C1C)',
            color:'white', fontSize:20, fontWeight:900,
            padding:'8px 18px', borderRadius:50,
            boxShadow:'0 4px 20px rgba(229,57,53,0.45)',
            letterSpacing:'-0.5px'
          }}>
            -{descuentoPct}%
          </div>

          {/* Precios */}
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            <span style={{
              fontSize:'clamp(36px,5.5vw,64px)',
              fontWeight:900, color:'#69F0AE',
              lineHeight:1, letterSpacing:'-2px',
              textShadow:'0 0 40px rgba(105,240,174,0.3)'
            }}>
              {fmt(precioDesc)}
            </span>
            <span style={{
              fontSize:16, color:'rgba(255,255,255,0.4)',
              textDecoration:'line-through', fontWeight:400,
              letterSpacing:'0.5px'
            }}>
              Antes: {fmt(pd.precio)}
            </span>
          </div>

          {/* Ahorro */}
          <div style={{
            background:'rgba(105,240,174,0.12)',
            border:'1px solid rgba(105,240,174,0.25)',
            borderRadius:12, padding:'8px 14px',
            display:'flex', flexDirection:'column', gap:1
          }}>
            <span style={{fontSize:10,color:'rgba(255,255,255,0.5)',textTransform:'uppercase',letterSpacing:'1px',fontWeight:600}}>Ahorras</span>
            <span style={{fontSize:18,fontWeight:800,color:'#69F0AE'}}>{fmt(ahorras)}</span>
          </div>
        </div>

        {/* Botones */}
        <div className="lx-hero__btns">
          <button className="lx-btn" style={{padding:'14px 32px',fontSize:15,fontWeight:800,letterSpacing:'0.3px'}}
            onClick={() => addToCart({...pd, precio: precioDesc})}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight:8,display:'inline-block',verticalAlign:'middle'}}>
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            Agregar al carrito
          </button>
          <a href="#menu" className="lx-btn lx-btn--outline" style={{padding:'14px 28px',fontSize:15}}>
            Ver el menú
          </a>
        </div>

        {/* Tiempo restante si hay fecha de fin */}
        {pd.fecha_fin_desc && (() => {
          const fin = new Date(pd.fecha_fin_desc);
          const ahora = new Date();
          const diff = fin - ahora;
          if (diff <= 0) return null;
          const dias = Math.floor(diff / (1000*60*60*24));
          const hrs  = Math.floor((diff % (1000*60*60*24)) / (1000*60*60));
          return (
            <div style={{marginTop:24,display:'flex',alignItems:'center',gap:8,color:'rgba(255,255,255,0.45)',fontSize:12}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Oferta válida por{dias > 0 ? ` ${dias} día${dias!==1?'s':''} y` : ''} {hrs} hora{hrs!==1?'s':''}
            </div>
          );
        })()}
      </div>

      {/* Otros productos en oferta — minicarrusel en la esquina */}
      {PRODUCTOS_CON_DESCUENTO.length > 1 && (
        <div style={{
          position:'absolute', bottom:40, right:48, zIndex:4,
          display:'flex', gap:10, alignItems:'center'
        }}>
          {PRODUCTOS_CON_DESCUENTO.slice(1, 4).map(p => {
            const pDesc = calcPrecioFinal(p);
            return (
              <button key={p.id} onClick={() => addToCart({...p, precio: pDesc})}
                style={{
                  background:'rgba(255,255,255,0.09)', backdropFilter:'blur(16px)',
                  border:'1px solid rgba(255,255,255,0.14)', borderRadius:16,
                  padding:'10px 14px', cursor:'pointer', textAlign:'left',
                  transition:'all .25s', color:'white', minWidth:120,
                  boxShadow:'0 4px 20px rgba(0,0,0,0.3)'
                }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(76,175,80,0.18)'; e.currentTarget.style.borderColor='rgba(76,175,80,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.09)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.14)'; }}
              >
                <div style={{fontSize:11,color:'#FF8A80',fontWeight:700,marginBottom:3}}>-{p.descuento}%</div>
                <div style={{fontSize:12,fontWeight:700,marginBottom:2,lineHeight:1.3}}>{p.nombre}</div>
                <div style={{fontSize:14,fontWeight:900,color:'#69F0AE'}}>{fmt(pDesc)}</div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
})() : (
      <section className="lx-hero">
        <div className="lx-hero__parallax"><img src="https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1800&q=85" alt="café"/></div>
        <div className="lx-hero__grain"/>
        <div className="lx-hero__fade"/>
        <div className="lx-hero__content">
          <div className="lx-hero__pill"><svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>Cafetería Cafe Don Berna - Medellin</div>
          <h1 className="lx-hero__h1">Café Don<br/><em>Berna</em></h1>
          <p className="lx-hero__p">Cada taza, una historia · Cada sorbo, una experiencia</p>
          <div className="lx-hero__btns">
            <a href="#menu" className="lx-btn">Ver el menú</a>
            {!clienteSession && (
              <button className="lx-btn lx-btn--outline" onClick={() => { setModal("auth"); setAuthTab("register"); }}>Crear cuenta</button>
            )}
          </div>
        </div>
      </section>
      )}

      {/* ── Marquee ── */}
      <div className="lx-marquee">
        <div className="lx-marquee__track">
          {["Cafe don berna","Capuchino","Carajillo","Cafe Con Leche","Perico","Tinto","Cafe Berna","Frappe","Capuchino Helado","Preentrenos","Amaretto","Granizado de Cafe","Cafe Helado"].map((t,i) => (
            <span key={i} className="lx-marquee__item">{t}<span className="lx-marquee__dot"> · </span></span>
          ))}
        </div>
      </div>

      <section className="lx-stats">
        {[{n:"3+",l:"Años de experiencia"},{n:"Variedad de",l:"Recetas únicas"},{n:"Todos Nuestros",l:"Clientes felices"},{n:"100%",l:"Ingredientes naturales"}].map((s,i) => (
          <div className="lx-stat" key={i}><div className="lx-stat__n">{s.n}</div><div className="lx-stat__l">{s.l}</div></div>
        ))}
      </section>

      {/* ── Combos ── */}
      {COMBOS_ACTIVOS.length > 0 && (
        <section className="lx-section lx-combos-section" style={{paddingTop:60,paddingBottom:60}}>
          <div className="lx-section__in">
            <div className="lx-section__tag">Ofertas especiales</div>
            <h2 className="lx-section__h2">Combos<br/><em>del día</em></h2>
            <p className="lx-section__p">Combinaciones especiales con precio exclusivo para ti.</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:20,marginTop:32}}>
              {COMBOS_ACTIVOS.map(combo => {
                const totalOrig = (combo.items||[]).reduce((s,p) => {
                  const adicionesTotal = (p.adiciones||[]).reduce((s2,a) => s2 + (Number(a.precio)||0), 0);
                  // Number(p.precioOriginal): sin esto, "500" + adicionesTotal
                  // concatena texto en vez de sumar (mismo bug que en
                  // LxPersonalizar/addToCartWithExtras).
                  return s + ((Number(p.precioOriginal)||0) + adicionesTotal) * (p.cantidad||1);
                }, 0);
                const ahorro = totalOrig > combo.precio ? totalOrig - combo.precio : 0;
                // El backend devuelve fecha_inicio/fecha_fin (snake_case) —
                // leer combo.fechaFin daba siempre undefined. "Desde" se
                // muestra siempre (con created_at como respaldo si no hay
                // fecha de inicio explícita); "Hasta" solo si el combo tiene
                // una fecha de fin definida — mismo comportamiento que ya
                // usa el panel admin de Combos.
                const fechaInicioCombo = soloFecha(combo.fecha_inicio || combo.fechaInicio) || soloFecha(combo.created_at);
                const fechaFinCombo    = soloFecha(combo.fecha_fin    || combo.fechaFin);
                return (
                  <div key={combo.id} style={{background:'var(--lx-surface)',borderRadius:16,border:'1px solid var(--lx-border)',overflow:'hidden',transition:'transform 0.2s,box-shadow 0.2s'}}
                    onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-4px)';e.currentTarget.style.boxShadow='0 12px 32px rgba(0,0,0,0.4)'}}
                    onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='none'}}>
                    <div style={{height:140,background:'var(--lx-bg)',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',position:'relative'}}>
                      {combo.imagen
                        ? <img src={combo.imagen} alt={combo.nombre} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                        : <span style={{fontSize:48}}>🎁</span>
                      }
                      {ahorro > 0 && (
                        <div style={{position:'absolute',top:12,left:12,background:'#E53935',color:'white',fontSize:12,fontWeight:800,padding:'4px 10px',borderRadius:20}}>
                          Ahorras {fmt(ahorro)}
                        </div>
                      )}
                    </div>
                    <div style={{padding:'16px 18px'}}>
                      <div style={{fontSize:16,fontWeight:800,color:'var(--lx-text)',marginBottom:6}}>{combo.nombre}</div>
                      {combo.descripcion && <div style={{fontSize:13,color:'var(--lx-muted)',marginBottom:10}}>{combo.descripcion}</div>}
                      {fechaInicioCombo && (
                        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10,flexWrap:'wrap'}}>
                          <span style={{fontSize:11,color:'var(--lx-muted)',background:'rgba(255,255,255,0.06)',borderRadius:6,padding:'3px 8px',display:'flex',alignItems:'center',gap:4}}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            Desde {formatFecha(fechaInicioCombo)}
                          </span>
                          {fechaFinCombo && (() => {
                            const today = new Date().toISOString().slice(0,10);
                            const diff = Math.ceil((new Date(fechaFinCombo) - new Date(today)) / 86400000);
                            const urgente = diff >= 0 && diff <= 3;
                            return (
                              <span style={{fontSize:11,color:urgente?'#FF8A80':'var(--lx-muted)',fontWeight:urgente?700:400,background:'rgba(255,255,255,0.06)',borderRadius:6,padding:'3px 8px',display:'flex',alignItems:'center',gap:4}}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                {urgente && diff === 0 ? '⚡ Último día' : urgente ? `⚡ Vence en ${diff} día${diff!==1?'s':''}` : `Hasta ${formatFecha(fechaFinCombo)}`}
                              </span>
                            );
                          })()}
                        </div>
                      )}
                      <div style={{fontSize:12,color:'var(--lx-muted)',marginBottom:12}}>
                        {(combo.items||[]).map((p,i)=>(
                          <span key={p.id ?? i}>{i>0&&<span style={{color:'var(--lx-muted)'}}> + </span>}{p.cantidad>1?`${p.cantidad}× `:''}{p.nombre}</span>
                        ))}
                      </div>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <div style={{display:'flex',alignItems:'baseline',gap:8}}>
                          <span style={{fontSize:22,fontWeight:900,color:'var(--lx-green)'}}>{fmt(combo.precio)}</span>
                          {totalOrig > 0 && <span style={{fontSize:13,color:'var(--lx-muted)',textDecoration:'line-through'}}>{fmt(totalOrig)}</span>}
                        </div>
                        <button className="lx-card__add"
                          onClick={() => {
                            if(!clienteSession){setModal('auth');setAuthTab('login');showToast('Inicia sesión para agregar al carrito');return;}
                            const prod = {id:`combo-${combo.id}`,nombre:combo.nombre,precio:combo.precio,imagen:combo.imagen||'',categoria:'Combo'};
                            addToCart(prod);
                          }}
                          style={{background:'linear-gradient(135deg,#4CAF50,#2E7D32)'}}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Menú ── */}
      <section id="menu" className="lx-section lx-menu">
        <div className="lx-section__in">
          <div className="lx-section__tag">Nuestro menú</div>
          <h2 className="lx-section__h2">Lo mejor<br/><em>de la casa</em></h2>
          <p className="lx-section__p">Seleccionamos los mejores ingredientes para crear cada bebida con dedicación.</p>
          {clienteSession ? (
            <div className="lx-catcards-wrap">
              <div className="lx-catcards-track" ref={catScrollRef} onScroll={updateCatScroll}>
                <button className={`lx-catcard lx-catcard--all ${activeCat === 'Todos' ? 'lx-catcard--on' : ''}`} onClick={() => setActiveCat('Todos')}>
                  <div className="lx-catcard__circle">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
                    </svg>
                  </div>
                  <div className="lx-catcard__label">
                    <span className="lx-catcard__name">Todos</span>
                    <span className="lx-catcard__count">{PRODUCTS.length} productos</span>
                  </div>
                </button>
                {CATEGORIAS_DATA.map(cat => {
                  const count = PRODUCTS.filter(p => p.categoria === cat.nombre).length;
                  const nombre = cat.nombre.toLowerCase();
                  const icono = nombre.includes('caliente') ? (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 8h1a4 4 0 0 1 0 8h-1"/>
                      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>
                      <line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>
                    </svg>
                  ) : nombre.includes('fr') ? (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 11V7a7 7 0 0 1 14 0v4"/>
                      <rect x="3" y="11" width="18" height="10" rx="2"/>
                      <line x1="12" y1="11" x2="12" y2="21"/>
                    </svg>
                  ) : nombre.includes('jugo') || nombre.includes('natural') ? (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                      <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                    </svg>
                  ) : (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
                    </svg>
                  );
                  return (
                    <button key={cat.id} className={`lx-catcard ${activeCat === cat.nombre ? 'lx-catcard--on' : ''}`} onClick={() => setActiveCat(cat.nombre)}>
                      <div className="lx-catcard__circle">{icono}</div>
                      <div className="lx-catcard__label">
                        <span className="lx-catcard__name">{cat.nombre}</span>
                        <span className="lx-catcard__count">{count} producto{count!==1?'s':''}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="lx-cats">{cats.map(c => <button key={c} className={`lx-cat ${activeCat===c?"lx-cat--on":""}`} onClick={() => setActiveCat(c)}>{c}</button>)}</div>
          )}
          <div className="lx-grid">
            {shown.map(p => {
              // descuentoVigente ya revisa fecha_inicio_desc/fecha_fin_desc: un
              // descuento programado para el futuro (o ya vencido) no debe
              // mostrarse como "con descuento" en el catálogo hasta que llegue
              // esa fecha. Antes esto solo miraba p.descuento > 0, sin importar
              // la vigencia, así que un descuento programado ya se veía aplicado.
              const descVigente = descuentoVigente(p);
              const pd = descVigente ? calcPrecioFinal(p) : null;
              const precioCarrito = pd || p.precio;
              const hayStock = productoDisponible(p.id);
              return (
              <div className="lx-card" key={p.id} style={hayStock ? {} : {opacity:0.75}}>
                <div className="lx-card__img-wrap">
                  {(p.imagen||p.img)
                    ? <img src={p.imagen||p.img} alt={p.nombre} className="lx-card__img" onError={e=>{e.target.style.display='none'}}/>
                    : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:36}}>☕</div>
                  }
                  {descVigente && (
                    <span style={{position:'absolute',top:10,left:10,background:'#E53935',color:'white',fontSize:11,fontWeight:800,padding:'3px 9px',borderRadius:20,zIndex:2}}>
                      -{descVigente}%
                    </span>
                  )}
                </div>
                <div className="lx-card__body">
                  <div className="lx-card__cat">{p.categoria}</div>
                  <h3 className="lx-card__name">{p.nombre}</h3>
                  {!hayStock && <p style={{fontSize:11,color:'#E53935',fontWeight:600,margin:'2px 0 4px'}}>⚠ No disponible</p>}
                  {p.descripcion && <p className="lx-card__desc">{p.descripcion}</p>}
                  <div className="lx-card__foot">
                    <div style={{display:'flex',flexDirection:'column',gap:2}}>
                      {pd ? (
                        <>
                          <span className="lx-card__price" style={{color:'#E53935'}}>{fmt(pd)}</span>
                          <span style={{fontSize:11,color:'#bbb',textDecoration:'line-through',lineHeight:1}}>{fmt(p.precio)}</span>
                        </>
                      ) : (
                        <span className="lx-card__price">{fmt(p.precio)}</span>
                      )}
                    </div>
                    <button className="lx-card__add" disabled={!hayStock}
                      style={hayStock ? {} : {opacity:0.4,cursor:'not-allowed',filter:'grayscale(1)'}}
                      title={hayStock ? 'Agregar al carrito' : 'Producto sin insumos disponibles'}
                      onClick={() => hayStock && ((getToppingsPorProducto(p).length > 0 || getAdicionesPorProducto(p).length > 0) ? openPersonalizar({...p,precio:precioCarrito}) : addToCart({...p,precio:precioCarrito}))}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Nosotros ── */}
      <section id="nosotros" className="lx-section lx-about">
        <div className="lx-section__in lx-about__in">
          <div className="lx-about__img-wrap">
            <img src="https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=800&q=80" alt="barista" className="lx-about__img"/>
            <div className="lx-about__badge"><div className="lx-about__badge-n">3+</div><div className="lx-about__badge-l">años de pasión</div></div>
          </div>
          <div className="lx-about__text">
            <div className="lx-section__tag">Nuestra historia</div>
            <h2 className="lx-section__h2">Más que<br/><em>un café</em></h2>
            <p>Café Don Berna nació de la pasión por el café de especialidad y el deseo de crear un espacio donde cada persona encontrara su bebida perfecta. Comenzamos en 2023 con una pequeña barra y un sueño grande.</p>
            <p style={{marginTop:16}}>Hoy somos el referente de cafetería artesanal en Medellín, con un menú que mezcla lo clásico y lo innovador.</p>
            <div className="lx-about__chips">{["Ingredientes naturales","Baristas certificados","Recetas propias","Comercio justo"].map(c => <span className="lx-about__chip" key={c}>✓ {c}</span>)}</div>
          </div>
        </div>
      </section>

      {/* ── Reseñas ── */}
      <section className="lx-section lx-reviews">
        <div className="lx-section__in">
          <div className="lx-reviews-header">
            <div>
              <div className="lx-section__tag">Testimonios</div>
              <h2 className="lx-section__h2">Lo que dicen<br/><em>nuestros clientes</em></h2>
            </div>
            {clienteSession && !resenasService.yaReseño(clienteSession.id, resenas) && (
              <button className="lx-review-add-btn" onClick={() => setShowReviewForm(v => !v)}>
                {showReviewForm ? (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancelar</>
                ) : (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>Dejar mi reseña</>
                )}
              </button>
            )}
            {clienteSession && resenasService.yaReseño(clienteSession.id, resenas) && (
              <div className="lx-review-done-badge">✓ Ya dejaste tu reseña</div>
            )}
          </div>
          {showReviewForm && clienteSession && (
            <form className="lx-review-form" onSubmit={handleSubmitReview}>
              <div className="lx-review-form__top">
                <div className="lx-review__av" style={{width:44,height:44,fontSize:18}}>{clienteSession.nombre.charAt(0).toUpperCase()}</div>
                <div><div style={{fontWeight:700,fontSize:14,color:'var(--ink)'}}>{clienteSession.nombre}</div><div style={{fontSize:12,color:'var(--muted)'}}>Cliente verificado</div></div>
              </div>
              <div className="lx-review-stars-pick">
                <span style={{fontSize:13,color:'var(--muted)',fontWeight:600}}>Tu calificación:</span>
                <div className="lx-stars-row">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button" className={`lx-star-btn ${n <= (reviewHover || reviewForm.estrellas) ? 'lx-star-btn--on' : ''}`}
                      onMouseEnter={() => setReviewHover(n)} onMouseLeave={() => setReviewHover(0)}
                      onClick={() => setReviewForm(f => ({...f, estrellas: n}))}>★</button>
                  ))}
                </div>
              </div>
              <textarea className="lx-review-textarea" placeholder="Cuéntanos tu experiencia..." value={reviewForm.texto} onChange={e => setReviewForm(f => ({...f, texto: e.target.value.slice(0, 400)}))} rows={4}/>
              <div style={{fontSize:11,color:'var(--muted)',textAlign:'right',marginTop:4}}>{reviewForm.texto.length}/400</div>
              {reviewError   && <div className="lx-modal__err" style={{marginTop:8}}>{reviewError}</div>}
              {reviewSuccess && <div className="lx-modal__ok"  style={{marginTop:8}}>{reviewSuccess}</div>}
              <button type="submit" className="lx-btn" disabled={reviewLoading} style={{marginTop:12,alignSelf:'flex-end'}}>{reviewLoading ? 'Enviando...' : 'Publicar reseña →'}</button>
            </form>
          )}
          {(() => {
            const totalResenas = resenas.length;
            const promedio     = totalResenas ? (resenas.reduce((s,r) => s+(r.calificacion??5),0)/totalResenas) : 0;
            const totalPages   = Math.ceil(totalResenas / REVIEWS_PER_PAGE);
            const paginadas    = resenas.slice((reviewPage-1)*REVIEWS_PER_PAGE, reviewPage*REVIEWS_PER_PAGE);
            return (
              <>
                {totalResenas > 0 && (
                  <div className="lx-rating-summary">
                    <span className="lx-rating-summary__num">{promedio.toFixed(1)}</span>
                    <div className="lx-rating-summary__stars">{[1,2,3,4,5].map(n => <span key={n} style={{color: n<=Math.round(promedio)?"#4CAF50":"rgba(255,255,255,0.1)"}}>★</span>)}</div>
                    <span className="lx-rating-summary__total">({totalResenas} reseña{totalResenas!==1?"s":""})</span>
                  </div>
                )}
                <div className="lx-reviews-grid">
                  {paginadas.map((r, i) => (
                    <div className="lx-review" key={r.id ?? i}>
                      <div className="lx-review__stars">{'★'.repeat(r.calificacion ?? 5)}{'☆'.repeat(5-(r.calificacion??5))}</div>
                      <p className="lx-review__txt">"{r.texto ?? r.txt}"</p>
                      <div className="lx-review__author">
                        <div className="lx-review__av">{(r.nombre ?? r.name).charAt(0)}</div>
                        <div><div className="lx-review__name">{r.nombre ?? r.name}</div><div className="lx-review__role">{r.rol ?? r.role}</div></div>
                        {r.cliente_id && <div className="lx-review__verified" title="Cliente verificado">✓</div>}
                      </div>
                    </div>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="lx-review-pagination">
                    <button className="lx-review-page-btn" disabled={reviewPage===1} onClick={() => setReviewPage(p=>p-1)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
                    {Array.from({length:totalPages},(_,i)=>i+1).map(p => <button key={p} className={`lx-review-page-btn ${reviewPage===p?'lx-review-page-btn--on':''}`} onClick={() => setReviewPage(p)}>{p}</button>)}
                    <button className="lx-review-page-btn" disabled={reviewPage===totalPages} onClick={() => setReviewPage(p=>p+1)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg></button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </section>

      {/* ── Contacto ── */}
      <section id="contacto" className="lx-section lx-contact">
        <div className="lx-section__in lx-contact__in">
          <div>
            <div className="lx-section__tag">Encuéntranos</div>
            <h2 className="lx-section__h2">Visítanos</h2>
            <div className="lx-contact__items">
              {[
                {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,t:"Dirección",v:"Calle 10A #52-44, en frente del D1"},
                {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,t:"Horario",v:"Lun–Sáb 7am–8pm · Dom 8am–6pm"},
                {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.24 2 2 0 0 1 3.58 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.06 6.06l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,t:"Teléfono",v:"324 644 4774"},
                {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,t:"Correo",v:"sebastiancastano9704@gmail.com"},
                {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,t:"Propietario",v:"Sebastian Castaño Palacio"}
              ].map((item,i) => (
                <div className="lx-contact__item" key={i}><span className="lx-contact__icon">{item.icon}</span><div><div className="lx-contact__label">{item.t}</div><div className="lx-contact__val">{item.v}</div></div></div>
              ))}
            </div>
          </div>
          <div className="lx-contact__cta-box">
            <h3>¿Listo para ordenar?</h3>
            <p>Crea tu cuenta y pide tu bebida favorita a domicilio.</p>
            {clienteSession
              ? <button className="lx-btn" onClick={() => document.getElementById("menu")?.scrollIntoView({behavior:"smooth"})}>Ver el menú →</button>
              : <button className="lx-btn" onClick={() => { setModal("auth"); setAuthTab("register"); }}>Crear cuenta gratis →</button>
            }
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lx-footer">
        <div className="lx-footer__in">
          <div>
            <div className="lx-logo" style={{marginBottom:12}}><span className="lx-logo__s"><img src="/img/Logotipo_blanco.png" alt="Café Don Berna" style={{width:32,height:32,objectFit:'contain',display:'block',transition:'filter 0.3s ease'}}/></span><span className="lx-logo__rest" style={{fontSize:11,letterSpacing:2}}>Café Don Berna</span></div>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.4)",maxWidth:260}}>Cafetería artesanal · Cafe Don Berna, en el corazón de Medellín.</p>
            <p style={{fontSize:11,color:"var(--lx-muted)",maxWidth:260,marginTop:5}}>Calle 10A #52-44, en frente del D1</p>
            <p style={{fontSize:11,color:"var(--lx-muted)",maxWidth:260,marginTop:2}}>Propietario: Sebastian Castaño Palacio</p>
          </div>
          <div className="lx-footer__links">{[['#menu','Menú'],['#nosotros','Nosotros'],['#contacto','Contacto']].map(([id,label]) => (<a key={id} href={id} onClick={e=>{e.preventDefault();const el=document.querySelector(id);if(!el)return;const s=window.scrollY,en=el.getBoundingClientRect().top+window.scrollY-72,d=en-s,dur=Math.min(900,Math.max(500,Math.abs(d)*0.4));let st=null;const ease=t=>t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;const step=ts=>{if(!st)st=ts;const p=Math.min((ts-st)/dur,1);window.scrollTo(0,s+d*ease(p));if(p<1)requestAnimationFrame(step);};requestAnimationFrame(step);}}>{label}</a>))}</div>
        </div>
        <div className="lx-footer__bar">© 2025 Café Don Berna · Todos los derechos reservados.</div>
      </footer>

      {/* ── Carrito drawer ── */}
      <div className={`lx-mask ${cartOpen?"lx-mask--on":""}`} onClick={() => setCartOpen(false)}/>
      <div className={`lx-drawer ${cartOpen?"lx-drawer--open":""}`}>
        <div className="lx-drawer__top">
          <div><h3>Carrito</h3>{cartCount>0&&<span className="lx-drawer__cnt">{cartCount} {cartCount===1?"producto":"productos"}</span>}</div>
          <button className="lx-drawer__x" onClick={() => setCartOpen(false)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div className="lx-drawer__body">
          {cart.length === 0 ? (
            <div className="lx-drawer__nil">
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
              <p>Tu carrito está vacío</p>
              <button className="lx-btn lx-btn--sm" onClick={() => { setCartOpen(false); document.getElementById("menu")?.scrollIntoView({behavior:"smooth"}); }}>Ver menú</button>
            </div>
          ) : (
            <div className="lx-drawer__list">
              {cart.map(item => {
                const imgSrc = item.imagen || item.img || null;
                const nombre = item.nombre || item.name || 'Producto';
                const precio = (item.precioFinal || item.precio || item.price || 0);
                const precioOriginal = item._precioOriginal || null;
                const ahorro = precioOriginal ? (precioOriginal - precio) * item.qty : null;
                return (
                  <div className="lx-drawer__row" key={item._cartKey || item.id}>
                    <CartThumb src={imgSrc} alt={nombre}/>
                    <div className="lx-drawer__meta">
                      <strong>{nombre}</strong>
                      {Array.isArray(item.toppings) && item.toppings.length > 0 && <span className="lx-drawer__extras">{item.toppings.map(t=>t.nombre).join(", ")}</span>}
                      {Array.isArray(item.adiciones) && item.adiciones.length > 0 && <span className="lx-drawer__addons">{item.adiciones.map(a=>a.nombre).join(", ")}</span>}
                      <span className="lx-drawer__price">{fmt(precio * item.qty)}</span>
                      {ahorro > 0 && (
                        <span style={{fontSize:11,fontWeight:700,color:'var(--lx-green)',background:'rgba(76,175,80,0.12)',padding:'2px 7px',borderRadius:10,marginTop:2,display:'inline-block'}}>
                          Ahorras {fmt(ahorro)}
                        </span>
                      )}
                    </div>
                    <div className="lx-drawer__ctrl">
                      <button onClick={() => updateQty(item._cartKey || item.id,-1,item.id)}>−</button>
                      <input
                        type="number" className="lx-drawer__qty-input"
                        value={item.qty}
                        onChange={e => setCartQty(item._cartKey || item.id, e.target.value, item.id)}
                        onBlur={e => { if (!e.target.value || Number(e.target.value) < 1) setCartQty(item._cartKey || item.id, 1, item.id); }}
                      />
                      <button onClick={() => updateQty(item._cartKey || item.id,+1,item.id)}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {cart.length > 0 && (
          <div className="lx-drawer__bot">
            <div className="lx-drawer__total"><span>Total</span><strong>{fmt(cartTotal)}</strong></div>
            {!clienteSession && <p className="lx-drawer__login-hint">Inicia sesión para finalizar tu pedido</p>}
            <button className="lx-btn lx-btn--full" onClick={finalizarPedido}>{clienteSession?"Proceder al pago →":"Iniciar sesión y pagar →"}</button>
            <button className="lx-drawer__clr" onClick={() => setCart([])}>Vaciar carrito</button>
          </div>
        )}
      </div>

      {/* ── Modal Auth ── */}
      {modal === "auth" && (
        <div className="lx-modal-mask" onClick={() => setModal(null)}>
          <div className={`lx-modal${authTab==='register' ? ' lx-modal--register' : ''}`} onClick={e => e.stopPropagation()}>
            <button className="lx-modal__x" onClick={() => setModal(null)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            <div className="lx-modal__brand"><span className="lx-logo__s"><img src="/img/Logotipo_blanco.png" alt="Café Don Berna" style={{width:28,height:28,objectFit:'contain',display:'block',transition:'filter 0.3s ease'}}/></span><span className="lx-modal__bname" style={{fontSize:13,letterSpacing:2}}>Café Don Berna</span></div>
            <div className="lx-modal__tabs">
              <button className={authTab==="login"?"on":""} onClick={() => { setAuthTab("login"); setAuthError(""); setAuthSuccess(""); }}>Ingresar</button>
              <button className={authTab==="register"?"on":""} onClick={() => { setAuthTab("register"); setAuthError(""); setAuthSuccess(""); }}>Registrarse</button>
            </div>
            {authError && <div className="lx-modal__err">{authError}</div>}
            {authSuccess && <div className="lx-modal__ok">{authSuccess}</div>}
            {authTab==="login" && (
              <form className="lx-form" onSubmit={handleLogin}>
                <div className="lx-field"><label>Correo / Usuario</label><input type="text" placeholder="tu@correo.com o usuario admin" value={loginData.correo} onChange={e=>setLoginData({...loginData,correo:e.target.value})}/></div>
                <div className="lx-field"><label>Contraseña</label><div className="lx-pass-wrap"><input type={showLoginPass?'text':'password'} placeholder="••••••••" value={loginData.password} onChange={e=>setLoginData({...loginData,password:e.target.value})}/><button type="button" className="lx-eye" onClick={()=>setShowLoginPass(v=>!v)}>{showLoginPass?<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}</button></div></div>
                <button type="submit" className="lx-btn lx-btn--full" disabled={authLoading}>{authLoading?"Ingresando...":"Ingresar"}</button>
                <p style={{textAlign:'center',marginTop:12,fontSize:13}}>
                  <span style={{color:'var(--lx-accent)',cursor:'pointer',textDecoration:'underline'}} onClick={()=>{setModal(null);navigate('/recuperar-password');}}>¿Olvidaste tu contraseña?</span>
                </p>
              </form>
            )}
            {authTab==="register" && (
              <form className="lx-form" onSubmit={handleRegister}>
                <div className="lx-form__2">
                  <div className="lx-field"><label>Tipo de documento</label>
                    <select value={regData.tipoDoc} onChange={e=>setRegData({...regData,tipoDoc:e.target.value,tipoDocOtro:e.target.value==='Otros'?regData.tipoDocOtro:""})}>
                      <option>Cédula de Ciudadanía</option><option>Tarjeta de Identidad</option><option>Cédula de Extranjería</option><option>Otros</option>
                    </select>
                  </div>
                  <div className="lx-field"><label>Número de documento *</label><input type="text" inputMode="numeric" placeholder="Solo números" value={regData.numeroDoc} onChange={e=>setRegData({...regData,numeroDoc:e.target.value.replace(/[^0-9]/g,'')})}/></div>
                </div>
                {regData.tipoDoc === 'Otros' && (
                  <div className="lx-field"><label>¿Cuál documento? *</label><input type="text" value={regData.tipoDocOtro} placeholder="Ej: Pasaporte, Permiso Especial..." onChange={e=>setRegData({...regData,tipoDocOtro:e.target.value})}/></div>
                )}
                <div className="lx-form__2">
                  <div className="lx-field"><label>Nombre *</label><input type="text" placeholder="Solo letras y espacios" value={regData.nombre} onChange={e=>setRegData({...regData,nombre:e.target.value.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü ]/g,'')})}/></div>
                  <div className="lx-field"><label>Teléfono</label><input type="tel" inputMode="numeric" placeholder="Solo números" value={regData.telefono} onChange={e=>setRegData({...regData,telefono:e.target.value.replace(/[^0-9]/g,'').slice(0, 10)})}/></div>
                </div>
                <div className="lx-field"><label>Correo *</label><input type="text" value={regData.correo} onChange={e=>setRegData({...regData,correo:e.target.value})}/></div>
                <div style={{display:'flex',alignItems:'flex-start',gap:8,padding:'10px 12px',borderRadius:8,background:'rgba(129,199,132,0.12)',border:'1px solid rgba(129,199,132,0.35)',marginBottom:4}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#66BB6A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,marginTop:1}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  <span style={{fontSize:11.5,color:'var(--lx-text)',lineHeight:1.4}}>Actualmente solo prestamos servicio en Medellín, específicamente en las comunas 8 y 9.</span>
                </div>
                <div className="lx-form__2">
                  <div className="lx-field">
                    <label>Comuna <span style={{fontSize:11,color:'var(--lx-muted)',fontWeight:400}}>(domicilios solo comunas 8 y 9)</span></label>
                    <select value={regData.comuna} onChange={e=>setRegData({...regData,comuna:e.target.value})}>
                      <option value="">Seleccionar comuna...</option>
                      <option value="Comuna 8 - Villa Hermosa">Comuna 8 - Villa Hermosa</option>
                      <option value="Comuna 9 - Buenos Aires">Comuna 9 - Buenos Aires</option>
                    </select>
                  </div>
                  <div className="lx-field"><label>Dirección</label><input type="text" value={regData.direccion} placeholder="Ej: Calle 10 # 43-20" onChange={e=>setRegData({...regData,direccion:e.target.value})}/></div>
                </div>
                {(regData.comuna === 'Comuna 8 - Villa Hermosa' || regData.comuna === 'Comuna 9 - Buenos Aires') && (
                  <p style={{fontSize:12,color:'#81C784',marginTop:-8,marginBottom:4,fontWeight:600}}>✓ ¡Perfecto! Hacemos domicilios a tu zona.</p>
                )}
                <div className="lx-form__2">
                  <div className="lx-field"><label>Contraseña *</label><div className="lx-pass-wrap"><input type={showRegPass?'text':'password'} placeholder="Mín. 8, 1 mayúscula" value={regData.password} onChange={e=>setRegData({...regData,password:e.target.value})}/><button type="button" className="lx-eye" onClick={()=>setShowRegPass(v=>!v)}>{showRegPass?<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}</button></div></div>
                  <div className="lx-field"><label>Confirmar *</label><div className="lx-pass-wrap"><input type={showRegConf?'text':'password'} placeholder="••••••••" value={regData.confirm} onChange={e=>setRegData({...regData,confirm:e.target.value})}/><button type="button" className="lx-eye" onClick={()=>setShowRegConf(v=>!v)}>{showRegConf?<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}</button></div></div>
                </div>
                <p style={{fontSize:11,color:'var(--lx-muted)',marginTop:-8,marginBottom:4}}>La contraseña debe tener mínimo 8 caracteres y al menos una letra mayúscula.</p>
                <button type="submit" className="lx-btn lx-btn--full" disabled={authLoading}>{authLoading?"Creando...":"Crear cuenta"}</button>
              </form>
            )}
          </div>
        </div>
      )}

      {modal === "logout" && (
        <div className="lx-modal-mask" onClick={() => setModal(null)}>
          <div className="lx-modal" style={{maxWidth:360}} onClick={e => e.stopPropagation()}>
            <div className="lx-logout-modal-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></div>
            <h3 className="lx-logout-modal-title">¿Cerrar sesión?</h3>
            <p className="lx-logout-modal-sub">¿Estás seguro de que deseas salir?</p>
            <div className="lx-logout-modal-actions">
              <button className="lx-btn lx-btn--outline-dark" onClick={() => setModal(null)}>Cancelar</button>
              <button className="lx-btn lx-btn--danger" onClick={handleLogout}>Sí, salir</button>
            </div>
          </div>
        </div>
      )}

      {modal === "perfil" && clienteSession && (() => {
        const fmt2 = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n||0);
        const cliente = clienteData;        const estadoColor = { pendiente_verificacion:'#F57F17', pendiente:'#f59e0b', en_proceso:'#3b82f6', listo:'#10b981', entregado:'#6b7280', cancelado:'#ef4444' };
        const estadoLabel = { pendiente_verificacion:'Verificando pago', pendiente:'Pendiente', en_proceso:'En proceso', listo:'Listo', entregado:'Entregado', cancelado:'Cancelado' };
        return (
          <div className="lx-modal-mask" onClick={() => setModal(null)}>
            <div className="lx-modal lx-perfil-modal" onClick={e => e.stopPropagation()} style={{maxWidth:520,width:'95%',maxHeight:'90vh',overflowY:'auto',padding:'32px 28px'}}>
              <button className="lx-modal__x" onClick={() => setModal(null)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
              <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:20}}>
                <div style={{width:60,height:60,borderRadius:'50%',background:'linear-gradient(135deg,#4CAF50,#2e7d32)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,fontWeight:700,color:'white',flexShrink:0}}>{clienteSession.nombre.charAt(0).toUpperCase()}</div>
                <div>
                  <div style={{fontWeight:700,fontSize:18,color:'var(--lx-text)'}}>{clienteSession.nombre}</div>
                  <div style={{fontSize:13,color:'var(--lx-muted)'}}>{cliente?.correo}</div>
                  <div style={{fontSize:11,color:'#4CAF50',fontWeight:600,marginTop:2}}>● Cliente activo</div>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:14,marginBottom:20,borderBottom:'2px solid var(--lx-border)'}}>
                {perfilTab==='info' && <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--lx-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span style={{fontSize:15,fontWeight:700,color:'var(--lx-text)'}}>Mi perfil</span></>}
                {perfilTab==='editar' && <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--lx-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span style={{fontSize:15,fontWeight:700,color:'var(--lx-text)'}}>Editar mis datos</span></>}
              </div>
              {perfilTab === "info" && (
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  {[
                    {icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,label:'Correo',val:cliente?.correo},
                    {icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.6 4.87 2 2 0 0 1 3.56 2.69h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.4a16 16 0 0 0 6 6l.9-.9a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.46 18z"/></svg>,label:'Teléfono',val:cliente?.telefono||'—'},
                    {icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,label:'Dirección',val:cliente?.direccion||'—'},
                    {icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,label:'Comuna',val:cliente?.comuna||'—'},
                    {icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>,label:'Ubicación',val:cliente?.municipio&&cliente?.departamento?`${cliente.municipio}, ${cliente.departamento}`:'—'},
                    {icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,label:'Documento',val:cliente?.tipoDoc&&cliente?.numeroDoc?`${cliente.tipoDoc}: ${cliente.numeroDoc}`:'—'},
                    {icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,label:'Miembro desde',val:cliente?.fechaRegistro?new Date(cliente.fechaRegistro).toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'}):'—'},
                  ].map(({icon,label,val}) => (
                    <div key={label} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'rgba(128,128,128,.06)',borderRadius:10,border:'1px solid var(--lx-border)'}}>
                      <span style={{width:28,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--lx-muted)',flexShrink:0}}>{icon}</span>
                      <div><div style={{fontSize:11,color:'var(--lx-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:.5}}>{label}</div><div style={{fontSize:14,color:'var(--lx-text)',fontWeight:500,marginTop:1}}>{val}</div></div>
                    </div>
                  ))}
                  <div style={{display:'flex', gap:10, marginTop:8}}>
                    <button className="lx-btn lx-btn--sm" style={{flex:1, justifyContent:'center'}} onClick={() => setPerfilTab("editar")}>Editar mis datos →</button>
                  </div>
                </div>
              )}
              {perfilTab === "editar" && (
                <form onSubmit={handleEditPerfil} style={{display:'flex',flexDirection:'column',gap:14}}>
                  {editError && <div className="lx-modal__err">{editError}</div>}
                  {editSuccess && <div className="lx-modal__ok">{editSuccess}</div>}
                  <div className="lx-field"><label>Nombre completo *</label><input type="text" value={editData.nombre||""} onChange={e=>setEditData({...editData,nombre:e.target.value})}/></div>
                  <div className="lx-field"><label>Teléfono</label><input type="tel" value={editData.telefono||""} onChange={e=>setEditData({...editData,telefono:e.target.value})}/></div>
                  <div className="lx-field">
                    <label>Comuna <span style={{fontSize:11,color:'var(--lx-muted)',fontWeight:400}}>(servicio disponible solo en comunas 8 y 9)</span></label>
                    <select value={editData.comuna||""} onChange={e=>setEditData({...editData,comuna:e.target.value})}>
                      <option value="">Seleccionar comuna...</option>
                      <option value="Comuna 8 - Villa Hermosa">Comuna 8 - Villa Hermosa</option>
                      <option value="Comuna 9 - Buenos Aires">Comuna 9 - Buenos Aires</option>
                    </select>
                  </div>
                  <div className="lx-field"><label>Dirección</label><input type="text" value={editData.direccion||""} placeholder="Ej: Calle 10 # 43-20" onChange={e=>setEditData({...editData,direccion:e.target.value})}/></div>
               <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
  <div className="lx-field"><label>Departamento</label>
    <select value="Antioquia" disabled><option>Antioquia</option></select>
  </div>
  <div className="lx-field"><label>Municipio</label>
    <select value="Medellín" disabled><option>Medellín</option></select>
  </div>
</div>
                  <button type="submit" className="lx-btn lx-btn--full" disabled={editLoading} style={{marginTop:4}}>{editLoading?"Guardando...":"Guardar cambios"}</button>
                </form>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Modal: solicitar devolución (cliente) ── */}
      {devPedido && (
        <div className="lx-modal-mask" onClick={() => !devLoading && setDevPedido(null)}>
          <div className="lx-modal" style={{maxWidth:440}} onClick={e=>e.stopPropagation()}>
            <button className="lx-modal__x" onClick={() => setDevPedido(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            {devSuccess ? (
              <div style={{textAlign:'center',padding:'24px 0'}}>
                <div style={{fontSize:40,marginBottom:10}}>✓</div>
                <h3 style={{fontSize:17,fontWeight:700,marginBottom:6}}>¡Solicitud enviada!</h3>
                <p style={{fontSize:13,color:'var(--lx-muted)'}}>{devSuccess}</p>
              </div>
            ) : (
              <>
                <h3 style={{fontSize:17,fontWeight:700,marginBottom:4}}>Solicitar devolución</h3>
                <p style={{fontSize:13,color:'var(--lx-muted)',marginBottom:16}}>Pedido #{devPedido.id} · Selecciona qué productos quieres devolver.</p>
                {devError && <div className="lx-modal__err" style={{marginBottom:12}}>{devError}</div>}
                <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16,maxHeight:220,overflowY:'auto'}}>
                  {(devPedido.productos||[]).map((item,idx) => {
                    const sel = !!devProductosSel.find(x => x.id === item.id);
                    return (
                      <button key={idx} type="button" onClick={() => toggleDevProducto(item)}
                        style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,border:sel?'2px solid #EF5350':'1.5px solid var(--lx-border)',background:sel?'rgba(239,83,80,0.08)':'transparent',cursor:'pointer',textAlign:'left'}}>
                        <span style={{width:18,height:18,borderRadius:5,border:sel?'none':'2px solid var(--lx-muted)',background:sel?'#EF5350':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'white',fontSize:12,fontWeight:800}}>{sel?'✓':''}</span>
                        <span style={{fontSize:13,flex:1}}>{item.nombre} x{item.cantidad||1}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="lx-field" style={{marginBottom:16}}>
                  <label>Motivo de la devolución *</label>
                  <textarea rows={3} placeholder="Cuéntanos qué pasó (mínimo 10 caracteres)..." value={devMotivo} onChange={e=>setDevMotivo(e.target.value)} style={{width:'100%',resize:'vertical',fontFamily:'inherit'}}/>
                </div>
                <button className="lx-btn lx-btn--full" disabled={devLoading} onClick={confirmarSolicitudDevolucion}>
                  {devLoading ? 'Enviando...' : 'Enviar solicitud'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modal duplicar ── */}
      {modalDuplicar && (
        <div className="lx-modal-mask" onClick={() => setModalDuplicar(null)}>
          <div className="lx-modal" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <button className="lx-modal__x" onClick={() => setModalDuplicar(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div style={{textAlign:'center',padding:'8px 0 16px'}}>
              <div style={{fontSize:32,marginBottom:8}}>☕</div>
              <h3 style={{fontSize:17,fontWeight:700,margin:'0 0 6px'}}>{modalDuplicar.nombre}</h3>
              <p style={{fontSize:13,color:'var(--lx-muted)',margin:'0 0 20px'}}>
                Ya tienes este producto en el carrito.<br/>¿Qué quieres hacer?
              </p>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <button className="lx-btn lx-btn--full"
                  onClick={() => {
                    const prod = modalDuplicar;
                    // 5 — si ya hay una línea de este producto sin toppings
                    // ni adiciones (misma configuración), sumamos cantidad
                    // ahí en vez de crear otra línea idéntica.
                    const existente = buscarLineaMismaConfig(prod.id, [], []);
                    if (existente) {
                      sumarUnoALinea(existente, prod.id, `${prod.nombre} — cantidad actualizada`);
                      setModalDuplicar(null);
                      return;
                    }
                    // Ver comentario equivalente en addToCartWithExtras: un combo no tiene
                    // precio original con descuento, así que no vale la pena consultarlo.
                    const prodOriginal = esIdCombo(prod.id) ? null : productosService.getById(prod.id);
                    const precioOriginal = prodOriginal && descuentoVigente(prodOriginal) ? prodOriginal.precio : null;
                    const cartKey = `${prod.id}-${Date.now()}`;
                    setCart(prev => [...prev, {...prod, qty:1, toppings:[], adiciones:[], precioFinal:prod.precio||prod.price, _precioOriginal: precioOriginal, _cartKey: cartKey}]);
                    showToast(`${prod.nombre} agregado`);
                    setModalDuplicar(null);
                  }}
                  style={{justifyContent:'center'}}>
                  Agregar uno igual (sin adiciones)
                </button>
                {(getToppingsPorProducto(modalDuplicar).length > 0 || getAdicionesPorProducto(modalDuplicar).length > 0) && (
                  <button className="lx-btn lx-btn--full"
                    style={{background:'rgba(76,175,80,0.15)',color:'#4CAF50',border:'1.5px solid rgba(76,175,80,0.3)',justifyContent:'center'}}
                    onClick={() => { setModalDuplicar(null); setModalPersonalizar(modalDuplicar); }}>
                    Agregar uno con adiciones diferentes
                  </button>
                )}
                <button style={{background:'none',border:'none',color:'var(--lx-muted)',fontSize:13,cursor:'pointer',padding:'4px 0'}}
                  onClick={() => setModalDuplicar(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalPersonalizar && (
        <div className="lx-modal-mask" onClick={() => setModalPersonalizar(null)}>
          <div className="lx-modal" style={{maxWidth:720, padding:0, overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
            <button className="lx-modal__x" onClick={() => setModalPersonalizar(null)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            <LxPersonalizar producto={modalPersonalizar} toppings={getToppingsPorProducto(modalPersonalizar)} adiciones={getAdicionesPorProducto(modalPersonalizar)} onAdd={addToCartWithExtras} onClose={() => setModalPersonalizar(null)}/>
          </div>
        </div>
      )}
    </div>
  );
}