# Runbooks

For the person on call at 02:00, who did not write the code and should not have to read it.

| Runbook | When |
|---|---|
| [payment-stuck.md](payment-stuck.md) | A payment sits in `unknown` or `awaiting_user` |
| [ledger-drift.md](ledger-drift.md) | The drift alert fired, or a balance looks wrong |
| [deploy-rollback.md](deploy-rollback.md) | A deploy made things worse |
| [database-restore.md](database-restore.md) | Data loss or corruption |

**Practise the restore.** An untested backup is not a backup — it is a belief. Schedule
it in Sprint 5 and do it again every quarter.
