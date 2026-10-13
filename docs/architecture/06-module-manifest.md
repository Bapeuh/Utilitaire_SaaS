# Manifest standard d'un module

Chaque module publie un manifest déclaratif. Le manifest décrit son identité et son contrat avec la plateforme ; il ne contient pas sa logique métier.

## Schéma conceptuel

```yaml
id: tasks
name: Tasks
version: 0.1.0
contract_version: 1

required:
  modules:
    - core
  capabilities: []

optional:
  modules: []
  capabilities: []
  actions: []

owns:
  objects:
    - task
    - phase
    - milestone

permissions:
  - task.read
  - task.create
  - task.edit
  - task.assign
  - task.archive

actions:
  - tasks.create
  - tasks.update
  - tasks.assign_person
  - tasks.archive

events:
  emits:
    - task.created
    - task.updated
    - task.completed
    - task.archived
  listens: []

providers:
  provides:
    - tasks.summary
  consumes: []

ui:
  routes:
    - /tasks
  widgets:
    - tasks.overdue
    - tasks.my_tasks

automation:
  triggers:
    - task.created
    - task.completed
  actions:
    - tasks.create
    - tasks.assign_person
```

## Règles

1. `id` est stable et ne change pas lors d'un renommage marketing.
2. La version du module suit SemVer ; la version des contrats inter-modules est indépendante.
3. `owns.objects` indique les **types d'objets métier enregistrés dans l'Object Registry dont le module est propriétaire**. Il ne décrit ni toutes les tables SQL internes ni les objets Core simplement référencés par le module.
4. Les permissions sont déclarées par le module et enregistrées dans Core.
5. Actions, Events et Providers correspondent à des contrats enregistrés et testables.
6. Une route/widget disparaît de l'UI lorsque le module est désactivé ; les données ne sont pas supprimées.
7. Une dépendance optionnelle ne peut pas être nécessaire au démarrage du module.
8. L'installation vérifie les dépendances requises et les versions compatibles.
9. `events.listens` déclare uniquement les consumers réellement implémentés. Aucun abonnement métier n'est implicite.
10. `automation.triggers` et `automation.actions` décrivent ce qui pourra être exposé au futur moteur d'Automation ; cette section reste déclarative en V1.

## Manifest V1 par module

### Tasks

- required: Core
- provides: `tasks.summary`
- emits: `task.created`, `task.updated`, `task.completed`, `task.archived`
- actions: create/update/assign/archive

### Scheduling

- required: Core
- optional: Resource Service
- les Shifts sont affectés directement à des `Person`; aucune Resource n'est requise pour un Shift V1
- provides: `staff.availability`, `staff.coverage`
- emits: `shift.created`, `shift.published`, `shift.assignment.updated`
- actions: create/update/publish/assign person

### Event

- required: Core
- provides: `event.details`, `event.sessions`, `event.participants`
- emits: `event.created`, `event.published`, `event.cancelled`, `session.created`, `session.updated`, `session.cancelled`, `session.completed`
- actions: get/create/update Event and Session

### Forms

- required: Core
- provides: `forms.submission`
- emits: `form.published`, `form.submitted`, `submission.updated`
- actions: create/publish/submit/get submission
- V1.1 optional consumer: option Providers pour champs dynamiques

### Flux Lite

- required: Core
- optional providers: `event.sessions`, `staff.availability`, `resource.capacity`
- `resource.capacity` est un contrat réservé : aucun provider V1 n'est obligatoire
- provides: `capacity.operational`, `flux.simulation.result`
- emits: `flux.simulation.completed`, `flux.simulation.failed`
- actions: create scenario, simulate, get result

## Consumers V1

Les manifests peuvent déclarer `events.listens` et des Actions optionnelles nécessaires à leurs consumers. Aucun consumer métier cross-module n'est livré par défaut en V1. Chaque consumer ajouté doit être explicite, documenté, testé et idempotent.

## Activation

`workspace_modules` conserve l'état : installed, enabled ou disabled.

Désactiver un module masque ses routes/widgets, désenregistre ses Providers actifs, empêche ses Actions utilisateur, conserve ses données et ne supprime pas ses Events historiques. Réactiver restaure le module et ses données.
