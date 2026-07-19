const { SaleStatus } = require('../models/Sale');
const { TransactionType } = require('../models/Transaction');
const { ConflictError, ValidationError } = require('../utils/errors');

const RECONCILABLE_TARGETS = new Set([SaleStatus.APPROVED, SaleStatus.REJECTED]);

/**
 * Handles reconciliation of a single pending sale into approved/rejected,
 * and immediately settles the final payout adjustment against any advance
 * already paid:
 *
 *   Approved -> credit (earning - advancePaid)   [never negative, since
 *                                                  advance is only ever
 *                                                  10% of earning]
 *   Rejected -> debit  (advancePaid)              [0 if no advance was
 *                                                  ever paid on this sale]
 *
 * Reconciliation is one-way and idempotent per sale: a sale that has
 * already been reconciled cannot be reconciled again (guarded by
 * `sale.isReconciled()` under a per-sale lock), which prevents an admin
 * double-click or a retried request from double-crediting/debiting the
 * wallet.
 */
class ReconciliationService {
  constructor({ saleRepository, walletService, mutex }) {
    this.saleRepository = saleRepository;
    this.walletService = walletService;
    this.mutex = mutex;
  }

  async reconcile(saleId, targetStatus) {
    if (!RECONCILABLE_TARGETS.has(targetStatus)) {
      throw new ValidationError(`targetStatus must be one of: ${[...RECONCILABLE_TARGETS].join(', ')}`);
    }

    return this.mutex.runExclusive(`sale:${saleId}`, async () => {
      const sale = await this.saleRepository.findById(saleId);

      if (sale.isReconciled()) {
        throw new ConflictError(`Sale ${saleId} has already been reconciled (status=${sale.status})`);
      }
      if (!sale.isPending()) {
        throw new ConflictError(`Sale ${saleId} is not pending (status=${sale.status})`);
      }

      const advancePaid = sale.advancePaidPaise; // 0 if advance job never ran / hadn't reached this sale

      sale.status = targetStatus;
      sale.reconciledAt = new Date();
      await this.saleRepository.save(sale);

      let adjustmentPaise = 0;
      let type = null;

      if (targetStatus === SaleStatus.APPROVED) {
        adjustmentPaise = sale.earningPaise - advancePaid; // >= 0 by construction
        type = TransactionType.RECONCILIATION_CREDIT;
      } else {
        adjustmentPaise = advancePaid === 0 ? 0 : -advancePaid; // <= 0 (avoid -0)
        type = TransactionType.RECONCILIATION_DEBIT;
      }

      if (adjustmentPaise !== 0) {
        await this.walletService.recordEntry({
          userId: sale.userId,
          type,
          amountPaise: adjustmentPaise,
          referenceType: 'sale',
          referenceId: sale.id,
        });
      }

      return { saleId: sale.id, status: sale.status, advancePaidPaise: advancePaid, adjustmentPaise };
    });
  }
}

module.exports = { ReconciliationService };
