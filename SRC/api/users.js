const express = require('express');
const { v4: uuid } = require('uuid');
const { User } = require('../../models/User');
const { toRupees } = require('../../utils/money');

function usersRouter({ userRepository, transactionRepository, saleRepository }) {
  const router = express.Router();

  // POST /api/users { name, email }
  router.post('/', async (req, res, next) => {
    try {
      const { name, email } = req.body;
      const user = new User({ id: uuid(), name, email });
      await userRepository.create(user);
      res.status(201).json(user);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/users/:userId/balance
  router.get('/:userId/balance', async (req, res, next) => {
    try {
      const user = await userRepository.findById(req.params.userId);
      res.json({
        userId: user.id,
        withdrawableBalance: toRupees(user.withdrawableBalancePaise),
        lastSuccessfulWithdrawalAt: user.lastSuccessfulWithdrawalAt,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/users/:userId/transactions
  router.get('/:userId/transactions', async (req, res, next) => {
    try {
      const transactions = await transactionRepository.findAllByUser(req.params.userId);
      res.json(
        transactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: toRupees(t.amountPaise),
          referenceType: t.referenceType,
          referenceId: t.referenceId,
          createdAt: t.createdAt,
        }))
      );
    } catch (err) {
      next(err);
    }
  });

  // GET /api/users/:userId/sales
  router.get('/:userId/sales', async (req, res, next) => {
    try {
      const sales = await saleRepository.findAllByUser(req.params.userId);
      res.json(
        sales.map((s) => ({
          id: s.id,
          brand: s.brand,
          earning: toRupees(s.earningPaise),
          status: s.status,
          advanceStatus: s.advanceStatus,
          advancePaid: toRupees(s.advancePaidPaise),
        }))
      );
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { usersRouter };
