#!/usr/bin/env bash
# Installation de MJ IA sur une VM Ubuntu 22.04 ou 24.04 (Oracle Cloud Always Free, ARM ou x86).
# À lancer sur la VM :
#   curl -fsSL https://raw.githubusercontent.com/azadrius/mj-ia/main/scripts/install-vm.sh -o install-vm.sh
#   bash install-vm.sh
# Le script peut être relancé sans risque : il garde le .env existant.
set -euo pipefail

REPO_URL="https://github.com/azadrius/mj-ia.git"
APP_DIR="${APP_DIR:-$HOME/mj-ia}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.vm.yml --profile app)

say() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }

say "1/5 Docker"
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl git
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" |
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
fi
# Le groupe docker ne s'applique qu'à la prochaine connexion : en attendant, on passe par sudo.
if ! docker info >/dev/null 2>&1; then COMPOSE=(sudo "${COMPOSE[@]}"); fi

say "2/5 Pare-feu de la VM (ports 80 et 443)"
# Les images Ubuntu d'Oracle bloquent tout sauf SSH dans iptables, en plus de la « security list » d'Oracle.
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 1 -p tcp -m state --state NEW --dport "$port" -j ACCEPT
  fi
done
if command -v netfilter-persistent >/dev/null 2>&1; then sudo netfilter-persistent save >/dev/null; fi

say "3/5 Code de MJ IA"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

say "4/5 Réglages (.env)"
if [ ! -f .env ]; then
  cp .env.example .env
  ip="$(curl -fsS https://api.ipify.org || true)"
  default_domain="${ip//./-}.sslip.io"
  read -rp "Adresse de la table [${default_domain}] (laisse vide pour l'adresse gratuite) : " domain
  domain="${domain:-$default_domain}"
  # Les saisies ne s'affichent pas à l'écran.
  read -rsp "Clé API Anthropic (vide = pas d'IA pour l'instant) : " anthropic; echo
  read -rsp "Jeton du bot Discord (vide = pas de bot) : " bot; echo
  read -rp "Discord OAuth Client ID (vide = connexion par pseudo) : " client_id
  client_secret=""
  if [ -n "$client_id" ]; then read -rsp "Discord OAuth Client Secret : " client_secret; echo; fi

  set_var() { # remplace ou ajoute VAR=valeur dans .env
    local key="$1" value="$2"
    if grep -q "^${key}=" .env; then
      python3 - "$key" "$value" <<'PY'
import sys
key, value = sys.argv[1], sys.argv[2]
lines = open(".env").read().splitlines()
lines = [f"{key}={value}" if l.startswith(f"{key}=") else l for l in lines]
open(".env", "w").write("\n".join(lines) + "\n")
PY
    else
      echo "${key}=${value}" >> .env
    fi
  }
  set_var DOMAIN "$domain"
  set_var APP_URL "https://$domain"
  set_var DB_PASSWORD "$(openssl rand -hex 24)"
  set_var ANTHROPIC_API_KEY "$anthropic"
  set_var DISCORD_BOT_TOKEN "$bot"
  set_var DISCORD_CLIENT_ID "$client_id"
  set_var DISCORD_CLIENT_SECRET "$client_secret"
  # Sans Discord, on garde la connexion par pseudo pour pouvoir tester.
  set_var ALLOW_DEV_LOGIN "$([ -n "$client_id" ] && echo false || echo true)"
  set_var WHISPER_MODEL small
  chmod 600 .env
  echo "Réglages enregistrés dans $APP_DIR/.env (modifiable avec : nano $APP_DIR/.env)"
else
  echo ".env existant conservé."
fi

say "5/5 Construction et démarrage (10 à 20 minutes la première fois)"
"${COMPOSE[@]}" up -d --build

domain="$(grep '^DOMAIN=' .env | cut -d= -f2-)"
cat <<EOF

MJ IA démarre. Dans une minute, ouvre : https://${domain}
Le certificat HTTPS est créé automatiquement au premier accès.

Commandes utiles (dans $APP_DIR) :
  bash scripts/update-vm.sh                    # mettre à jour
  ${COMPOSE[*]} logs -f app       # journaux de la table
  ${COMPOSE[*]} ps                # état des services
EOF
if grep -q '^DISCORD_CLIENT_ID=.\+' .env; then
  echo "Discord : ajoute https://${domain}/api/auth/discord/callback dans OAuth2 > Redirects."
fi
