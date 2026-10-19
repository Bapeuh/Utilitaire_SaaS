# Lot 2 — Hardening / sortie Alpha 0.2

Ce document définit la passe finale avant ouverture de la PR du Lot 2 vers `main`.

## Objectif

Valider que le module Tasks et ses données transverses sont sûrs en multi-workspace, cohérents avec les permissions V1, reproductibles sur une base vierge et utilisables sans dépendance implicite à un autre module métier.

## Contrôles obligatoires

### API et permissions

- matrice Administrator / Manager / Member / Guest sur Tasks ;
- un utilisateur hors Workspace reçoit un `404` avant toute synchronisation de permissions ;
- Guest ne voit aucune Task par défaut ;
- Member peut create/read/update/assign/comment mais pas archive ;
- Manager et Administrator ont toutes les permissions Tasks V1 ;
- Comments/Files/Tags/Relations réutilisent les permissions de la Task source ;
- Notifications sont toujours limitées à l'utilisateur courant du Workspace.

### Relations

Dans le Lot 2, l'API Tasks ne permet de créer une relation que vers une autre Task active du même Workspace et lisible par l'utilisateur. Cette restriction évite qu'un `targetObjectId` connu permette de référencer ou révéler un objet d'un autre module sans contrat de visibilité générique.

Les relations inter-modules seront ouvertes ultérieurement via un Provider/contrat de visibilité d'objet, pas par lecture directe des tables privées des autres modules.

### Isolation tenant

- aucun accès lecture/écriture cross-workspace par ID direct ;
- Person/Team assignées dans le même Workspace ;
- Context, Object Registry et Task utilisent les FKs tenant-safe prévues ;
- les données transverses ciblent Object Registry et non une FK métier vers `tasks`.

### Outbox / notifications

- les Events Tasks sont écrits avec Activity/Outbox dans la transaction métier ;
- le worker traite les événements connus sans les envoyer en dead-letter ;
- les notifications d'assignation sont créées uniquement pour une affectation active (`assigned = true`) ;
- le traitement reste couvert par l'idempotence du consumer Outbox (`processed_events` + consumer key).

### UI

- navigation Tasks unique, sans ancien shim/portal parallèle ;
- Liste et Kanban fonctionnels ;
- drag & drop du Kanban met à jour le statut ;
- détail Task, affectations, checklist, commentaires, tags et métadonnées fichier fonctionnels ;
- filtres Context / statut / priorité / Person / Team ;
- comportement acceptable en desktop et largeur mobile/tablette.

### Migrations / build

Avant PR :

```bash
pnpm install
pnpm --filter @utilitaire/database db:migrate
pnpm --filter @utilitaire/tasks test:integration
pnpm --filter @utilitaire/transverse test:integration
pnpm --filter @utilitaire/api test
pnpm check
```

Une validation supplémentaire doit être faite sur une base PostgreSQL vierge en rejouant toutes les migrations depuis `0000`.

## Critère de sortie

Le Lot 2 peut être proposé en PR vers `main` lorsque :

- tous les tests ci-dessus sont verts ;
- `pnpm check` est vert ;
- une base vierge accepte toute la chaîne de migrations ;
- aucun fichier généré/migration attendu n'est laissé non commité ;
- l'interface Tasks a été validée manuellement ;
- la PR est revue avant merge et le merge reste soumis à validation explicite.
