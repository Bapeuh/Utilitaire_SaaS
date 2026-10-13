# ERD — Tasks & Scheduling V1

```mermaid
erDiagram
    CONTEXT ||--o{ PHASE : contains
    CONTEXT ||--o{ TASK : contains
    CONTEXT ||--o{ MILESTONE : contains

    PHASE o|--o{ TASK : groups
    PHASE o|--o{ MILESTONE : groups
    TASK ||--o{ TASK : parent_child

    TASK ||--o{ TASK_PERSON_ASSIGNMENT : assigned
    PERSON ||--o{ TASK_PERSON_ASSIGNMENT : receives
    TASK ||--o{ TASK_TEAM_ASSIGNMENT : assigned
    TEAM ||--o{ TASK_TEAM_ASSIGNMENT : receives

    TASK_STATUS ||--o{ TASK : status
    TASK_PRIORITY o|--o{ TASK : priority

    TASK ||--o{ TASK_DEPENDENCY : predecessor
    TASK ||--o{ TASK_DEPENDENCY : successor
    TASK }o--o{ MILESTONE : task_milestones
    TASK ||--o{ TASK_CHECKLIST_ITEM : checklist

    CONTEXT ||--o{ SCHEDULE : contains
    SCHEDULE o|--o{ SHIFT : contains
    CONTEXT ||--o{ SHIFT : contains

    SHIFT ||--o{ SHIFT_REQUIREMENT : requirements
    JOB_ROLE ||--o{ SHIFT_REQUIREMENT : role

    SHIFT ||--o{ SHIFT_PERSON_ASSIGNMENT : assignments
    PERSON ||--o{ SHIFT_PERSON_ASSIGNMENT : assigned
    SHIFT_REQUIREMENT o|--o{ SHIFT_PERSON_ASSIGNMENT : fulfils
    SHIFT_PERSON_ASSIGNMENT ||--o{ SHIFT_BREAK : breaks

    PERSON ||--o{ PERSON_AVAILABILITY : availability
    PERSON o|--o| RESOURCE : schedulable_resource
```

## Tasks — invariants

- Parent et enfant doivent appartenir au même Context.
- Task et Phase doivent appartenir au même Context.
- Milestone et Phase doivent appartenir au même Context.
- Les dépendances entre Tasks peuvent traverser les Contexts, sous réserve des permissions.
- Une Task ne peut dépendre d'elle-même.
- Les cycles de dépendances sont refusés par le service Tasks.
- `estimated_minutes` représente un effort de travail, pas une durée calendaire.
- La récurrence n'est pas implémentée dans Tasks.

## Scheduling — invariants

- Un Shift rattaché à un Schedule partage son Context.
- `start_at < end_at` pour Schedule, Shift, Break et Availability.
- `required_count > 0`.
- Une Person ne possède qu'une affectation par Shift.
- Un `shift_requirement_id` référencé par une affectation doit appartenir au même Shift.
- Les conflits de Shift sont détectés par le service Scheduling et peuvent être avertis ou bloqués selon la politique ; ils ne sont pas globalement interdits par la DB.
- Une pause planifiée appartient à une affectation individuelle, pas au Shift entier.
- Scheduling fonctionne sans module HR.

## Périmètre V1

Inclus : List/Kanban/Calendar, Gantt simple, shifts, requirements, affectations, pauses, disponibilités et détection de conflits.

Différé : templates, récurrence native, workload avancé, auto-scheduling, shift bidding/swapping, time tracking, payroll et matching avancé par compétences.