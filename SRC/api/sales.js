const express = require('express');
const { v4: uuid } = require('uuid');
const { Sale } = require('../../models/Sale');
const { toPaise, toRupees } = require('../../utils/money');
const { ValidationError } = require('../../utils/errors');

function salesRouter({ saleRepository, advancePayoutService, reconciliationService }) {
  const router = express.Router();

  // POST /api/sales { userId, brand, earning }
  router.post('/', async (req, res, next) => {
    try {
      const { userId, brand, earning } = req.body;
      if (!userId || earning == null) throw new ValidationError('userId and earning are required');

      const sale = new Sale({ id: uuid(), userId, brand, earningPaise: toPaise(earning) });
      await saleRepository.create(sale);
      res.status(201).json(sale);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/sales/advance-payouts/run { userId }
  // Triggers the advance payout batch job for a user. Safe to call
  // repeatedly — see AdvancePayoutService for idempotency guarantees.
  router.post('/advance-payouts/run', async (req, res, next) => {
    try {
      const { userId } = req.body;
      if (!userId) throw new ValidationError('userId is required');

      const results = await advancePayoutService.runForUser(userId);
      res.json({
        userId,
        salesAdvanced: results.length,
        details: results.map((r) => ({ saleId: r.saleId, advancePaid: toRupees(r.advancePaidPaise) })),
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/sales/:saleId/reconcile { status: "approved" | "rejected" }
  router.post('/:saleId/reconcile', async (req, res, next) => {
    try {
      const { status } = req.body;
      const result = await reconciliationService.reconcile(req.params.saleId, status);
      res.json({
        saleId: result.saleId,
        status: result.status,
        advancePaid: toRupees(result.advancePaidPaise),
        adjustment: toRupees(result.adjustmentPaise),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { salesRouter };
