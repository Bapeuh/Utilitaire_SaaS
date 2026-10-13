# ERD — Event & Forms V1

```mermaid
erDiagram
    CONTEXT ||--o{ EVENT : contains
    EVENT ||--o{ PROGRAM_BLOCK : program
    PROGRAM_BLOCK ||--o{ PROGRAM_BLOCK : children
    EVENT ||--o{ SESSION : sessions
    PROGRAM_BLOCK o|--o{ SESSION : primary_block

    EVENT ||--o{ EVENT_PARTICIPANT : participants
    SESSION ||--o{ SESSION_PARTICIPANT : participants
    PERSON ||--o{ EVENT_PARTICIPANT : participates
    PERSON ||--o{ SESSION_PARTICIPANT : participates
    PARTICIPANT_ROLE o|--o{ EVENT_PARTICIPANT : role
    PARTICIPANT_ROLE o|--o{ SESSION_PARTICIPANT : role

    CONTEXT ||--o{ FORM : contains
    FORM ||--o{ FORM_VERSION : versions
    FORM_VERSION ||--o{ FORM_FIELD : fields
    FORM_FIELD ||--o{ FORM_FIELD_OPTION : static_options
    FORM_VERSION ||--o{ FORM_RULE : rules

    FORM ||--o{ FORM_TARGET : targets
    OBJECT ||--o{ FORM_TARGET : target_object

    FORM ||--o{ FORM_SUBMISSION : submissions
    FORM_VERSION ||--o{ FORM_SUBMISSION : submitted_version
    FORM_SUBMISSION ||--o{ FORM_ANSWER : answers
    FORM_FIELD ||--o{ FORM_ANSWER : field

    FORM_SUBMISSION ||--o{ SUBMISSION_SUBJECT : subjects
    OBJECT ||--o{ SUBMISSION_SUBJECT : subject_object
```

## Event — règles

- Event appartient à un Context mais n'est pas lui-même un Context.
- Session appartient obligatoirement à un Event.
- ProgramBlock appartient obligatoirement à un Event.
- Si une Session référence un ProgramBlock, les deux appartiennent au même Event.
- Un ProgramBlock enfant appartient au même Event que son parent.
- Event peut être sans dates lorsqu'il est encore TBD ; une Session possède des dates concrètes en V1.
- `declared_capacity` est une capacité déclarée et non une capacité opérationnelle calculée.
- Participant représente un rôle métier et ne remplace pas Registration.
- Registration, waiting list, ticketing et check-in sont hors V1.

## Forms — règles

- Form vit dans un Context mais peut cibler n'importe quel Object autorisé du Workspace.
- `UNIQUE(form_id, version_number)`.
- Une version publiée est immutable.
- `UNIQUE(form_version_id, key)` pour les champs.
- Les règles V1 restent simples : une condition → une action show/hide (et éventuellement require/optional si retenu lors de l'implémentation).
- Une Submission référence explicitement le Form et la FormVersion utilisée.
- Une Submission `submitted` et ses Answers deviennent immuables.
- `UNIQUE(submission_id, field_id)` ; un multi-select stocke plusieurs valeurs dans le JSON de la réponse.
- Les Subjects d'une Submission sont N:N vers Object Registry.
- Forms conserve la déclaration historique originale ; il ne devient pas la source de vérité des objets métier mis à jour via Automation/Actions.

## V1 réduit

Les champs `reference` dynamiques et les Provider-backed options sont différés en V1.1. Le modèle Object Registry permet de les ajouter sans refonte.