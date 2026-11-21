# Linked account deletion

Account removal now records a Firebase deletion intent in the same PostgreSQL transaction that removes a student/collaborator or disables an invited administrator. It then calls Firebase Admin SDK `deleteUser` with the stored `firebaseUid`. It never looks up an identity by email. An already missing Firebase user counts as success. Principal administrators and self-deletion remain protected.

For invited administrators, the existing disabled database row and attendance audit authors are preserved; their Firebase Authentication identity is deleted and local sessions and links are revoked. This retains the established audit policy.

Firebase and PostgreSQL cannot share an atomic transaction. After the database commits, the backend immediately attempts Firebase deletion, bounded to 15 seconds. On failure or process exit the durable intent remains. A worker retries due jobs on startup and every 30 seconds while the service is running, up to 20 jobs per pass. An atomic five-minute lease prevents concurrent processing and becomes eligible for retry after failures/crashes. No retry depends on the browser staying open. A sleeping/stopped Render instance resumes work after it wakes.

Completed intents retain only the Firebase UID, timestamps and attempt count. Both pending and completed UIDs are rejected during Firebase login and enrollment, including a second check immediately before creating a new database account. This prevents a Firebase identity awaiting cleanup from recreating a deleted business account. New registrations with a newly issued Firebase UID remain possible after the old identity is removed.

The worker refuses to delete a UID still attached to an active business account. It stores no passwords, tokens, email addresses or raw SDK errors. It does not inspect Firebase account lists or remove pre-existing orphan identities automatically.

## Deployment

Apply the additive migration `20261121180000_firebase_account_deletion` before deploying this backend. Generate the Prisma client and build normally. No frontend API contract change is required: the DELETE endpoint continues to acknowledge the business deletion with 204, with durable Firebase cleanup performed immediately or retried automatically. Do not interpret a 204 as proof that an unavailable external service has already completed cleanup.

Production application data and Firebase identities were not modified while implementing this change. Existing orphan identities need a separate reviewed audit; never delete them merely because an email matches a removed database account.

## Verification

Unit tests cover deletion for all removable roles, database rollback, missing links, Firebase failure/retry, concurrent leases, completion-write failure, already absent identities, active-account protection and blocked re-enrollment. Emulator HTTP tests cover deletion of a student, collaborator and invited administrator, verify that Firebase cannot sign them in again, and retain the protected principal/audit policy.

The emulator tests use the existing isolated PostgreSQL/Firebase runner (`npm run test:firebase`), never production credentials. Docker access was subsequently authorized and the HTTP/emulator checks were executed, including durable retry by a fresh worker after a simulated provider outage.

Firebase API reference: [Manage users with the Admin SDK](https://firebase.google.com/docs/auth/admin/manage-users#delete_a_user).
