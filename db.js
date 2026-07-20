'use strict';

const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'cafe.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  category    TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  price       INTEGER NOT NULL,
  prev_price  INTEGER,
  on_sale     INTEGER NOT NULL DEFAULT 0,
  stock       INTEGER NOT NULL DEFAULT 0,
  featured    INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  image       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name    TEXT    NOT NULL,
  customer_email   TEXT    NOT NULL,
  customer_address TEXT    NOT NULL,
  total            INTEGER NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'pendiente',
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id),
  product_id   INTEGER,
  product_name TEXT    NOT NULL,
  unit_price   INTEGER NOT NULL,
  qty          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reservations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  contact    TEXT    NOT NULL,
  date       TEXT    NOT NULL,
  time       TEXT    NOT NULL,
  people     INTEGER NOT NULL,
  note       TEXT    NOT NULL DEFAULT '',
  status     TEXT    NOT NULL DEFAULT 'pendiente',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  username  TEXT NOT NULL UNIQUE,
  salt      TEXT NOT NULL,
  pass_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, hash) {
  const candidate = Buffer.from(hashPassword(password, salt), 'hex');
  const stored = Buffer.from(hash, 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

// ---- Seed inicial (solo si la base está vacía) ----

const adminCount = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
if (adminCount === 0) {
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO admins (username, salt, pass_hash) VALUES (?, ?, ?)')
    .run('admin', salt, hashPassword('cafe2026', salt));
}

const settingsDefaults = [
  ['store_name', 'ORIGEN'],
  ['announcement_active', '1'],
  ['announcement_text', 'Envío gratis en compras sobre $40.000 — solo por esta semana'],
];
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of settingsDefaults) insertSetting.run(k, v);

// ---- Bebidas de la casa (migración: se insertan si aún no existen) ----
const DRINKS_SEED = [
  ['Malteada de Chocolate Belga', 'Malteadas',
    'Helado artesanal, cacao belga 60% y leche entera, coronada con crema batida y cereza. Espesa como debe ser.',
    5490, null, 0, 30, 1, '/img/products/malteada-chocolate.svg'],
  ['Malteada de Fresa', 'Malteadas',
    'Fresas frescas licuadas con helado de vainilla y un toque de crema. Dulzor natural, sin jarabes artificiales.',
    4990, 5990, 1, 28, 0, '/img/products/malteada-fresa.svg'],
  ['Malteada de Vainilla', 'Malteadas',
    'Vainilla de vaina auténtica, helado cremoso y leche fría. El clásico que nunca falla, con hilo de caramelo.',
    4990, null, 0, 26, 0, '/img/products/malteada-vainilla.svg'],
  ['Malteada Cookies & Cream', 'Malteadas',
    'Galletas de chocolate trituradas en helado de vainilla, con trozos crujientes y galleta entera de corona.',
    5490, null, 0, 24, 0, '/img/products/malteada-cookies.svg'],
  ['Batido de Mango y Maracuyá', 'Batidos',
    'Mango maduro y pulpa de maracuyá batidos al momento. Tropical, refrescante y sin azúcar añadida.',
    4490, null, 0, 32, 1, '/img/products/batido-mango.svg'],
  ['Batido de Frutos Rojos', 'Batidos',
    'Frutillas, arándanos y frambuesas con yogurt natural. Antioxidante y con el punto justo de acidez.',
    4490, null, 0, 30, 0, '/img/products/batido-frutos-rojos.svg'],
  ['Batido Verde Energía', 'Batidos',
    'Espinaca, piña, jengibre y manzana verde. El empujón fresco para empezar el día con todo.',
    4990, 5490, 1, 26, 0, '/img/products/batido-verde.svg'],
  ['Batido de Plátano y Avena', 'Batidos',
    'Plátano, avena integral, miel y canela sobre leche fría. Desayuno completo en un vaso.',
    3990, null, 0, 34, 0, '/img/products/batido-platano-avena.svg'],
  ['Latte Caramelo', 'Cafés de la Casa',
    'Doble espresso de la casa, leche cremada a 65 °C y caramelo artesanal en capas. Nuestro más pedido.',
    3990, null, 0, 40, 1, '/img/products/latte-caramelo.svg'],
  ['Cappuccino Clásico', 'Cafés de la Casa',
    'Tercios perfectos de espresso, leche texturizada y espuma sedosa, espolvoreado con cacao amargo.',
    3490, null, 0, 40, 0, '/img/products/cappuccino.svg'],
  ['Mocha con Crema', 'Cafés de la Casa',
    'Espresso intenso con chocolate semiamargo fundido, coronado con crema batida y polvo de cacao.',
    4290, 4990, 1, 36, 0, '/img/products/mocha-crema.svg'],
  ['Cold Brew de la Casa', 'Cafés de la Casa',
    'Extracción en frío por 16 horas de nuestro blend de altura. Suave, dulce natural y muy bajo en acidez.',
    3990, null, 0, 30, 0, '/img/products/cold-brew.svg'],
];

{
  const exists = db.prepare('SELECT COUNT(*) AS n FROM products WHERE name = ?');
  const insertDrink = db.prepare(`
    INSERT INTO products (name, category, description, price, prev_price, on_sale, stock, featured, image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of DRINKS_SEED) {
    if (exists.get(p[0]).n === 0) insertDrink.run(...p);
  }
}

// ---- Migración: el local dejó de vender equipamiento de café ----
// Ahora ORIGEN es 100% cafetería: solo se sirven bebidas (malteadas, batidos, cafés
// de la casa). Se retiran cafeteras, máquinas de espresso, molinillos, vasos/tazas,
// accesorios y café en grano/molido del catálogo, si quedaban de una versión anterior.
{
  const RETIRED_CATEGORIES = ['Cafeteras', 'Espresso', 'Vasos y Tazas', 'Molinillos', 'Café', 'Accesorios'];
  const placeholders = RETIRED_CATEGORIES.map(() => '?').join(', ');
  db.prepare(`DELETE FROM products WHERE category IN (${placeholders})`).run(...RETIRED_CATEGORIES);
}

module.exports = { db, hashPassword, verifyPassword };
