const express = require('express');
const { toPaise, toRupees } = require('../../utils/money');
const { ValidationError } = require('../../utils/errors');

function toDto(w) {
  return {
    id: w.id,
    userId: w.userId,
    amount: toRupees(w.amountPaise),
    status: w.status,
    requestedAt: w.requestedAt,
    processedAt: w.processedAt,
  };
}

function withdrawalsRouter({ withdrawalService, withdrawalRepository }) {
  const router = express.Router();

  // POST /api/withdrawals { userId, amount }
  router.post('/', async (req, res, next) => {
    try {
      const { userId, amount } = req.body;
      if (!userId || amount == null) throw new ValidationError('userId and amount are required');

      const withdrawal = await withdrawalService.requestWithdrawal(userId, toPaise(amount));
      res.status(201).json(toDto(withdrawal));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/withdrawals/:id/status { status: "processing"|"success"|"failed"|"cancelled"|"rejected" }
  // Simulates a payment-gateway webhook.
  router.post('/:id/status', async (req, res, next) => {
    try {
      const { status } = req.body;
      const withdrawal = await withdrawalService.updateStatus(req.params.id, status);
      res.json(toDto(withdrawal));
    } catch (err) {
      next(err);
    }
  });

  // GET /api/withdrawals/user/:userId
  router.get('/user/:userId', async (req, res, next) => {
    try {
      const withdrawals = await withdrawalRepository.findAllByUser(req.params.userId);
      res.json(withdrawals.map(toDto));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { withdrawalsRouter };
