# ERD global simplifié — V1

Ce diagramme présente les frontières de domaines et les relations structurantes. Il ne cherche volontairement pas à afficher toutes les colonnes ni toutes les tables de liaison.

```mermaid
erDiagram
    WORKSPACE ||--o{ WORKSPACE_USER : contains
    USER ||--o{ WORKSPACE_USER : joins
    WORKSPACE ||--|| CONTEXT : root_context
    WORKSPACE ||--o{ OBJECT : owns
    WORKSPACE ||--o{ PERSON : owns
    WORKSPACE ||--o{ ORGANIZATION : owns
    WORKSPACE ||--o{ TEAM : owns

    CONTEXT ||--o{ CONTEXT : parent_of
    CONTEXT ||--o| SCOPE : represents
    CONTEXT ||--o| PROJECT : represents
    SCOPE }o--o{ PROJECT : project_scopes

    OBJECT ||--o| PERSON : identifies
    OBJECT ||--o| ORGANIZATION : identifies
    OBJECT ||--o| TEAM : identifies
    OBJECT ||--o| SCOPE : identifies
    OBJECT ||--o| PROJECT : identifies
    OBJECT ||--o| TASK : identifies
    OBJECT ||--o| SHIFT : identifies
    OBJECT ||--o| EVENT : identifies
    OBJECT ||--o| SESSION : identifies
    OBJECT ||--o| FORM : identifies
    OBJECT ||--o| FORM_SUBMISSION : identifies
    OBJECT ||--o| FLUX_SCENARIO : identifies
    OBJECT ||--o| FLUX_SIMULATION : identifies
    OBJECT ||--o| RESOURCE : identifies

    CONTEXT ||--o{ TASK : contains
    CONTEXT ||--o{ SCHEDULE : contains
    CONTEXT ||--o{ SHIFT : contains
    CONTEXT ||--o{ EVENT : contains
    CONTEXT ||--o{ FORM : contains
    CONTEXT ||--o{ FLUX_SCENARIO : contains

    PERSON }o--o{ ORGANIZATION : affiliations
    PERSON }o--o{ TEAM : membership
    PERSON o|--o| RESOURCE : can_be

    TASK }o--o{ PERSON : person_assignment
    TASK }o--o{ TEAM : team_assignment
    TASK }o--o{ TASK : dependency

    SCHEDULE ||--o{ SHIFT : contains
    SHIFT ||--o{ SHIFT_REQUIREMENT : requires
    SHIFT ||--o{ SHIFT_PERSON_ASSIGNMENT : staffed_by
    PERSON ||--o{ SHIFT_PERSON_ASSIGNMENT : assigned

    EVENT ||--o{ PROGRAM_BLOCK : structures
    EVENT ||--o{ SESSION : contains
    PROGRAM_BLOCK o|--o{ SESSION : groups
    EVENT }o--o{ PERSON : participants
    SESSION }o--o{ PERSON : participants

    FORM ||--o{ FORM_VERSION : versions
    FORM_VERSION ||--o{ FORM_FIELD : fields
    FORM ||--o{ FORM_SUBMISSION : receives
    FORM_SUBMISSION ||--o{ FORM_ANSWER : answers
    FORM }o--o{ OBJECT : targets
    FORM_SUBMISSION }o--o{ OBJECT : subjects

    FLUX_SCENARIO ||--|| FLUX_FLOW_MODEL : model
    FLUX_SCENARIO ||--o{ FLUX_OPERATING_PERIOD : periods
    FLUX_SCENARIO ||--o{ FLUX_SIMULATION : runs
    FLUX_SIMULATION ||--|| FLUX_RESULT : produces

    OBJECT ||--o{ COMMENT : comments
    OBJECT }o--o{ FILE : attachments
    OBJECT }o--o{ TAG : tags
    OBJECT ||--o{ RELATION : source
    OBJECT ||--o{ RELATION : target
```

## Lecture

- **Workspace** est la frontière de tenant.
- **Context** définit où vit une activité : Workspace, Scope ou Project.
- **Object Registry** donne une identité générique aux objets qui doivent être référencés transversalement.
- Les relations structurelles internes restent des FK de domaine : Session → Event, Shift → Schedule, Answer → Submission, etc.
- Les liens optionnels entre domaines utilisent `relations` / `object_id`, et les demandes de données dynamiques passent par Providers.
- Aucun module V1 ne doit lire directement les tables privées d'un autre module.
- `Person ↔ Resource` est optionnel en V1 ; Scheduling affecte directement des Persons.

## Domaines V1

| Domaine | Objets principaux |
|---|---|
| Core | Workspace, User, Person, Organization, Team, Scope, Project, Context, Object |
| Core services | Resource, Relation, Comment, File, Tag, Activity, Notification |
| Tasks | Task, Phase, Milestone |
| Scheduling | Schedule, Shift, ShiftRequirement, ShiftPersonAssignment, Availability |
| Event | Event, ProgramBlock, Session, Participant |
| Forms | Form, FormVersion, FormField, FormSubmission, FormAnswer |
| Flux Lite | FluxScenario, FlowModel, OperatingPeriod, Simulation, Result |

Les diagrammes détaillés complètent ce document avec les tables de liaison, cardinalités et invariants.
