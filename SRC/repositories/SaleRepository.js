const { NotFoundError } = require('../utils/errors');

class SaleRepository {
  constructor(db) {
    this.db = db;
  }

  async create(sale) {
    this.db.sales.set(sale.id, sale);
    return sale;
  }

  async findById(id) {
    const sale = this.db.sales.get(id);
    if (!sale) throw new NotFoundError(`Sale ${id} not found`);
    return sale;
  }

  async save(sale) {
    sale.updatedAt = new Date();
    this.db.sales.set(sale.id, sale);
    return sale;
  }

  async findPendingAdvanceEligibleByUser(userId) {
    return [...this.db.sales.values()].filter((s) => s.userId === userId && s.isAdvanceEligible());
  }

  async findAllByUser(userId) {
    return [...this.db.sales.values()].filter((s) => s.userId === userId);
  }
}

module.exports = { SaleRepository };
