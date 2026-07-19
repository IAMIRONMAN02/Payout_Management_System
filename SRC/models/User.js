/**
 * User — wallet is intentionally NOT a single mutable balance field that
 * services increment/decrement directly. Instead `withdrawableBalancePaise`
 * is a cached projection that is only ever mutated inside WalletService,
 * in the same transaction as an immutable Transaction (ledger) row. The
 * ledger is the source of truth; the cached balance exists purely so we
 * don't have to re-sum the ledger on every read.
 */
class User {
  constructor({ id, name, email, createdAt = new Date() }) {
    this.id = id;
    this.name = name;
    this.email = email;
    this.withdrawableBalancePaise = 0;
    this.lastSuccessfulWithdrawalAt = null; // drives the 24h restriction
    this.createdAt = createdAt;
  }
}

module.exports = { User };
