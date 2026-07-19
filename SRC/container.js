const { InMemoryDB } = require('./repositories/InMemoryDB');
const { UserRepository } = require('./repositories/UserRepository');
const { SaleRepository } = require('./repositories/SaleRepository');
const { WithdrawalRepository } = require('./repositories/WithdrawalRepository');
const { TransactionRepository } = require('./repositories/TransactionRepository');

const { KeyedMutex } = require('./utils/KeyedMutex');
const { WalletService } = require('./services/WalletService');
const { AdvancePayoutService } = require('./services/AdvancePayoutService');
const { ReconciliationService } = require('./services/ReconciliationService');
const { WithdrawalService } = require('./services/WithdrawalService');

/** Builds a fresh, fully-wired set of repositories + services. One call
 * per test gives full isolation; one call at server boot gives the app
 * its singletons. */
function createContainer() {
  const db = new InMemoryDB();
  const mutex = new KeyedMutex();

  const userRepository = new UserRepository(db);
  const saleRepository = new SaleRepository(db);
  const withdrawalRepository = new WithdrawalRepository(db);
  const transactionRepository = new TransactionRepository(db);

  const walletService = new WalletService({ userRepository, transactionRepository });
  const advancePayoutService = new AdvancePayoutService({ saleRepository, walletService, mutex });
  const reconciliationService = new ReconciliationService({ saleRepository, walletService, mutex });
  const withdrawalService = new WithdrawalService({ userRepository, withdrawalRepository, walletService, mutex });

  return {
    db,
    userRepository,
    saleRepository,
    withdrawalRepository,
    transactionRepository,
    walletService,
    advancePayoutService,
    reconciliationService,
    withdrawalService,
  };
}

module.exports = { createContainer };
