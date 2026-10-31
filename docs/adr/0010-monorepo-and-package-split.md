# One monorepo of three packages and an Example

The repository is a pnpm workspace named `obsidian-md`. It holds three published packages and one private Example:

- `remark-obsidian-md`: the remark plugin. Framework-agnostic MDAST, as ADR 0001 decided.
- `react-obsidian-md`: headless React components (Hover Preview, Properties Panel) with no styling of their own.
- `fumadocs-obsidian-md`: the glue that wires a Vault into Fumadocs (resolver, Slugs, MDX options, Asset URLs, Preview Payload route).
- `examples/fumadocs`: the Example, a Next.js Wiki built from the three. It is copied, not installed.

Each package is versioned and released independently with Changesets.

## Why a monorepo, not git submodules

The Example, the glue and the components change together: a new Preview Payload field touches all three. Submodules would pin each repo to a commit and make that a three-repo, three-PR change with a manual bump step, and CI could not test the packages against each other. A workspace resolves them from source, runs one lint, build and test pass, and gives one issue tracker, glossary and ADR log.

## Why the components are headless

`react-obsidian-md` ships behavior (collapse state that persists, popover timing, nested previews) but no CSS, so it does not impose a design system on the Wiki that uses it. This mirrors ADR 0008 for the plugin: styling is the consumer's. The Example styles them with Tailwind and its own tokens; another Wiki can use plain CSS.

## Why a glue package

Resolving a Vault against Fumadocs' source and routing (Slugs, Asset URLs, link targets, Preview Payload generation) is the same for every Fumadocs Wiki and does not belong in the framework-agnostic plugin (ADR 0001) or in the headless components. Keeping it in `fumadocs-obsidian-md` means the Example is only configuration and layout, so copying it with `degit` leaves the logic upgradable through npm instead of forked.

## Why the Fumadocs patch

Fumadocs parses Frontmatter at four unguarded entry points before any supported hook runs, so one corrupt Note fails the whole build with a stack trace and the glue package cannot intercept it. The Example carries a pnpm patch to `fumadocs-core`'s `frontmatter` function that falls back to plain Markdown, registered in `pnpm-workspace.yaml`. It is tied to an exact version and should be deleted once Fumadocs ships a tolerant parser. `fumadocs-obsidian-md-check` is the safety net that names the offending Notes.

## Consequences

Starting a Wiki means copying `examples/fumadocs` and depending on the published packages, so a breaking change in a package must account for the Example in the same change. The patch must be regenerated on every `fumadocs-core` upgrade.
