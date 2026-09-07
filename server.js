const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve the frontend index.html on root request
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. Get Menu
app.get('/api/menu', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menu_items ORDER BY category DESC, id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve menu.' });
  }
});

// 2. Get Staff
app.get('/api/staff', async (req, res) => {
  try {
    const waiters = await pool.query('SELECT * FROM staff_waiters ORDER BY name');
    const chefs = await pool.query('SELECT * FROM staff_chefs ORDER BY name');
    const bartenders = await pool.query('SELECT * FROM staff_bartenders ORDER BY name');
    res.json({
      waiters: waiters.rows,
      chefs: chefs.rows,
      bartenders: bartenders.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve staff.' });
  }
});

// 3. Place Order
app.post('/api/orders', async (req, res) => {
  const { customer_name, seat_number, items } = req.body;

  if (!customer_name || !seat_number || !items || items.length === 0) {
    return res.status(400).json({ error: 'Name, seat number, and order items are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const custRes = await client.query(
      `INSERT INTO customers (name, seat_number, status) VALUES ($1, $2, 'In') RETURNING *`,
      [customer_name, seat_number]
    );
    const customer = custRes.rows[0];

    const itemIds = items.map(i => i.menu_item_id);
    const menuQuery = await client.query('SELECT id, price, prep_time_minutes FROM menu_items WHERE id = ANY($1::int[])', [itemIds]);
    const menuMap = new Map();
    menuQuery.rows.forEach(r => menuMap.set(r.id, r));

    let totalAmount = 0;
    let maxPrepTime = 0;

    for (const item of items) {
      const dbItem = menuMap.get(item.menu_item_id);
      if (dbItem) {
        totalAmount += Number(dbItem.price) * item.quantity;
        if (dbItem.prep_time_minutes > maxPrepTime) maxPrepTime = dbItem.prep_time_minutes;
      }
    }

    const orderRes = await client.query(
      `INSERT INTO orders (customer_id, table_number, estimated_waiting_time, total_amount, status)
       VALUES ($1, $2, $3, $4, 'Received')
       RETURNING *`,
      [customer.id, seat_number, maxPrepTime, totalAmount]
    );
    const newOrder = orderRes.rows[0];

    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, menu_item_id, quantity) VALUES ($1, $2, $3)',
        [newOrder.id, item.menu_item_id, item.quantity]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ...newOrder, customer_name: customer.name });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message || 'Failed to place order.' });
  } finally {
    client.release();
  }
});

// 4. Get Orders: Single Fast Aggregation Query (eliminates N+1 latency)
app.get('/api/orders', async (req, res) => {
  try {
    const fastQuery = `
      SELECT 
        o.id,
        o.customer_id,
        o.table_number,
        o.status,
        o.estimated_waiting_time,
        o.actual_waiting_time,
        o.total_amount,
        o.rating,
        o.complaint,
        o.created_at,
        c.name AS customer_name,
        c.seat_number,
        c.status AS customer_status,
        w.name AS waiter_name,
        ch.name AS chef_name,
        b.name AS bartender_name,
        p.payment_status,
        p.paid_at,
        COALESCE(
          json_agg(
            json_build_object(
              'quantity', oi.quantity,
              'name', m.name,
              'price', m.price,
              'category', m.category
            )
          ) FILTER (WHERE oi.id IS NOT NULL), '[]'
        ) AS items
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN staff_waiters w ON o.waiter_id = w.id
      LEFT JOIN staff_chefs ch ON o.chef_id = ch.id
      LEFT JOIN staff_bartenders b ON o.bartender_id = b.id
      LEFT JOIN payments p ON o.id = p.order_id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN menu_items m ON oi.menu_item_id = m.id
      GROUP BY o.id, c.id, c.name, c.seat_number, c.status, w.name, ch.name, b.name, p.payment_status, p.paid_at
      ORDER BY o.created_at DESC;
    `;
    const result = await pool.query(fastQuery);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

// 5. Staff Assignment
app.patch('/api/orders/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { waiter_id, chef_id, bartender_id, actual_waiting_time } = req.body;

  if (!waiter_id || !chef_id || !bartender_id) {
    return res.status(400).json({ error: 'Please select Waiter, Chef, and Bartender.' });
  }

  try {
    const result = await pool.query(
      `UPDATE orders
       SET waiter_id = $1, chef_id = $2, bartender_id = $3, actual_waiting_time = $4, status = 'Served'
       WHERE id = $5
       RETURNING *`,
      [waiter_id, chef_id, bartender_id, actual_waiting_time || 15, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign staff.' });
  }
});

// 6. Rating & Complaint
app.post('/api/orders/:id/feedback', async (req, res) => {
  const { id } = req.params;
  const { rating, complaint } = req.body;

  try {
    const result = await pool.query(
      `UPDATE orders SET rating = $1, complaint = $2 WHERE id = $3 RETURNING *`,
      [rating, complaint || null, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to record feedback.' });
  }
});

// 7. Pretend Payment
app.post('/api/orders/:id/pay', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderQ = await client.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderQ.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found.' });
    }
    const order = orderQ.rows[0];

    const paymentQ = await client.query(`
      INSERT INTO payments (order_id, amount, payment_status, payment_method)
      VALUES ($1, $2, 'Paid (Pretend)', 'Simulated Dining Terminal')
      ON CONFLICT (order_id) DO NOTHING
      RETURNING *
    `, [order.id, order.total_amount]);

    await client.query("UPDATE orders SET status = 'Paid' WHERE id = $1", [id]);
    await client.query("UPDATE customers SET status = 'Left' WHERE id = $1", [order.customer_id]);

    await client.query('COMMIT');
    res.json({ success: true, payment: paymentQ.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Payment simulation error.' });
  } finally {
    client.release();
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Chowly live at http://localhost:${PORT}`);
});