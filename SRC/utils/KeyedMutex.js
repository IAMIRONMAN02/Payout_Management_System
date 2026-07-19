/**
 * KeyedMutex serializes async operations that share a key (e.g. a userId
 * or saleId) so that concurrent requests can't interleave and corrupt
 * shared state (double-crediting an advance, two withdrawals racing past
 * a balance check, etc.).
 *
 * In a real relational database this same guarantee is normally achieved
 * with `SELECT ... FOR UPDATE` inside a transaction, or a unique
 * constraint + optimistic retry. Since this reference implementation uses
 * an in-memory store to keep the assignment runnable with zero external
 * infra, we reproduce that guarantee explicitly here. Swapping the
 * repositories for real DB-backed ones would let this mutex be replaced
 * by row-level locking without touching service code.
 */
class KeyedMutex {
  constructor() {
    this._queues = new Map(); // key -> Promise (tail of the queue)
  }

  async runExclusive(key, fn) {
    const previous = this._queues.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => (release = resolve));
    this._queues.set(key, previous.then(() => current));

    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this._queues.get(key) === current) {
        this._queues.delete(key);
      }
    }
  }
}

module.exports = { KeyedMutex };
