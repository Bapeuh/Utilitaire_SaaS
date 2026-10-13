# ADR-003 — React web application and PWA-first strategy

## Status
Accepted

## Decision
Build the primary client with React + Vite, TanStack Router and TanStack Query. The V1 mobile experience is a responsive Progressive Web App.

## Reasons
- The product is primarily an authenticated business application; SSR/SEO is not a core requirement.
- React has a strong ecosystem for forms, tables, dashboards, planning and complex interactive interfaces.
- PWA provides browser + installable mobile access without maintaining a separate native app in V1.
- A clean API boundary keeps future clients independent from the web framework.

## Consequences
- Responsive/mobile UX is a V1 requirement, not a later retrofit.
- Offline support is prepared but not a full offline-first synchronization engine in V1.
- Browser storage may cache appropriate client state, but PostgreSQL remains the server source of truth.