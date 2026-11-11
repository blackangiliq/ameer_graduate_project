// SQLite connection (Node's built-in driver, no native build step).
// All queries in the project use prepared statements with bound parameters,
// which is what prevents SQL injection.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const cache = new Map();
function stmt(sql) {
  let s = cache.get(sql);
  if (!s) { s = db.prepare(sql); cache.set(sql, s); }
  return s;
}

module.exports = {
  raw: db,
  get: (sql, ...params) => stmt(sql).get(...params),
  all: (sql, ...params) => stmt(sql).all(...params),
  run: (sql, ...params) => stmt(sql).run(...params),
  exec: (sql) => db.exec(sql),
  // Run several statements atomically: all succeed or none do.
  transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  },
};
