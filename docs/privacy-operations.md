# Data and privacy operations

Implements the five findings under **P1 — Correct existing data/privacy behavior** in [audit #2](https://github.com/Arch0zn-domain/iubesc-mamele/issues/2). These are prototype operations, not a claim of legal compliance or a supported live deployment.

## Fulfillment and permissions

Administrators use `/admin/privacy`; moderators cannot fulfill privacy requests. An administrator confirms the requester or the basis of a content complaint, records a response, and executes the requested operation. Signed-in requests are bound to their original account. Anonymous access/correction requests require a verified account selection. The prototype does not automatically verify identity or send exports by email.

| Request | Fulfillment | Recorded outcome |
| --- | --- | --- |
| Access | Generate JSON containing the subject's account/profile, contributions, checks, document metadata, sessions without credentials, own teacher profile/offers, privacy requests and family-link status | `export_generated`, completed |
| Correction | Apply a validated account name, alumni field, or field on the subject's claimed teacher profile | `data_corrected`, target and field, completed |
| Illegal content | Select and remove a specific review/reply, deactivate an offer, or unpublish an alumni profile | `content_removed`, target type/id, completed |
| Profile withdrawal | Withdraw/redact the selected teacher profile, contributions and offers; preserve the source-key suppression against reimport | `profile_withdrawn`, completed |
| Account erasure | Disable the account and revoke credentials, erase private/free-text data and queue every owned evidence file | `account_erasure_awaiting_files`, processing; then `account_erased`, completed |

Approval with missing correction/content fields fails. Rejection records a reason and does not execute the operation. Repeated account-erasure approval returns its existing result. File failures cannot mark account erasure completed.

Access exports are downloadable only by the active subject account or an administrator from `/api/privacy/<request-id>/export`, with `Cache-Control: no-store`. The account dashboard exposes the subject's download link. Anonymous requests can be delivered through an administrator after identity verification. Exports omit authentication tokens, passwords, raw evidence and third-party family/contact identities. They expire after seven days; the job removes expired payloads.

## Erasure and retention

Account erasure removes the phone/email/name, sessions, auth accounts and matching OTP identifiers. It clears authored review text, approved/pending teacher replies (tracked by author), request messages, check details/reasons, report reasons/resolutions, alumni data, claimed biography and private family labels/contact fields. Related audit free text is scrubbed, including copies written by staff. Offers and family permissions are deactivated; child sessions are revoked for affected family links. Independently sourced professional records are retained after account erasure; use profile withdrawal for their removal and reimport suppression.

Technical IDs, dates, erased account stubs, status/history and non-text review metadata remain for references and deduplication. These are minimized records, not claimed to be anonymous. Completed privacy/check/report decision text is scrubbed after 30 days; report retention starts at resolution. Audit history and job history are removed after 30 days. Pending privacy requests remain available for fulfillment.

Evidence is encrypted in `DATA_DIR/private-documents`, outside `public`. The retention job expires pending checks at 30 days and deletes evidence after a check decision, after 30 days, or when queued for erasure. All owned files are queued on erasure, including files not linked to a check. A queued file is immediately unavailable through the document endpoint. Deletion treats a missing file as success; other I/O errors persist an error code, attempt count and retry time five minutes ahead. Retry occurs at the next hourly cycle or ordinary cleanup after that time. A failed file does not prevent other files from being processed.

## Running and observing retention

Next.js instrumentation starts the job at server startup, then hourly, without HTTP traffic. Keep the Node process running for this schedule. The local runtime serializes it with database operations and skips overlapping ticks. This is an in-process schedule; a stopped server cannot execute it. It catches up at the next startup.

`/admin/privacy` displays recent job runs, failure counts and pending file-deletion errors. Job errors also go to the server log without document contents or full filesystem paths.

For a one-shot run while the local app is stopped:

```powershell
npm run maintenance
```

Use the same `DATA_DIR` and document key as the app. With local PGlite, do not start a second database process against the same directory while the app owns it. The command exits unsuccessfully if files fail, so an external scheduler can detect failures. The built-in scheduler remains the default while the app is running.

## Migration and reply moderation

Migration `003_privacy_outcomes.sql` backfills authors and review versions for legacy approved replies whose teacher is still claimed. Legacy pending replies and approved replies whose author cannot be recovered are removed. Existing bare privacy approvals reopen as pending with `legacy_approval_requires_fulfillment`; staff must execute and verify their outcome, including rechecking old account/profile approvals.

Every review edit increments its version, clears both approved and pending replies, and returns the review to its existing moderation flow. `/admin/replies` binds a decision to both the displayed review version and a unique pending-reply token. Editing the review or replacing the pending reply makes an old decision fail. Public teacher details show replies only for the approved review's current version.

## Verification

```powershell
npm run typecheck
npm test
npm run build
npm run test:retention
npm run test:e2e
```

Regression fixtures cover public suppression, actual fulfillment and authorization, private export ownership/expiry, teacher correction ownership, erasure with failed file deletion/retry, unattended scheduling, decision-text retention, stale reply decisions and upgrading legacy data. The startup check launches a production server with an isolated temporary database, sends no HTTP requests, verifies expired-check/evidence cleanup and a completed job record, then stops its server and removes only its test directory.

Browser coverage verifies anonymous access fulfillment and protected delivery to the identified account, an applied rectification, and a stale reply form rejected after a review edit. To run without affecting another local server, set `TEST_BASE_URL=http://127.0.0.1:3123` and `TEST_DATA_DIR` to a separate disposable directory. Build first.
