# Contributing to Orbit

Thanks for your interest in Orbit. This guide covers how to pick up an issue, set up the project, and get a pull request merged.

---

## 1. Claiming an issue

1. Browse the [open issues](https://github.com/Orbit-xyz/Orbit/issues). Issues labeled `good first issue` are a good place to start.
2. Comment on the issue asking to be assigned. Briefly say how you plan to approach it.
3. Wait until a maintainer assigns you before you start. Unassigned PRs for issues someone else is working on may be closed.
4. One issue per contributor at a time, unless a maintainer says otherwise.
5. If you can no longer work on an issue, comment so it can be reassigned. Issues with no activity for 7 days after assignment may be unassigned.

### Labels

| Label | Meaning |
|---|---|
| `difficulty: easy` | Small, well-scoped change. Good for first-time contributors. |
| `difficulty: medium` | Needs some understanding of the codebase or Soroban. |
| `difficulty: hard` | Design work or changes across several parts of the system. |
| `area: contract` | Soroban smart contract (`contracts/soroban`) |
| `area: backend` | Merchant API (`apps/backend`) |
| `area: frontend` | Next.js app (`apps/frontend`) |
| `area: widget` | Checkout widget (`packages/checkout-widget`) |
| `area: docs` | Documentation (`Docs/`, READMEs, docs site) |
| `area: ci` | Build, test and release tooling |
| `security` | Affects funds, keys or access control |

---

## 2. Project layout

```
contracts/soroban/          Soroban contract (Rust, no_std) and unit tests
apps/backend/               Merchant API (Express + Supabase + Stellar SDK)
apps/frontend/              Landing page and merchant dashboard (Next.js)
packages/checkout-widget/   Embeddable checkout widget (React + Vite)
scripts/                    Testnet deploy and end-to-end flow scripts
Docs/                       Architecture, spec and product docs
```

See [Docs/ARCHITECTURE.md](Docs/ARCHITECTURE.md) for how the pieces fit together.

---

## 3. Local setup

### Prerequisites

- Rust (stable) with the `wasm32v1-none` target: `rustup target add wasm32v1-none`
- [Stellar CLI](https://developers.stellar.org/docs/tools/stellar-cli)
- Node.js 18+ and npm 9+

### Contract

```bash
cd contracts/soroban
cargo test
stellar contract build
```

### Frontend

```bash
cd apps/frontend
npm install
npm run dev          # http://localhost:3000
npm run typecheck
npm run lint
```

### Backend

```bash
cd apps/backend
npm install
cp .env.example .env # fill in your own Supabase project values
node index.js        # http://localhost:3001
```

Create the tables by running `apps/backend/schema.sql` in your Supabase project. Never commit `.env` or any secret key.

### Checkout widget

```bash
cd packages/checkout-widget
npm install
npm run dev
```

---

## 4. Making changes

### Branch naming

Fork the repo, then create a branch from `main`:

```
<type>/<issue-number>-<short-description>
```

Examples: `feat/12-cancel-vault`, `fix/7-overflow-check`, `docs/21-api-reference`.

### Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>
```

- **type**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`
- **scope**: `contract`, `backend`, `frontend`, `widget`, `docs`, `scripts`

Example: `fix(contract): use checked_add for pull interval`

### Code expectations

- Keep the change focused on the issue. Open a separate issue for unrelated fixes.
- Match the style of the surrounding code.
- Contract changes must include tests in `contracts/soroban/src/test.rs`.
- Run `cargo fmt` and `cargo clippy` for Rust changes.
- Run `npm run typecheck` and `npm run lint` for frontend changes.
- Update the docs or README if you change behavior, a contract function, or an API route.

---

## 5. Opening a pull request

1. Push your branch to your fork and open a PR against `main`.
2. Link the issue in the description, for example `Closes #12`.
3. Describe what changed and how you tested it. Add screenshots for UI changes.
4. Make sure all tests and checks pass.
5. A maintainer will review it. Address the feedback by pushing new commits to the same branch.

PRs that are unrelated to an assigned issue, or that mostly contain formatting or typo churn, may be closed.

---

## 6. Reporting security issues

Do not open a public issue for vulnerabilities that could put funds or keys at risk. Contact the maintainers privately through the repository's security advisory page ("Security" tab, "Report a vulnerability").

---

## 7. License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
