/**
 * PRINTER.JS - Impresión por Bluetooth (Web Bluetooth API) a impresoras
 * térmicas genéricas ESC/POS de 58mm.
 *
 * Sólo funciona en Chrome para Android (no en iOS/Safari).
 * El usuario debe emparejar/conectar la impresora la primera vez con el
 * botón "🖨️ Impresora"; el navegador recuerda el permiso para las próximas.
 */

var Impresora = (function () {

  // UUIDs típicos usados por la mayoría de las mini impresoras térmicas
  // Bluetooth genéricas (clones "Goojprt/Zjiang" y similares).
  var SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
  var CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

  var dispositivo = null;
  var characteristic = null;

  function soportado() {
    return !!navigator.bluetooth;
  }

  function conectar() {
    if (!soportado()) {
      return Promise.reject(new Error('Este navegador no soporta Bluetooth. Usá Chrome en Android.'));
    }
    return navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID]
    })
      .catch(function () {
        // Fallback: si la impresora usa otro UUID, dejamos elegir cualquier dispositivo BLE cercano.
        return navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [SERVICE_UUID]
        });
      })
      .then(function (device) {
        dispositivo = device;
        return device.gatt.connect();
      })
      .then(function (server) {
        return server.getPrimaryService(SERVICE_UUID);
      })
      .then(function (service) {
        return service.getCharacteristic(CHARACTERISTIC_UUID);
      })
      .then(function (char) {
        characteristic = char;
        return true;
      });
  }

  function estaConectada() {
    return !!(characteristic && dispositivo && dispositivo.gatt.connected);
  }

  // --- Construcción de comandos ESC/POS ---
  var ESC = 0x1B, GS = 0x1D;

  function normalizarTexto(texto) {
    // Muchas impresoras baratas no soportan bien UTF-8/acentos: quitamos tildes/ñ.
    return String(texto)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/ñ/gi, 'n');
  }

  function textoABytes(texto) {
    var normal = normalizarTexto(texto) + '\n';
    var bytes = [];
    for (var i = 0; i < normal.length; i++) bytes.push(normal.charCodeAt(i) & 0xFF);
    return bytes;
  }

  function construirTicket(venta) {
    var bytes = [];
    function push() { for (var i = 0; i < arguments.length; i++) bytes.push(arguments[i]); }
    function linea(texto) { bytes = bytes.concat(textoABytes(texto)); }
    function centrar(on) { push(ESC, 0x61, on ? 1 : 0); }
    function negrita(on) { push(ESC, 0x45, on ? 1 : 0); }

    push(ESC, 0x40); // inicializar

    centrar(true);
    negrita(true);
    linea(CONFIG.NOMBRE_KIOSCO || 'Kiosco');
    negrita(false);
    linea(new Date(venta.fecha || Date.now()).toLocaleString());
    linea('Vendedor: ' + venta.usuario);
    linea('--------------------------------');
    centrar(false);

    venta.items.forEach(function (it) {
      linea(it.cantidad + ' x ' + it.productoNombre);
      var precioTxt = CONFIG.MONEDA + it.subtotal.toFixed(2);
      var espacios = Math.max(1, 32 - precioTxt.length);
      linea(' '.repeat(espacios) + precioTxt);
    });

    linea('--------------------------------');
    negrita(true);
    linea('TOTAL: ' + CONFIG.MONEDA + venta.total.toFixed(2));
    negrita(false);
    linea('');
    centrar(true);
    linea('Gracias por su compra!');
    linea('');
    linea('');
    linea('');

    return new Uint8Array(bytes);
  }

  function enviarEnPartes(bytes) {
    var CHUNK = 20; // tamaño seguro de escritura BLE sin negociar MTU
    var i = 0;
    function siguiente() {
      if (i >= bytes.length) return Promise.resolve();
      var parte = bytes.slice(i, i + CHUNK);
      i += CHUNK;
      return characteristic.writeValue(parte)
        .then(function () { return new Promise(function (r) { setTimeout(r, 20); }); })
        .then(siguiente);
    }
    return siguiente();
  }

  function imprimirVenta(venta) {
    if (!estaConectada()) {
      return Promise.reject(new Error('La impresora no está conectada.'));
    }
    var bytes = construirTicket(venta);
    return enviarEnPartes(bytes);
  }

  return {
    soportado: soportado,
    conectar: conectar,
    estaConectada: estaConectada,
    imprimirVenta: imprimirVenta
  };
})();
