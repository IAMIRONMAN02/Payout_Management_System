const WithdrawalStatus = Object.freeze({
  PENDING: 'pending', // requested, awaiting processing by payment gateway
  PROCESSING: 'processing',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
});

// Terminal statuses that mean "money never actually reached the user" and
// therefore must be reversed back into the withdrawable balance.
const FAILURE_STATUSES = new Set([
  WithdrawalStatus.FAILED,
  WithdrawalStatus.CANCELLED,
  WithdrawalStatus.REJECTED,
]);

class Withdrawal {
  constructor({ id, userId, amountPaise, requestedAt = new Date() }) {
    this.id = id;
    this.userId = userId;
    this.amountPaise = amountPaise;
    this.status = WithdrawalStatus.PENDING;
    this.requestedAt = requestedAt;
    this.processedAt = null;
    this.reversed = false; // guards against double-reversal
  }
}

module.exports = { Withdrawal, WithdrawalStatus, FAILURE_STATUSES };
