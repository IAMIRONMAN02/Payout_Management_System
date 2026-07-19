const { NotFoundError } = require('../utils/errors');

class UserRepository {
  constructor(db) {
    this.db = db;
  }

  async create(user) {
    this.db.users.set(user.id, user);
    return user;
  }

  async findById(id) {
    const user = this.db.users.get(id);
    if (!user) throw new NotFoundError(`User ${id} not found`);
    return user;
  }

  async save(user) {
    this.db.users.set(user.id, user);
    return user;
  }
}

module.exports = { UserRepository };
