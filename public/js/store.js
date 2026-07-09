'use strict';

/* ================================================================
   ORIGEN Café — lógica de la tienda
   ================================================================ */

const Api = {
  async getProducts() {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error('No se pudo cargar el catálogo.');
    return res.json();
  },
  async getSettings() {
    const res = await fetch('/api/settings');
    if (!res.ok) return {};
    return res.json();
  },
  async checkout(payload) {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'No se pudo procesar el pedido.');
      err.status = res.status;
      throw err;
    }
    return data;
  },
};

const CART_KEY = 'origen_cart_v1';

const state = {
  products: [],
  cart: loadCart(), // { [productId]: qty }
  category: 'Todos',
  search: '',
  onlySale: false,
  sort: 'relevance',
};

// ---------------------------------------------------------------- utilidades

function money(n) {
  return '$' + Number(n).toLocaleString('es-CL');
}

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}

function productById(id) {
  return state.products.find((p) => p.id === Number(id));
}

function cartEntries() {
  return Object.entries(state.cart)
    .map(([id, qty]) => ({ product: productById(id), qty }))
    .filter((e) => e.product && e.qty > 0);
}

function cartCount() {
  return cartEntries().reduce((sum, e) => sum + e.qty, 0);
}

function cartSubtotal() {
  return cartEntries().reduce((sum, e) => sum + e.product.price * e.qty, 0);
}

function discountPercent(p) {
  if (!p.on_sale || !p.prev_price || p.prev_price <= p.price) return null;
  return Math.round((1 - p.price / p.prev_price) * 100);
}

const PLACEHOLDER_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/>
    <line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>
  </svg>`;

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

let toastTimer;
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------- catálogo

function visibleProducts() {
  let list = [...state.products];
  if (state.category !== 'Todos') list = list.filter((p) => p.category === state.category);
  if (state.onlySale) list = list.filter((p) => p.on_sale);
  if (state.search) {
    const q = state.search.toLowerCase();
    list = list.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q));
  }
  switch (state.sort) {
    case 'price-asc': list.sort((a, b) => a.price - b.price); break;
    case 'price-desc': list.sort((a, b) => b.price - a.price); break;
    case 'name': list.sort((a, b) => a.name.localeCompare(b.name, 'es')); break;
    default: // relevancia: destacados primero, luego ofertas
      list.sort((a, b) => (b.featured - a.featured) || (b.on_sale - a.on_sale) || a.name.localeCompare(b.name, 'es'));
  }
  return list;
}

function renderCategories() {
  const categories = ['Todos', ...new Set(state.products.map((p) => p.category))];
  const wrap = document.getElementById('category-chips');
  wrap.innerHTML = categories.map((c) =>
    `<button class="chip ${c === state.category ? 'active' : ''}" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`
  ).join('');
}

function stockNote(p) {
  if (p.stock <= 0) return '<span class="stock-note out">Agotado</span>';
  if (p.stock <= 5) return `<span class="stock-note low">¡Últimas ${p.stock} unidades!</span>`;
  return '<span class="stock-note ok">Disponible</span>';
}

function renderGrid() {
  const grid = document.getElementById('product-grid');
  const list = visibleProducts();
  document.getElementById('catalog-count').textContent =
    `${list.length} producto${list.length === 1 ? '' : 's'}`;

  if (!list.length) {
    grid.innerHTML = '<div class="empty-state">No encontramos productos con esos filtros.<br>Prueba con otra búsqueda.</div>';
    return;
  }

  grid.innerHTML = list.map((p) => {
    const pct = discountPercent(p);
    const out = p.stock <= 0;
    const media = p.image
      ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy">`
      : `<div class="placeholder">${PLACEHOLDER_SVG}<span>${escapeHtml(p.category)}</span></div>`;
    return `
    <article class="card">
      <div class="card-media">
        ${media}
        <div class="badges">
          ${pct ? `<span class="badge badge-sale">Oferta −${pct}%</span>` : ''}
          ${p.featured ? '<span class="badge badge-featured">Destacado</span>' : ''}
          ${out ? '<span class="badge badge-out">Agotado</span>' : ''}
        </div>
      </div>
      <div class="card-body">
        <span class="card-category">${escapeHtml(p.category)}</span>
        <h3 class="card-title">${escapeHtml(p.name)}</h3>
        <p class="card-desc">${escapeHtml(p.description || '')}</p>
        <div class="price-row">
          <span class="price ${p.on_sale && p.prev_price ? 'sale-price' : ''}">${money(p.price)}</span>
          ${p.on_sale && p.prev_price ? `<span class="prev-price">${money(p.prev_price)}</span>` : ''}
        </div>
        ${stockNote(p)}
        <button class="btn btn-primary" data-add="${p.id}" ${out ? 'disabled' : ''}>
          ${out ? 'Sin stock' : 'Agregar al carrito'}
        </button>
      </div>
    </article>`;
  }).join('');
}

// ---------------------------------------------------------------- carrito

function addToCart(id) {
  const product = productById(id);
  if (!product) return;
  const current = state.cart[id] || 0;
  if (current >= product.stock) {
    showToast(`Solo quedan ${product.stock} unidades de este producto.`, true);
    return;
  }
  state.cart[id] = current + 1;
  saveCart();
  renderCart();
  showToast(`“${product.name}” agregado al carrito.`);
}

function setQty(id, qty) {
  const product = productById(id);
  if (!product) return;
  if (qty <= 0) {
    delete state.cart[id];
  } else {
    if (qty > product.stock) {
      showToast(`Solo quedan ${product.stock} unidades disponibles.`, true);
      qty = product.stock;
    }
    state.cart[id] = qty;
  }
  saveCart();
  renderCart();
}

function renderCart() {
  const entries = cartEntries();
  document.getElementById('cart-count').textContent = cartCount();

  const body = document.getElementById('cart-body');
  const foot = document.getElementById('cart-foot');

  if (!entries.length) {
    body.innerHTML = `<div class="cart-empty">
      <p style="font-size:2rem; margin-bottom:8px">☕</p>
      <p>Tu carrito está vacío.</p>
      <p style="font-size:0.82rem; margin-top:6px">Agrega productos del catálogo para comenzar.</p>
    </div>`;
    foot.hidden = true;
    return;
  }

  body.innerHTML = entries.map(({ product: p, qty }) => `
    <div class="cart-item">
      <div class="cart-item-thumb">
        ${p.image ? `<img src="${escapeHtml(p.image)}" alt="">` : PLACEHOLDER_SVG}
      </div>
      <div>
        <div class="cart-item-name">${escapeHtml(p.name)}</div>
        <div class="cart-item-price">${money(p.price)} c/u</div>
        <div class="qty-controls">
          <button data-qty-minus="${p.id}" aria-label="Restar">−</button>
          <span>${qty}</span>
          <button data-qty-plus="${p.id}" aria-label="Sumar">+</button>
        </div>
      </div>
      <div class="cart-item-right">
        <span class="cart-item-total">${money(p.price * qty)}</span>
        <button class="link-remove" data-remove="${p.id}">Quitar</button>
      </div>
    </div>`).join('');

  foot.hidden = false;
  document.getElementById('cart-subtotal').textContent = money(cartSubtotal());
}

function openCart(open) {
  document.getElementById('cart-drawer').classList.toggle('open', open);
  document.getElementById('overlay').classList.toggle('open', open);
}

// ---------------------------------------------------------------- checkout

function openCheckout(open) {
  const modal = document.getElementById('checkout-modal');
  modal.classList.toggle('open', open);
  if (open) {
    document.getElementById('checkout-form-view').hidden = false;
    document.getElementById('checkout-success-view').hidden = true;
    document.getElementById('checkout-error').classList.remove('show');
    document.getElementById('checkout-total').textContent = money(cartSubtotal());
  }
}

async function submitCheckout(event) {
  event.preventDefault();
  const errorBox = document.getElementById('checkout-error');
  errorBox.classList.remove('show');

  const submitBtn = document.getElementById('checkout-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Procesando…';

  try {
    const payload = {
      customer: {
        name: document.getElementById('co-name').value,
        email: document.getElementById('co-email').value,
        address: document.getElementById('co-address').value,
      },
      items: cartEntries().map((e) => ({ id: e.product.id, qty: e.qty })),
    };
    const result = await Api.checkout(payload);

    state.cart = {};
    saveCart();
    await loadProducts(); // refresca stock

    document.getElementById('checkout-form-view').hidden = true;
    document.getElementById('checkout-success-view').hidden = false;
    document.getElementById('checkout-success-msg').textContent =
      `Tu pedido N.º ${result.orderId} por ${money(result.total)} fue registrado. Te contactaremos al correo indicado para coordinar pago y despacho.`;
    document.getElementById('checkout-form').reset();
    openCart(false);
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.add('show');
    if (err.status === 409) await loadProducts(); // stock cambió: refrescar
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Confirmar pedido';
  }
}

// ---------------------------------------------------------------- carga inicial

async function loadProducts() {
  state.products = await Api.getProducts();
  // Ajusta el carrito si el stock bajó o un producto desapareció
  for (const [id, qty] of Object.entries(state.cart)) {
    const p = productById(id);
    if (!p || p.stock <= 0) delete state.cart[id];
    else if (qty > p.stock) state.cart[id] = p.stock;
  }
  saveCart();
  renderCategories();
  renderGrid();
  renderCart();
}

async function loadSettings() {
  const settings = await Api.getSettings();
  const bar = document.getElementById('announcement');
  if (settings.announcement_active === '1' && settings.announcement_text) {
    bar.textContent = settings.announcement_text;
    bar.hidden = false;
  } else {
    bar.hidden = true;
  }
}

// ---------------------------------------------------------------- eventos

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-add], [data-qty-plus], [data-qty-minus], [data-remove], [data-category], [data-close-checkout]');
  if (!target) return;

  if (target.dataset.add) addToCart(Number(target.dataset.add));
  else if (target.dataset.qtyPlus) setQty(Number(target.dataset.qtyPlus), (state.cart[target.dataset.qtyPlus] || 0) + 1);
  else if (target.dataset.qtyMinus) setQty(Number(target.dataset.qtyMinus), (state.cart[target.dataset.qtyMinus] || 0) - 1);
  else if (target.dataset.remove) setQty(Number(target.dataset.remove), 0);
  else if (target.dataset.category) {
    state.category = target.dataset.category;
    renderCategories();
    renderGrid();
  }
  else if (target.hasAttribute('data-close-checkout')) openCheckout(false);
});

document.getElementById('cart-open').addEventListener('click', () => openCart(true));
document.getElementById('cart-close').addEventListener('click', () => openCart(false));
document.getElementById('overlay').addEventListener('click', () => openCart(false));
document.getElementById('checkout-open').addEventListener('click', () => {
  if (!cartEntries().length) return;
  openCheckout(true);
});
document.getElementById('checkout-form').addEventListener('submit', submitCheckout);

document.getElementById('search-input').addEventListener('input', (e) => {
  state.search = e.target.value.trim();
  renderGrid();
});
document.getElementById('filter-sale').addEventListener('change', (e) => {
  state.onlySale = e.target.checked;
  renderGrid();
});
document.getElementById('sort-select').addEventListener('change', (e) => {
  state.sort = e.target.value;
  renderGrid();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { openCart(false); openCheckout(false); }
});

// init
loadSettings();
loadProducts().catch(() => {
  document.getElementById('product-grid').innerHTML =
    '<div class="empty-state">No se pudo cargar el catálogo. Verifica que el servidor esté activo.</div>';
});
