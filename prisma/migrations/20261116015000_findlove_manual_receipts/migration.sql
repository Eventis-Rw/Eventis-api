-- Records of money received externally must not be double-entered.
CREATE UNIQUE INDEX "findlove_manual_reference_unique" ON "payment_intents" ("provider_transaction_id") WHERE "provider" = 'admin_recorded' AND "purpose" = 'FINDLOVE';
