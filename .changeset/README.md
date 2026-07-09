# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).

When a PR changes published behavior, run `bun run changeset` and commit the generated file. On
merge to `main`, the release workflow opens (or updates) a "chore: release" PR that bumps the
version and CHANGELOG. Merging that PR publishes to npm with provenance.
