const { v4: uuid } = require('uuid');
const { Withdrawal, WithdrawalStatus, FAILURE_STATUSES } = require('../models/Withdrawal');
const { TransactionType } = require('../models/Transaction');
const { ConflictError, ValidationError } = require('../utils/errors');

const WITHDRAWAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const ACTIVE_STATUSES = new Set([WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING]);
const TERMINAL_STATUSES = new Set([
  WithdrawalStatus.SUCCESS,
  WithdrawalStatus.FAILED,
  WithdrawalStatus.CANCELLED,
  WithdrawalStatus.REJECTED,
]);

/**
 * Question 1, Rule 3 (one withdrawal per 24h) + Question 2 (failed payout
 * recovery) both live here because they interact: a withdrawal that later
 * fails must NOT count against the 24h cooldown — the user shouldn't be
 * punished with a lockout for a payment-gateway failure that wasn't their
 * fault. So the cooldown is keyed off `lastSuccessfulWithdrawalAt`, which
 * is only set when a withdrawal reaches SUCCESS.
 *
 * Balance handling: the requested amount is debited from
 * withdrawableBalancePaise the moment a withdrawal is *requested* (so the
 * same money can't be withdrawn twice while a payout is in flight). If
 * the withdrawal later fails/cancels/rejects, the amount is credited back
 * (Question 2) and the user is free to immediately request a new
 * withdrawal for it, without waiting out the 24h window, since no
 * successful withdrawal occurred.
 */
class WithdrawalService {
  constructor({ userRepository, withdrawalRepository, walletService, mutex }) {
    this.userRepository = userRepository;
    this.withdrawalRepository = withdrawalRepository;
    this.walletService = walletService;
    this.mutex = mutex;
  }

  async requestWithdrawal(userId, amountPaise) {
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new ValidationError('amount must be a positive number');
    }

    return this.mutex.runExclusive(`user:${userId}`, async () => {
      const user = await this.userRepository.findById(userId);

      if (user.lastSuccessfulWithdrawalAt) {
        const elapsed = Date.now() - user.lastSuccessfulWithdrawalAt.getTime();
        if (elapsed < WITHDRAWAL_COOLDOWN_MS) {
          const retryAfterMs = WITHDRAWAL_COOLDOWN_MS - elapsed;
          throw new ConflictError(
            `Only one withdrawal is allowed every 24 hours. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`
          );
        }
      }

      if (amountPaise > user.withdrawableBalancePaise) {
        throw new ConflictError('Insufficient withdrawable balance');
      }

      const withdrawal = new Withdrawal({ id: uuid(), userId, amountPaise });
      await this.withdrawalRepository.create(withdrawal);

      // Debit immediately so the funds can't be double-spent by a second
      // request while this one is still in flight with the payment rail.
      await this.walletService.recordEntry({
        userId,
        type: TransactionType.WITHDRAWAL_DEBIT,
        amountPaise: -amountPaise,
        referenceType: 'withdrawal',
        referenceId: withdrawal.id,
      });

      return withdrawal;
    });
  }

  /**
   * Simulates a payment-gateway webhook updating a withdrawal's terminal
   * status. success -> starts the 24h cooldown. failed/cancelled/rejected
   * -> reverses the debit (Question 2: Failed Payout Recovery).
   */
  async updateStatus(withdrawalId, newStatus) {
    if (!TERMINAL_STATUSES.has(newStatus) && newStatus !== WithdrawalStatus.PROCESSING) {
      throw new ValidationError(`Unknown withdrawal status: ${newStatus}`);
    }

    return this.mutex.runExclusive(`withdrawal:${withdrawalId}`, async () => {
      const withdrawal = await this.withdrawalRepository.findById(withdrawalId);

      if (!ACTIVE_STATUSES.has(withdrawal.status)) {
        throw new ConflictError(
          `Withdrawal ${withdrawalId} is already in a terminal state (${withdrawal.status})`
        );
      }

      withdrawal.status = newStatus;

      if (newStatus === WithdrawalStatus.PROCESSING) {
        await this.withdrawalRepository.save(withdrawal);
        return withdrawal;
      }

      withdrawal.processedAt = new Date();

      if (newStatus === WithdrawalStatus.SUCCESS) {
        const user = await this.userRepository.findById(withdrawal.userId);
        user.lastSuccessfulWithdrawalAt = withdrawal.processedAt;
        await this.userRepository.save(user);
      } else if (FAILURE_STATUSES.has(newStatus) && !withdrawal.reversed) {
        // Question 2: credit the amount back so it's withdrawable again.
        await this.walletService.recordEntry({
          userId: withdrawal.userId,
          type: TransactionType.WITHDRAWAL_REVERSAL_CREDIT,
          amountPaise: withdrawal.amountPaise,
          referenceType: 'withdrawal',
          referenceId: withdrawal.id,
        });
        withdrawal.reversed = true;
      }

      await this.withdrawalRepository.save(withdrawal);
      return withdrawal;
    });
  }
}

module.exports = { WithdrawalService, WITHDRAWAL_COOLDOWN_MS };
