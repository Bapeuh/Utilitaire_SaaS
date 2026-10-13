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

Principes :

- validation d'entrée par le module propriétaire ;
- contrôle des permissions dans le module propriétaire ;
- réponse explicite succès/erreur ;
- aucune connaissance du schéma SQL interne requise par l'appelant ;
- versionnement du contrat si changement incompatible.

## 2. Event — fait asynchrone

Un Event annonce qu'un fait métier a déjà eu lieu. L'émetteur n'attend pas de réponse.

Exemples : `task.created`, `task.completed`, `shift.published`, `event.published`, `session.cancelled`, `form.submitted`, `flux.simulation.completed`.

Les événements persistants passent par `outbox_events` dans la même transaction que l'opération métier. Ils ne sont publiés qu'après commit.

Principes :

- un Event décrit le passé ;
- payload minimal et stable ;
- pour les données riches, le consommateur appelle ensuite une Action/Provider autorisé ;
- les consommateurs doivent être idempotents sur `event.id`.

## 3. Provider — capacité de lecture substituable

Un Provider expose une capacité ou un jeu de données sans imposer quel module le fournit.

Exemples : `event.sessions`, `staff.availability`, `resource.capacity`, `capacity.operational`, futur `cost.workforce`.

Principes :

- le consommateur dépend d'une capacité, pas d'un module précis ;
- zéro, un ou plusieurs Providers peuvent exister ;
- le registre connaît les Providers actifs du Workspace ;
- l'absence d'un Provider optionnel ne doit pas casser le module consommateur lorsqu'un fallback manuel est prévu ;
- un Provider reste read-only du point de vue du consommateur.

`resource.capacity` est un contrat **réservé** pour les futurs usages génériques de Resource. Aucun module V1 n'est obligé de le fournir. Flux Lite doit fonctionner sans ce Provider.

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

## 4 bis. Consumers déclarés et Automation

L'infrastructure Event Bus existe en V1, mais l'éditeur d'Automation utilisateur reste prévu pour V1.1.

- `events.listens` déclare uniquement les consumers réellement implémentés ;
- une Action utilisée par un consumer doit être déclarée dans les dépendances contractuelles du module ;
- aucun comportement métier cross-module n'est activé implicitement parce qu'un Event existe ;
- la section `automation` du manifest est déclarative en V1 : elle expose les futurs triggers/actions mais n'exécute pas de règles WHEN/IF/THEN ;
- aucun consumer métier cross-module n'est livré par défaut en V1 ; tout ajout doit être explicite, documenté, testé et idempotent.

## 5. ObjectRef standard

Les contrats utilisent l'Object Registry pour adresser génériquement un objet : `object_id: uuid`.

## 6. Context standard

Les appels contextuels utilisent `workspace_id` et, lorsque nécessaire, `context_id`. `workspace_id` reste toujours explicite pour l'isolation multi-tenant.

## 7. Erreurs standard

- `VALIDATION_ERROR`
- `NOT_FOUND`
- `FORBIDDEN`
- `CONFLICT`
- `PROVIDER_UNAVAILABLE`
- `MODULE_DISABLED`
- `INTERNAL_ERROR`

Les détails internes/SQL ne sont jamais exposés.

## 8. Versionnement

V1 utilise un entier de version par contrat. Un ajout de sortie optionnelle est compatible ; un nouvel input obligatoire ou un changement de sens/type exige une nouvelle version.

## 9. Permissions

Un appel inter-module ne contourne jamais les permissions. Le module propriétaire décide si l'opération est autorisée. Les workers système utilisent une identité système explicitement tracée.

## 10. Frontière transactionnelle

Une transaction DB ne doit pas englober arbitrairement les tables de plusieurs modules. Une opération déclenchée après un Event utilise le contrat public du module cible après commit de l'objet source. En cas d'échec, l'objet source reste valide et le traitement peut être retenté/observé.
