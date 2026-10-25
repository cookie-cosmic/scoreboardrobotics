# Backup and recovery runbook

## Backup policy

- Enable Supabase point-in-time recovery for the production tier appropriate to the event’s data-retention needs.
- Take a logical pre-migration backup and verify its restore before any production schema change.
- Export immutable audit logs and finalized match summaries on a regular schedule; exports must be encrypted at rest and access-controlled.
- Store restoration credentials separately from application secrets. Encrypt backups and test access revocation.

## Before an event

1. Record active frontend deployment version, database migration revision, Override manual/config versions, and open controller/display links.
2. Confirm a recent successful backup and perform a restore drill in a non-production project.
3. Test account login, an owner/admin/scorekeeper/viewer role matrix, a public display link, a controller link, scoring, finalization, and a timer reconnect.
4. Export a read-only event snapshot (teams, schedule, rules) to encrypted storage.

## Recovery procedure

1. Declare incident and stop creating or finalizing matches if integrity is uncertain.
2. Preserve Edge Function logs, request IDs, and audit logs; rotate links if a credential incident is suspected.
3. Select a point-in-time backup before the incident. Restore to an isolated project first.
4. Validate migration version, user/profile references, row counts, match/result parity, and a sample of `score_events` against `match_results`.
5. Repoint the frontend only after access policy and realtime configuration are validated. Do not use production service-role keys in the recovery environment.
6. Reconcile any paper/referee record through accountable correction events. Never directly overwrite score totals to “catch up.”
7. Announce recovery, monitor errors/realtime lag, and document the final state.

## Deletion workflow

Account deletion should be an authenticated, confirmed operation with a cooling-off policy defined by the organization. Competition data may have an event-record retention obligation; disclose this before deletion. Remove personally identifiable profile fields where legally required, revoke sessions/links immediately, and record the operation in an administrative audit trail without retaining credentials or secrets.
