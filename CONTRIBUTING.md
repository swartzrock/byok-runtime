# Contributing

Thanks for taking a look at BYOK Runtime.

Before opening a pull request, run:

```sh
bun install
bun run format:check
bun run lint
bun run build
bun run typecheck
bun run typecheck:examples
bun run test
bun run pack:check
bun run publint
bun run attw
```

If your PR changes published behavior, add a changeset (`bun run changeset`) describing the change and its semver impact. Releases are automated: merged changesets accumulate in a release PR, and merging that PR publishes to npm.

Keep the package app-agnostic. Host apps own storage, UI, secret handling, prompting, validation, and runtime transport policy.
