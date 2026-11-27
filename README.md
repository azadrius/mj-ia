# MJ IA

Une table de jeu de rôle en ligne avec un maître du jeu IA, pensée pour jouer en vocal sur Discord.

## Feuille de route

1. **Table virtuelle** : cartes, jetons en temps réel, fiches, journal, permissions par rôle.
2. **MJ IA (texte)** : Claude mène la partie ou assiste le MJ, en respectant les permissions.
3. **Voix sur Discord** : le bot écoute les joueurs et fait parler chaque PNJ avec sa voix et ses émotions.
4. **Finitions** : brouillard de guerre, initiative, autres systèmes de JDR.

## Installer sur ton PC (tout gratuit sauf l'IA)

Guide pas à pas pour Windows 11 avec une carte NVIDIA : [docs/installation-pc.md](docs/installation-pc.md). En résumé :

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile app up -d --build
```

## Développer en local

Il faut Node.js 22 ou plus et Docker (pour PostgreSQL).

```bash
cp .env.example .env        # puis ajuste si besoin
docker compose up -d        # lance PostgreSQL, Piper (voix) et Whisper (écoute)
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

## Le MJ IA (étape 2)

L'IA s'active avec `ANTHROPIC_API_KEY` dans `.env` (clé à créer sur https://console.anthropic.com). Sans clé, la table fonctionne normalement et l'IA prévient le MJ qu'elle n'est pas configurée.

Le mode se choisit dans le panneau MJ :

| Mode | Ce que fait l'IA |
| --- | --- |
| MJ humain | Rien à la table. Le MJ peut lui demander un conseil privé avec `/ia`. |
| MJ humain + IA assistante | Pareil : `/ia` donne des conseils que seul le MJ voit. |
| MJ IA autonome | L'IA répond à chaque action des joueurs : narration, PNJ, jets, jetons, PV, journal. Le MJ humain peut lui glisser une consigne privée avec `/ia`, et un joueur peut lui écrire en privé avec `/mj`. |

### Commandes du chat

| Commande | Effet |
| --- | --- |
| `/r 1d20+5` | Jet de dés public (`2d20kh1` avantage, `2d20kl1` désavantage) |
| `/gr 1d20` | Jet secret, visible du MJ seulement |
| `/w Nom texte` | Chuchoter à un membre |
| `/mj texte` | Message privé au MJ (ou au MJ IA) |
| `/ia texte` | MJ : consigne ou question à l'IA |

### Comment l'IA agit

Le code est dans `apps/server/src/ai/`. À chaque tour, l'IA reçoit la campagne complète vue par le MJ (`context.ts`) et le chat récent, puis agit uniquement avec des outils (`tools.ts`) :

- `say` : une réplique du narrateur ou d'un PNJ, avec une **émotion** (pour la voix de l'étape 3), publique ou privée ;
- `roll_dice`, `move_token`, `set_token_hidden`, `update_hp`, `write_journal`, `set_active_scene`.

Le texte qu'elle écrit hors des outils n'est jamais montré aux joueurs. Garde-fou : `say` refuse un texte qui recopie un secret du MJ, et demande à l'IA de reformuler.

Variables : `AI_MODEL` (par défaut `claude-opus-5-5` ; `claude-haiku-5-5` coûte beaucoup moins cher) et `AI_EFFORT` (`low` par défaut pour répondre vite).

## La voix (étape 3, Piper)

Les répliques de l'IA (narration et PNJ) sont lues à voix haute avec **Piper**, un moteur de synthèse vocale gratuit qui tourne en local. `docker compose up -d` le lance avec cinq voix françaises (siwis, upmc, tom, gilles, mls). La première construction télécharge les voix depuis Hugging Face.

- Chaque PNJ reçoit une **voix stable** : le même nom donne toujours la même voix et la même hauteur. Le narrateur a sa voix à lui (`PIPER_NARRATOR_VOICE`).
- L'**émotion** choisie par l'IA règle le débit, l'expressivité, la hauteur et le volume (`packages/shared/src/voice.ts`).
- Chaque joueur active ou coupe la voix avec le bouton **Voix** en haut de la table. Le son est joué dans son navigateur, il l'entend donc pendant l'appel Discord.
- Si Piper ne répond pas, les répliques restent écrites (`TTS_PROVIDER=none` coupe la voix).

### Mesure de consommation

Chaque réplique lue est comptée en caractères (narration et PNJ séparés), même avec Piper. Chaque appel à l'IA est compté en tokens. Le panneau MJ > **Consommation** affiche les 30 derniers jours par séance, le coût IA estimé, et l'offre ElevenLabs qui suffirait.

## Le bot Discord

Le bot lit les répliques dans votre salon vocal et relie un salon textuel au chat de la table. Avec `/mj ecouter`, il écoute aussi les joueurs : **Whisper** (gratuit, local, `docker/whisper`) transcrit chaque phrase, qui part au chat de la table, et le MJ IA répond à voix haute. Installation pas à pas : [docs/bot-discord.md](docs/bot-discord.md). Il démarre avec le serveur dès que `DISCORD_BOT_TOKEN` est renseigné.

## Commandes utiles

```bash
npm test             # tests (permissions, dés, chat, contexte de l'IA)
npm run typecheck    # vérification TypeScript de tous les paquets
npm run db:generate  # génère une migration après modification de apps/server/src/db/schema.ts
```

## Ajouter un système de jeu

Déclare le schéma de fiche dans `packages/shared/src/systems/` et ajoute-le à `SYSTEMS` dans `systems/index.ts`. Le formulaire de fiche de la webapp est pour l'instant spécifique à D&D 5e.
