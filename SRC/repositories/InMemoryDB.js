/**
 * A single shared in-memory store. In a production system this file is the
 * ONLY thing that would change — it'd be replaced with a Postgres/MySQL
 * connection pool. Every repository below depends only on this object's
 * shape, not on the fact that it's in-memory, so that swap is mechanical.
 * See schema.sql for the equivalent relational schema.
 */
class InMemoryDB {
  constructor() {
    this.users = new Map(); // id -> User
    this.sales = new Map(); // id -> Sale
    this.withdrawals = new Map(); // id -> Withdrawal
    this.transactions = new Map(); // id -> Transaction
  }
}

module.exports = { InMemoryDB };
