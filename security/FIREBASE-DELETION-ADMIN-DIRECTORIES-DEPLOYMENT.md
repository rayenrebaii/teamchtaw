# Firebase account deletion and admin directories: production release

Published on 21 November 2026 (Africa/Tunis), after the owner's explicit authorization to run integration tests and deploy the outstanding changes.

## Published version

- Application commit: `0e39bb03946a41dedf5521a7150391294eda74f7`, pushed normally to `codex/collaborator-firebase-release` without rewriting published history. Unrelated security changes and private artifacts were excluded.
- Render backend: `dep-dc0sugu7bikc73bq8cb0`, observed **live**, exact application commit verified.
- Vercel PWA: `dpl_N8GCsre6jXvCNxJaUv8e9mcJCDhq`, observed **READY**, `aliasAssigned: true`, exact application commit and `teamchtaw-pwa.vercel.app` assigned.
- Production configuration was checked without printing secrets: `AUTH_PROVIDER=firebase`, required Firebase credential settings present.

## Behavior shipped

- Removable accounts queue Firebase deletion by their established UID in the same PostgreSQL transaction as business-account removal/revocation. Firebase deletion is attempted immediately after commit. Failures survive process restarts and are retried from the durable queue. Pending and completed deletion UIDs cannot re-enroll.
- Students and collaborators are removed from the business database. Invited administrator identities are removed from Firebase while their disabled database audit record is retained, as required by the existing audit policy. Principal administrators and self-deletion remain protected.
- No historical orphan identities are enumerated or deleted automatically. The synchronization applies to subsequent removals of linked accounts.
- Members lists and counts only students, keeping server pagination at six profiles. Collaborators uses a handshake icon, distinct from Administrators.
- Administrators now follows the complete Members layout: statistics, status tabs, search, sorting, account type filter, joined dates, compact actions, responsive rows and six-row pagination.

## Backup and migration

- Before applying the additive migration `20261121180000_firebase_account_deletion`, a consistent snapshot of all 32 pre-existing business tables was captured (355 rows).
- A 438,098-byte PostgreSQL custom archive was encrypted with AES-256-GCM; its key was protected using Windows DPAPI. The encrypted backup was saved outside OneDrive under `%LOCALAPPDATA%/ChtawTeam/release-backups/0e39bb03946a41dedf5521a7150391294eda74f7/20261121180000_firebase_account_deletion/verification-1/`.
- The saved archive was decrypted only in memory, its integrity verified, and restored into an owned isolated PostgreSQL instance. All table fingerprints matched the original snapshot.
- The migration adds only `FirebaseAccountDeletion` and its index. The operator verified the reviewed migration against the exact Git commit. Brief shared table locks excluded concurrent application writes from the before/after comparison.
- Migration result: `applied: true`, `existingDataUnchanged: true` for all 32 prior tables. Post-release state: 20 migrations applied, none pending, 33 business tables. Queue observed after backend startup: 0 total, 0 pending.
- No production reset, seed, restore, credential rotation, user removal or account approval change was performed during deployment or verification.

## Validation

- **719 passing tests:** 258 backend unit tests, 230 PostgreSQL HTTP/Socket.IO integration tests, 10 Firebase Auth Emulator tests, 221 frontend UI tests.
- Firebase emulator tests verify removal of students, collaborators and invited administrator identities, rejected subsequent sign-in, preserved administrator audits, and durable retry by a fresh worker following a simulated provider outage.
- Integration fixtures were corrected to use normalized emails, provide the required general group, and account for retained fixtures from other suites. These changes do not relax application checks.
- The first concurrent frontend test run hit two timeouts under load. The complete UI suite then passed with one worker; no timeout threshold was increased.
- Backend/PWA production builds, backend TypeScript, full frontend lint and focused backend lint passed. Global backend lint has the previously documented unrelated failures outside this release's changes.
- Real public health requests returned 200 on Render and the PWA proxy; anonymous Members and Administrators requests returned 401.
- Published UI verification passed at 1440px dark and 390px dark/light: student-only Members rows and lazy pagination, primary export/calendar buttons, handshake icon, the full Administrators layout, Polls, Attendance, Schools and school requests. Mobile English login and registration wizard also passed. No horizontal overflow or page JavaScript errors were observed.
- All private API calls and WebSockets were intercepted in browser verification, using fictional identities. No real production user was signed in, exported, invited or removed for testing. Real deletion behavior was tested only against disposable PostgreSQL/Firebase emulator data.
- Screenshots are retained under `chtaw-team-pwa/.test-browser-results/admin-tables-release/`. Published desktop Administrators and mobile Members screenshots were visually inspected.

PWA: https://teamchtaw-pwa.vercel.app
