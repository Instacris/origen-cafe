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

const productCount = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
if (productCount === 0) {
  const seed = [
    // [name, category, description, price, prev_price, on_sale, stock, featured, image]
    ['Prensa Francesa 600 ml', 'Cafeteras',
      'Prensa de vidrio borosilicato con marco de acero inoxidable. Ideal para 3 tazas de café de cuerpo completo.',
      18990, 24990, 1, 24, 0, '/img/products/prensa-francesa.webp'],
    ['Cafetera Moka Italiana 6 tazas', 'Cafeteras',
      'Clásica cafetera de aluminio para preparar café intenso al estilo italiano, apta para cocinas a gas y eléctricas.',
      22990, null, 0, 18, 0, '/img/products/cafetera-moka-italiana.webp'],
    ['Cafetera de Goteo Programable 1.5 L', 'Cafeteras',
      'Con temporizador de 24 horas, jarra de vidrio y placa calefactora. Prepara hasta 12 tazas.',
      54990, 64990, 1, 10, 1, '/img/products/cafetera-goteo-programable.webp'],
    ['Chemex 6 tazas', 'Cafeteras',
      'Cafetera de filtrado manual en vidrio soplado con collar de madera. Un ícono del método pour-over.',
      49990, null, 0, 7, 0, '/img/products/chemex-6-tazas.jpeg'],

    ['Máquina de Espresso Semiautomática 15 bar', 'Espresso',
      'Bomba de 15 bares, vaporizador de leche y portafiltro de acero. Espresso de calidad de cafetería en casa.',
      189990, 229990, 1, 6, 1, '/img/products/maquina-espresso-semiautomatica.jpg'],
    ['Máquina Superautomática con Molinillo', 'Espresso',
      'Muele, dosifica y extrae con un solo botón. Molinillo cerámico integrado y pantalla táctil.',
      429990, null, 0, 3, 1, '/img/products/maquina-superautomatica-molinillo.webp'],
    ['Espresso de Cápsulas Compacta', 'Espresso',
      'Diseño compacto de extracción a 19 bares, compatible con cápsulas estándar. Lista en 25 segundos.',
      79990, null, 0, 15, 0, '/img/products/espresso-capsulas-compacta.webp'],

    ['Set 2 Tazas de Cerámica 250 ml', 'Vasos y Tazas',
      'Tazas de cerámica esmaltada de doble pared que conservan la temperatura. Aptas para lavavajillas.',
      12990, null, 0, 40, 0, '/img/products/set-2-tazas-ceramica.avif'],
    ['Vaso Térmico de Acero 350 ml', 'Vasos y Tazas',
      'Doble pared al vacío: mantiene el calor 6 horas. Tapa antiderrame y exterior antideslizante.',
      16990, 19990, 1, 32, 0, '/img/products/vaso-termico-acero.jpg'],
    ['Set 4 Tazas de Espresso con Platillos', 'Vasos y Tazas',
      'Porcelana blanca de pared gruesa, 80 ml. El estándar de la barra italiana.',
      21990, null, 0, 14, 0, '/img/products/set-4-tazas-espresso.webp'],
    ['Par de Vasos de Doble Vidrio 250 ml', 'Vasos y Tazas',
      'Vidrio borosilicato de doble pared: el café flota visualmente y el vaso no quema.',
      14990, null, 0, 26, 0, '/img/products/par-vasos-doble-vidrio.webp'],

    ['Molinillo Manual de Muelas Cerámicas', 'Molinillos',
      'Molienda ajustable de fina a gruesa, cuerpo de acero y manivela plegable. Perfecto para viajes.',
      24990, null, 0, 12, 0, '/img/products/molinillo-manual-ceramico.webp'],
    ['Molinillo Eléctrico de Muelas Cónicas', 'Molinillos',
      '40 grados de molienda, dosificación por tiempo y tolva de 400 g. Consistencia profesional.',
      69990, 84990, 1, 8, 1, '/img/products/molinillo-electrico-conico.webp'],

    ['Café de Grano Tostado Medio 1 kg', 'Café',
      'Blend de altura con notas de chocolate y frutos secos. Tostado la semana del despacho.',
      15990, null, 0, 60, 0, '/img/products/cafe-grano-tostado.jpeg'],
    ['Café Molido Espresso 500 g', 'Café',
      'Molienda fina calibrada para espresso. Intensidad 8/10, crema densa y persistente.',
      9990, 11990, 1, 45, 0, '/img/products/cafe-molido-espresso.webp'],

    ['Báscula Digital con Temporizador', 'Accesorios',
      'Precisión de 0,1 g y cronómetro integrado para recetas de filtrado exactas.',
      27990, null, 0, 16, 0, '/img/products/bascula-digital.webp'],
    ['Tamper de Acero 51 mm', 'Accesorios',
      'Base plana de acero pulido y mango ergonómico de aluminio. Compactación uniforme.',
      13990, null, 0, 20, 0, '/img/products/tamper-acero.webp'],
    ['Jarra Espumadora de Leche 500 ml', 'Accesorios',
      'Acero inoxidable con pico de precisión para arte latte y marcas de medición internas.',
      11990, null, 0, 22, 0, '/img/products/jarra-espumadora.webp'],
  ];

  const insert = db.prepare(`
    INSERT INTO products (name, category, description, price, prev_price, on_sale, stock, featured, image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of seed) insert.run(...p);
}

module.exports = { db, hashPassword, verifyPassword };
