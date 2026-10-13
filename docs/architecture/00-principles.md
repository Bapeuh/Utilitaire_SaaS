# Principes d'architecture

## Règles structurantes

1. **Workspace est la frontière de tenant.**
2. **Context indique où vit une activité.** Les types V1 sont `workspace`, `scope` et `project`.
3. **Object Registry identifie les objets transversalement adressables.**
4. **Un module possède sa vérité métier.** Les autres modules la consomment sans la dupliquer.
5. **Aucun module ne lit directement les tables privées d'un autre module.**
6. **Les échanges inter-modules passent par Actions, Events et Providers.**
7. **Context ≠ Relation.** Le Context est le rattachement principal ; Relation exprime les liens supplémentaires.
8. **User ≠ Person.** User représente l'identité d'accès ; Person représente la personne métier dans un Workspace.
9. **Scope ≠ Project.** Scope est durable ; Project représente une initiative bornée.
10. **Désactiver un module ne supprime jamais ses données.**
11. **Archive par défaut, suppression physique explicite.**
12. **Ne pas généraliser prématurément.** Une abstraction n'entre dans le Core qu'après validation par plusieurs usages réels.

## Abstractions validées pour la V1

- Context Registry
- Object Registry
- Resource Service
- Permissions contextuelles
- Relations génériques
- Files / Comments / Tags / Activity / Notifications
- Module Registry
- Event Bus / Action Registry / Provider contracts
- Transactional Outbox

## Abstractions volontairement non généralisées pour l'instant

- Capacity
- Scenario
- Versioning global
- Status global
- Workflow
- Recurrence

Chaque domaine conserve son modèle propre tant qu'un besoin transversal réel n'est pas démontré.
