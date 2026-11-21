# Admin tables, English authentication and remote members pagination

Published on 21 November 2026 (Africa/Tunis), following the owner's explicit request to deploy all changes from this session.

- Application commit: `b3a2e9c31dc55a6a67ac7931f911d626aeb77307`, pushed normally to `codex/collaborator-firebase-release`. No published history was rewritten. Pre-existing security files and unrelated local changes were excluded.
- Backend Render: `dep-dc0s5rs9v7es739pqkgg`, confirmed `live` with the exact application commit, before publishing the frontend.
- PWA Vercel: `dpl_447cX2a26MbE9YQWSUcmLM5dwAon`, confirmed `READY`, `aliasAssigned: true`, exact application commit and `teamchtaw-pwa.vercel.app` assigned.
- CLI Vercel login was renewed after the previous operator credential returned 403. No application credentials, database schema, business data or account approvals were changed.

## Changes shipped

- Login and registration respect the selected language, including school/photo selection and validation copy. Session loading now reads “Getting everything ready for you…” in English.
- Admin dashboard explanatory paragraphs removed; analytics label matches the membership label color.
- Members export label changed to “Export all users”, using the primary button colors. This is a label/style change; the existing student export endpoint and data scope are unchanged.
- Members bulk-selection explanation removed; school editing has a pencil icon.
- Polls Calendar button uses primary colors. Administrators, Polls, Attendance and Schools reuse Members table styles and responsive rows.
- School suggestions are accessed through a header button with a pending count and a separate dialog containing status filters and review actions. School review remains separate from account approval.
- Members uses the admin-only `/api/v1/users/members` endpoint: at most six profiles per response, with database search, status/group/date filters, deterministic ordering, totals and status counts. Next/Previous fetch the requested page; pages are not prefetched. The members route no longer calls the shared full-user-directory collector during background synchronization. Cross-page selection is preserved; filters clear selection.

## Validation

- Backend production build and PWA production build passed using the isolated environment guard.
- 243 backend unit tests, 117 frontend logic tests and 219 frontend UI tests passed (579 total). TypeScript passed for both applications. Frontend lint and focused backend lint passed.
- Global backend lint still has two pre-existing failures outside the release changes, in `test/security-rotation.emulator.ts` and `test/session-audit.integration.ts`.
- Added the `--members` isolated HTTP integration scenario. It could not run because the Docker engine was unavailable, including after an authorized elevated attempt. No existing database was used as a substitute.
- Real public API and PWA proxy health returned 200. Anonymous access to `/api/v1/users/members?page=1` and school suggestions returned 401 on both domains.
- `node security/verify-admin-tables-release.cjs` passed against the published frontend: six admin screen checks at 1440px dark, 390px dark and 390px light; mobile English login and all three registration steps also passed. The Members check confirmed six rows per page, a request for page 2 on Next, and no request to the full directory while on Members. Export and Calendar use primary button classes.
- These browser checks intercepted all private API calls and WebSockets, used fictional identities, and performed zero business writes. They verify shipped UI assets and request behavior, not authenticated production database results. No real user login, export, invitation, school review or attendance edit was performed.
- Screenshots are saved locally under `chtaw-team-pwa/.test-browser-results/admin-tables-release/`. Desktop Polls and the school requests dialog were visually inspected, as was the mobile dialog. No horizontal overflow or page JavaScript errors were observed.

Public PWA: https://teamchtaw-pwa.vercel.app
