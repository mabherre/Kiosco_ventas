/**
 * APP.JS - Lógica principal de la interfaz.
 */
(function () {

  var estado = {
    usuario: null,
    productos: [],
    carrito: {} // { productoId: { producto, cantidad } }
  };

  /* ---------- Utilidades UI ---------- */
  function $(id) { return document.getElementById(id); }

  function mostrarCarga(texto) {
    $('overlay-carga-texto').textContent = texto || 'Cargando...';
    $('overlay-carga').classList.remove('oculto');
  }
  function ocultarCarga() {
    $('overlay-carga').classList.add('oculto');
  }
  var toastTimeout;
  function toast(msg, esError) {
    if (esError) {
      // Los errores se muestran con alert() para que no se pierdan
      // (el cartel rojo desaparece solo y en el celular a veces no se
      // alcanza a leer). Además queda un texto que se puede copiar/mandar.
      alert('⚠️ ' + msg);
      return;
    }
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('error');
    t.classList.remove('oculto');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function () { t.classList.add('oculto'); }, 3500);
  }
  function formatoMoneda(n) {
    return CONFIG.MONEDA + Number(n).toFixed(2);
  }

  /* ---------- Login ---------- */
  function iniciarSesion() {
    var guardado = sessionStorage.getItem('kiosco_usuario');
    if (guardado) {
      entrarComo(guardado);
      return;
    }
    $('pantalla-login').classList.add('activa');
  }

  function entrarComo(nombre) {
    estado.usuario = nombre;
    sessionStorage.setItem('kiosco_usuario', nombre);
    $('usuario-actual').textContent = nombre;
    $('pantalla-login').classList.remove('activa');
    $('pantalla-login').classList.add('oculto');
    $('app').classList.remove('oculto');
    cargarProductos();
  }

  $('btn-entrar').addEventListener('click', function () {
    var nombre = $('input-nombre-usuario').value.trim();
    if (!nombre) {
      $('login-error').textContent = 'Ingresá tu nombre para continuar.';
      $('login-error').classList.remove('oculto');
      return;
    }
    entrarComo(nombre);
  });
  $('input-nombre-usuario').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('btn-entrar').click();
  });

  $('btn-cambiar-usuario').addEventListener('click', function () {
    sessionStorage.removeItem('kiosco_usuario');
    location.reload();
  });

  /* ---------- Tabs ---------- */
  document.querySelectorAll('.tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (b) { b.classList.remove('activa'); });
      document.querySelectorAll('.tab-contenido').forEach(function (c) { c.classList.remove('activa'); });
      btn.classList.add('activa');
      $('tab-' + btn.dataset.tab).classList.add('activa');
    });
  });

  /* ---------- Cargar productos ---------- */
  function cargarProductos() {
    mostrarCarga('Cargando productos...');
    DB.obtenerProductos()
      .then(function (productos) {
        estado.productos = productos || [];
        renderizarProductosVenta();
        renderizarProductosAdmin();
      })
      .catch(function (err) { toast('Error al cargar productos: ' + err.message, true); })
      .then(ocultarCarga);
  }

  /* ---------- Vista Venta ---------- */
  function renderizarProductosVenta() {
    var cont = $('grid-productos-venta');
    cont.innerHTML = '';
    if (!estado.productos.length) {
      cont.innerHTML = '<p>No hay productos cargados. Agregalos en la pestaña Productos.</p>';
      return;
    }
    estado.productos.forEach(function (p) {
      var enCarrito = estado.carrito[p.id];
      var div = document.createElement('div');
      div.className = 'tarjeta-producto' + (enCarrito ? ' seleccionado' : '');
      div.innerHTML =
        (p.fotoUrl
          ? '<img src="' + p.fotoUrl + '" alt="">'
          : '<div class="sin-foto">📦</div>') +
        '<div class="nombre">' + escapeHtml(p.nombre) + '</div>' +
        '<div class="precio">' + formatoMoneda(p.precio) + '</div>' +
        '<div class="stepper">' +
        '<button class="btn-restar">−</button>' +
        '<span class="cantidad">' + (enCarrito ? enCarrito.cantidad : 0) + '</span>' +
        '<button class="btn-sumar">+</button>' +
        '</div>';
      div.querySelector('.btn-sumar').addEventListener('click', function (e) {
        e.stopPropagation();
        cambiarCantidad(p, 1);
      });
      div.querySelector('.btn-restar').addEventListener('click', function (e) {
        e.stopPropagation();
        cambiarCantidad(p, -1);
      });
      cont.appendChild(div);
    });
  }

  function cambiarCantidad(producto, delta) {
    var item = estado.carrito[producto.id];
    var cantidadActual = item ? item.cantidad : 0;
    var nuevaCantidad = Math.max(0, cantidadActual + delta);
    if (nuevaCantidad === 0) {
      delete estado.carrito[producto.id];
    } else {
      estado.carrito[producto.id] = { producto: producto, cantidad: nuevaCantidad };
    }
    renderizarProductosVenta();
    renderizarCarrito();
  }

  function renderizarCarrito() {
    var cont = $('carrito-items');
    var items = Object.values(estado.carrito);
    if (!items.length) {
      cont.innerHTML = '<p class="vacio">No hay productos seleccionados</p>';
      $('carrito-total-monto').textContent = formatoMoneda(0);
      $('btn-registrar-venta').disabled = true;
      return;
    }
    var total = 0;
    cont.innerHTML = items.map(function (item) {
      var subtotal = item.producto.precio * item.cantidad;
      total += subtotal;
      return '<div class="carrito-item">' +
        '<div class="info">' + escapeHtml(item.producto.nombre) + ' x' + item.cantidad + '</div>' +
        '<div class="subtotal">' + formatoMoneda(subtotal) + '</div>' +
        '</div>';
    }).join('');
    $('carrito-total-monto').textContent = formatoMoneda(total);
    $('btn-registrar-venta').disabled = false;
  }

  $('btn-registrar-venta').addEventListener('click', registrarVenta);

  function registrarVenta() {
    var items = Object.values(estado.carrito).map(function (item) {
      return {
        productoId: item.producto.id,
        productoNombre: item.producto.nombre,
        cantidad: item.cantidad,
        precioUnitario: item.producto.precio,
        subtotal: item.producto.precio * item.cantidad
      };
    });
    if (!items.length) return;
    var total = items.reduce(function (acc, it) { return acc + it.subtotal; }, 0);
    var venta = { usuario: estado.usuario, items: items, total: total, fecha: new Date().toISOString() };

    mostrarCarga('Registrando venta...');
    DB.registrarVenta(venta)
      .then(function (respuesta) {
        venta.ventaId = respuesta.ventaId;
        toast('Venta registrada correctamente.');
        estado.carrito = {};
        renderizarProductosVenta();
        renderizarCarrito();
        return imprimirSiCorresponde(venta);
      })
      .catch(function (err) { toast('Error al registrar la venta: ' + err.message, true); })
      .then(ocultarCarga);
  }

  function imprimirSiCorresponde(venta) {
    // 1) Si hay una impresora BLE genérica conectada (ESC/POS estándar), se
    //    imprime directo sin pasos extra.
    if (Impresora.soportado() && Impresora.estaConectada()) {
      return Impresora.imprimirVenta(venta)
        .then(function () { toast('Comprobante impreso.'); })
        .catch(function (err) { toast('Venta guardada, pero falló la impresión: ' + err.message, true); });
    }
    // 2) Muchas impresoras de bolsillo (como las que usan la app "Fun
    //    Print") no son compatibles con Web Bluetooth: se comparte el
    //    comprobante como imagen para terminarlo de imprimir desde esa app.
    if (Impresora.puedeCompartirImagenes()) {
      return Impresora.compartirTicket(venta)
        .then(function () { toast('Venta guardada. Elegí la app de tu impresora para imprimir el comprobante.'); })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return; // el usuario cerró el menú de compartir
          toast('Venta guardada, pero no se pudo compartir el comprobante: ' + err.message, true);
        });
    }
    toast('Venta guardada. Este navegador no permite compartir el comprobante automáticamente.');
  }

  /* ---------- Impresora: conectar ---------- */
  $('btn-conectar-impresora').addEventListener('click', function () {
    if (!Impresora.soportado()) {
      toast('Este navegador no soporta Bluetooth. Usá Chrome en Android.', true);
      return;
    }
    mostrarCarga('Buscando impresora...');
    Impresora.conectar()
      .then(function () { toast('Impresora conectada.'); })
      .catch(function (err) { toast('No se pudo conectar la impresora: ' + err.message, true); })
      .then(ocultarCarga);
  });

  /* ---------- Vista Productos (admin) ---------- */
  function renderizarProductosAdmin() {
    var cont = $('lista-productos-admin');
    if (!estado.productos.length) {
      cont.innerHTML = '<p>No hay productos cargados todavía.</p>';
      return;
    }
    cont.innerHTML = '';
    estado.productos.forEach(function (p) {
      var div = document.createElement('div');
      div.className = 'fila-producto-admin';
      div.innerHTML =
        (p.fotoUrl
          ? '<img src="' + p.fotoUrl + '" alt="">'
          : '<div class="sin-foto">📦</div>') +
        '<div class="info">' +
        '<div class="nombre">' + escapeHtml(p.nombre) + '</div>' +
        '<div class="precio">' + formatoMoneda(p.precio) + '</div>' +
        '</div>' +
        '<button class="btn btn-chico btn-editar">Editar</button>';
      div.querySelector('.btn-editar').addEventListener('click', function () { abrirModalProducto(p); });
      cont.appendChild(div);
    });
  }

  $('btn-nuevo-producto').addEventListener('click', function () { abrirModalProducto(null); });

  var fotoBase64Actual = null;

  function abrirModalProducto(producto) {
    fotoBase64Actual = null;
    $('modal-producto-error').classList.add('oculto');
    $('producto-foto').value = '';
    if (producto) {
      $('modal-producto-titulo').textContent = 'Editar producto';
      $('producto-id').value = producto.id;
      $('producto-nombre').value = producto.nombre;
      $('producto-precio').value = producto.precio;
      if (producto.fotoUrl) {
        $('producto-foto-preview').src = producto.fotoUrl;
        $('producto-foto-preview').classList.remove('oculto');
      } else {
        $('producto-foto-preview').classList.add('oculto');
      }
      $('btn-eliminar-producto').classList.remove('oculto');
    } else {
      $('modal-producto-titulo').textContent = 'Nuevo producto';
      $('producto-id').value = '';
      $('producto-nombre').value = '';
      $('producto-precio').value = '';
      $('producto-foto-preview').classList.add('oculto');
      $('btn-eliminar-producto').classList.add('oculto');
    }
    $('modal-producto').classList.remove('oculto');
  }

  $('btn-cancelar-producto').addEventListener('click', function () {
    $('modal-producto').classList.add('oculto');
  });

  $('producto-foto').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      fotoBase64Actual = reader.result;
      $('producto-foto-preview').src = fotoBase64Actual;
      $('producto-foto-preview').classList.remove('oculto');
    };
    reader.readAsDataURL(file);
  });

  $('btn-guardar-producto').addEventListener('click', function () {
    var id = $('producto-id').value;
    var nombre = $('producto-nombre').value.trim();
    var precio = parseFloat($('producto-precio').value);

    if (!nombre || isNaN(precio) || precio < 0) {
      $('modal-producto-error').textContent = 'Completá nombre y precio válidos.';
      $('modal-producto-error').classList.remove('oculto');
      return;
    }

    var payload = { nombre: nombre, precio: precio };
    if (fotoBase64Actual) payload.fotoBase64 = fotoBase64Actual;

    mostrarCarga('Guardando producto...');
    var promesa = id
      ? DB.actualizarProducto(Object.assign({ id: id }, payload))
      : DB.agregarProducto(payload);

    promesa
      .then(function () {
        toast('Producto guardado.');
        $('modal-producto').classList.add('oculto');
        cargarProductos();
      })
      .catch(function (err) { toast('Error al guardar: ' + err.message, true); })
      .then(ocultarCarga);
  });

  $('btn-eliminar-producto').addEventListener('click', function () {
    var id = $('producto-id').value;
    if (!id) return;
    if (!confirm('¿Eliminar este producto? Ya no se podrá vender, pero el historial de ventas se conserva.')) return;
    mostrarCarga('Eliminando...');
    DB.eliminarProducto(id)
      .then(function () {
        toast('Producto eliminado.');
        $('modal-producto').classList.add('oculto');
        cargarProductos();
      })
      .catch(function (err) { toast('Error al eliminar: ' + err.message, true); })
      .then(ocultarCarga);
  });

  /* ---------- Helpers ---------- */
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- Arranque ---------- */
  if (!DB.urlConfigurada()) {
    toast('Falta configurar la URL de Apps Script en js/config.js', true);
  }
  iniciarSesion();

  // Registrar service worker para uso offline básico (si el archivo se sirve por http/https).
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

})();
