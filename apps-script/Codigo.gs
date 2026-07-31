/**
 * BACKEND - App de Ventas Kiosco
 * ---------------------------------
 * Este script va PEGADO en el editor de Apps Script (script.google.com)
 * de una Hoja de Cálculo de Google (Google Sheets), como script "vinculado" (contenedor).
 * Ver README.md para el paso a paso de instalación y despliegue.
 *
 * Crea automáticamente (si no existen) 3 pestañas en la hoja:
 *  - Productos      : ID | Nombre | Precio | FotoURL | Activo
 *  - Ventas         : ID | Fecha | Usuario | Total
 *  - DetalleVentas  : ID | VentaID | ProductoID | ProductoNombre | Cantidad | PrecioUnitario | Subtotal
 *
 * Expone un Web App (doGet / doPost) que el frontend consume por fetch().
 */

var CARPETA_FOTOS = 'FotosKiosco';

function doGet(e) {
  try {
    var accion = e.parameter.accion || e.parameter.action;
    if (accion === 'getProductos' || accion === 'getProducts') {
      return respond({ ok: true, productos: getProductos() });
    }
    if (accion === 'ping') {
      return respond({ ok: true, mensaje: 'Backend Kiosco activo' });
    }
    return respond({ ok: false, error: 'Acción GET no soportada: ' + accion });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var accion = data.accion || data.action;
    var resultado;

    switch (accion) {
      case 'getProductos':
        resultado = { productos: getProductos() };
        break;
      case 'agregarProducto':
        resultado = agregarProducto(data);
        break;
      case 'actualizarProducto':
        resultado = actualizarProducto(data);
        break;
      case 'eliminarProducto':
        resultado = eliminarProducto(data);
        break;
      case 'registrarVenta':
        resultado = registrarVenta(data);
        break;
      default:
        return respond({ ok: false, error: 'Acción POST no reconocida: ' + accion });
    }
    return respond(Object.assign({ ok: true }, resultado));
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- Hojas ---------------- */

function getSheet_(nombre, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(nombre);
  if (!sheet) {
    sheet = ss.insertSheet(nombre);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getProductosSheet_() {
  return getSheet_('Productos', ['ID', 'Nombre', 'Precio', 'FotoURL', 'Activo']);
}
function getVentasSheet_() {
  return getSheet_('Ventas', ['ID', 'Fecha', 'Usuario', 'Total']);
}
function getDetalleSheet_() {
  return getSheet_('DetalleVentas', ['ID', 'VentaID', 'ProductoID', 'ProductoNombre', 'Cantidad', 'PrecioUnitario', 'Subtotal']);
}

/* ---------------- Productos ---------------- */

function getProductos() {
  var sheet = getProductosSheet_();
  var values = sheet.getDataRange().getValues();
  var productos = [];
  for (var i = 1; i < values.length; i++) {
    var fila = values[i];
    var activo = fila[4];
    if (activo === false || activo === 'FALSE' || activo === 'NO') continue;
    productos.push({
      id: String(fila[0]),
      nombre: fila[1],
      precio: Number(fila[2]) || 0,
      fotoUrl: fila[3] || ''
    });
  }
  return productos;
}

function agregarProducto(data) {
  var sheet = getProductosSheet_();
  var id = Utilities.getUuid();
  var fotoUrl = '';
  if (data.fotoBase64) {
    fotoUrl = guardarImagenEnDrive_(data.fotoBase64, 'producto_' + id);
  }
  sheet.appendRow([id, data.nombre, Number(data.precio) || 0, fotoUrl, true]);
  return { id: id, fotoUrl: fotoUrl };
}

function actualizarProducto(data) {
  var sheet = getProductosSheet_();
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(data.id)) {
      var fila = i + 1;
      if (data.nombre !== undefined) sheet.getRange(fila, 2).setValue(data.nombre);
      if (data.precio !== undefined) sheet.getRange(fila, 3).setValue(Number(data.precio) || 0);
      if (data.fotoBase64) {
        var fotoUrl = guardarImagenEnDrive_(data.fotoBase64, 'producto_' + data.id);
        sheet.getRange(fila, 4).setValue(fotoUrl);
      }
      return { actualizado: true };
    }
  }
  return { actualizado: false, error: 'Producto no encontrado' };
}

function eliminarProducto(data) {
  var sheet = getProductosSheet_();
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(data.id)) {
      sheet.getRange(i + 1, 5).setValue(false); // baja lógica, conserva historial de ventas
      return { eliminado: true };
    }
  }
  return { eliminado: false, error: 'Producto no encontrado' };
}

function guardarImagenEnDrive_(base64Data, nombreArchivo) {
  var match = base64Data.match(/^data:(.*);base64,(.*)$/);
  if (!match) return '';
  var contentType = match[1];
  var bytes = Utilities.base64Decode(match[2]);
  var blob = Utilities.newBlob(bytes, contentType, nombreArchivo);
  var folder = getOrCreateFolder_(CARPETA_FOTOS);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}

function getOrCreateFolder_(nombre) {
  var folders = DriveApp.getFoldersByName(nombre);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(nombre);
}

/* ---------------- Ventas ---------------- */

function registrarVenta(data) {
  var ventasSheet = getVentasSheet_();
  var detalleSheet = getDetalleSheet_();
  var ventaId = Utilities.getUuid();
  var fecha = new Date();

  ventasSheet.appendRow([ventaId, fecha, data.usuario || '', Number(data.total) || 0]);

  var items = data.items || [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var detalleId = Utilities.getUuid();
    detalleSheet.appendRow([
      detalleId,
      ventaId,
      it.productoId,
      it.productoNombre,
      Number(it.cantidad) || 0,
      Number(it.precioUnitario) || 0,
      Number(it.subtotal) || 0
    ]);
  }

  return {
    ventaId: ventaId,
    fecha: fecha.toISOString()
  };
}
