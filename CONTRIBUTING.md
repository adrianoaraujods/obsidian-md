# Contributing

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/); a commit-msg hook enforces it.

## Adding a changeset

The publishable packages (`remark-obsidian-md`, `react-obsidian-md`, `fumadocs-obsidian-md`) are versioned independently with [Changesets](https://github.com/changesets/changesets). The private `examples/fumadocs` app is ignored.

For any user-visible change to a package (feature, fix, breaking change), add a changeset in the same pull request:

```sh
pnpm changeset
```

Pick the affected packages, the bump type (patch, minor or major, per semver) and write a short summary for the changelog. Commit the generated `.changeset/*.md` file. Docs, tests, CI and example-only changes do not need one.

Run `pnpm changeset status` to see which packages would be released.

## How releases work

On every push to `main`, the Release workflow (`.github/workflows/release.yml`) opens or updates a "Version Packages" pull request that bumps versions and changelogs from pending changesets. Merging it publishes only the changed packages to npm with provenance, through npm trusted publishing (OIDC). There is no long-lived npm token.
