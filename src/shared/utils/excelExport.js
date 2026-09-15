// ─────────────────────────────────────────────────────────────────────────
// Exportación a Excel — .xlsx real (ExcelJS), con carga diferida
// ─────────────────────────────────────────────────────────────────────────
// Versión anterior: generaba SpreadsheetML 2003 (XML plano) a mano, sin
// dependencias, guardado como .xls — Excel avisa "el formato y la
// extensión no coinciden" si a eso se le llama .xlsx, así que no había
// forma de entregar un .xlsx de verdad sin una librería.
//
// Se cambió a ExcelJS (dependencia real, ~1MB) para poder:
//   · generar un .xlsx (OOXML) genuino, sin advertencia de Excel al abrirlo;
//   · usar colores de relleno, no solo blanco y negro;
//   · calcular el ancho de columna a partir del contenido real (una
//     aproximación de "autoajustar", que Excel solo calcula al abrir el
//     archivo, nunca al generarlo por código).
// El costo (~1MB) no golpea la carga inicial de la app: se importa acá
// dentro, dinámicamente — solo se descarga cuando alguien de verdad hace
// clic en "Exportar Excel" (ver el `await import('exceljs')` más abajo).
//
// Paleta: verde sutil (el color de marca de Café Don Berna) en vez del
// negro sólido de la versión anterior — "un color de fondo sutil" fue
// literalmente lo que pidió el negocio para los encabezados de columna.
const COLOR_MARCA        = 'FF2E7D32'; // verde oscuro (texto/acentos)
const COLOR_MARCA_CLARO  = 'FFE8F5E9'; // verde muy claro (fondo encabezado)
const COLOR_GRIS_TEXTO   = 'FF595959';
const COLOR_GRIS_BORDE   = 'FFBFBFBF';
const COLOR_NEGRO        = 'FF000000';

const BORDE_FINO_GRIS = { style: 'thin', color: { argb: COLOR_GRIS_BORDE } };
const BORDE_GRUESO_NEGRO = { style: 'medium', color: { argb: COLOR_NEGRO } };

// Formatos numéricos reutilizados en todo el libro.
const FORMATO = {
  numero:  '#,##0',
  moneda:  '"$" #,##0',
  decimal: '#,##0.00"%"',
};

// Excel limita el nombre de hoja a 31 caracteres y prohíbe : \ / ? * [ ]
const nombreHojaValido = (nombre, indice) => {
  const limpio = String(nombre || `Hoja${indice + 1}`).replace(/[:\\/?*[\]]/g, '-').slice(0, 31);
  return limpio || `Hoja${indice + 1}`;
};

// Aproximación de "autoajustar ancho de columna": Excel solo lo calcula
// al abrir el archivo (mirando la fuente real, el DPI, etc.) — no hay
// forma de replicar eso exacto generando el archivo por código. Esto
// mide el texto (o el número ya formateado) más largo de cada columna y
// lo usa como ancho, con un piso y un techo razonables. Las columnas que
// de verdad necesitarían pasarse del techo (ej. "Productos", con listas
// largas separadas por coma) quedan con `wrapText` en vez de una hoja
// kilométrica — así el texto nunca se corta, solo ocupa más de una línea.
const ANCHO_MIN = 9;
const ANCHO_MAX = 48;

const textoVisible = (valor, tipo) => {
  if (valor === null || valor === undefined || valor === '') return '';
  if (tipo === 'moneda') return `$ ${Math.round(Number(valor) || 0).toLocaleString('es-CO')}`;
  if (tipo === 'numero') return Math.round(Number(valor) || 0).toLocaleString('es-CO');
  if (tipo === 'decimal') return (Number(valor) || 0).toFixed(2) + '%';
  return String(valor);
};

/**
 * Construye una hoja dentro del libro.
 *
 * @param {object} hoja
 * @param {string} hoja.nombre       Nombre de la pestaña.
 * @param {string} [hoja.empresa]    Nombre del negocio, primera línea del encabezado.
 * @param {string} [hoja.titulo]     Título del reporte/sección.
 * @param {string[]} [hoja.subtitulos] Líneas de contexto (periodo, local, generado).
 * @param {Array} [hoja.datos]       Pares [etiqueta, valor, tipo] como ficha resumen.
 *   Etiqueta '---' → fila en blanco. Etiqueta '##' → encabezado de sub-sección.
 * @param {object[]} [hoja.columnas] [{ titulo, tipo }] — sin `ancho`: se calcula solo.
 * @param {Array[]} [hoja.filas]     Matriz de valores, en el orden de columnas.
 * @param {Array} [hoja.totales]     Fila de cierre, en el orden de columnas.
 * @param {string} [hoja.nota]       Texto al pie.
 */
const construirHoja = (workbook, hoja, indice) => {
  const columnas = hoja.columnas || [];
  const numCols = Math.max(columnas.length, 2);
  const ws = workbook.addWorksheet(nombreHojaValido(hoja.nombre, indice), {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // Ancho real por columna: arranca en el largo del título (o, en las
  // hojas de ficha etiqueta/valor sin `columnas`, en 2 columnas parejas) y
  // va creciendo con cada valor que se escribe (ver anotarAncho más abajo).
  const totalColsAncho = columnas.length || (hoja.datos && hoja.datos.length ? 2 : 0);
  const anchos = columnas.length
    ? columnas.map(c => Math.min(Math.max((c.titulo || '').length, ANCHO_MIN), ANCHO_MAX))
    : new Array(totalColsAncho).fill(ANCHO_MIN);
  const anotarAncho = (i, texto) => {
    if (i < 0 || i >= anchos.length) return;
    anchos[i] = Math.max(anchos[i], Math.min(String(texto || '').length, ANCHO_MAX));
  };

  let fila = 1;
  const mergeFila = (r) => { if (numCols > 1) ws.mergeCells(r, 1, r, numCols); };

  if (hoja.empresa) {
    const r = ws.getRow(fila);
    r.getCell(1).value = hoja.empresa;
    r.getCell(1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLOR_MARCA } };
    r.height = 24;
    mergeFila(fila);
    fila++;
  }
  if (hoja.titulo) {
    const r = ws.getRow(fila);
    r.getCell(1).value = hoja.titulo;
    r.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: COLOR_NEGRO } };
    r.height = 20;
    mergeFila(fila);
    fila++;
  }
  (hoja.subtitulos || []).forEach(s => {
    const r = ws.getRow(fila);
    r.getCell(1).value = s;
    r.getCell(1).font = { name: 'Calibri', size: 10, color: { argb: COLOR_GRIS_TEXTO } };
    mergeFila(fila);
    fila++;
  });
  if (hoja.empresa || hoja.titulo || (hoja.subtitulos || []).length) fila++; // fila en blanco

  // Ficha de datos sueltos (etiqueta / valor), para hojas de resumen.
  if (hoja.datos && hoja.datos.length) {
    hoja.datos.forEach(([etiqueta, valor, tipo]) => {
      if (etiqueta === '---') { fila++; return; }
      if (etiqueta === '##') {
        const r = ws.getRow(fila);
        r.getCell(1).value = valor;
        r.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR_MARCA } };
        r.getCell(1).border = { bottom: BORDE_GRUESO_NEGRO };
        mergeFila(fila);
        anotarAncho(0, valor);
        fila++;
        return;
      }
      const r = ws.getRow(fila);
      r.getCell(1).value = etiqueta;
      r.getCell(1).font = { name: 'Calibri', size: 11, bold: true };
      anotarAncho(0, etiqueta);
      const esNum = tipo === 'moneda' || tipo === 'numero';
      const c2 = r.getCell(2);
      if (esNum) {
        c2.value = Number(valor) || 0;
        c2.numFmt = FORMATO[tipo];
      } else {
        c2.value = valor ?? '';
      }
      anotarAncho(1, textoVisible(valor, tipo));
      fila++;
    });
    if (columnas.length) fila++; // fila en blanco antes de la tabla
  }

  const filaEncabezado = fila;
  if (columnas.length) {
    const r = ws.getRow(fila);
    columnas.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      cell.value = c.titulo;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_MARCA } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_MARCA_CLARO } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = { top: BORDE_FINO_GRIS, bottom: { style: 'thin', color: { argb: COLOR_MARCA } }, left: BORDE_FINO_GRIS, right: BORDE_FINO_GRIS };
      anotarAncho(i, c.titulo);
    });
    r.height = 20;
    fila++;

    (hoja.filas || []).forEach(datosFila => {
      const r2 = ws.getRow(fila);
      columnas.forEach((c, i) => {
        const cell = r2.getCell(i + 1);
        const tipo = c.tipo || 'texto';
        const valor = datosFila[i];
        if (tipo === 'moneda' || tipo === 'numero' || tipo === 'decimal') {
          cell.value = Number(valor) || 0;
          cell.numFmt = FORMATO[tipo];
          cell.alignment = { horizontal: 'right' };
        } else {
          cell.value = valor ?? '';
        }
        cell.border = { bottom: BORDE_FINO_GRIS };
        anotarAncho(i, textoVisible(valor, tipo));
      });
      fila++;
    });

    if (hoja.totales) {
      const r3 = ws.getRow(fila);
      columnas.forEach((c, i) => {
        const cell = r3.getCell(i + 1);
        const v = hoja.totales[i];
        cell.font = { bold: true };
        cell.border = { top: BORDE_GRUESO_NEGRO };
        if (v === null || v === undefined || v === '') { cell.value = ''; return; }
        if (c.tipo === 'moneda' || c.tipo === 'numero') {
          cell.value = Number(v) || 0;
          cell.numFmt = FORMATO[c.tipo];
          cell.alignment = { horizontal: 'right' };
        } else {
          cell.value = v;
        }
        anotarAncho(i, textoVisible(v, c.tipo));
      });
      fila++;
    }
  }

  if (hoja.nota) {
    fila++;
    const r = ws.getRow(fila);
    r.getCell(1).value = hoja.nota;
    r.getCell(1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: COLOR_GRIS_TEXTO } };
    mergeFila(fila);
  }

  anchos.forEach((ancho, i) => {
    const col = ws.getColumn(i + 1);
    col.width = ancho + 2;
    // Si el contenido real es más ancho que el techo permitido, se envuelve
    // el texto (con más alto de fila) en vez de dejarlo cortado o estirar
    // la hoja entera por una sola columna con listas largas. Solo aplica a
    // columnas de tabla real (con `filas`) — las de ficha etiqueta/valor
    // nunca llegan a ese largo.
    if (!columnas.length) return;
    const largoMaximo = (hoja.filas || []).reduce((m, f) => Math.max(m, String(f[i] ?? '').length), 0);
    if (largoMaximo > ANCHO_MAX) {
      col.alignment = { wrapText: true, vertical: 'top' };
    }
  });
  // Congela hasta la fila indicada (o hasta el encabezado de la tabla, si
  // no se especificó una) para que al bajar la lista el título y los
  // encabezados de columna se mantengan visibles.
  const ySplit = hoja.filaCongelada ?? (columnas.length ? filaEncabezado : 0);
  if (ySplit > 0) ws.views = [{ state: 'frozen', ySplit }];
};

/**
 * Genera y descarga un libro de Excel (.xlsx real).
 * @param {string} nombreArchivo  Sin extensión.
 * @param {object[]} hojas
 * @returns {Promise<void>}
 */
export const descargarExcel = async (nombreArchivo, hojas) => {
  // Carga diferida: ExcelJS (~1MB) solo se descarga cuando alguien
  // exporta de verdad, nunca en la carga inicial de la app.
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SICABER';
  workbook.company = 'Café Don Berna';
  workbook.created = new Date();

  hojas.forEach((hoja, i) => construirHoja(workbook, hoja, i));

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreArchivo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Se libera en el siguiente tick: revocarlo de inmediato cancela la
  // descarga en Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default descargarExcel;
