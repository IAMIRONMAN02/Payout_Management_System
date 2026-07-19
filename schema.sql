
CREATE TABLE users (
    id                          UUID PRIMARY KEY,
    name                        TEXT NOT NULL,
    email                       TEXT NOT NULL UNIQUE,
    withdrawable_balance_paise  BIGINT NOT NULL DEFAULT 0,
    last_successful_withdrawal_at TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE brands (
    id      UUID PRIMARY KEY,
    name    TEXT NOT NULL UNIQUE
);

CREATE TABLE sales (
    id                  UUID PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES users(id),
    brand_id            UUID NOT NULL REFERENCES brands(id),
    earning_paise       BIGINT NOT NULL CHECK (earning_paise >= 0),
    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
    advance_status      TEXT NOT NULL DEFAULT 'none'
                            CHECK (advance_status IN ('none', 'paid')),
    advance_paid_paise  BIGINT NOT NULL DEFAULT 0,
    reconciled_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_user_status ON sales(user_id, status);

CREATE INDEX idx_sales_advance_eligible ON sales(user_id, status, advance_status)
    WHERE status = 'pending' AND advance_status = 'none';
 (
    id              UUID PRIMARY KEY,
    sale_id         UUID NOT NULL UNIQUE REFERENCES sales(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    amount_paise    BIGINT NOT NULL CHECK (amount_paise >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reconciliations (
    id                  UUID PRIMARY KEY,
    sale_id             UUID NOT NULL UNIQUE REFERENCES sales(id),
    previous_status     TEXT NOT NULL,
    new_status          TEXT NOT NULL CHECK (new_status IN ('approved', 'rejected')),
    advance_paid_paise  BIGINT NOT NULL,
    adjustment_paise    BIGINT NOT NULL, 
    processed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE withdrawals (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    amount_paise    BIGINT NOT NULL CHECK (amount_paise > 0),
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'success', 'failed', 'cancelled', 'rejected')),
    reversed        BOOLEAN NOT NULL DEFAULT FALSE,
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at    TIMESTAMPTZ
);

CREATE INDEX idx_withdrawals_user ON withdrawals(user_id, requested_at DESC);


CREATE TABLE transactions (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    type            TEXT NOT NULL CHECK (type IN (
                        'advance_credit',
                        'reconciliation_credit',
                        'reconciliation_debit',
                        'withdrawal_debit',
                        'withdrawal_reversal_credit'
                    )),
    amount_paise    BIGINT NOT NULL, 
    reference_type  TEXT NOT NULL CHECK (reference_type IN ('sale', 'withdrawal')),
    reference_id    UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user ON transactions(user_id, created_at);
CREATE INDEX idx_transactions_reference ON transactions(reference_type, reference_id);

