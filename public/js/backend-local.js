'use strict';

/* ================================================================
   ORIGEN Café — Backend LOCAL (demo sin servidor)
   ----------------------------------------------------------------
   Reemplaza al servidor Node + SQLite: intercepta fetch('/api/*')
   y responde desde localStorage, replicando exactamente las mismas
   rutas y formatos. Así store.js y admin.js funcionan sin cambios.
   Todo vive en el navegador de cada visitante (demo de portafolio).
   ================================================================ */
(function () {
  const DB_KEY = 'origen_db_v2'; // v2: se agregan bebidas (malteadas, batidos, cafés de la casa)
  const SESSION_KEY = 'origen_admin_session_v1';

  // [name, category, description, price, prev_price, on_sale, stock, featured, image]
  const SEED = [
    ['Prensa Francesa 600 ml', 'Cafeteras', 'Prensa de vidrio borosilicato con marco de acero inoxidable. Ideal para 3 tazas de café de cuerpo completo.', 18990, 24990, 1, 24, 0, '/img/products/prensa-francesa.webp'],
    ['Cafetera Moka Italiana 6 tazas', 'Cafeteras', 'Clásica cafetera de aluminio para preparar café intenso al estilo italiano, apta para cocinas a gas y eléctricas.', 22990, null, 0, 18, 0, '/img/products/cafetera-moka-italiana.webp'],
    ['Cafetera de Goteo Programable 1.5 L', 'Cafeteras', 'Con temporizador de 24 horas, jarra de vidrio y placa calefactora. Prepara hasta 12 tazas.', 54990, 64990, 1, 10, 1, '/img/products/cafetera-goteo-programable.webp'],
    ['Chemex 6 tazas', 'Cafeteras', 'Cafetera de filtrado manual en vidrio soplado con collar de madera. Un ícono del método pour-over.', 49990, null, 0, 7, 0, '/img/products/chemex-6-tazas.jpeg'],
    ['Máquina de Espresso Semiautomática 15 bar', 'Espresso', 'Bomba de 15 bares, vaporizador de leche y portafiltro de acero. Espresso de calidad de cafetería en casa.', 189990, 229990, 1, 6, 1, '/img/products/maquina-espresso-semiautomatica.jpg'],
    ['Máquina Superautomática con Molinillo', 'Espresso', 'Muele, dosifica y extrae con un solo botón. Molinillo cerámico integrado y pantalla táctil.', 429990, null, 0, 3, 1, '/img/products/maquina-superautomatica-molinillo.webp'],
    ['Espresso de Cápsulas Compacta', 'Espresso', 'Diseño compacto de extracción a 19 bares, compatible con cápsulas estándar. Lista en 25 segundos.', 79990, null, 0, 15, 0, '/img/products/espresso-capsulas-compacta.webp'],
    ['Set 2 Tazas de Cerámica 250 ml', 'Vasos y Tazas', 'Tazas de cerámica esmaltada de doble pared que conservan la temperatura. Aptas para lavavajillas.', 12990, null, 0, 40, 0, '/img/products/set-2-tazas-ceramica.avif'],
    ['Vaso Térmico de Acero 350 ml', 'Vasos y Tazas', 'Doble pared al vacío: mantiene el calor 6 horas. Tapa antiderrame y exterior antideslizante.', 16990, 19990, 1, 32, 0, '/img/products/vaso-termico-acero.jpg'],
    ['Set 4 Tazas de Espresso con Platillos', 'Vasos y Tazas', 'Porcelana blanca de pared gruesa, 80 ml. El estándar de la barra italiana.', 21990, null, 0, 14, 0, '/img/products/set-4-tazas-espresso.webp'],
    ['Par de Vasos de Doble Vidrio 250 ml', 'Vasos y Tazas', 'Vidrio borosilicato de doble pared: el café flota visualmente y el vaso no quema.', 14990, null, 0, 26, 0, '/img/products/par-vasos-doble-vidrio.webp'],
    ['Molinillo Manual de Muelas Cerámicas', 'Molinillos', 'Molienda ajustable de fina a gruesa, cuerpo de acero y manivela plegable. Perfecto para viajes.', 24990, null, 0, 12, 0, '/img/products/molinillo-manual-ceramico.webp'],
    ['Molinillo Eléctrico de Muelas Cónicas', 'Molinillos', '40 grados de molienda, dosificación por tiempo y tolva de 400 g. Consistencia profesional.', 69990, 84990, 1, 8, 1, '/img/products/molinillo-electrico-conico.webp'],
    ['Café de Grano Tostado Medio 1 kg', 'Café', 'Blend de altura con notas de chocolate y frutos secos. Tostado la semana del despacho.', 15990, null, 0, 60, 0, '/img/products/cafe-grano-tostado.jpeg'],
    ['Café Molido Espresso 500 g', 'Café', 'Molienda fina calibrada para espresso. Intensidad 8/10, crema densa y persistente.', 9990, 11990, 1, 45, 0, '/img/products/cafe-molido-espresso.webp'],
    ['Báscula Digital con Temporizador', 'Accesorios', 'Precisión de 0,1 g y cronómetro integrado para recetas de filtrado exactas.', 27990, null, 0, 16, 0, '/img/products/bascula-digital.webp'],
    ['Tamper de Acero 51 mm', 'Accesorios', 'Base plana de acero pulido y mango ergonómico de aluminio. Compactación uniforme.', 13990, null, 0, 20, 0, '/img/products/tamper-acero.webp'],
    ['Jarra Espumadora de Leche 500 ml', 'Accesorios', 'Acero inoxidable con pico de precisión para arte latte y marcas de medición internas.', 11990, null, 0, 22, 0, '/img/products/jarra-espumadora.webp'],
    // Bebidas de la casa
    ['Malteada de Chocolate Belga', 'Malteadas', 'Helado artesanal, cacao belga 60% y leche entera, coronada con crema batida y cereza. Espesa como debe ser.', 5490, null, 0, 30, 1, '/img/products/malteada-chocolate.svg'],
    ['Malteada de Fresa', 'Malteadas', 'Fresas frescas licuadas con helado de vainilla y un toque de crema. Dulzor natural, sin jarabes artificiales.', 4990, 5990, 1, 28, 0, '/img/products/malteada-fresa.svg'],
    ['Malteada de Vainilla', 'Malteadas', 'Vainilla de vaina auténtica, helado cremoso y leche fría. El clásico que nunca falla, con hilo de caramelo.', 4990, null, 0, 26, 0, '/img/products/malteada-vainilla.svg'],
    ['Malteada Cookies & Cream', 'Malteadas', 'Galletas de chocolate trituradas en helado de vainilla, con trozos crujientes y galleta entera de corona.', 5490, null, 0, 24, 0, '/img/products/malteada-cookies.svg'],
    ['Batido de Mango y Maracuyá', 'Batidos', 'Mango maduro y pulpa de maracuyá batidos al momento. Tropical, refrescante y sin azúcar añadida.', 4490, null, 0, 32, 1, '/img/products/batido-mango.svg'],
    ['Batido de Frutos Rojos', 'Batidos', 'Frutillas, arándanos y frambuesas con yogurt natural. Antioxidante y con el punto justo de acidez.', 4490, null, 0, 30, 0, '/img/products/batido-frutos-rojos.svg'],
    ['Batido Verde Energía', 'Batidos', 'Espinaca, piña, jengibre y manzana verde. El empujón fresco para empezar el día con todo.', 4990, 5490, 1, 26, 0, '/img/products/batido-verde.svg'],
    ['Batido de Plátano y Avena', 'Batidos', 'Plátano, avena integral, miel y canela sobre leche fría. Desayuno completo en un vaso.', 3990, null, 0, 34, 0, '/img/products/batido-platano-avena.svg'],
    ['Latte Caramelo', 'Cafés de la Casa', 'Doble espresso de la casa, leche cremada a 65 °C y caramelo artesanal en capas. Nuestro más pedido.', 3990, null, 0, 40, 1, '/img/products/latte-caramelo.svg'],
    ['Cappuccino Clásico', 'Cafés de la Casa', 'Tercios perfectos de espresso, leche texturizada y espuma sedosa, espolvoreado con cacao amargo.', 3490, null, 0, 40, 0, '/img/products/cappuccino.svg'],
    ['Mocha con Crema', 'Cafés de la Casa', 'Espresso intenso con chocolate semiamargo fundido, coronado con crema batida y polvo de cacao.', 4290, 4990, 1, 36, 0, '/img/products/mocha-crema.svg'],
    ['Cold Brew de la Casa', 'Cafés de la Casa', 'Extracción en frío por 16 horas de nuestro blend de altura. Suave, dulce natural y muy bajo en acidez.', 3990, null, 0, 30, 0, '/img/products/cold-brew.svg'],
  ];

  const SEED_SETTINGS = {
    store_name: 'ORIGEN',
    announcement_active: '1',
    announcement_text: 'Envío gratis en compras sobre $40.000 — solo por esta semana',
  };

  function now() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

  function freshDb() {
    let id = 0;
    const products = SEED.map((p) => ({
      id: ++id, name: p[0], category: p[1], description: p[2], price: p[3],
      prev_price: p[4], on_sale: p[5], stock: p[6], featured: p[7],
      active: 1, image: p[8] || null, created_at: now(),
    }));
    return {
      products, orders: [], settings: { ...SEED_SETTINGS },
      admin: { username: 'admin', password: 'cafe2026' },
      nextProductId: id + 1, nextOrderId: 1,
    };
  }

  function load() {
    try { const raw = localStorage.getItem(DB_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    const db = freshDb(); save(db); return db;
  }
  function save(db) { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {} }

  // ---- helpers ----
  function json(status, data) {
    return new Response(JSON.stringify(data), {
      status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  function toInt(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : NaN; }
  function publicProduct(row) { return { ...row, on_sale: !!row.on_sale, featured: !!row.featured, active: !!row.active }; }
  function isAuthed() { try { return !!localStorage.getItem(SESSION_KEY); } catch (e) { return false; } }

  const PRODUCT_FIELDS = ['name', 'category', 'description', 'price', 'prev_price', 'on_sale', 'stock', 'featured', 'active', 'image'];
  function validateProductPayload(body, partial) {
    const data = {}; const errors = [];
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
    for (const key of ['name', 'category', 'description']) if (has(key)) data[key] = String(body[key] == null ? '' : body[key]).trim();
    if (has('image')) { const img = body.image === null ? null : String(body.image).trim(); data.image = img || null; }
    for (const key of ['price', 'stock']) {
      if (has(key)) { const n = toInt(body[key]); if (!Number.isInteger(n) || n < 0) errors.push(`Valor inválido en ${key}.`); else data[key] = n; }
    }
    if (has('prev_price')) {
      if (body.prev_price === null || body.prev_price === '') data.prev_price = null;
      else { const n = toInt(body.prev_price); if (!Number.isInteger(n) || n < 0) errors.push('Precio anterior inválido.'); else data.prev_price = n; }
    }
    for (const key of ['on_sale', 'featured', 'active']) if (has(key)) data[key] = body[key] ? 1 : 0;
    if (!partial) {
      if (!data.name) errors.push('El nombre es obligatorio.');
      if (!data.category) errors.push('La categoría es obligatoria.');
      if (!Number.isInteger(data.price) || data.price <= 0) errors.push('El precio debe ser mayor a 0.');
      if (!Number.isInteger(data.stock)) data.stock = 0;
    }
    if (data.name === '') errors.push('El nombre no puede quedar vacío.');
    if (data.category === '') errors.push('La categoría no puede quedar vacía.');
    return { data, errors };
  }

  // ---- rutas (mismas que server.js) ----
  const routes = [
    ['GET', /^\/api\/products$/, () => {
      const db = load();
      const rows = db.products.filter((p) => p.active)
        .sort((a, b) => (b.featured - a.featured) || (b.on_sale - a.on_sale) || a.name.localeCompare(b.name));
      return json(200, rows.map(publicProduct));
    }],
    ['GET', /^\/api\/settings$/, () => json(200, load().settings)],
    ['POST', /^\/api\/checkout$/, (body) => {
      const db = load();
      const customer = body.customer || {};
      const items = Array.isArray(body.items) ? body.items : [];
      const name = String(customer.name || '').trim();
      const email = String(customer.email || '').trim();
      const address = String(customer.address || '').trim();
      if (!name || !email || !address) return json(400, { error: 'Completa nombre, correo y dirección.' });
      if (!items.length) return json(400, { error: 'El carrito está vacío.' });
      let total = 0; const resolved = [];
      for (const item of items) {
        const id = toInt(item.id), qty = toInt(item.qty);
        if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1 || qty > 99) return json(400, { error: 'Artículo inválido en el carrito.' });
        const product = db.products.find((p) => p.id === id && p.active);
        if (!product) return json(409, { error: 'Un producto del carrito ya no está disponible.' });
        if (product.stock < qty) return json(409, { error: `Stock insuficiente para “${product.name}” (quedan ${product.stock}).`, productId: product.id });
        total += product.price * qty; resolved.push({ product, qty });
      }
      const orderId = db.nextOrderId++;
      const order = { id: orderId, customer_name: name, customer_email: email, customer_address: address, total, status: 'pendiente', created_at: now(), items: [] };
      for (const { product, qty } of resolved) {
        order.items.push({ id: order.items.length + 1, order_id: orderId, product_id: product.id, product_name: product.name, unit_price: product.price, qty });
        product.stock -= qty;
      }
      db.orders.push(order); save(db);
      return json(201, { orderId, total });
    }],
    ['POST', /^\/api\/admin\/login$/, (body) => {
      const db = load();
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (username !== db.admin.username || password !== db.admin.password) return json(401, { error: 'Usuario o contraseña incorrectos.' });
      try { localStorage.setItem(SESSION_KEY, db.admin.username); } catch (e) {}
      return json(200, { username: db.admin.username });
    }],
    ['POST', /^\/api\/admin\/logout$/, () => { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} return json(200, { ok: true }); }],
    ['GET', /^\/api\/admin\/me$/, () => isAuthed() ? json(200, { username: load().admin.username }) : json(401, { error: 'No autorizado.' })],
    ['GET', /^\/api\/admin\/products$/, () => {
      if (!isAuthed()) return json(401, { error: 'No autorizado.' });
      const rows = load().products.slice().sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      return json(200, rows.map(publicProduct));
    }],
    ['POST', /^\/api\/admin\/products$/, (body) => {
      if (!isAuthed()) return json(401, { error: 'No autorizado.' });
      const { data, errors } = validateProductPayload(body, false);
      if (errors.length) return json(400, { error: errors.join(' ') });
      const db = load();
      const row = {
        id: db.nextProductId++, name: data.name, category: data.category, description: data.description || '',
        price: data.price, prev_price: data.prev_price == null ? null : data.prev_price, on_sale: data.on_sale || 0,
        stock: data.stock || 0, featured: data.featured || 0, active: data.active == null ? 1 : data.active,
        image: data.image || null, created_at: now(),
      };
      db.products.push(row); save(db);
      return json(201, publicProduct(row));
    }],
    ['PUT', /^\/api\/admin\/products\/(\d+)$/, (body, m) => {
      if (!isAuthed()) return json(401, { error: 'No autorizado.' });
      const db = load(); const id = Number(m[1]);
      const row = db.products.find((p) => p.id === id);
      if (!row) return json(404, { error: 'Producto no encontrado.' });
      const { data, errors } = validateProductPayload(body, true);
      if (errors.length) return json(400, { error: errors.join(' ') });
      const keys = Object.keys(data).filter((k) => PRODUCT_FIELDS.includes(k));
      if (!keys.length) return json(400, { error: 'Nada que actualizar.' });
      keys.forEach((k) => { row[k] = data[k]; });
      save(db);
      return json(200, publicProduct(row));
    }],
    ['DELETE', /^\/api\/admin\/products\/(\d+)$/, (body, m) => {
      if (!isAuthed()) return json(401, { error: 'No autorizado.' });
      const db = load(); const id = Number(m[1]);
      const idx = db.products.findIndex((p) => p.id === id);
      if (idx < 0) return json(404, { error: 'Producto no encontrado.' });
      db.products.splice(idx, 1); save(db);
      return json(200, { ok: true });
    }],
    ['GET', /^\/api\/admin\/orders$/, () => {
      if (!isAuthed()) return json(401, { error: 'No autorizado.' });
      const rows = load().orders.slice().sort((a, b) => b.id - a.id);
      return json(200, rows);
    }],
    ['PUT', /^\/api\/admin\/orders\/(\d+)$/, (body, m) => {
      if (!isAuthed()) return json(401, { error: 'No autorizado.' });
      const STATUSES = ['pendiente', 'enviado', 'completado', 'cancelado'];
      const status = String(body.status || '');
      if (!STATUSES.includes(status)) return json(400, { error: 'Estado inválido.' });
      const db = load(); const order = db.orders.find((o) => o.id === Number(m[1]));
      if (!order) return json(404, { error: 'Pedido no encontrado.' });
      order.status = status; save(db);
      return json(200, { ok: true });
    }],
    ['PUT', /^\/api\/admin\/settings$/, (body) => {
      if (!isAuthed()) return json(401, { error: 'No autorizado.' });
      const db = load();
      ['store_name', 'announcement_active', 'announcement_text'].forEach((k) => {
        if (Object.prototype.hasOwnProperty.call(body, k)) db.settings[k] = String(body[k]);
      });
      save(db);
      return json(200, db.settings);
    }],
    ['PUT', /^\/api\/admin\/password$/, (body) => {
      if (!isAuthed()) return json(401, { error: 'No autorizado.' });
      const db = load();
      const current = String(body.current || ''), next = String(body.next || '');
      if (next.length < 6) return json(400, { error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
      if (current !== db.admin.password) return json(401, { error: 'La contraseña actual no es correcta.' });
      db.admin.password = next; save(db);
      return json(200, { ok: true });
    }],
    ['POST', /^\/api\/admin\/upload$/, (body) => {
      if (!isAuthed()) return json(401, { error: 'No autorizado.' });
      const dataUrl = String(body.data || '');
      const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(dataUrl);
      if (!m) return json(400, { error: 'Formato de imagen no soportado (usa PNG, JPG, WEBP o GIF).' });
      const approxBytes = Math.floor(m[2].length * 0.75);
      if (approxBytes > 5 * 1024 * 1024) return json(400, { error: 'La imagen supera los 5 MB.' });
      // Sin servidor: la "ruta" es el propio data URL (se guarda en el producto).
      return json(201, { path: dataUrl });
    }],
  ];

  async function handleApi(method, pathname, body) {
    for (const [m, re, fn] of routes) {
      if (m !== method) continue;
      const match = re.exec(pathname);
      if (!match) continue;
      try { return fn(body, match); }
      catch (e) { return json(500, { error: 'Error interno.' }); }
    }
    return json(404, { error: 'Ruta no encontrada.' });
  }

  // ---- intercepta fetch('/api/*') ----
  const origFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (!path.startsWith('/api/')) return origFetch ? origFetch(input, init) : Promise.reject(new Error('offline'));
    const method = ((init && init.method) || (typeof input === 'object' && input && input.method) || 'GET').toUpperCase();
    let body = {};
    if (init && init.body) { try { body = JSON.parse(init.body); } catch (e) { body = {}; } }
    return handleApi(method, path, body);
  };
})();
