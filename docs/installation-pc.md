# Installer MJ IA sur ton PC (Windows 11 + NVIDIA)

Tout tourne sur ton PC : la base de données, la voix (Piper), l'écoute (Whisper sur ta carte graphique), la table et le bot Discord. Seul le MJ IA appelle l'API Claude, payée à l'usage.

Le PC doit rester allumé pendant les parties. Compte environ 15 Go d'espace disque (images Docker et modèles).

## 1. Préparer Windows (une seule fois)

1. **Pilote NVIDIA** à jour (GeForce Experience ou nvidia.com). Rien d'autre à installer pour CUDA : Docker s'en charge.
2. **Docker Desktop** : https://www.docker.com/products/docker-desktop/. À l'installation, garde « Use WSL 2 ». Redémarre si on te le demande.
3. Dans Docker Desktop > Settings > Resources > WSL integration, vérifie que c'est activé. Pour tester la carte graphique, dans un terminal PowerShell :
   ```powershell
   docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu22.04 nvidia-smi
   ```
   Tu dois voir le nom de ta carte.
4. **Git** : https://git-scm.com/download/win.

## 2. Récupérer le projet

```powershell
git clone https://github.com/azadrius/mj-ia.git
cd mj-ia
copy .env.example .env
notepad .env
```

Dans `.env`, remplis au minimum :

- `ANTHROPIC_API_KEY` : ta clé sur https://console.anthropic.com (sans elle, la table marche mais l'IA ne répond pas).
- `DISCORD_BOT_TOKEN` : voir [bot-discord.md](bot-discord.md).
- `DISCORD_CLIENT_ID` et `DISCORD_CLIENT_SECRET` : pour que les joueurs se connectent avec Discord (nécessaire pour que le bot sache qui parle).
- `APP_URL` : l'adresse où les joueurs ouvrent la table (voir étape 4). En attendant : `http://localhost:3001`.

## 3. Lancer

```powershell
docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile app up -d --build
```

La première fois, compte 10 à 20 minutes (téléchargement des images, des voix et du modèle Whisper). Ensuite, le démarrage prend quelques secondes, et tout redémarre seul avec Docker Desktop.

Ouvre http://localhost:3001. Vérifications :

```powershell
docker compose logs app --tail 20       # « Serveur MJ IA prêt », « [discord] connecté »
curl.exe http://localhost:5001/health   # Whisper : {"ok": true, ...}
curl.exe http://localhost:5000/voices   # Piper : la liste des voix
```

Sans carte NVIDIA, enlève `-f docker-compose.yml -f docker-compose.gpu.yml` : Whisper tourne alors sur le processeur avec le modèle `small`, plus lent.

Mettre à jour après une nouvelle version :

```powershell
git pull
docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile app up -d --build
```

## 4. Ouvrir la table à tes joueurs

Les joueurs ont besoin d'une adresse publique en `https://`. Deux options gratuites :

**Pour essayer (aucun compte)** : Cloudflare Quick Tunnel.

```powershell
docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile app --profile tunnel up -d
docker compose logs tunnel | findstr trycloudflare
```

L'adresse `https://….trycloudflare.com` change à chaque redémarrage du tunnel. Il faut alors mettre à jour `APP_URL` dans `.env` et la redirection OAuth sur Discord, puis relancer `app`. Pratique pour un test, pénible pour chaque séance.

**Pour jouer régulièrement** : Tailscale Funnel donne une adresse fixe gratuite (`https://ton-pc.ton-reseau.ts.net`).

1. Installe Tailscale pour Windows (https://tailscale.com/download) et connecte-toi.
2. Dans la console Tailscale, active HTTPS et Funnel (Settings > Funnel).
3. Dans PowerShell : `tailscale funnel --bg 3001`. L'adresse s'affiche.
4. Mets cette adresse dans `APP_URL`, et `https://<adresse>/api/auth/discord/callback` dans les redirections OAuth2 de ton application Discord. Mets `ALLOW_DEV_LOGIN=false`.
5. Relance : `docker compose ... --profile app up -d`.

## Réglages utiles (dans `.env`)

| Variable | Rôle |
| --- | --- |
| `WHISPER_MODEL` | `large-v3-turbo` par défaut sur GPU. `medium` ou `small` si ta carte a peu de mémoire (moins de 6 Go). |
| `STT_SILENCE_MS` | Silence qui termine une phrase (900 ms). Monte-le si le bot coupe les joueurs. |
| `AI_TABLE_DEBOUNCE_MS` | Calme attendu avant que l'IA réponde (1500 ms). |
| `AI_MODEL` | `claude-haiku-5-5` coûte beaucoup moins cher que `claude-opus-5-5`. |

## En cas de souci

| Symptôme | Piste |
| --- | --- |
| `could not select device driver "nvidia"` | Pilote NVIDIA trop ancien, ou Docker Desktop sans WSL 2. Refais l'étape 1.3. |
| Whisper redémarre en boucle (`CUDA out of memory`) | Prends un modèle plus petit : `WHISPER_MODEL=medium` dans `.env`. |
| La page s'ouvre mais la connexion Discord échoue | `APP_URL` et la redirection OAuth sur Discord doivent être exactement la même adresse. |
| Les joueurs ne voient pas les changements de carte en direct | Le tunnel doit laisser passer les WebSockets : c'est le cas de Cloudflare et Tailscale, vérifie l'adresse utilisée. |
