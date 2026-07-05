# Contributing

Thanks for taking a look at BYOK Runtime.

Before opening a pull request, run:

```sh
bun install
bun run build
bun run typecheck
bun run typecheck:examples
bun run test
```

Keep the package app-agnostic. Host apps own storage, UI, secret handling, prompting, validation, and runtime transport policy.
