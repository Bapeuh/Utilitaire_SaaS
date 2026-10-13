# ADR-004 — NestJS backend

## Status
Accepted

## Decision
Use NestJS for the HTTP API and server-side application layer.

## Reasons
- Nest modules map naturally to the platform's Core, Tasks, Scheduling, Event, Forms and Flux boundaries.
- Dependency injection makes cross-module dependencies explicit.
- Guards/interceptors support authentication, contextual permissions, tenant isolation and observability.
- It gives stronger architectural conventions than a minimal Fastify-only backend.

## Rules
- A Nest module may not import another module's repository/database internals.
- Cross-module communication uses registered Actions, Events and Providers.
- Controllers remain thin; business rules live in application/domain services.
- Pure engines such as Flux must not depend on NestJS.

## Consequences
NestJS adds framework structure/boilerplate, accepted in exchange for architectural discipline.