const { createContainer } = require('../src/container');
const { User } = require('../src/models/User');
const { Sale, SaleStatus } = require('../src/models/Sale');
const { v4: uuid } = require('uuid');
const { toPaise, toRupees } = require('../src/utils/money');

describe('ReconciliationService', () => {
  async function setup() {
    const container = createContainer();
    const user = new User({ id: uuid(), name: 'U', email: `${uuid()}@example.com` });
    await container.userRepository.create(user);
    return { ...container, user };
  }

  test('approved sale with no advance ever paid credits full earning', async () => {
    const { saleRepository, reconciliationService, userRepository, user } = await setup();
    const sale = await saleRepository.create(
      new Sale({ id: uuid(), userId: user.id, brand: 'b', earningPaise: toPaise(30) })
    );

    const result = await reconciliationService.reconcile(sale.id, SaleStatus.APPROVED);
    expect(toRupees(result.adjustmentPaise)).toBe(30);

    const finalUser = await userRepository.findById(user.id);
    expect(toRupees(finalUser.withdrawableBalancePaise)).toBe(30);
  });

  test('rejected sale with no advance ever paid has zero adjustment', async () => {
    const { saleRepository, reconciliationService, userRepository, user } = await setup();
    const sale = await saleRepository.create(
      new Sale({ id: uuid(), userId: user.id, brand: 'b', earningPaise: toPaise(50) })
    );

    const result = await reconciliationService.reconcile(sale.id, SaleStatus.REJECTED);
    expect(toRupees(result.adjustmentPaise)).toBe(0);

    const finalUser = await userRepository.findById(user.id);
    expect(toRupees(finalUser.withdrawableBalancePaise)).toBe(0);
  });

  test('a sale cannot be reconciled twice', async () => {
    const { saleRepository, reconciliationService, user } = await setup();
    const sale = await saleRepository.create(
      new Sale({ id: uuid(), userId: user.id, brand: 'b', earningPaise: toPaise(30) })
    );

    await reconciliationService.reconcile(sale.id, SaleStatus.APPROVED);
    await expect(reconciliationService.reconcile(sale.id, SaleStatus.REJECTED)).rejects.toThrow(
      /already been reconciled/
    );
  });

  test('rejects an invalid target status', async () => {
    const { saleRepository, reconciliationService, user } = await setup();
    const sale = await saleRepository.create(
      new Sale({ id: uuid(), userId: user.id, brand: 'b', earningPaise: toPaise(30) })
    );
    await expect(reconciliationService.reconcile(sale.id, SaleStatus.PENDING)).rejects.toThrow(
      /targetStatus must be one of/
    );
  });
});
