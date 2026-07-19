const SaleStatus = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const AdvanceStatus = Object.freeze({
  NONE: 'none', // never attempted
  PAID: 'paid', // advance successfully transferred
});

/**
 * Sale — one affiliate sale line item.
 *
 * earningPaise      : total earning for this sale (integer paise)
 * status            : pending -> approved | rejected (one-way, terminal)
 * advanceStatus     : none -> paid (one-way; a sale can NEVER receive a
 *                      second advance, enforced both here and by a unique
 *                      constraint at the persistence layer)
 * advancePaidPaise  : amount actually transferred as advance (0 until paid)
 * reconciledAt      : set once reconciliation has produced a final payout,
 *                      guarantees a sale is reconciled at most once
 */
class Sale {
  constructor({ id, userId, brand, earningPaise, status = SaleStatus.PENDING, createdAt = new Date() }) {
    this.id = id;
    this.userId = userId;
    this.brand = brand;
    this.earningPaise = earningPaise;
    this.status = status;
    this.advanceStatus = AdvanceStatus.NONE;
    this.advancePaidPaise = 0;
    this.reconciledAt = null;
    this.createdAt = createdAt;
    this.updatedAt = createdAt;
  }

  isPending() {
    return this.status === SaleStatus.PENDING;
  }

  isAdvanceEligible() {
    // Only pending sales that have never received an advance are eligible.
    return this.isPending() && this.advanceStatus === AdvanceStatus.NONE;
  }

  isReconciled() {
    return this.reconciledAt !== null;
  }
}

module.exports = { Sale, SaleStatus, AdvanceStatus };
