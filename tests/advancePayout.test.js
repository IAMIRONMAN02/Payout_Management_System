const { createContainer } = require('../src/container');
const { User } = require('../src/models/User');
const { Sale } = require('../src/models/Sale');
const { v4: uuid } = require('uuid');
const { toPaise, toRupees } = require('../src/utils/money');

describe('AdvancePayoutService', () => {
  test('a sale never receives a second advance, even if the job runs multiple times', async () => {
    const { userRepository, saleRepository, advancePayoutService } = createContainer();

    const user = new User({ id: uuid(), name: 'Jane', email: 'jane@example.com' });
    await userRepository.create(user);

    const sale = await saleRepository.create(
      new Sale({ id: uuid(), userId: user.id, brand: 'brand_1', earningPaise: toPaise(30) })
    );

    await advancePayoutService.runForUser(user.id);
    await advancePayoutService.runForUser(user.id); // re-run: should be a no-op
    await advancePayoutService.processSale(sale.id); // direct re-run: should also be a no-op

    const finalUser = await userRepository.findById(user.id);
    expect(toRupees(finalUser.withdrawableBalancePaise)).toBe(3); // 10% of 30, only once

    const finalSale = await saleRepository.findById(sale.id);
    expect(toRupees(finalSale.advancePaidPaise)).toBe(3);
  });

  test('concurrent advance payout runs for the same sale do not double-credit', async () => {
    const { userRepository, saleRepository, advancePayoutService } = createContainer();

    const user = new User({ id: uuid(), name: 'Race', email: 'race@example.com' });
    await userRepository.create(user);

    const sale = await saleRepository.create(
      new Sale({ id: uuid(), userId: user.id, brand: 'brand_1', earningPaise: toPaise(100) })
    );

    // Fire 10 concurrent attempts at the same sale.
    await Promise.all(Array.from({ length: 10 }, () => advancePayoutService.processSale(sale.id)));

    const finalUser = await userRepository.findById(user.id);
    expect(toRupees(finalUser.withdrawableBalancePaise)).toBe(10); // 10% of 100, exactly once
  });

  test('a sale with zero earning produces zero advance and no ledger entry', async () => {
    const { userRepository, saleRepository, advancePayoutService, transactionRepository } = createContainer();
    const user = new User({ id: uuid(), name: 'Zero', email: 'zero@example.com' });
    await userRepository.create(user);
    await saleRepository.create(new Sale({ id: uuid(), userId: user.id, brand: 'b', earningPaise: 0 }));

    await advancePayoutService.runForUser(user.id);

    const txns = await transactionRepository.findAllByUser(user.id);
    expect(txns).toHaveLength(0);
  });
});
