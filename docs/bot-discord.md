# Installer le bot Discord

Le bot relie un serveur Discord à une campagne :

- il **lit à voix haute** la narration et les répliques des PNJ dans votre salon vocal (voix Piper) ;
- le **salon textuel lié** et le chat de la table se répondent : ce que vous écrivez sur Discord part à la table (et réveille le MJ IA), et la narration arrive sur Discord ;
- `/r 1d20+5` lance des dés depuis Discord.

Le bot tourne dans le même serveur que la table : il démarre tout seul si `DISCORD_BOT_TOKEN` est renseigné.

## 1. Créer le bot (une seule fois)

1. Va sur https://discord.com/developers/applications et ouvre l'application déjà créée pour la connexion (ou crée-en une : **New Application**, nom « MJ IA »).
2. Onglet **Bot** :
   - clique sur **Reset Token**, copie le jeton et colle-le dans `.env` sur ton PC : `DISCORD_BOT_TOKEN=...`. Ne le partage jamais (ni dans un chat, ni dans Git : `.env` est ignoré) ;
   - active **Message Content Intent** (section *Privileged Gateway Intents*), sinon le bot ne voit pas les messages du salon ;
   - tu peux désactiver **Public Bot** pour que toi seul puisses l'inviter.
3. Onglet **OAuth2** : note le **Client ID**.

## 2. Inviter le bot sur ton serveur

Ouvre cette adresse en remplaçant `CLIENT_ID` :

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=2150697984
```

Les permissions demandées : voir les salons, envoyer des messages, lire l'historique, se connecter et parler en vocal, utiliser les commandes.

## 3. Lancer

```bash
docker compose up -d   # Postgres + Piper
npm run dev            # ou npm start
```

Dans les logs, tu dois voir `[discord] connecté en tant que MJ IA#1234`.

## 4. Relier une campagne

Chaque joueur doit s'être **connecté une fois sur la table avec Discord** et avoir rejoint la campagne : c'est comme ça que le bot sait qui parle.

1. Le MJ rejoint le salon vocal de la partie.
2. Dans le salon textuel de la partie, il tape `/mj lier code:<code d'invitation>` (le code est la fin du lien d'invitation, dans le panneau MJ).
3. Le bot rejoint le salon vocal et confirme.

Autres commandes : `/mj rejoindre` (le bot vient dans ton salon vocal), `/mj quitter`, `/mj statut`, `/mj delier`, `/r formule`.

Seuls les messages **publics** passent sur Discord : chuchotements, messages au MJ, jets secrets et conseils de l'IA restent sur la table.

## En cas de souci

| Symptôme | Piste |
| --- | --- |
| `[discord] démarrage impossible : An invalid token was provided` | Jeton recopié incomplet : refais **Reset Token**. |
| `Used disallowed intents` | Active **Message Content Intent** (onglet Bot). |
| Les commandes `/mj` n'apparaissent pas | Réinvite le bot avec le lien ci-dessus (portée `applications.commands`), puis redémarre le serveur. |
| Le bot est en vocal mais muet | Vérifie que Piper tourne (`curl localhost:5000/voices`) et que l'IA parle bien dans le chat de la table. |
| Le bot ne réagit pas à un joueur | Ce joueur doit se connecter une fois sur la table avec Discord et rejoindre la campagne. |
