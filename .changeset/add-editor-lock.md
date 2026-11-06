---
"codemirror-obsidian-md": minor
---

Add editor lock handling (`createSaveLock`): after a successful Save on a storage with the `lock` capability, the Note stays locked until `isDeployed(commit)` reports the deploy is live, polling after 1 minute then every 5 seconds up to 5 minutes (all configurable). At the timeout it offers Reload from GitHub and Keep waiting; without a build commit it shows a one-time notice and does not lock.
