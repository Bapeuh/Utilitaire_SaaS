# Contrats inter-modules — V1

## Objectif

Un module peut enrichir un autre module sans créer de dépendance à ses tables internes. Trois mécanismes standardisent les échanges : **Action**, **Event** et **Provider**.

Règle fondamentale : un module ne lit ni n'écrit directement les tables privées d'un autre module.

## 1. Action — commande synchrone

Une Action demande explicitement à un module d'effectuer une opération et retourne un résultat ou une erreur.

Exemples :

- `tasks.create`
- `tasks.assign_person`
- `forms.get_submission`
- `flux.simulate`
- `event.get_session`

Contrat minimal :

```yaml
key: tasks.create
version: 1
input:
  workspace_id: uuid
  context_id: uuid
  title: string
  description: string|null
output:
  object_id: uuid
  task_id: uuid
permissions:
  - task.create
```

Principes :

- validation d'entrée par le module propriétaire ;
- contrôle des permissions dans le module propriétaire ;
- réponse explicite succès/erreur ;
- aucune connaissance du schéma SQL interne requise par l'appelant ;
- versionnement du contrat si changement incompatible.

## 2. Event — fait asynchrone

Un Event annonce qu'un fait métier a déjà eu lieu. L'émetteur n'attend pas de réponse.

Exemples :

- `task.created`
- `task.completed`
- `shift.published`
- `event.published`
- `session.cancelled`
- `form.submitted`
- `flux.simulation.completed`

Envelope standard :

```yaml
id: uuid
name: form.submitted
version: 1
workspace_id: uuid
context_id: uuid|null
object_id: uuid|null
occurred_at: timestamp
actor_user_id: uuid|null
payload: {}
```

Les événements persistants passent par `outbox_events` dans la même transaction que l'opération métier. Ils ne sont publiés qu'après commit.

Principes :

- un Event décrit le passé ;
- son nom ne doit pas être une commande (`task.created`, pas `create.task`) ;
- payload minimal et stable ;
- pour les données riches, le consommateur appelle ensuite une Action/Provider autorisé ;
- les consommateurs doivent être idempotents : recevoir deux fois le même `event.id` ne doit pas produire deux effets irréversibles.

## 3. Provider — capacité de lecture substituable

Un Provider expose une capacité ou un jeu de données sans imposer quel module le fournit.

Exemples :

- `event.sessions`
- `staff.availability`
- `resource.capacity`
- `capacity.operational`
- futur `cost.workforce`

Contrat conceptuel :

```yaml
key: staff.availability
version: 1
input:
  workspace_id: uuid
  context_id: uuid
  start_at: timestamp
  end_at: timestamp
output:
  people:
    - person_object_id: uuid
      available: boolean
      metadata: {}
```

Principes :

- le consommateur dépend d'une capacité, pas d'un module précis ;
- zéro, un ou plusieurs Providers peuvent exister ;
- le registre connaît les Providers actifs du Workspace ;
- l'absence d'un Provider optionnel ne doit pas casser le module consommateur lorsqu'un fallback manuel est prévu ;
- un Provider reste read-only du point de vue du consommateur.

## 4. Dépendances

Chaque module déclare :

- `required`: sans ces capacités/modules, le module ne peut pas fonctionner ;
- `optional`: enrichissements disponibles lorsqu'un module/capability est présent.

V1 vise très peu de dépendances requises en dehors de Core.

Exemple Flux :

```yaml
required:
  - core
optional_capabilities:
  - event.sessions
  - staff.availability
  - resource.capacity
```

Sans ces Providers, Flux Lite reste utilisable par saisie manuelle.

## 5. ObjectRef standard

Les contrats utilisent l'Object Registry pour adresser génériquement un objet :

```yaml
object_id: uuid
```

Le consommateur ne transporte pas un triplet `module/type/id` comme identité principale. Si nécessaire, `module_key` et `object_type` peuvent être retournés comme métadonnées descriptives.

## 6. Context standard

Les appels contextuels utilisent :

```yaml
workspace_id: uuid
context_id: uuid|null
```

`workspace_id` reste toujours explicite pour l'isolation multi-tenant. `context_id` est requis dès que l'opération vit dans un Context.

## 7. Erreurs standard

Les Actions/Providers doivent retourner des erreurs métier normalisées :

- `VALIDATION_ERROR`
- `NOT_FOUND`
- `FORBIDDEN`
- `CONFLICT`
- `PROVIDER_UNAVAILABLE`
- `MODULE_DISABLED`
- `INTERNAL_ERROR`

Une erreur contient un `code`, un message exploitable par l'UI et éventuellement des détails structurés. Les détails internes/SQL ne sont jamais exposés.

## 8. Versionnement

V1 utilise un entier de version par contrat (`version: 1`).

- ajout d'un champ de sortie optionnel : compatible ;
- ajout d'un champ d'entrée obligatoire : incompatible → nouvelle version ;
- changement de sens/type : incompatible → nouvelle version.

Pas besoin de construire un système complexe de négociation de versions en V1 ; le registre doit néanmoins stocker la version pour permettre l'évolution.

## 9. Permissions

Un appel inter-module ne contourne jamais les permissions. Le contexte d'exécution transporte l'utilisateur/acteur. Le module propriétaire décide si l'opération est autorisée.

Les workers système utilisent une identité système explicitement tracée, pas un faux utilisateur administrateur.

## 10. Frontière transactionnelle

Une transaction DB ne doit pas englober arbitrairement les tables de plusieurs modules.

Si Tasks crée une Task après `form.submitted`, Forms a déjà commité sa Submission. L'Automation/consumer appelle ensuite `tasks.create`. En cas d'échec, la Submission reste valide et l'échec peut être retenté/observé.

Cela évite de créer un monolithe fortement couplé malgré une base de données commune.