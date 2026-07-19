const { NotFoundError } = require('../utils/errors');

class WithdrawalRepository {
  constructor(db) {
    this.db = db;
  }

  async create(withdrawal) {
    this.db.withdrawals.set(withdrawal.id, withdrawal);
    return withdrawal;
  }

  async findById(id) {
    const w = this.db.withdrawals.get(id);
    if (!w) throw new NotFoundError(`Withdrawal ${id} not found`);
    return w;
  }

  async save(withdrawal) {
    this.db.withdrawals.set(withdrawal.id, withdrawal);
    return withdrawal;
  }

  async findAllByUser(userId) {
    return [...this.db.withdrawals.values()]
      .filter((w) => w.userId === userId)
      .sort((a, b) => b.requestedAt - a.requestedAt);
  }
}

module.exports = { WithdrawalRepository };
