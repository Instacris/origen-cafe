'use strict';

/* ================================================================
   ORIGEN Café — panel administrativo
   ================================================================ */

const AdminApi = {
  async request(method, url, body) {
    const options = { method, headers: {} };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Error de servidor.');
      err.status = res.status;
      throw err;
    }
    return data;
  },
  me() { return this.request('GET', '/api/admin/me'); },
  login(username, password) { return this.request('POST', '/api/admin/login', { username, password }); },
  logout() { return this.request('POST', '/api/admin/logout'); },
  getProducts() { return this.request('GET', '/api/admin/products'); },
  createProduct(data) { return this.request('POST', '/api/admin/products', data); },
  updateProduct(id, data) { return this.request('PUT', `/api/admin/products/${id}`, data); },
  deleteProduct(id) { return this.request('DELETE', `/api/admin/products/${id}`); },
  getOrders() { return this.request('GET', '/api/admin/orders'); },
  updateOrder(id, status) { return this.request('PUT', `/api/admin/orders/${id}`, { status }); },
  getReservations() { return this.request('GET', '/api/admin/reservations'); },
  updateReservation(id, status) { return this.request('PUT', `/api/admin/reservations/${id}`, { status }); },
  getSettings() { return this.request('GET', '/api/settings'); },
  updateSettings(data) { return this.request('PUT', '/api/admin/settings', data); },
  changePassword(current, next) { return this.request('PUT', '/api/admin/password', { current, next }); },
  uploadImage(dataUrl) { return this.request('POST', '/api/admin/upload', { data: dataUrl }); },
};

const state = {
  products: [],
  orders: [],
  settings: {},
  search: '',
  categoryFilter: '',
  editingId: null,   // null = producto nuevo
  pendingImage: null, // dataURL pendiente de subir, o '' para quitar
};

// ---------------------------------------------------------------- utilidades

function money(n) {
  return '$' + Number(n).toLocaleString('es-CL');
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const PLACEHOLDER_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/>
    <line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>
  </svg>`;

let toastTimer;
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function showFormError(id, message) {
  const box = document.getElementById(id);
  if (message) {
    box.textContent = message;
    box.classList.add('show');
  } else {
    box.classList.remove('show');
  }
}

// ---------------------------------------------------------------- vistas

function showLogin() {
  document.getElementById('login-view').hidden = false;
  document.getElementById('panel-view').hidden = true;
}

async function showPanel(username) {
  document.getElementById('login-view').hidden = true;
  document.getElementById('panel-view').hidden = false;
  document.getElementById('admin-username').textContent = username;
  await refreshAll();
}

async function refreshAll() {
  const [products, orders, reservations, settings] = await Promise.all([
    AdminApi.getProducts(),
    AdminApi.getOrders(),
    AdminApi.getReservations(),
    AdminApi.getSettings(),
  ]);
  state.products = products;
  state.orders = orders;
  state.reservations = reservations;
  state.settings = settings;
  renderStats();
  renderCategoryOptions();
  renderProductsTable();
  renderOrdersTable();
  renderReservationsTable();
  renderSettingsForm();
}

// ---------------------------------------------------------------- estadísticas

function renderStats() {
  const active = state.products.filter((p) => p.active);
  const onSale = active.filter((p) => p.on_sale).length;
  const lowStock = active.filter((p) => p.stock > 0 && p.stock <= 5).length;
  const outStock = active.filter((p) => p.stock <= 0).length;
  const pending = state.orders.filter((o) => o.status === 'pendiente').length;
  const pendingReservations = (state.reservations || []).filter((r) => r.status === 'pendiente').length;

  document.getElementById('stats-row').innerHTML = `
    <div class="stat-card"><div class="stat-label">Productos visibles</div><div class="stat-value">${active.length}</div></div>
    <div class="stat-card"><div class="stat-label">En oferta</div><div class="stat-value">${onSale}</div></div>
    <div class="stat-card ${lowStock ? 'alert' : ''}"><div class="stat-label">Stock bajo (≤5)</div><div class="stat-value">${lowStock}</div></div>
    <div class="stat-card ${outStock ? 'alert' : ''}"><div class="stat-label">Agotados</div><div class="stat-value">${outStock}</div></div>
    <div class="stat-card ${pending ? 'alert' : ''}"><div class="stat-label">Pedidos pendientes</div><div class="stat-value">${pending}</div></div>
    <div class="stat-card ${pendingReservations ? 'alert' : ''}"><div class="stat-label">Reservas pendientes</div><div class="stat-value">${pendingReservations}</div></div>`;
}

// ---------------------------------------------------------------- tabla de productos

function categories() {
  return [...new Set(state.products.map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'es'));
}

function renderCategoryOptions() {
  const filter = document.getElementById('admin-category-filter');
  const current = state.categoryFilter;
  filter.innerHTML = '<option value="">Todas las categorías</option>' +
    categories().map((c) => `<option value="${escapeHtml(c)}" ${c === current ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');

  document.getElementById('category-list').innerHTML =
    categories().map((c) => `<option value="${escapeHtml(c)}">`).join('');
}

function filteredProducts() {
  let list = [...state.products];
  if (state.categoryFilter) list = list.filter((p) => p.category === state.categoryFilter);
  if (state.search) {
    const q = state.search.toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }
  return list;
}

function renderProductsTable() {
  const tbody = document.getElementById('products-tbody');
  const list = filteredProducts();

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:34px">No hay productos que coincidan.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map((p) => {
    const stockClass = p.stock <= 0 ? 'zero' : (p.stock <= 5 ? 'low' : '');
    return `
    <tr data-id="${p.id}">
      <td>
        <div class="prod-cell">
          <div class="prod-thumb">${p.image ? `<img src="${escapeHtml(p.image)}" alt="">` : PLACEHOLDER_SVG}</div>
          <div>
            <div class="name">${escapeHtml(p.name)}</div>
            <div class="cat">${escapeHtml(p.category)}</div>
          </div>
        </div>
      </td>
      <td class="price-cell">
        ${money(p.price)}
        ${p.prev_price ? `<span class="old" title="Precio anterior">${money(p.prev_price)}</span>` : ''}
      </td>
      <td>
        <label class="switch sale-switch" title="En oferta">
          <input type="checkbox" data-toggle="on_sale" ${p.on_sale ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </td>
      <td><input type="number" class="stock-input ${stockClass}" data-stock min="0" step="1" value="${p.stock}"></td>
      <td>
        <label class="switch" title="Destacado">
          <input type="checkbox" data-toggle="featured" ${p.featured ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <label class="switch" title="Visible en la tienda">
          <input type="checkbox" data-toggle="active" ${p.active ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <div class="row-actions">
          <button class="btn btn-outline btn-sm" data-edit>Editar</button>
          <button class="btn btn-outline btn-sm" data-delete style="color:var(--sale)">Eliminar</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function patchProduct(id, patch, successMsg) {
  try {
    const updated = await AdminApi.updateProduct(id, patch);
    const idx = state.products.findIndex((p) => p.id === id);
    if (idx >= 0) state.products[idx] = updated;
    renderStats();
    renderProductsTable();
    if (successMsg) showToast(successMsg);
  } catch (err) {
    showToast(err.message, true);
    renderProductsTable(); // revierte el estado visual
  }
}

// ---------------------------------------------------------------- modal de producto

function openProductModal(product) {
  state.editingId = product ? product.id : null;
  state.pendingImage = null;

  document.getElementById('product-modal-title').textContent =
    product ? 'Editar producto' : 'Nuevo producto';
  showFormError('product-error', '');

  document.getElementById('pf-name').value = product?.name || '';
  document.getElementById('pf-category').value = product?.category || '';
  document.getElementById('pf-description').value = product?.description || '';
  document.getElementById('pf-price').value = product?.price ?? '';
  document.getElementById('pf-prev-price').value = product?.prev_price ?? '';
  document.getElementById('pf-stock').value = product?.stock ?? 0;
  document.getElementById('pf-on-sale').checked = !!product?.on_sale;
  document.getElementById('pf-featured').checked = !!product?.featured;
  document.getElementById('pf-active').checked = product ? !!product.active : true;
  document.getElementById('pf-image-file').value = '';

  updatePrevPriceVisibility();
  renderImagePreview(product?.image || null);
  document.getElementById('product-modal').classList.add('open');
  document.getElementById('pf-name').focus();
}

function closeProductModal() {
  document.getElementById('product-modal').classList.remove('open');
}

function updatePrevPriceVisibility() {
  const onSale = document.getElementById('pf-on-sale').checked;
  document.getElementById('pf-prev-wrap').hidden = !onSale;
  if (onSale && !document.getElementById('pf-prev-price').value) {
    // sugiere el precio actual como "precio anterior"
    document.getElementById('pf-prev-price').value = document.getElementById('pf-price').value || '';
  }
}

function renderImagePreview(src) {
  const preview = document.getElementById('pf-img-preview');
  const removeBtn = document.getElementById('pf-image-remove');
  if (src) {
    preview.innerHTML = `<img src="${escapeHtml(src)}" alt="Vista previa">`;
    removeBtn.hidden = false;
  } else {
    preview.textContent = 'Sin imagen — se mostrará un ícono de la categoría';
    removeBtn.hidden = true;
  }
}

function currentEditingProduct() {
  return state.products.find((p) => p.id === state.editingId) || null;
}

async function saveProduct(event) {
  event.preventDefault();
  showFormError('product-error', '');
  const saveBtn = document.getElementById('product-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando…';

  try {
    const onSale = document.getElementById('pf-on-sale').checked;
    const prevRaw = document.getElementById('pf-prev-price').value;
    const data = {
      name: document.getElementById('pf-name').value,
      category: document.getElementById('pf-category').value,
      description: document.getElementById('pf-description').value,
      price: Number(document.getElementById('pf-price').value),
      stock: Number(document.getElementById('pf-stock').value),
      on_sale: onSale,
      prev_price: onSale && prevRaw !== '' ? Number(prevRaw) : (prevRaw !== '' ? Number(prevRaw) : null),
      featured: document.getElementById('pf-featured').checked,
      active: document.getElementById('pf-active').checked,
    };

    if (onSale && data.prev_price !== null && data.prev_price <= data.price) {
      throw new Error('Para mostrar la oferta, el precio anterior debe ser mayor que el precio actual.');
    }

    // Imagen: subir si hay una pendiente; quitar si se pidió quitar
    if (state.pendingImage) {
      const uploaded = await AdminApi.uploadImage(state.pendingImage);
      data.image = uploaded.path;
    } else if (state.pendingImage === '') {
      data.image = null;
    }

    if (state.editingId) {
      await AdminApi.updateProduct(state.editingId, data);
      showToast('Producto actualizado.');
    } else {
      await AdminApi.createProduct(data);
      showToast('Producto creado.');
    }

    closeProductModal();
    state.products = await AdminApi.getProducts();
    renderStats();
    renderCategoryOptions();
    renderProductsTable();
  } catch (err) {
    showFormError('product-error', err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar producto';
  }
}

// ---------------------------------------------------------------- pedidos

const STATUS_OPTIONS = ['pendiente', 'enviado', 'completado', 'cancelado'];

function renderOrdersTable() {
  const tbody = document.getElementById('orders-tbody');
  if (!state.orders.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:34px">Aún no hay pedidos registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = state.orders.map((o) => `
    <tr>
      <td><strong>#${o.id}</strong></td>
      <td style="white-space:nowrap">${escapeHtml(o.created_at)}</td>
      <td>
        <div style="font-weight:600">${escapeHtml(o.customer_name)}</div>
        <div style="font-size:0.78rem; color:var(--muted)">${escapeHtml(o.customer_email)}</div>
        <div style="font-size:0.78rem; color:var(--muted)">${escapeHtml(o.customer_address)}</div>
      </td>
      <td>
        <ul class="order-items">
          ${o.items.map((i) => `<li>${i.qty} × ${escapeHtml(i.product_name)} (${money(i.unit_price)})</li>`).join('')}
        </ul>
      </td>
      <td class="price-cell">${money(o.total)}</td>
      <td>
        <select class="select" data-order-status="${o.id}" style="padding:6px 10px; font-size:0.82rem">
          ${STATUS_OPTIONS.map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('');
}

// ---------------------------------------------------------------- reservas

const RESERVATION_STATUSES = ['pendiente', 'confirmada', 'completada', 'cancelada'];

function renderReservationsTable() {
  const tbody = document.getElementById('reservations-tbody');
  if (!tbody) return;
  const rows = state.reservations || [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:34px">Aún no hay reservas registradas.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td><strong>#${r.id}</strong></td>
      <td style="white-space:nowrap"><strong>${escapeHtml(r.date)}</strong> · ${escapeHtml(r.time)} h</td>
      <td>
        <div style="font-weight:600">${escapeHtml(r.name)}</div>
        <div style="font-size:0.78rem; color:var(--muted)">${escapeHtml(r.contact)}</div>
      </td>
      <td style="text-align:center">${r.people}</td>
      <td style="font-size:0.82rem; color:var(--ink-soft)">${escapeHtml(r.note || '—')}</td>
      <td style="white-space:nowrap; font-size:0.8rem; color:var(--muted)">${escapeHtml(r.created_at)}</td>
      <td>
        <select class="select" data-reservation-status="${r.id}" style="padding:6px 10px; font-size:0.82rem">
          ${RESERVATION_STATUSES.map((s) => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('');
}

// ---------------------------------------------------------------- ajustes

function renderSettingsForm() {
  document.getElementById('set-announcement').value = state.settings.announcement_text || '';
  document.getElementById('set-announcement-active').checked = state.settings.announcement_active === '1';
}

// ---------------------------------------------------------------- eventos

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  showFormError('login-error', '');
  const btn = document.getElementById('login-submit');
  btn.disabled = true;
  btn.textContent = 'Ingresando…';
  try {
    const result = await AdminApi.login(
      document.getElementById('login-user').value,
      document.getElementById('login-pass').value
    );
    await showPanel(result.username);
  } catch (err) {
    showFormError('login-error', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await AdminApi.logout().catch(() => {});
  showLogin();
});

// pestañas
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    for (const name of ['products', 'orders', 'reservations', 'settings']) {
      document.getElementById(`tab-${name}`).hidden = name !== tab.dataset.tab;
    }
  });
});

// tabla de productos: delegación de eventos
document.getElementById('products-tbody').addEventListener('change', (event) => {
  const row = event.target.closest('tr[data-id]');
  if (!row) return;
  const id = Number(row.dataset.id);
  const product = state.products.find((p) => p.id === id);
  if (!product) return;

  if (event.target.matches('[data-toggle]')) {
    const field = event.target.dataset.toggle;
    const value = event.target.checked;

    if (field === 'on_sale' && value && (!product.prev_price || product.prev_price <= product.price)) {
      // Activar oferta sin precio anterior válido: abrir el editor con el flujo guiado
      event.target.checked = false;
      openProductModal(product);
      document.getElementById('pf-on-sale').checked = true;
      updatePrevPriceVisibility();
      showFormError('product-error', 'Define el nuevo precio de oferta. El precio anterior quedó pre-cargado con el precio actual.');
      document.getElementById('pf-price').focus();
      document.getElementById('pf-price').select();
      return;
    }

    const labels = {
      on_sale: value ? 'Producto marcado en oferta.' : 'Oferta desactivada (el precio anterior queda guardado).',
      featured: value ? 'Producto destacado.' : 'Producto ya no está destacado.',
      active: value ? 'Producto visible en la tienda.' : 'Producto oculto de la tienda.',
    };
    patchProduct(id, { [field]: value }, labels[field]);
  } else if (event.target.matches('[data-stock]')) {
    const stock = Math.max(0, Math.floor(Number(event.target.value) || 0));
    patchProduct(id, { stock }, `Stock de “${product.name}” actualizado a ${stock}.`);
  }
});

document.getElementById('products-tbody').addEventListener('click', async (event) => {
  const row = event.target.closest('tr[data-id]');
  if (!row) return;
  const id = Number(row.dataset.id);
  const product = state.products.find((p) => p.id === id);
  if (!product) return;

  if (event.target.closest('[data-edit]')) {
    openProductModal(product);
  } else if (event.target.closest('[data-delete]')) {
    if (!confirm(`¿Eliminar definitivamente “${product.name}”?\n\nSi solo quieres ocultarlo de la tienda, usa el interruptor “Visible”.`)) return;
    try {
      await AdminApi.deleteProduct(id);
      state.products = state.products.filter((p) => p.id !== id);
      renderStats();
      renderCategoryOptions();
      renderProductsTable();
      showToast('Producto eliminado.');
    } catch (err) {
      showToast(err.message, true);
    }
  }
});

document.getElementById('admin-search').addEventListener('input', (e) => {
  state.search = e.target.value.trim();
  renderProductsTable();
});

document.getElementById('admin-category-filter').addEventListener('change', (e) => {
  state.categoryFilter = e.target.value;
  renderProductsTable();
});

document.getElementById('new-product-btn').addEventListener('click', () => openProductModal(null));
document.getElementById('product-modal-close').addEventListener('click', closeProductModal);
document.getElementById('product-cancel').addEventListener('click', closeProductModal);
document.getElementById('product-form').addEventListener('submit', saveProduct);
document.getElementById('pf-on-sale').addEventListener('change', updatePrevPriceVisibility);

document.getElementById('pf-image-file').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showFormError('product-error', 'La imagen supera los 5 MB.');
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    state.pendingImage = reader.result;
    renderImagePreview(reader.result);
  };
  reader.readAsDataURL(file);
});

document.getElementById('pf-image-remove').addEventListener('click', () => {
  state.pendingImage = '';
  document.getElementById('pf-image-file').value = '';
  renderImagePreview(null);
});

document.getElementById('orders-tbody').addEventListener('change', async (event) => {
  if (!event.target.matches('[data-order-status]')) return;
  const id = Number(event.target.dataset.orderStatus);
  try {
    await AdminApi.updateOrder(id, event.target.value);
    const order = state.orders.find((o) => o.id === id);
    if (order) order.status = event.target.value;
    renderStats();
    showToast(`Pedido #${id} marcado como “${event.target.value}”.`);
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById('reservations-tbody').addEventListener('change', async (event) => {
  if (!event.target.matches('[data-reservation-status]')) return;
  const id = Number(event.target.dataset.reservationStatus);
  try {
    await AdminApi.updateReservation(id, event.target.value);
    const reservation = (state.reservations || []).find((r) => r.id === id);
    if (reservation) reservation.status = event.target.value;
    renderStats();
    showToast(`Reserva #${id} marcada como “${event.target.value}”.`);
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById('announcement-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    state.settings = await AdminApi.updateSettings({
      announcement_text: document.getElementById('set-announcement').value,
      announcement_active: document.getElementById('set-announcement-active').checked ? '1' : '0',
    });
    showToast('Anuncio actualizado.');
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById('password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  showFormError('password-error', '');
  const next = document.getElementById('pw-next').value;
  const confirm_ = document.getElementById('pw-confirm').value;
  if (next !== confirm_) {
    showFormError('password-error', 'Las contraseñas nuevas no coinciden.');
    return;
  }
  try {
    await AdminApi.changePassword(document.getElementById('pw-current').value, next);
    document.getElementById('password-form').reset();
    showToast('Contraseña actualizada correctamente.');
  } catch (err) {
    showFormError('password-error', err.message);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeProductModal();
});

// ---------------------------------------------------------------- init

(async () => {
  try {
    const session = await AdminApi.me();
    await showPanel(session.username);
  } catch {
    showLogin();
  }
})();
