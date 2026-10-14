# Démarrage développement

## Prérequis
- Node.js 22+
- pnpm 10+
- Docker + Docker Compose

## Installation
```bash
pnpm install
docker compose up -d
pnpm dev
```

Web : http://localhost:5173
API health : http://localhost:3000/health
MinIO console : http://localhost:9001

Copier `.env.example` vers `.env` avant les développements qui consomment la DB ou le stockage objet.

## Contrôles
```bash
node scripts/check-module-boundaries.mjs
pnpm check
```

Le Lot 0 ne crée encore aucun schéma métier ni migration : ceux-ci commencent avec Foundation afin de rester alignés sur les ERD et contraintes validées.
