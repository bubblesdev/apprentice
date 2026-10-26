# 0001: TypeScript monorepo (pnpm + Turborepo)

Date: 2026-10-26. Status: accepted.
Context: web app, API, worker and shared logic must share types and stay maintainable by one developer, then by contributors.
Decision: one repository, pnpm workspaces, Turborepo tasks, strict TypeScript everywhere.
Consequences: one install and CI pipeline; packages are reusable on their own; native shells can consume core packages later.
