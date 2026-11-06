# Commit with a shared credential and name the editor in a trailer

Supersedes the commit-identity part of ADR 0013. The authenticated Example lets any signed-in GitHub account edit. Better Auth (stateless, GitHub OAuth) only proves who the person is; it holds no repo token. Every Save, create and delete is committed server-side by one credential configured in an env var: a GitHub App installation token (Contents read/write, installed on the Vault repo only) or the owner's fine-grained PAT. The editor is named in a commit body trailer that the server builds from the verified session, so the client cannot alter it.

```
Update Projects/Roadmap.md

Edited-with: obsidian-md editor
Edited-by: Ada Lovelace (@ada)
```

The subject is `Update <path>`, `Create <path>` or `Delete <path>` (path relative to the Vault root). The body is read-only in the confirmation dialog. No email, no `Co-authored-by`.

## Considered options

- **Commit as the signed-in user (ADR 0013)**: GitHub enforces push access, but only collaborators can edit, which defeats an open Wiki. User-authored commits are also reported to be refused by Vercel Hobby unless the author is the owner. Moved to post-MVP as an adapter for private team Wikis.
- **Explicit author from the session**: forfeits App signing and has no usable address for users with a private email. Rejected.

## Consequences

Anyone with a GitHub account can edit by default. Restricting access is the copier's job, in Better Auth's own hooks (email list, email domain, login allow/block list); the Example documents where. There is no database, so no rate limiting: abuse is handled by reverting commits. The credential is a long-lived write secret; a PAT makes commits appear as its owner. `Edited-by` is the audit trail. Commits never carry skip markers; `[skip actions]` is a copier opt-in that skips Actions only and leaves required checks pending.
