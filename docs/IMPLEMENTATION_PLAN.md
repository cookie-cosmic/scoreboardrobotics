# Incremental implementation plan

The empty repository was inspected on October 24, 2026. The following baseline is now in the repository.

## Completed baseline

- Project bootstrapping, typed frontend, responsive desktop/controller/display UI.
- Supabase schema, Auth profile trigger, normalized core records, indexes, role helpers, RLS policies, and audit model.
- Transactional score, undo, timer, Override tally, and finalization action model.
- Controller-link secret hashing/exchange functions and a separate public-display credential model.
- Live protected match loading plus transactional score, undo, and timer calls in desktop and phone-controller flows; minimal team and opening-match administration.
- Pinned Override v2.1 numerical configuration and calculator with unit tests.
- Developer setup, security and recovery documentation.

## Next implementation increments (must be tested against a provisioned Supabase test project)

1. **Data administration:** team CRUD/import/export, match scheduler, rule version editor, full template cloning, invitation acceptance workflow, account deletion flow.
2. **Operational controller hardening:** add a protected match selector, richer confirmed/pending/rejected offline state, correction-reason entry, and a referee-only finalization confirmation.
3. **Displays and realtime:** public display exchange (fragment to limited display session), layout selector, fullscreen, subscribe/reconcile implementation, reconnect test.
4. **Override workflow:** graphical nine-goal/four-toggle referee panel, per-goal input validation, autonomous criteria/referee checklist, penalties/Match Affecting annotations, tie-breaker workflow based on current official manual/Q&A.
5. **Reports:** standings, event search, category breakdown, CSV/print exports, finalized-versus-draft filters.
6. **Production acceptance:** database/RLS integration suite, Edge Function tests, multi-context Playwright tests, aXe checks, load/rate-limit tests, backup restore drill, deploy hardening.

The next increments are explicitly not marked complete until their database operations and authorization tests—not just UI controls—pass.
