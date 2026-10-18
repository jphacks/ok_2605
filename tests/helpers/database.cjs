const { DatabaseSync } = require('node:sqlite');
function createDatabase(path = ':memory:') {
  let connection = new DatabaseSync(path);
  const db = {
    async execAsync(sql) { connection.exec(sql); },
    async runAsync(sql, ...params) {
      const row = connection.prepare(sql).run(...params);
      return { lastInsertRowId: Number(row.lastInsertRowid), changes: Number(row.changes) };
    },
    async getAllAsync(sql, ...params) { return connection.prepare(sql).all(...params).map((row) => ({ ...row })); },
    async getFirstAsync(sql, ...params) { const row = connection.prepare(sql).get(...params); return row ? { ...row } : null; },
    async withExclusiveTransactionAsync(task) {
      connection.exec('BEGIN IMMEDIATE');
      try { await task(db); connection.exec('COMMIT'); }
      catch (error) { connection.exec('ROLLBACK'); throw error; }
    },
  };
  return { db, close: () => connection.close(), reopen: () => { connection.close(); connection = new DatabaseSync(path); } };
}
module.exports = { createDatabase };
