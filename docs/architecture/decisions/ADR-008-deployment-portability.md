# ADR-008 — Deployment portability

## Status
Accepted

## Decision
Package server components with Docker and avoid architecture that requires a single proprietary hosting platform.

Initial logical deployment:

```text
Web client
    |
API (NestJS)
    |
PostgreSQL

Worker ---- PostgreSQL/outbox
    |
S3-compatible object storage
```

## Principles
- Prefer EU-hostable infrastructure for production.
- PostgreSQL remains portable.
- File storage uses an S3-compatible interface.
- Background processing starts simple; PostgreSQL/outbox is sufficient before introducing dedicated queue infrastructure.
- Configuration/secrets are environment-based.
- Development should run locally with containers for required infrastructure.

## Reasons
- Keep early hosting costs and operations manageable.
- Avoid unnecessary vendor lock-in.
- Preserve the future possibility of cloud, enterprise, on-premise or local-site deployments.
- Support event/site use cases where local infrastructure may eventually matter.

## Consequences
Cloud-specific services may still be used, but business architecture must not depend on proprietary APIs when a reasonable portable boundary exists.