const { v4: uuid } = require('uuid');
const { Transaction } = require('../models/Transaction');

/**
 * WalletService is the single choke point through which a user's
 * withdrawableBalancePaise is ever mutated. Every call appends an
 * immutable ledger row (Transaction) AND updates the cached balance in
 * the same logical operation, so the cached balance can always be
 * rebuilt by summing the ledger — that invariant is what makes the wallet
 * auditable.
 */
class WalletService {
  constructor({ userRepository, transactionRepository }) {
    this.userRepository = userRepository;
    this.transactionRepository = transactionRepository;
  }

  /**
   * @param {number} amountPaise signed: positive credits, negative debits
   */
  async recordEntry({ userId, type, amountPaise, referenceType, referenceId }) {
    const user = await this.userRepository.findById(userId);

    const transaction = new Transaction({
      id: uuid(),
      userId,
      type,
      amountPaise,
      referenceType,
      referenceId,
    });
    await this.transactionRepository.create(transaction);

    user.withdrawableBalancePaise += amountPaise;
    await this.userRepository.save(user);

    return { user, transaction };
  }
}

module.exports = { WalletService };
