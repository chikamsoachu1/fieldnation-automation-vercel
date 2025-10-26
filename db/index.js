const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'database.sqlite');

// ensure directory exists
const ensureDir = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

ensureDir(DB_PATH);

const db = new Database(DB_PATH);

// initialize schema if not present
const init = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      fn_username TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      subscription_status TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
  `);
};

init();

// Helpers
const createUser = (email, fn_username) => {
  const stmt = db.prepare(`INSERT OR IGNORE INTO users (email, fn_username) VALUES (?, ?)`);
  const info = stmt.run(email, fn_username || null);
  if (info.changes === 0) {
    // user existed, return existing
    return getUserByEmail(email);
  }
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(info.lastInsertRowid);
};

const getUserByEmail = (email) => db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);

const getUserById = (id) => db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);

const getUserByStripeCustomerId = (customerId) => db.prepare(`SELECT * FROM users WHERE stripe_customer_id = ?`).get(customerId);

const linkCustomerSubscription = ({ userId, stripeCustomerId, stripeSubscriptionId, status }) => {
  const stmt = db.prepare(`UPDATE users SET stripe_customer_id = ?, stripe_subscription_id = ?, subscription_status = ?, updated_at = datetime('now') WHERE id = ?`);
  const info = stmt.run(stripeCustomerId, stripeSubscriptionId, status, userId);
  if (info.changes === 0) return null;
  return getUserById(userId);
};

const upsertUserWithStripe = ({ email, fn_username, stripeCustomerId, stripeSubscriptionId, status }) => {
  // ensure user exists
  let user = getUserByEmail(email);
  if (!user) user = createUser(email, fn_username);
  // link stripe data
  const stmt = db.prepare(`UPDATE users SET stripe_customer_id = ?, stripe_subscription_id = ?, subscription_status = ?, updated_at = datetime('now') WHERE id = ?`);
  stmt.run(stripeCustomerId || null, stripeSubscriptionId || null, status || null, user.id);
  return getUserById(user.id);
};

const setSubscriptionStatusByCustomerId = (customerId, status, subscriptionId) => {
  const stmt = db.prepare(`UPDATE users SET subscription_status = ?, stripe_subscription_id = ?, updated_at = datetime('now') WHERE stripe_customer_id = ?`);
  const info = stmt.run(status, subscriptionId || null, customerId);
  if (info.changes === 0) return null;
  return getUserByStripeCustomerId(customerId);
};

module.exports = {
  db,
  createUser,
  getUserByEmail,
  getUserById,
  getUserByStripeCustomerId,
  linkCustomerSubscription,
  upsertUserWithStripe,
  setSubscriptionStatusByCustomerId,
};