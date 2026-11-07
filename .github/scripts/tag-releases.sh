#!/usr/bin/env bash
# Tag and release every public package whose current version has no git tag yet.
#
# changesets/action only pushes tags and creates GitHub Releases when it can
# parse them from `changeset publish` output, which is not reliable (a
# successful publish once pushed nothing). This derives the same result from
# the package versions themselves, so it is idempotent: a package already
# tagged on the remote is skipped, and a normal push to main that did not bump
# a version does nothing.
#
# Needs: git, gh (GH_TOKEN), node. Set DRY_RUN=1 to only print what would run.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
git fetch --tags --quiet origin

for dir in packages/*/; do
  dir=${dir%/}
  [ -f "$dir/package.json" ] || continue
  read -r name version private < <(node -p \
    "const p=require('./$dir/package.json');[p.name,p.version,!!p.private].join(' ')")
  [ "$private" = "false" ] || continue

  tag="$name@$version"
  if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
    continue
  fi

  # The changelog section for this version is the release body.
  notes=$(awk -v v="## $version" '$0==v{f=1;next} /^## /{f=0} f' "$dir/CHANGELOG.md" 2>/dev/null || true)
  [ -n "$notes" ] || notes="Release $tag."

  echo "Releasing $tag"
  if [ "${DRY_RUN:-}" = "1" ]; then
    printf '%s\n' "$notes"
    continue
  fi
  git tag "$tag"
  git push origin "refs/tags/$tag"
  gh release create "$tag" --verify-tag --title "$tag" --notes "$notes"
done
