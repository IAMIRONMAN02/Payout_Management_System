class TransactionRepository {
  constructor(db) {
    this.db = db;
  }

  async create(transaction) {
    this.db.transactions.set(transaction.id, transaction);
    return transaction;
  }

  async findAllByUser(userId) {
    return [...this.db.transactions.values()]
      .filter((t) => t.userId === userId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }
}

module.exports = { TransactionRepository };
