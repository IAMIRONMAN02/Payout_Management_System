// Append-only ledger entry type. Every balance-affecting event in the
// system writes exactly one of these — this is what makes the wallet
// balance auditable and reconstructable from scratch.
const TransactionType = Object.freeze({
  ADVANCE_CREDIT: 'advance_credit', // +10% advance paid out on a pending sale
  RECONCILIATION_CREDIT: 'reconciliation_credit', // + (earning - advance) on approval
  RECONCILIATION_DEBIT: 'reconciliation_debit', // - advance on rejection
  WITHDRAWAL_DEBIT: 'withdrawal_debit', // - amount when a withdrawal is requested
  WITHDRAWAL_REVERSAL_CREDIT: 'withdrawal_reversal_credit', // + amount when a withdrawal fails/cancels/rejects
});

class Transaction {
  constructor({ id, userId, type, amountPaise, referenceType, referenceId, createdAt = new Date() }) {
    this.id = id;
    this.userId = userId;
    this.type = type;
    // amountPaise is signed: positive = credit, negative = debit.
    this.amountPaise = amountPaise;
    this.referenceType = referenceType; // 'sale' | 'withdrawal'
    this.referenceId = referenceId;
    this.createdAt = createdAt;
  }
}

module.exports = { Transaction, TransactionType };
