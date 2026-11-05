# Repository dependencies

The API installs and runs from a single checkout. It does not require another Eventis repository or published private packages.

| Location | Owns |
| --- | --- |
| `src/contracts/` | HTTP schemas, response types, error codes, and money helpers |
| `config/eslint/` | ESLint rules and module layering checks |
| `tsconfig.base.json` | Shared compiler settings for checks and builds |
| `bun.lock` | Resolved public dependencies used by local development, CI, and Docker |

The mobile application remains a separate repository and communicates with the API over HTTP. Contract changes must preserve compatibility with existing clients.

Install with `bun install --frozen-lockfile`. Do not use `bun link` for API dependencies. See [local setup](../guides/local-setup.md) and [ADR 0010](../adr/0010-self-contained-api.md).
