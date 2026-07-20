'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, hashPassword, verifyPassword } = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'img', 'products');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---------------------------------------------------------------- sesiones

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map(); // token -> { username, expires }

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, expires: Date.now() + SESSION_TTL_MS });
  return token;
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function getSession(req) {
  const token = parseCookies(req).session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

// ---------------------------------------------------------------- helpers

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf-8'));
  } catch {
    const err = new Error('invalid_json');
    err.status = 400;
    throw err;
  }
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function publicProduct(row) {
  return { ...row, on_sale: !!row.on_sale, featured: !!row.featured, active: !!row.active };
}

// ---------------------------------------------------------------- API pública

function listPublicProducts(req, res) {
  const rows = db.prepare(
    'SELECT * FROM products WHERE active = 1 ORDER BY featured DESC, on_sale DESC, name'
  ).all();
  sendJson(res, 200, rows.map(publicProduct));
}

function getPublicSettings(req, res) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  sendJson(res, 200, settings);
}

async function checkout(req, res) {
  const body = await readJsonBody(req);
  const customer = body.customer || {};
  const items = Array.isArray(body.items) ? body.items : [];

  const name = String(customer.name || '').trim();
  const email = String(customer.email || '').trim();
  const address = String(customer.address || '').trim();
  if (!name || !email || !address) {
    return sendJson(res, 400, { error: 'Completa nombre, correo y dirección.' });
  }
  if (!items.length) {
    return sendJson(res, 400, { error: 'El carrito está vacío.' });
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    let total = 0;
    const resolved = [];
    for (const item of items) {
      const id = toInt(item.id);
      const qty = toInt(item.qty);
      if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1 || qty > 99) {
        db.exec('ROLLBACK');
        return sendJson(res, 400, { error: 'Artículo inválido en el carrito.' });
      }
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(id);
      if (!product) {
        db.exec('ROLLBACK');
        return sendJson(res, 409, { error: 'Un producto del carrito ya no está disponible.' });
      }
      if (product.stock < qty) {
        db.exec('ROLLBACK');
        return sendJson(res, 409, {
          error: `Stock insuficiente para “${product.name}” (quedan ${product.stock}).`,
          productId: product.id,
        });
      }
      total += product.price * qty;
      resolved.push({ product, qty });
    }

    const orderResult = db.prepare(
      'INSERT INTO orders (customer_name, customer_email, customer_address, total) VALUES (?, ?, ?, ?)'
    ).run(name, email, address, total);
    const orderId = Number(orderResult.lastInsertRowid);

    const insertItem = db.prepare(
      'INSERT INTO order_items (order_id, product_id, product_name, unit_price, qty) VALUES (?, ?, ?, ?, ?)'
    );
    const decrementStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    for (const { product, qty } of resolved) {
      insertItem.run(orderId, product.id, product.name, product.price, qty);
      decrementStock.run(qty, product.id);
    }

    db.exec('COMMIT');
    sendJson(res, 201, { orderId, total });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

// ---------------------------------------------------------------- API admin

async function login(req, res) {
  const body = await readJsonBody(req);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !verifyPassword(password, admin.salt, admin.pass_hash)) {
    return sendJson(res, 401, { error: 'Usuario o contraseña incorrectos.' });
  }
  const token = createSession(admin.username);
  res.setHeader('Set-Cookie',
    `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`);
  sendJson(res, 200, { username: admin.username });
}

function logout(req, res) {
  const session = getSession(req);
  if (session) sessions.delete(session.token);
  res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  sendJson(res, 200, { ok: true });
}

function me(req, res, session) {
  sendJson(res, 200, { username: session.username });
}

function listAllProducts(req, res) {
  const rows = db.prepare('SELECT * FROM products ORDER BY category, name').all();
  sendJson(res, 200, rows.map(publicProduct));
}

const PRODUCT_FIELDS = ['name', 'category', 'description', 'price', 'prev_price', 'on_sale', 'stock', 'featured', 'active', 'image'];

function validateProductPayload(body, { partial }) {
  const data = {};
  const errors = [];

  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  for (const key of ['name', 'category', 'description']) {
    if (has(key)) data[key] = String(body[key] ?? '').trim();
  }
  if (has('image')) {
    const img = body.image === null ? null : String(body.image).trim();
    data.image = img || null;
  }
  for (const key of ['price', 'stock']) {
    if (has(key)) {
      const n = toInt(body[key]);
      if (!Number.isInteger(n) || n < 0) errors.push(`Valor inválido en ${key}.`);
      else data[key] = n;
    }
  }
  if (has('prev_price')) {
    if (body.prev_price === null || body.prev_price === '') data.prev_price = null;
    else {
      const n = toInt(body.prev_price);
      if (!Number.isInteger(n) || n < 0) errors.push('Precio anterior inválido.');
      else data.prev_price = n;
    }
  }
  for (const key of ['on_sale', 'featured', 'active']) {
    if (has(key)) data[key] = body[key] ? 1 : 0;
  }

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

async function createProduct(req, res) {
  const body = await readJsonBody(req);
  const { data, errors } = validateProductPayload(body, { partial: false });
  if (errors.length) return sendJson(res, 400, { error: errors.join(' ') });

  const result = db.prepare(`
    INSERT INTO products (name, category, description, price, prev_price, on_sale, stock, featured, active, image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name, data.category, data.description ?? '', data.price,
    data.prev_price ?? null, data.on_sale ?? 0, data.stock ?? 0,
    data.featured ?? 0, data.active ?? 1, data.image ?? null
  );
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(result.lastInsertRowid));
  sendJson(res, 201, publicProduct(row));
}

async function updateProduct(req, res, session, match) {
  const id = Number(match[1]);
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) return sendJson(res, 404, { error: 'Producto no encontrado.' });

  const body = await readJsonBody(req);
  const { data, errors } = validateProductPayload(body, { partial: true });
  if (errors.length) return sendJson(res, 400, { error: errors.join(' ') });

  const keys = Object.keys(data).filter((k) => PRODUCT_FIELDS.includes(k));
  if (!keys.length) return sendJson(res, 400, { error: 'Nada que actualizar.' });

  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE products SET ${setClause} WHERE id = ?`).run(...keys.map((k) => data[k]), id);

  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  sendJson(res, 200, publicProduct(row));
}

function deleteProduct(req, res, session, match) {
  const id = Number(match[1]);
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(id);
  if (!result.changes) return sendJson(res, 404, { error: 'Producto no encontrado.' });
  sendJson(res, 200, { ok: true });
}

function listOrders(req, res) {
  const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  sendJson(res, 200, orders.map((o) => ({ ...o, items: itemsStmt.all(o.id) })));
}

const ORDER_STATUSES = ['pendiente', 'enviado', 'completado', 'cancelado'];

async function updateOrder(req, res, session, match) {
  const id = Number(match[1]);
  const body = await readJsonBody(req);
  const status = String(body.status || '');
  if (!ORDER_STATUSES.includes(status)) {
    return sendJson(res, 400, { error: 'Estado inválido.' });
  }
  const result = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
  if (!result.changes) return sendJson(res, 404, { error: 'Pedido no encontrado.' });
  sendJson(res, 200, { ok: true });
}

// ---------------------------------------------------------------- reservas

const RESERVATION_STATUSES = ['pendiente', 'confirmada', 'completada', 'cancelada'];

async function createReservation(req, res) {
  const body = await readJsonBody(req);
  const name = String(body.name || '').trim();
  const contact = String(body.contact || '').trim();
  const date = String(body.date || '').trim();
  const time = String(body.time || '').trim();
  const people = toInt(body.people);
  const note = String(body.note || '').trim().slice(0, 200);

  if (!name || !contact) return sendJson(res, 400, { error: 'Completa tu nombre y un teléfono o correo.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendJson(res, 400, { error: 'Elige una fecha válida.' });
  if (!/^\d{2}:\d{2}$/.test(time)) return sendJson(res, 400, { error: 'Elige una hora válida.' });
  if (!Number.isInteger(people) || people < 1 || people > 8) {
    return sendJson(res, 400, { error: 'Las reservas son de 1 a 8 personas.' });
  }
  if (date < new Date().toISOString().slice(0, 10)) {
    return sendJson(res, 400, { error: 'La fecha ya pasó — elige una desde hoy.' });
  }

  const result = db.prepare(
    'INSERT INTO reservations (name, contact, date, time, people, note) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, contact, date, time, people, note);
  sendJson(res, 201, { reservationId: Number(result.lastInsertRowid) });
}

function listReservations(req, res) {
  const rows = db.prepare('SELECT * FROM reservations ORDER BY date, time, id DESC').all();
  sendJson(res, 200, rows);
}

async function updateReservation(req, res, session, match) {
  const id = Number(match[1]);
  const body = await readJsonBody(req);
  const status = String(body.status || '');
  if (!RESERVATION_STATUSES.includes(status)) {
    return sendJson(res, 400, { error: 'Estado inválido.' });
  }
  const result = db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run(status, id);
  if (!result.changes) return sendJson(res, 404, { error: 'Reserva no encontrada.' });
  sendJson(res, 200, { ok: true });
}

async function updateSettings(req, res) {
  const body = await readJsonBody(req);
  const allowed = ['store_name', 'announcement_active', 'announcement_text'];
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      stmt.run(key, String(body[key]));
    }
  }
  getPublicSettings(req, res);
}

async function changePassword(req, res, session) {
  const body = await readJsonBody(req);
  const current = String(body.current || '');
  const next = String(body.next || '');
  if (next.length < 6) return sendJson(res, 400, { error: 'La nueva contraseña debe tener al menos 6 caracteres.' });

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(session.username);
  if (!admin || !verifyPassword(current, admin.salt, admin.pass_hash)) {
    return sendJson(res, 401, { error: 'La contraseña actual no es correcta.' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE admins SET salt = ?, pass_hash = ? WHERE id = ?')
    .run(salt, hashPassword(next, salt), admin.id);
  sendJson(res, 200, { ok: true });
}

const IMAGE_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

async function uploadImage(req, res) {
  const body = await readJsonBody(req);
  const dataUrl = String(body.data || '');
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!match) return sendJson(res, 400, { error: 'Formato de imagen no soportado (usa PNG, JPG, WEBP o GIF).' });

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) {
    return sendJson(res, 400, { error: 'La imagen supera los 5 MB.' });
  }
  const filename = `producto-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${IMAGE_TYPES[match[1]]}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  sendJson(res, 201, { path: `/img/products/${filename}` });
}

// ---------------------------------------------------------------- rutas

function requireAuth(handler) {
  return (req, res, session, match) => {
    if (!session) return sendJson(res, 401, { error: 'No autorizado.' });
    return handler(req, res, session, match);
  };
}

const routes = [
  ['GET',    /^\/api\/products$/,            listPublicProducts],
  ['GET',    /^\/api\/settings$/,            getPublicSettings],
  ['POST',   /^\/api\/checkout$/,            checkout],
  ['POST',   /^\/api\/admin\/login$/,        login],
  ['POST',   /^\/api\/admin\/logout$/,       logout],
  ['GET',    /^\/api\/admin\/me$/,           requireAuth(me)],
  ['GET',    /^\/api\/admin\/products$/,     requireAuth(listAllProducts)],
  ['POST',   /^\/api\/admin\/products$/,     requireAuth(createProduct)],
  ['PUT',    /^\/api\/admin\/products\/(\d+)$/, requireAuth(updateProduct)],
  ['DELETE', /^\/api\/admin\/products\/(\d+)$/, requireAuth(deleteProduct)],
  ['GET',    /^\/api\/admin\/orders$/,       requireAuth(listOrders)],
  ['PUT',    /^\/api\/admin\/orders\/(\d+)$/, requireAuth(updateOrder)],
  ['POST',   /^\/api\/reservations$/,        createReservation],
  ['GET',    /^\/api\/admin\/reservations$/, requireAuth(listReservations)],
  ['PUT',    /^\/api\/admin\/reservations\/(\d+)$/, requireAuth(updateReservation)],
  ['PUT',    /^\/api\/admin\/settings$/,     requireAuth(updateSettings)],
  ['PUT',    /^\/api\/admin\/password$/,     requireAuth(changePassword)],
  ['POST',   /^\/api\/admin\/upload$/,       requireAuth(uploadImage)],
];

function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin') pathname = '/admin.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — No encontrado');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    for (const [method, pattern, handler] of routes) {
      if (req.method !== method) continue;
      const match = pattern.exec(pathname);
      if (!match) continue;
      const session = getSession(req);
      await handler(req, res, session, match);
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      return serveStatic(req, res, pathname);
    }
    sendJson(res, 404, { error: 'Ruta no encontrada.' });
  } catch (err) {
    if (err.message === 'payload_too_large') {
      return sendJson(res, 413, { error: 'El contenido enviado es demasiado grande.' });
    }
    const status = err.status || 500;
    console.error(`[error] ${req.method} ${pathname}:`, err);
    if (!res.headersSent) {
      sendJson(res, status, { error: status === 400 ? 'Solicitud inválida.' : 'Error interno del servidor.' });
    }
  }
});

server.listen(PORT, () => {
  console.log(`ORIGEN Café — servidor iniciado en http://localhost:${PORT}`);
  console.log(`Panel administrativo: http://localhost:${PORT}/admin`);
});
