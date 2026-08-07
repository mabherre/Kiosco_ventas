/**
 * DB.JS - Comunicación con el backend (Google Apps Script) + caché local.
 *
 * Nota técnica: se usa Content-Type "text/plain" en los POST a propósito.
 * Esto evita que el navegador dispare un "preflight" OPTIONS (petición CORS
 * compleja), que Apps Script no responde. Así, el POST llega directo como
 * una petición "simple" y funciona sin configurar CORS manualmente.
 */

var DB = (function () {

  var CACHE_KEY = 'kiosco_productos_cache_v1';

  function urlConfigurada() {
    return CONFIG.URL_APPS_SCRIPT && CONFIG.URL_APPS_SCRIPT.indexOf('https://') === 0;
  }

  function llamarBackend(accion, payload) {
    if (!urlConfigurada()) {
      return Promise.reject(new Error('Falta configurar la URL de Apps Script en js/config.js'));
    }
    // Todas las peticiones llevan el token de la app, para que el backend
    // sepa que vienen de acá y no de cualquiera que le pegue a la URL.
    var body = Object.assign({ accion: accion, tokenApp: CONFIG.TOKEN_APP }, payload || {});
    return fetch(CONFIG.URL_APPS_SCRIPT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json.ok) throw new Error(json.error || 'Error desconocido del servidor');
        return json;
      });
  }

  function guardarCache(productos) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(productos)); } catch (e) {}
  }

  function leerCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  return {
    urlConfigurada: urlConfigurada,

    obtenerProductos: function () {
      return llamarBackend('getProductos')
        .then(function (json) {
          guardarCache(json.productos);
          return json.productos;
        })
        .catch(function (err) {
          console.warn('No se pudo obtener productos del servidor, usando caché local:', err);
          return leerCache();
        });
    },

    // Estas tres acciones son sólo de Administrador: además del token de la
    // app, mandan la clave de administrador para que el backend la valide.
    agregarProducto: function (producto) {
      return llamarBackend('agregarProducto', Object.assign({ claveAdmin: CONFIG.CLAVE_ADMIN }, producto));
    },

    actualizarProducto: function (producto) {
      return llamarBackend('actualizarProducto', Object.assign({ claveAdmin: CONFIG.CLAVE_ADMIN }, producto));
    },

    eliminarProducto: function (id) {
      return llamarBackend('eliminarProducto', { id: id, claveAdmin: CONFIG.CLAVE_ADMIN });
    },

    // Estas dos acciones son sólo de Vendedor: mandan la clave de vendedor
    // para que el backend la valide.
    registrarVenta: function (venta) {
      return llamarBackend('registrarVenta', Object.assign({ claveVendedor: CONFIG.CLAVE_VENDEDOR }, venta));
    },

    buscarTransferencias: function (texto) {
      return llamarBackend('buscarTransferencias', { texto: texto, claveVendedor: CONFIG.CLAVE_VENDEDOR });
    },

    resumenTransferencias: function () {
      return llamarBackend('resumenTransferencias');
    }
  };
})();
