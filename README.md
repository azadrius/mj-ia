# MJ IA

Une table de jeu de rôle en ligne avec un maître du jeu IA, pensée pour jouer en vocal sur Discord.

## Feuille de route

1. **Table virtuelle** : cartes, jetons en temps réel, fiches, journal, permissions par rôle.
2. **MJ IA (texte)** : Claude mène la partie ou assiste le MJ, en respectant les permissions.
3. **Voix sur Discord** : le bot écoute les joueurs et fait parler chaque PNJ avec sa voix et ses émotions.
4. **Finitions** : brouillard de guerre, initiative, autres systèmes de JDR.

## Démarrer en local

Il faut Node.js 22 ou plus et Docker (pour PostgreSQL).

```bash
cp .env.example .env        # puis ajuste si besoin
docker compose up -d        # lance PostgreSQL
npm install
npm run dev                 # serveur sur :3001, webapp sur http://localhost:5173
```

Les migrations de la base sont appliquées au démarrage du serveur. Sans configuration Discord, la page de connexion propose une connexion de test par pseudo (`ALLOW_DEV_LOGIN=true`).

Pour tester à plusieurs sur la même machine, ouvre une seconde fenêtre en navigation privée.

### Connexion Discord

1. Crée une application sur https://discord.com/developers/applications.
2. Dans **OAuth2**, ajoute la redirection `http://localhost:5173/api/auth/discord/callback` (adapte l'hôte à `APP_URL`).
3. Remplis `DISCORD_CLIENT_ID` et `DISCORD_CLIENT_SECRET` dans `.env`.

### Production

```bash
npm run build   # compile la webapp dans apps/web/dist
npm start       # le serveur sert l'API, le temps réel et la webapp sur PORT
```

Mets alors `APP_URL` sur l'URL publique et `ALLOW_DEV_LOGIN=false`.

## Organisation du code

| Dossier | Rôle |
| --- | --- |
| `packages/shared` | Types, **règles de permissions**, événements temps réel, systèmes de jeu (D&D 5e). Utilisé par le serveur et la webapp. |
| `apps/server` | Fastify + Socket.IO + PostgreSQL (Drizzle). API REST, connexion, temps réel. |
| `apps/web` | React + Vite + Konva. La table : carte, jetons, fiches, journal. |

## Comment marchent les campagnes

- Une **campagne** a un système de jeu, un mode (MJ humain, IA assistante, MJ IA) et un lien d'invitation.
- Chaque **membre** est MJ, joueur ou spectateur.
- Une campagne contient des **scènes** (carte + grille), des **jetons** (positions en cases), des **fiches** et un **journal** (lieux, PNJ, quêtes, documents, résumés de séance).
- Les joueurs voient uniquement la **scène active** ; le MJ voit et prépare toutes les scènes.

### Permissions

Toute la logique est dans `packages/shared/src/permissions.ts`, testée dans `permissions.test.ts`.

- Chaque fiche et entrée de journal a une visibilité : **MJ seulement**, **tous**, ou **certains joueurs**.
- Un joueur voit toujours sa propre fiche, et peut la modifier.
- Les **secrets du MJ** d'une entrée de journal ne sont jamais envoyés à un joueur.
- Un **jeton caché** n'est visible que du MJ (et de ceux qui le contrôlent).
- Un joueur ne déplace que les jetons qu'il contrôle.

Le filtrage se fait **côté serveur** avant chaque envoi, en REST comme en temps réel : un joueur ne reçoit jamais une donnée qu'il n'a pas le droit de voir.

## Commandes utiles

```bash
npm test             # tests (permissions)
npm run typecheck    # vérification TypeScript de tous les paquets
npm run db:generate  # génère une migration après modification de apps/server/src/db/schema.ts
```

## Ajouter un système de jeu

Déclare le schéma de fiche dans `packages/shared/src/systems/` et ajoute-le à `SYSTEMS` dans `systems/index.ts`. Le formulaire de fiche de la webapp est pour l'instant spécifique à D&D 5e.
