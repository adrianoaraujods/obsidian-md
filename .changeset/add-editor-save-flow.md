---
"codemirror-obsidian-md": minor
---

Add the editor save flow (`createSaveFlow`, `saveFlowExtension`, `mountConflictBanner`): saves through a `Storage`, tracks dirty state with a leave-page warning, and on a stale SHA keeps the text and exposes Copy my text, a confirmed Reload and an explicit Overwrite that re-runs Save through the host's confirm dialog. Host hooks: `confirm`, `subscribe`, `onSaved`, `onReload`.
