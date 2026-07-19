const { computeAdvance } = require('../utils/money');
const { AdvanceStatus } = require('../models/Sale');
const { TransactionType } = require('../models/Transaction');

/**
 * Handles "Every Pending sale is eligible for an advance payout of 10% of
 * its earnings" — and the hard requirement that a sale must NEVER receive
 * a second advance even if this job is triggered repeatedly (e.g. a cron
 * re-run, a retried request, or two workers racing).
 *
 * Idempotency strategy (belt AND suspenders):
 *  1. Query-time filter: `findPendingAdvanceEligibleByUser` only returns
 *     sales whose advanceStatus is still NONE.
 *  2. Per-sale mutex: the actual read-modify-write (check eligibility ->
 *     mark PAID -> credit wallet) is wrapped in `mutex.runExclusive(saleId)`
 *     so two concurrent job runs can't both pass the eligibility check
 *     for the same sale before either has written PAID.
 *  3. Defensive re-check inside the lock: even if a caller bypasses the
 *     repository filter, `processSale` re-verifies `sale.isAdvanceEligible()`
 *     after acquiring the lock and is a no-op otherwise.
 *
 * In a real RDBMS, step 2's row-lock role is played by wrapping the
 * check + UPDATE in a transaction with `SELECT ... FOR UPDATE`, or by a
 * `UNIQUE(sale_id)` constraint on an `advance_payouts` table combined with
 * `INSERT ... ON CONFLICT DO NOTHING`.
 */
class AdvancePayoutService {
  constructor({ saleRepository, walletService, mutex }) {
    this.saleRepository = saleRepository;
    this.walletService = walletService;
    this.mutex = mutex;
  }

  /** Runs the advance payout batch for a single user. Safe to call repeatedly. */
  async runForUser(userId) {
    const eligibleSales = await this.saleRepository.findPendingAdvanceEligibleByUser(userId);
    const results = [];
    for (const sale of eligibleSales) {
      const result = await this.processSale(sale.id);
      if (result) results.push(result);
    }
    return results;
  }

  /** Processes a single sale's advance. Idempotent — a second call is a no-op. */
  async processSale(saleId) {
    return this.mutex.runExclusive(`sale:${saleId}`, async () => {
      const sale = await this.saleRepository.findById(saleId);

      if (!sale.isAdvanceEligible()) {
        // Already paid, no longer pending, etc. — silently skip so that
        // re-running the job is always safe.
        return null;
      }

      const advancePaise = computeAdvance(sale.earningPaise);

      sale.advanceStatus = AdvanceStatus.PAID;
      sale.advancePaidPaise = advancePaise;
      await this.saleRepository.save(sale);

      if (advancePaise > 0) {
        await this.walletService.recordEntry({
          userId: sale.userId,
          type: TransactionType.ADVANCE_CREDIT,
          amountPaise: advancePaise,
          referenceType: 'sale',
          referenceId: sale.id,
        });
      }

      return { saleId: sale.id, advancePaidPaise: advancePaise };
    });
  }
}

module.exports = { AdvancePayoutService };
