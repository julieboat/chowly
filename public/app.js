// Application State
let menuCatalog = [];
let staffDirectory = { waiters: [], chefs: [], bartenders: [] };
let activeCart = {};
let selectedCategory = 'all';
let currentSearchTerm = '';
let ordersCache = [];

// Session Storage for Customer Orders (ensures customer only sees their own table's orders)
function getMySessionOrderIds() {
  try {
    return JSON.parse(localStorage.getItem('chowly_my_orders')) || [];
  } catch (e) {
    return [];
  }
}

function saveOrderToSession(orderId) {
  const current = getMySessionOrderIds();
  if (!current.includes(orderId)) {
    current.push(orderId);
    localStorage.setItem('chowly_my_orders', JSON.stringify(current));
  }
}

// DOM Initialization
document.addEventListener('DOMContentLoaded', async () => {
  await fetchMenu();
  await fetchStaff();
  await loadCustomerOrders();
  await loadWaiterOrders();
});

// Toast Feedback System
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Role Switcher
function switchRole(role) {
  const customerView = document.getElementById('customerView');
  const waiterView = document.getElementById('waiterView');
  const btnCust = document.getElementById('btnRoleCustomer');
  const btnWaiter = document.getElementById('btnRoleWaiter');

  if (role === 'customer') {
    customerView.classList.remove('hidden');
    waiterView.classList.add('hidden');
    btnCust.classList.add('active');
    btnWaiter.classList.remove('active');
    loadCustomerOrders();
  } else {
    customerView.classList.add('hidden');
    waiterView.classList.remove('hidden');
    btnCust.classList.remove('active');
    btnWaiter.classList.add('active');
    loadWaiterOrders();
  }
}

// Customer View Tab Switching
function switchCustomerTab(tab) {
  const tabMenu = document.getElementById('tabContentMenu');
  const tabTracker = document.getElementById('tabContentTracker');
  const btnMenu = document.getElementById('tabBtnMenu');
  const btnTracker = document.getElementById('tabBtnTracker');

  if (tab === 'menu') {
    tabMenu.classList.add('active');
    tabTracker.classList.remove('active');
    btnMenu.classList.add('active');
    btnTracker.classList.remove('active');
  } else {
    tabMenu.classList.remove('active');
    tabTracker.classList.add('active');
    btnMenu.classList.remove('active');
    btnTracker.classList.add('active');
    loadCustomerOrders();
  }
}

// Data Fetching
async function fetchMenu() {
  try {
    const res = await fetch('/api/menu');
    menuCatalog = await res.json();
    renderMenu();
  } catch (err) {
    showToast('Failed to load menu.', 'error');
  }
}

async function fetchStaff() {
  try {
    const res = await fetch('/api/staff');
    const data = await res.json();
    staffDirectory.waiters = data.waiters || [];
    staffDirectory.chefs = data.chefs || [];
    staffDirectory.bartenders = data.bartenders || [];
  } catch (err) {
    showToast('Failed to load staff directory.', 'error');
  }
}

// Menu Filtering & Search
function filterMenu(category, btnElement) {
  selectedCategory = category;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  renderMenu();
}

function handleMenuSearch() {
  currentSearchTerm = document.getElementById('menuSearchInput').value.toLowerCase().trim();
  renderMenu();
}

function renderMenu() {
  const grid = document.getElementById('menuCardsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const filtered = menuCatalog.filter(item => {
    const matchesCategory = (selectedCategory === 'all' || item.category === selectedCategory);
    const matchesSearch = item.name.toLowerCase().includes(currentSearchTerm) || 
                          (item.description && item.description.toLowerCase().includes(currentSearchTerm));
    return matchesCategory && matchesSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 2rem;">No matching menu items.</p>`;
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'food-card';
    card.innerHTML = `
      <div class="food-card-img-wrapper">
        <img src="${item.image_url}" alt="${item.name}" class="food-card-img" loading="lazy" />
        <span class="category-pill-overlay ${item.category}">${item.category}</span>
      </div>

      <div class="food-card-body">
        <div>
          <h4 class="food-name">${item.name}</h4>
          <p class="food-desc">${item.description || ''}</p>
        </div>

        <div class="card-bottom">
          <div class="price-prep">
            <span class="price">₦${Number(item.price).toLocaleString()}</span>
            <span class="time-chip">⏱️ ~${item.prep_time_minutes} mins</span>
          </div>
          <button class="add-btn" onclick="addToCart(${item.id})">+ Add</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// Cart Logic
function addToCart(itemId) {
  const item = menuCatalog.find(i => i.id === itemId);
  if (!item) return;

  if (activeCart[itemId]) {
    activeCart[itemId].qty += 1;
  } else {
    activeCart[itemId] = { item, qty: 1 };
  }
  updateCartUI();
  showToast(`Added ${item.name}!`, 'success');
}

function updateCartQty(itemId, delta) {
  if (!activeCart[itemId]) return;
  activeCart[itemId].qty += delta;
  if (activeCart[itemId].qty <= 0) {
    delete activeCart[itemId];
  }
  updateCartUI();
}

function updateCartUI() {
  const container = document.getElementById('cartItemsList');
  const items = Object.values(activeCart);

  const totalCount = items.reduce((sum, entry) => sum + entry.qty, 0);
  document.getElementById('cartCountTag').textContent = `${totalCount} item${totalCount !== 1 ? 's' : ''}`;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="cart-empty-placeholder">
        <span class="empty-icon">🛒</span>
        <p>Your tray is empty.</p>
        <small>Select food or drinks to begin your order.</small>
      </div>
    `;
    document.getElementById('cartWaitDisplay').textContent = '~0 mins';
    document.getElementById('cartTotalDisplay').textContent = '₦0.00';
    return;
  }

  container.innerHTML = '';
  let subtotal = 0;
  let maxPrepTime = 0;

  items.forEach(({ item, qty }) => {
    subtotal += Number(item.price) * qty;
    if (item.prep_time_minutes > maxPrepTime) maxPrepTime = item.prep_time_minutes;

    const row = document.createElement('div');
    row.className = 'cart-line-item';
    row.innerHTML = `
      <div class="item-main">
        <strong>${item.name}</strong>
        <small>₦${Number(item.price).toLocaleString()} × ${qty}</small>
      </div>
      <div class="qty-control">
        <button class="qty-btn" onclick="updateCartQty(${item.id}, -1)">−</button>
        <span style="font-weight: 700; font-size: 0.85rem;">${qty}</span>
        <button class="qty-btn" onclick="updateCartQty(${item.id}, 1)">+</button>
      </div>
    `;
    container.appendChild(row);
  });

  document.getElementById('cartWaitDisplay').textContent = `~${maxPrepTime} mins`;
  document.getElementById('cartTotalDisplay').textContent = `₦${subtotal.toLocaleString()}`;
}

// Order Submission
async function submitCustomerOrder() {
  const nameInput = document.getElementById('custName');
  const seatInput = document.getElementById('custSeat');

  const name = nameInput.value.trim();
  const seat = seatInput.value.trim();
  const items = Object.values(activeCart).map(c => ({
    menu_item_id: c.item.id,
    quantity: c.qty
  }));

  if (!name || !seat) {
    showToast('Please enter your Name and Seat Number first!', 'warning');
    nameInput.focus();
    return;
  }

  if (items.length === 0) {
    showToast('Select at least one dish or drink from the menu.', 'warning');
    return;
  }

  const submitBtn = document.getElementById('btnOrderSubmit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_name: name, seat_number: parseInt(seat), items })
    });

    if (res.ok) {
      const placedOrder = await res.json();
      saveOrderToSession(placedOrder.id);

      activeCart = {};
      updateCartUI();
      showToast('Order received by the kitchen!', 'success');
      switchCustomerTab('tracker');
      await loadCustomerOrders();
    } else {
      const err = await res.json();
      showToast(err.error || 'Failed to place order.', 'error');
    }
  } catch (err) {
    showToast('Server connection failed.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Order to Kitchen ➔';
  }
}

// Customer Tracker (Scoped to Active Session Table)
async function loadCustomerOrders() {
  const container = document.getElementById('customerOrdersFeed');
  if (!container) return;

  try {
    const res = await fetch('/api/orders');
    ordersCache = await res.json();

    const myOrderIds = getMySessionOrderIds();
    const currentName = (document.getElementById('custName').value || '').trim().toLowerCase();
    const currentSeat = (document.getElementById('custSeat').value || '').trim();

    const myOrders = ordersCache.filter(o => {
      const isSessionId = myOrderIds.includes(o.id);
      const isMatchingProfile = currentName && (o.customer_name.toLowerCase() === currentName) && (!currentSeat || String(o.seat_number) === String(currentSeat));
      return isSessionId || isMatchingProfile;
    });

    const badge = document.getElementById('activeOrderBadge');
    if (myOrders.length > 0) {
      badge.textContent = myOrders.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    if (myOrders.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: #94a3b8; padding: 2.5rem 1rem;">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem;">🍽️</span>
          <p style="font-weight: 600; color: #475569;">No active orders for your table.</p>
          <small>Enter your name & seat above, then choose your meal from the menu tab.</small>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    myOrders.forEach(order => {
      const isReceived = order.status === 'Received';
      const isServed = order.status === 'Served';
      const isPaid = order.status === 'Paid';

      const itemsStr = order.items && order.items.length > 0 
        ? order.items.map(i => `${i.quantity}x ${i.name}`).join(', ') 
        : 'Assorted dishes';

      const card = document.createElement('div');
      card.className = 'order-tracker-card';
      card.innerHTML = `
        <div class="tracker-head">
          <div>
            <span class="order-badge-title">Order #${order.id} • Seat ${order.seat_number}</span>
            <span style="font-size: 0.85rem; color: #64748b; margin-left: 8px;">(${order.customer_name})</span>
          </div>
          <span class="badge-status ${order.status.toLowerCase()}">${order.status}</span>
        </div>

        <div class="order-stepper">
          <div class="step-node completed">
            <div class="step-icon">✓</div>
            <div class="step-label">Received</div>
          </div>
          <div class="step-node ${isServed || isPaid ? 'completed' : isReceived ? 'active' : ''}">
            <div class="step-icon">${isServed || isPaid ? '✓' : '🍳'}</div>
            <div class="step-label">Kitchen Prep</div>
          </div>
          <div class="step-node ${isPaid ? 'completed' : isServed ? 'active' : ''}">
            <div class="step-icon">${isPaid ? '✓' : '🍽️'}</div>
            <div class="step-label">Served</div>
          </div>
          <div class="step-node ${isPaid ? 'completed' : ''}">
            <div class="step-icon">${isPaid ? '✓' : '💳'}</div>
            <div class="step-label">Paid</div>
          </div>
        </div>

        <div class="order-info-columns">
          <div><strong>Items:</strong> ${itemsStr}</div>
          <div><strong>Estimated Wait:</strong> ⏱️ ~${order.estimated_waiting_time} mins</div>
          <div><strong>Total Amount:</strong> ₦${Number(order.total_amount).toLocaleString()}</div>
          <div><strong>Assigned Waiter:</strong> ${order.waiter_name || 'Kitchen Dispatching...'}</div>
          <div><strong>Chef / Bartender:</strong> ${order.chef_name || 'Kitchen Desk'} / ${order.bartender_name || 'Bar station'}</div>
        </div>

        ${order.rating ? `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; margin-bottom: 12px; font-size: 0.85rem;">
            <strong>Your Feedback:</strong> ⭐ ${order.rating}/5 — "${order.complaint || 'No complaint text'}"
          </div>
        ` : ''}

        <div class="order-actions-bar">
          ${!order.rating ? `
            <button class="btn-secondary" onclick="openComplaintModal(${order.id})">Delay / Complaint</button>
          ` : ''}
          <button class="btn-success" onclick="openReceiptModal(${order.id})">
            ${isPaid ? '🧾 View Receipt (Paid)' : '💳 Checkout / Pay (Pretend)'}
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    showToast('Failed to update orders.', 'error');
  }
}

// Waiter Orders Queue (Full visibility for restaurant staff)
async function loadWaiterOrders() {
  const container = document.getElementById('waiterOrdersQueue');
  if (!container) return;

  try {
    const res = await fetch('/api/orders');
    const orders = await res.json();

    if (orders.length === 0) {
      container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 2rem;">No orders currently in the kitchen queue.</p>`;
      return;
    }

    container.innerHTML = '';
    orders.forEach(order => {
      const itemsList = order.items && order.items.length > 0
        ? order.items.map(i => `<li>${i.quantity}x ${i.name}</li>`).join('')
        : '<li>Assorted order items</li>';

      // Distinguish positive praise (4-5 stars) from delay complaints (1-3 stars)
      const hasFeedback = order.rating || order.complaint;
      const isPositive = order.rating >= 4;
      const feedbackType = isPositive ? 'positive' : 'negative';
      const feedbackLabel = isPositive ? '💬 Guest Comment' : '⚠️ Delay Complaint';
      const badgeText = isPositive ? '💬 Comment' : '⚠️ Complaint';

      // Check if order has been finalized (paid or customer has left)
      const isFinalized = order.status === 'Paid' || order.customer_status === 'Left';

      const waiterOpts = (staffDirectory.waiters || []).map(w => `<option value="${w.id}" ${order.waiter_id === w.id ? 'selected' : ''}>${w.name}</option>`).join('');
      const chefOpts = (staffDirectory.chefs || []).map(c => `<option value="${c.id}" ${order.chef_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
      const barOpts = (staffDirectory.bartenders || []).map(b => `<option value="${b.id}" ${order.bartender_id === b.id ? 'selected' : ''}>${b.name}</option>`).join('');

      const card = document.createElement('div');
      card.className = 'waiter-card';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong>Order #${order.id} (Seat ${order.seat_number})</strong>
          <div style="display: flex; align-items: center;">
            ${hasFeedback ? `<span class="feedback-badge ${feedbackType}">${badgeText}</span>` : ''}
            <span class="badge-status ${order.status.toLowerCase()}">${order.status}</span>
          </div>
        </div>
        <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 8px;">
          Customer: <strong>${order.customer_name}</strong> • Dining Status: <strong>${order.customer_status || 'In'}</strong>
        </p>

        <!-- Feedback Alert: Green for Compliments, Red for Delay Complaints -->
        ${hasFeedback ? `
          <div class="waiter-feedback-alert ${feedbackType}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <strong>${feedbackLabel}</strong>
              <span style="font-weight: 700;">⭐ ${order.rating || 'N/A'}/5</span>
            </div>
            <p style="margin: 0; font-style: italic;">"${order.complaint || 'No additional comment provided.'}"</p>
          </div>
        ` : ''}
        
        <ul style="font-size: 0.85rem; padding-left: 1.2rem; margin-bottom: 12px; color: #334155;">
          ${itemsList}
        </ul>

        <!-- Only display dropdowns if the order is still active; if finalized, show completed summary -->
        ${!isFinalized ? `
          <form onsubmit="handleStaffAssignment(event, ${order.id})">
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div>
                <label style="font-size: 0.72rem; font-weight: 700; color: #64748b;">ASSIGN WAITER</label>
                <select id="w_waiter_${order.id}" required>
                  <option value="">Choose Waiter</option>
                  ${waiterOpts}
                </select>
              </div>
              <div>
                <label style="font-size: 0.72rem; font-weight: 700; color: #64748b;">PREPARING CHEF</label>
                <select id="w_chef_${order.id}" required>
                  <option value="">Choose Chef</option>
                  ${chefOpts}
                </select>
              </div>
              <div>
                <label style="font-size: 0.72rem; font-weight: 700; color: #64748b;">PREPARING BARTENDER</label>
                <select id="w_bar_${order.id}" required>
                  <option value="">Choose Bartender</option>
                  ${barOpts}
                </select>
              </div>
            </div>
            <button type="submit" class="btn-primary full-btn" style="margin-top: 12px;">
              Save Staff & Mark as Served
            </button>
          </form>
        ` : `
          <div class="completed-staff-summary">
            <div><strong>Served By:</strong> ${order.waiter_name || 'Staff'}</div>
            <div><strong>Chef:</strong> ${order.chef_name || 'Kitchen Desk'}</div>
            <div><strong>Bartender:</strong> ${order.bartender_name || 'Bar Station'}</div>
            <div class="order-closed-tag">✅ Order Paid & Table Closed</div>
          </div>
        `}
      `;
      container.appendChild(card);
    });
  } catch (err) {
    showToast('Failed to load kitchen dispatch queue.', 'error');
  }
}

// User-Triggered Refresh Handlers
async function manualRefreshTimeline() {
  const btn = document.getElementById('btnRefreshTimeline');
  if (btn) btn.textContent = '⏳ Refreshing...';

  try {
    await loadCustomerOrders();
    showToast('Order timeline updated!', 'info');
  } catch (err) {
    showToast('Failed to refresh timeline.', 'error');
  } finally {
    if (btn) btn.textContent = '🔄 Refresh Timeline';
  }
}

async function manualRefreshQueue() {
  const btn = document.getElementById('btnRefreshQueue');
  if (btn) btn.textContent = '⏳ Refreshing...';

  try {
    await loadWaiterOrders();
    showToast('Kitchen queue updated!', 'info');
  } catch (err) {
    showToast('Failed to refresh queue.', 'error');
  } finally {
    if (btn) btn.textContent = '🔄 Refresh Kitchen Queue';
  }
}

// Staff Assignment Handler
async function handleStaffAssignment(e, orderId) {
  e.preventDefault();
  const waiter_id = document.getElementById(`w_waiter_${orderId}`).value;
  const chef_id = document.getElementById(`w_chef_${orderId}`).value;
  const bartender_id = document.getElementById(`w_bar_${orderId}`).value;

  try {
    const res = await fetch(`/api/orders/${orderId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waiter_id, chef_id, bartender_id })
    });

    if (res.ok) {
      showToast(`Order #${orderId} marked as Served!`, 'success');
      await loadWaiterOrders();
    } else {
      const err = await res.json();
      showToast(err.error || 'Assignment failed', 'error');
    }
  } catch (err) {
    showToast('Server connection error.', 'error');
  }
}

// Modals Handling
function openComplaintModal(orderId) {
  document.getElementById('modalOrderId').value = orderId;
  document.getElementById('complaintModal').classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

async function submitCustomerFeedback() {
  const orderId = document.getElementById('modalOrderId').value;
  const rating = document.getElementById('modalRating').value;
  const complaint = document.getElementById('modalComplaintText').value.trim();

  try {
    const res = await fetch(`/api/orders/${orderId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: parseInt(rating), complaint })
    });

    if (res.ok) {
      showToast('Feedback recorded successfully.', 'success');
      closeModal('complaintModal');
      await loadCustomerOrders();
    }
  } catch (err) {
    showToast('Error recording feedback.', 'error');
  }
}

function openReceiptModal(orderId) {
  const order = ordersCache.find(o => o.id === orderId);
  if (!order) return;

  document.getElementById('recOrderId').textContent = order.id;
  document.getElementById('recCustomer').textContent = order.customer_name;
  document.getElementById('recSeat').textContent = order.seat_number;
  document.getElementById('recStatus').textContent = order.status;
  document.getElementById('recWaiter').textContent = order.waiter_name || 'Unassigned';
  document.getElementById('recChef').textContent = order.chef_name || 'Kitchen Desk';

  const itemsContainer = document.getElementById('recItemsList');
  itemsContainer.innerHTML = '';
  if (order.items && order.items.length > 0) {
    order.items.forEach(i => {
      const line = document.createElement('div');
      line.className = 'receipt-line';
      line.innerHTML = `<span>${i.quantity}x ${i.name}</span><span>₦${(Number(i.price) * i.quantity).toLocaleString()}</span>`;
      itemsContainer.appendChild(line);
    });
  }

  const totalFormatted = `₦${Number(order.total_amount).toLocaleString()}`;
  document.getElementById('recSubtotal').textContent = totalFormatted;
  document.getElementById('recTotal').textContent = totalFormatted;

  const btnPay = document.getElementById('btnPayAction');
  if (order.status === 'Paid') {
    btnPay.style.display = 'none';
  } else {
    btnPay.style.display = 'block';
    btnPay.onclick = () => confirmPretendPayment(order.id);
  }

  document.getElementById('receiptModal').classList.remove('hidden');
}

async function confirmPretendPayment(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}/pay`, { method: 'POST' });
    if (res.ok) {
      showToast(`Pretend payment complete! Dining status: Left.`, 'success');
      closeModal('receiptModal');
      await loadCustomerOrders();
    } else {
      showToast('Payment processing failed.', 'error');
    }
  } catch (err) {
    showToast('Payment server error.', 'error');
  }
}