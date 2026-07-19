const { createContainer } = require('../src/container');
const { User } = require('../src/models/User');
const { Sale } = require('../src/models/Sale');
const { v4: uuid } = require('uuid');
const { toPaise, toRupees } = require('../src/utils/money');
const { SaleStatus } = require('../src/models/Sale');

describe('Assignment worked example (₹40 x 3 -> 1 rejected, 2 approved)', () => {
  test('total final payout equals ₹68', async () => {
    const { userRepository, saleRepository, advancePayoutService, reconciliationService, userRepository: users } =
      createContainer();

    const user = new User({ id: uuid(), name: 'John Doe', email: 'john@example.com' });
    await userRepository.create(user);

    const sales = await Promise.all(
      [40, 40, 40].map((earning) =>
        saleRepository.create(
          new Sale({ id: uuid(), userId: user.id, brand: 'brand_1', earningPaise: toPaise(earning) })
        )
      )
    );

    // Advance payout: 10% of ₹120 pending earnings = ₹12 total (₹4 per sale)
    const advanceResults = await advancePayoutService.runForUser(user.id);
    const totalAdvance = advanceResults.reduce((sum, r) => sum + toRupees(r.advancePaidPaise), 0);
    expect(totalAdvance).toBe(12);

    const balanceAfterAdvance = await userRepository.findById(user.id);
    expect(toRupees(balanceAfterAdvance.withdrawableBalancePaise)).toBe(12);

    // Reconcile: sale[0] rejected, sale[1] & sale[2] approved
    const r0 = await reconciliationService.reconcile(sales[0].id, SaleStatus.REJECTED);
    const r1 = await reconciliationService.reconcile(sales[1].id, SaleStatus.APPROVED);
    const r2 = await reconciliationService.reconcile(sales[2].id, SaleStatus.APPROVED);

    // Matches the PDF's worked example exactly: -4 + 36 + 36 = 68
    const totalFinalAdjustment =
      toRupees(r0.adjustmentPaise) + toRupees(r1.adjustmentPaise) + toRupees(r2.adjustmentPaise);
    expect(toRupees(r0.adjustmentPaise)).toBe(-4);
    expect(toRupees(r1.adjustmentPaise)).toBe(36);
    expect(toRupees(r2.adjustmentPaise)).toBe(36);
    expect(totalFinalAdjustment).toBe(68);

    const finalUser = await users.findById(user.id);
    // -4 + 36 + 36 = 68, plus the 12 already paid as advance = 12 + 68 = 80
    // (assignment's "Final Payout" of 68 refers to the post-reconciliation
    // net adjustment; total money the user has received end-to-end is
    // advance (12) + adjustment (68) = 80, which is exactly 40+40+40 minus
    // the 4 clawed back from the rejected sale: 120 - 40 = 80.)
    expect(toRupees(finalUser.withdrawableBalancePaise)).toBe(80);
  });
});
