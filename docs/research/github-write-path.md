# GitHub write path: Contents API vs Git Data API, attribution, limits

Research for issue #65 (child of map #60). Question: how should a web app commit edited Notes (and Assets) of a Vault to a GitHub repo?
All claims are from docs.github.com (fetched 2026-11-04). Where a page is silent, that is stated as "not documented" rather than guessed.

## Recommendation (summary)

1. **Single-Note save: Contents API** (`PUT /repos/{owner}/{repo}/contents/{path}`) with the Note's blob `sha`. One request, and the `sha` gives optimistic concurrency per file.
2. **Multi-file commit (rename, Note plus new Assets, bulk edit): Git Data API** (blob, tree, commit, ref update). One atomic commit, and the ref update is a fast-forward check by default.
3. **Token model: GitHub App** with Contents: write (plus Pull requests: write only if PRs are used), preferably acting with a **user access token** so commits are attributed to the signed-in user and limited to the intersection of what the app and the user can do. Fine-grained PATs suit a single-user, self-hosted setup. OAuth App `repo` scope is the coarsest and the weakest choice.
4. **Direct push vs PR:** direct push to the default branch for personal Vaults; branch plus PR when the branch is protected or edits need review. Both use the same endpoints with a `branch` parameter.

## 1. Contents API

Source: https://docs.github.com/en/rest/repos/contents

- `PUT /repos/{owner}/{repo}/contents/{path}`: body `message` (required), `content` (required, Base64), `sha` ("Required if you are updating a file"; blob SHA of the file being replaced), `branch` (defaults to the default branch), `committer`, `author`.
- Responses: 201 on create, 200 on update, 404, 409, 422 ("Validation failed, or the endpoint has been spammed"). The page does **not** say which condition yields 409 vs 422, so the stale-`sha` status code is not documented there. Handle both as a conflict signal.
- Concurrency: "the concurrent requests will conflict and you will receive errors. You must use these endpoints serially instead" (PUT and DELETE on contents). Queue saves per repo.
- `DELETE .../contents/{path}` needs `message` and the file's blob `sha`.
- Size: no limit is stated on the PUT page. The Get-content section states: up to 1 MB all features; 1 to 100 MB only `raw` or `object` media types (with `object`, `content` is empty and `encoding` is `none`); over 100 MB not supported. Directory listings are capped at 1,000 files.
- One file and one commit per request. Multiple files means multiple commits and serial calls.
- The GET response carries `sha`, `content` (Base64) and `size`; keep the `sha` as the edit base.

## 2. Git Data API (multi-file commits)

Sources: https://docs.github.com/en/rest/git/blobs, /trees, /commits, /refs

Sequence for an atomic multi-file commit:

1. Read the branch head (`GET /git/ref/heads/<branch>`) and its commit/tree SHA.
2. `POST /git/blobs`: `content` plus `encoding` (`utf-8` default, or `base64`). Use `base64` for Assets. The create-blob page gives no size limit (the 100 MB figure is on Get-a-blob).
3. `POST /git/trees`: `base_tree` (existing tree SHA; entries overwrite same paths) and `tree[]` of `{path, mode, type, sha | content}`. `mode` `100644` for files. Use `sha` or `content`, not both (`content` makes GitHub create the blob, so small Markdown Notes can skip step 2). Set `sha: null` to delete a file (errors if it does not exist). **If `base_tree` is omitted, files not listed are recorded as deleted**, so always pass it.
4. `POST /git/commits`: `message`, `tree`, `parents` (omit and you write a root commit), optional `author`/`committer`/`signature`.
5. `PATCH /git/refs/heads/<branch>` with `sha`; `force` defaults to false so the update "must be a fast-forward". The page lists 422 and 409 but does not state which one a non-fast-forward returns. If the branch moved since step 1, refetch, rebuild the tree on the new head, and retry.

Conflict model: Contents API conflicts are per-file (`sha`); Git Data conflicts are per-branch (fast-forward). With Git Data, an edit to an unrelated file is only a head-moved retry, but a concurrent edit to the same Note must be detected by the app by comparing the blob SHA at the base commit with the one at the new head before retrying. The API does no merging for you.

Cost: about 4 to 5 write requests per commit (blobs, tree, commit, ref); each REST write costs 5 secondary-limit points (section 5). Contents API is 1 request per file.

## 3. Direct push vs pull request

Sources: https://docs.github.com/en/rest/pulls/pulls, refs page above

- Direct: pass `branch` (or update the default branch ref). Branch-protection interaction is not covered by the pages fetched.
- PR flow: create a ref (`POST /git/refs`, Contents: write) or target a new `branch` name, commit there, then `POST /repos/{owner}/{repo}/pulls` with `head`, `base`, `title`/`body`, optional `draft`. Needs Pull requests: write. The page lists no specific 422 triggers (no commits between branches, PR already exists), so handle 422 generically.
- Merge: `PUT .../pulls/{n}/merge` with `merge_method` (`merge|squash|rebase`) and optional `sha` (head must match, else 409); 405 if the merge cannot be performed. Rebase-and-merge commits are not signed by GitHub (section 4).
- Trade-off: direct push is simplest and gives an immediate Wiki rebuild; a PR gives review, preview and a place to resolve conflicts, but adds branch/PR lifecycle and the extra permission.

## 4. Attribution

Sources: Contents and Commits pages; https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification; https://docs.github.com/en/account-and-profile/reference/email-addresses-reference; https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps

- Contents API: `committer` defaults to the authenticated user; `author` defaults to committer. If you supply either object, `name` and `email` are both required (else 422). Commits API: `author` defaults to the authenticated user and current date, `committer` defaults to `author`.
- Token identity decides default attribution: a GitHub App installation token appears as a bot (docs example `@jenkins[bot]`); a user access token "identifies the app as the user who signed into the app".
- Linking a commit to an account by email: the email page documents only the noreply forms: `ID+USERNAME@users.noreply.github.com` (accounts after 2017-07-18; survives username changes) and `USERNAME@users.noreply.github.com` (older; loses linkage after a rename). Use the ID form when setting `author` explicitly. Full matching rules are not on the page fetched.
- Signing: the web UI auto-signs commits. The page does not say the REST API auto-signs. For Apps/bots, GitHub marks commits verified only when the request is authenticated as the App/bot and contains **no custom author, committer or signature information**. A custom `author` on an installation-token commit therefore forfeits that verified badge. The Commits API `verification.reason` values include `unsigned`, `unverified_email`, `unknown_key`.
- Practical pattern: user token with `author`/`committer` omitted is the simplest correct attribution; or an installation token with `author` set to the human (loses auto-verified) and committer left as the bot.

## 5. Rate limits

Source: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api

Primary (per hour): user (PAT, or App/OAuth app acting for the user) 5,000, shared across all that user's tokens; GitHub App installation 5,000 minimum, +50 per repo beyond 20 and +50 per org user beyond 20, capped at 12,500; Enterprise Cloud higher (15,000). Unauthenticated 60.

Secondary: max 100 concurrent requests; 900 points/minute for REST (GET/HEAD/OPTIONS = 1, POST/PATCH/PUT/DELETE = 5); 90 s CPU per 60 s; **content creation 80 requests/minute and 500/hour** (some endpoints stricter). For a human-paced editor this is ample; for bulk import prefer one Git Data commit rather than many Contents commits. Which Git Data endpoints count as "content creation" is not stated.

Handling: on a primary limit wait until `x-ratelimit-reset`; on a secondary limit use `retry-after`, else if `x-ratelimit-remaining` is 0 wait until reset, else wait at least a minute; back off exponentially; continuing while limited "may result in the banning of your integration".

## 6. Size limits

Sources: Contents page; https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github

- Contents GET: 1 MB full, 1 to 100 MB raw/object only, over 100 MB unsupported.
- Repo-level: Git warns above 50 MiB, GitHub blocks files above 100 MiB (use Git LFS); browser uploads are capped at 25 MiB; keep repos ideally under 1 GB, 5 GB at most.
- The docs fetched give no request-body cap for PUT contents or create blob, and Base64 inflates bodies by about a third. Do not assume a cap; enforce an app-side Asset limit well under 50 MiB.
- Git LFS through these endpoints is not covered by the sources; out of scope.

## 7. Token models and permissions

Sources: https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens; https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps; https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps; https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app

| Endpoint | Fine-grained permission |
|---|---|
| PUT/DELETE contents | Contents: write |
| POST git/blobs, trees, commits | Contents: write |
| PATCH / POST git/refs | Contents: write |
| POST pulls | Pull requests: write |
| GET commits | Contents: read |

Metadata is not listed in those tables. Files under `.github/workflows` additionally need the Workflows permission (classic `workflow` scope); relevant only if a Vault contains that path.

- **OAuth App**: scopes only, `repo` (full read/write to the user's private and public repos, plus org resources) or `public_repo` (public only). Cannot restrict to one repo; tokens are long-lived by default (optional 8-hour expiring tokens). Docs recommend GitHub Apps for finer control. Largest blast radius if leaked.
- **GitHub App**: fine-grained permissions; the account owner picks the installed repos. Installation tokens last 1 hour and are minted server-side with a JWT from the app private key. User access token: expires after 8 hours by default (optional expiring tokens via `offline_access`/app setting), refresh token 6 months; permissions are the **intersection** of app and user permissions, and only repos both can access. Installation rate limit scales with repos/users.
- **Fine-grained PAT**: per-repo scope and the permissions table above; owned by one user, manual rotation, no OAuth flow. Fits a personal/self-hosted Wiki. Shares the user's 5,000/hour budget.

Choice for a multi-user web app: GitHub App with user-to-server tokens. For a single-owner app: fine-grained PAT stored server-side, or an installation token with explicit `author`.

## Open points not settled by primary docs

- HTTP status for a stale `sha` on PUT contents (409 vs 422) and for a non-fast-forward ref update (422 vs 409). Verify empirically; handle both.
- Whether REST commits made with a user token are auto-signed.
- Request-body size caps for PUT contents and create blob.
- Branch-protection interaction with direct push.
