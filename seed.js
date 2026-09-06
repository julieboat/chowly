const pool = require('./db');

async function seedDatabase() {
  const client = await pool.connect();

  try {
    console.log('Optimizing schema and updating with accurate Nigerian culinary photography...');
    await client.query('BEGIN');

    await client.query(`
      DROP TABLE IF EXISTS payments CASCADE;
      DROP TABLE IF EXISTS order_items CASCADE;
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
      DROP TABLE IF EXISTS menu_items CASCADE;
      DROP TABLE IF EXISTS staff_waiters CASCADE;
      DROP TABLE IF EXISTS staff_chefs CASCADE;
      DROP TABLE IF EXISTS staff_bartenders CASCADE;
    `);

    await client.query(`
      CREATE TABLE staff_waiters (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL);
      CREATE TABLE staff_chefs (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL);
      CREATE TABLE staff_bartenders (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL);
      
      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        seat_number INT NOT NULL,
        status VARCHAR(20) DEFAULT 'In',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE menu_items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(20) NOT NULL CHECK (category IN ('food', 'drink')),
        price NUMERIC(10, 2) NOT NULL,
        prep_time_minutes INT NOT NULL,
        description TEXT,
        image_url TEXT NOT NULL
      );

      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
        table_number INT NOT NULL,
        status VARCHAR(30) DEFAULT 'Received',
        estimated_waiting_time INT NOT NULL DEFAULT 0,
        actual_waiting_time INT DEFAULT 0,
        total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        waiter_id INT REFERENCES staff_waiters(id),
        chef_id INT REFERENCES staff_chefs(id),
        bartender_id INT REFERENCES staff_bartenders(id),
        rating INT CHECK (rating BETWEEN 1 AND 5),
        complaint TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE order_items (
        id SERIAL PRIMARY KEY,
        order_id INT REFERENCES orders(id) ON DELETE CASCADE,
        menu_item_id INT REFERENCES menu_items(id),
        quantity INT NOT NULL DEFAULT 1
      );

      CREATE TABLE payments (
        id SERIAL PRIMARY KEY,
        order_id INT UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
        amount NUMERIC(10, 2) NOT NULL,
        payment_status VARCHAR(30) DEFAULT 'Paid (Pretend)',
        payment_method VARCHAR(50) DEFAULT 'Simulated In-App Terminal',
        paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Staff
    await client.query(`
      INSERT INTO staff_waiters (name) VALUES ('Fred'), ('Racheal'), ('Micheal');
      INSERT INTO staff_chefs (name) VALUES ('Joseph'), ('Juliana'), ('Aminat');
      INSERT INTO staff_bartenders (name) VALUES ('Samuel'), ('Joshua');
    `);

    // Accurate dishes and beverage photography using local static files
    await client.query(`
      INSERT INTO menu_items (name, category, price, prep_time_minutes, description, image_url) VALUES
      ('Jollof Rice & Chicken', 'food', 4500.00, 15, 'Smoky party jollof with spiced grilled chicken cuts and sweet plantains', '/images/jollof.jpg'),
      ('Fried Rice & Chicken', 'food', 4500.00, 15, 'Savory seasoned vegetable rice served with golden crispy chicken', '/images/fried_rice.jpg'),
      ('Amala & Abula Special', 'food', 5000.00, 12, 'Smooth yam flour morsel with hot gbegiri, ewedu, and assorted meat', '/images/amala.jpg'),
      ('Afang Soup with Beef', 'food', 6000.00, 22, 'Hearty vegetable delicacy simmered with palm oil, stockfish, and tender beef', '/images/afang.jpg'),
      ('Goat Meat Pepper Soup', 'food', 4000.00, 18, 'Fiery aromatic broth steeped in native calabash nutmeg and tender goat', '/images/pepper_soup.jpg'),
      ('Chilled Coke (50cl)', 'drink', 600.00, 2, 'Classic ice-cold Coca-Cola bottle served over ice', '/images/coke.jpg'),
      ('Chilled Fanta (50cl)', 'drink', 600.00, 2, 'Sparkling orange refresher poured over ice with fresh citrus garnish', '/images/fanta.jpg'),
      ('Chilled Sprite (50cl)', 'drink', 600.00, 2, 'Crisp lemon-lime soda served chilled with fresh lime wheel', '/images/sprite.jpg'),
      ('Signature Chapman', 'drink', 1800.00, 4, 'Classic Nigerian red mocktail with Angostura bitters, citrus, and cucumber', '/images/chapman.jpg');
    `);

    // Baseline Orders
    await client.query(`
      INSERT INTO customers (name, seat_number, status) VALUES
      ('John', 23, 'Left'),
      ('James', 54, 'In'),
      ('Mary', 39, 'Left');

      INSERT INTO orders (customer_id, table_number, status, estimated_waiting_time, actual_waiting_time, total_amount, waiter_id, chef_id, bartender_id, rating, complaint) VALUES
      (1, 23, 'Paid', 15, 8, 5100.00, 2, 1, 2, 5, 'Food arrived piping hot and on time!'),
      (2, 54, 'Received', 12, 0, 5600.00, NULL, NULL, NULL, NULL, NULL),
      (3, 39, 'Paid', 15, 10, 5100.00, 2, 1, 2, 5, 'Hospitality was prompt.');

      INSERT INTO order_items (order_id, menu_item_id, quantity) VALUES
      (1, 1, 1), (1, 6, 1),
      (2, 3, 1), (2, 7, 1),
      (3, 2, 1), (3, 8, 1);

      INSERT INTO payments (order_id, amount, payment_status, payment_method) VALUES
      (1, 5100.00, 'Paid (Pretend)', 'Simulated Dining Terminal'),
      (3, 5100.00, 'Paid (Pretend)', 'Simulated Dining Terminal');

      SELECT setval(pg_get_serial_sequence('customers', 'id'), COALESCE((SELECT MAX(id) FROM customers), 1));
      SELECT setval(pg_get_serial_sequence('orders', 'id'), COALESCE((SELECT MAX(id) FROM orders), 1));
      SELECT setval(pg_get_serial_sequence('order_items', 'id'), COALESCE((SELECT MAX(id) FROM order_items), 1));
      SELECT setval(pg_get_serial_sequence('payments', 'id'), COALESCE((SELECT MAX(id) FROM payments), 1));
      SELECT setval(pg_get_serial_sequence('menu_items', 'id'), COALESCE((SELECT MAX(id) FROM menu_items), 1));
    `);

    await client.query('COMMIT');
    console.log('✅ Menu updated with authentic dish imagery and clean sequences!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

seedDatabase();