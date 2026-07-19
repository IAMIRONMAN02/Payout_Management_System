const { createContainer } = require('../src/container');
const { User } = require('../src/models/User');
const { WithdrawalStatus } = require('../src/models/Withdrawal');
const { v4: uuid } = require('uuid');
const { toPaise, toRupees } = require('../src/utils/money');

async function seedUserWithBalance(container, amountRupees) {
  const user = new User({ id: uuid(), name: 'W', email: `${uuid()}@example.com` });
  await container.userRepository.create(user);
  user.withdrawableBalancePaise = toPaise(amountRupees);
  await container.userRepository.save(user);
  return user;
}

describe('WithdrawalService', () => {
  test('rejects a withdrawal that exceeds the withdrawable balance', async () => {
    const container = createContainer();
    const user = await seedUserWithBalance(container, 10);
    await expect(container.withdrawalService.requestWithdrawal(user.id, toPaise(20))).rejects.toThrow(
      /Insufficient withdrawable balance/
    );
  });

  test('debits the balance immediately on request', async () => {
    const container = createContainer();
    const user = await seedUserWithBalance(container, 50);
    await container.withdrawalService.requestWithdrawal(user.id, toPaise(20));

    const finalUser = await container.userRepository.findById(user.id);
    expect(toRupees(finalUser.withdrawableBalancePaise)).toBe(30);
  });

  test('only one successful withdrawal is allowed every 24 hours', async () => {
    const container = createContainer();
    const user = await seedUserWithBalance(container, 100);

    const w1 = await container.withdrawalService.requestWithdrawal(user.id, toPaise(10));
    await container.withdrawalService.updateStatus(w1.id, WithdrawalStatus.SUCCESS);

    // Second withdrawal attempted immediately after a success -> blocked.
    await expect(container.withdrawalService.requestWithdrawal(user.id, toPaise(10))).rejects.toThrow(
      /Only one withdrawal is allowed every 24 hours/
    );
  });

  test('a withdrawal that succeeded 24h+ ago no longer blocks new withdrawals', async () => {
    const container = createContainer();
    const user = await seedUserWithBalance(container, 100);

    const w1 = await container.withdrawalService.requestWithdrawal(user.id, toPaise(10));
    await container.withdrawalService.updateStatus(w1.id, WithdrawalStatus.SUCCESS);

    // Simulate that the successful withdrawal happened >24h ago.
    const staleUser = await container.userRepository.findById(user.id);
    staleUser.lastSuccessfulWithdrawalAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await container.userRepository.save(staleUser);

    const w2 = await container.withdrawalService.requestWithdrawal(user.id, toPaise(10));
    expect(w2.status).toBe(WithdrawalStatus.PENDING);
  });

  test.each([WithdrawalStatus.FAILED, WithdrawalStatus.CANCELLED, WithdrawalStatus.REJECTED])(
    'a %s withdrawal credits the amount back and does NOT trigger the 24h cooldown',
    async (terminalStatus) => {
      const container = createContainer();
      const user = await seedUserWithBalance(container, 100);

      const w1 = await container.withdrawalService.requestWithdrawal(user.id, toPaise(30));
      let afterDebit = await container.userRepository.findById(user.id);
      expect(toRupees(afterDebit.withdrawableBalancePaise)).toBe(70);

      await container.withdrawalService.updateStatus(w1.id, terminalStatus);

      const afterReversal = await container.userRepository.findById(user.id);
      expect(toRupees(afterReversal.withdrawableBalancePaise)).toBe(100); // credited back
      expect(afterReversal.lastSuccessfulWithdrawalAt).toBeNull(); // no cooldown started

      // User can immediately request another withdrawal for the same amount.
      const w2 = await container.withdrawalService.requestWithdrawal(user.id, toPaise(30));
      expect(w2.status).toBe(WithdrawalStatus.PENDING);
    }
  );

  test('a withdrawal already in a terminal state cannot be updated again (no double reversal)', async () => {
    const container = createContainer();
    const user = await seedUserWithBalance(container, 100);
    const w1 = await container.withdrawalService.requestWithdrawal(user.id, toPaise(30));

    await container.withdrawalService.updateStatus(w1.id, WithdrawalStatus.FAILED);
    await expect(container.withdrawalService.updateStatus(w1.id, WithdrawalStatus.FAILED)).rejects.toThrow(
      /already in a terminal state/
    );

    const finalUser = await container.userRepository.findById(user.id);
    expect(toRupees(finalUser.withdrawableBalancePaise)).toBe(100); // not credited twice
  });
});
