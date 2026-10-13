# ADR-002 — TypeScript monorepo

## Status
Accepted

## Decision
Use TypeScript as the primary application language and organize the platform as a pnpm/Turborepo monorepo.

Target structure:

```text
apps/
  web/
  api/
  worker/
packages/
  contracts/
  database/
  auth/
  permissions/
  ui/
  event-bus/
  provider-registry/
  forms-engine/
  flux-engine/
modules/
  core/
  tasks/
  scheduling/
  event/
  forms/
  flux/
```

## Reasons
- Share types, validation, contracts and pure business engines across web/API/future clients.
- Keep one main language for a small team and AI-assisted development.
- Make module boundaries explicit without prematurely splitting into microservices.
- Allow future mobile and desktop clients to reuse contracts and domain logic.

## Consequences
- Package/module dependency rules must be enforced.
- Business engines should avoid framework dependencies where possible.
- The monorepo is a modular monolith initially, not a distributed system.