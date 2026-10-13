# Périmètre V1

## Core

- Workspace
- Auth / User
- Person
- Organization
- Team / TeamMember
- JobRole
- Context Registry
- Scope
- Project
- Object Registry
- Permissions / AccessRole / AccessGrant
- Module Registry

## Core Services

- Relations
- Comments
- Files
- Tags
- Activity
- Notifications in-app
- Resource Service (fondation optionnelle pour Scheduling ; pas de ResourceBooking/Allocation en V1)
- Transactional Outbox

## Modules V1

### Tasks
- Task / sous-tâches
- Person & Team assignments
- Status / Priority
- Phase
- Milestone
- Checklist
- Dependencies
- List
- Kanban
- Calendar
- Basic Gantt

### Scheduling
- Schedule
- Shift
- ShiftRequirement
- ShiftPersonAssignment
- ShiftBreak
- PersonAvailability
- Conflict detection

Scheduling V1 affecte directement des `Person`. Une Person n'a pas besoin d'être une `Resource` pour être affectée à un Shift. Resource Service reste une capacité Core optionnelle destinée aux futurs usages génériques de réservation/allocation.

### Event
- Event
- ProgramBlock
- Session
- ParticipantRole
- EventParticipant
- SessionParticipant

### Forms
- Form
- FormVersion
- FormField
- Static options
- Simple conditions: IF field = value THEN show/hide
- FormSubmission
- FormAnswer
- Targets / Subjects

### Flux Lite
- Session mode
- Freeflow mode
- Scenarios
- Operating periods
- Simulations
- Comparison
- Throughput / capacity / max concurrent / timeline / basic bottleneck

## Explicitement hors V1

### V1.1
- Registration / Waiting List
- Communication
- Time Tracking
- Procedures
- Dynamic Form providers / reference fields
- Advanced form logic
- Session templates
- Recurring availability
- User-configurable Automation editor
- ResourceBooking / ResourceAllocation

### V2+
- Advanced HR
- Assets
- Spaces
- Maintenance
- Finance
- Ticketing
- CRM
- Procurement
- Deliverables
- Workflow
- Advanced Analytics

## Roadmap de réalisation

0. Lot 0 — Bootstrap du monorepo
1. Alpha 0.1 — Foundation : Organization, Team/TeamMember et TeamAccessGrant inclus
2. Alpha 0.2 — Tasks : Relations et Notifications in-app incluses
3. Alpha 0.3 — Project+ : Phases, Milestones, Dependencies et finalisation UI Teams
4. Alpha 0.4 — Scheduling : Resource Service posé comme fondation optionnelle, sans ResourceBooking/Allocation
5. Alpha 0.5 — Event
6. Alpha 0.6 — Forms
7. Alpha 0.7 — Flux Lite
8. Stabilisation V1
