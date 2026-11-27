# Héberger MJ IA sur une VM Oracle Cloud gratuite

Toute la table tourne sur une machine virtuelle **Oracle Cloud Always Free** : la base de données, la voix (Piper), l'écoute (Whisper), la table, le bot Discord et l'HTTPS. Seule l'API Claude (le MJ IA) est payée à l'usage.

Ce que l'offre gratuite donne : une VM ARM **Ampere A1 avec 4 cœurs et 24 Go de mémoire**, 200 Go de disque et une adresse IP publique. Pas de carte graphique : Whisper tourne sur le processeur, avec le modèle `small` (2 à 4 secondes par phrase).

Compte environ 45 minutes la première fois.

## 1. Créer le compte Oracle Cloud

1. Inscris-toi sur https://www.oracle.com/cloud/free/. Une carte bancaire est demandée pour vérifier ton identité, mais rien n'est prélevé tant que tu restes dans l'offre gratuite.
2. **Région d'origine** : elle ne peut plus être changée ensuite, et les ressources gratuites n'existent que là. Choisis une région proche, comme Paris, Marseille ou Francfort.
3. **Recommandé : passer le compte en « Pay As You Go »** (menu Billing > Upgrade). C'est toujours gratuit dans les limites Always Free, mais Oracle ne récupère plus les VM gratuites jugées inactives. Sur un compte resté en essai gratuit, une VM qui consomme peu pendant 7 jours peut être arrêtée, ce qui arrive vite entre deux séances. Crée aussi une alerte de budget à 1 € (Billing > Budgets) pour être prévenu au moindre dépassement.

## 2. Créer la VM

Dans la console : **Compute > Instances > Create instance**.

| Réglage | Valeur |
| --- | --- |
| Image | Canonical **Ubuntu 24.04** |
| Shape | **Ampere > VM.Standard.A1.Flex**, 4 OCPU, 24 Go |
| Réseau | Créer un VCN avec un **sous-réseau public**, cocher « Assign a public IPv4 address » |
| Clés SSH | « Generate a key pair » puis **télécharge la clé privée** (fichier `.key`) et garde-la précieusement |
| Boot volume | 100 Go suffisent |

Si Oracle répond **« Out of capacity »**, réessaie plus tard ou choisis un autre « availability domain ». Les VM ARM gratuites sont très demandées.

Note l'**adresse IP publique** de la VM, affichée sur sa page.

## 3. Ouvrir les ports 80 et 443

Sur la page de la VM : clique sur le sous-réseau, puis sur la **Default Security List**, puis **Add Ingress Rules**, deux fois :

| Source CIDR | Protocole | Port de destination |
| --- | --- | --- |
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

Le script d'installation ouvre aussi ces ports dans le pare-feu interne de la VM.

## 4. Se connecter à la VM depuis Windows

Dans PowerShell (remplace le chemin de la clé et l'adresse IP) :

```powershell
icacls $HOME\Downloads\ssh-key.key /inheritance:r /grant:r "$($env:USERNAME):(R)"
ssh -i $HOME\Downloads\ssh-key.key ubuntu@123.45.67.89
```

La première commande restreint les droits sur la clé : sans elle, SSH refuse de l'utiliser.

## 5. Installer MJ IA

Une fois connecté à la VM :

```bash
curl -fsSL https://raw.githubusercontent.com/azadrius/mj-ia/main/scripts/install-vm.sh -o install-vm.sh
bash install-vm.sh
```

Le script installe Docker, ouvre le pare-feu, récupère le code et te pose quelques questions. Ce que tu tapes pour les clés ne s'affiche pas, et rien n'est envoyé ailleurs que dans le fichier `~/mj-ia/.env` de la VM.

- **Adresse de la table** : laisse vide pour une adresse gratuite du type `https://123-45-67-89.sslip.io`. Elle reste la même tant que la VM garde son IP. Tu peux aussi mettre ton propre nom de domaine s'il pointe vers la VM.
- **Clé API Anthropic** : elle se crée sur https://console.anthropic.com. Tu peux la laisser vide, la table marche alors sans l'IA.
- **Jeton du bot Discord** et **Client ID / Secret OAuth** : voir [bot-discord.md](bot-discord.md). Sans OAuth, la connexion par pseudo reste active pour tester.

La première construction prend 10 à 20 minutes (images, voix, modèle Whisper). Ensuite, ouvre l'adresse affichée : le certificat HTTPS se crée tout seul au premier accès.

Avec Discord OAuth, ajoute la redirection `https://<ton adresse>/api/auth/discord/callback` dans ton application Discord (OAuth2 > Redirects).

## 6. Mises à jour

À la main, sur la VM :

```bash
cd ~/mj-ia && bash scripts/update-vm.sh
```

Le script sauvegarde d'abord la base dans `~/mj-ia-sauvegardes` (les 10 dernières sont gardées), puis récupère la dernière version et redémarre.

**Automatiquement à chaque fusion dans main** : ajoute trois secrets dans GitHub, dans le dépôt, sous Settings > Secrets and variables > Actions > New repository secret.

| Secret | Valeur |
| --- | --- |
| `VM_HOST` | l'adresse IP publique de la VM |
| `VM_USER` | `ubuntu` |
| `VM_SSH_KEY` | tout le contenu du fichier `.key` (ouvre-le avec le Bloc-notes et copie tout) |

Le workflow « Déployer sur la VM » lance alors `update-vm.sh` après chaque fusion. Tu peux aussi le lancer à la main depuis l'onglet Actions.

## Réglages utiles (dans `~/mj-ia/.env`, puis `bash scripts/update-vm.sh`)

| Variable | Rôle |
| --- | --- |
| `WHISPER_MODEL` | `small` par défaut. `base` répond plus vite mais comprend moins bien le français. |
| `STT_SILENCE_MS` | Silence qui termine une phrase (900 ms). |
| `AI_MODEL` | `claude-haiku-5-5` coûte beaucoup moins cher que `claude-opus-5-5`. |
| `ALLOW_DEV_LOGIN` | Mets `false` dès que Discord OAuth marche : sinon n'importe qui peut créer un compte par pseudo et une campagne qui utilise ta clé API. |

## Commandes utiles

```bash
cd ~/mj-ia
C="docker compose -f docker-compose.yml -f docker-compose.vm.yml --profile app"
$C ps                 # état des services
$C logs -f app        # journaux de la table et du bot
$C logs -f caddy      # HTTPS
$C restart app        # redémarrer la table
```

## En cas de souci

| Symptôme | Piste |
| --- | --- |
| La page ne s'ouvre pas du tout | Vérifie les règles 80 et 443 de la Security List (étape 3). |
| Erreur de certificat HTTPS | Regarde `$C logs caddy`. Les ports 80 et 443 doivent être ouverts pour que Let's Encrypt valide l'adresse. |
| `permission denied ... docker.sock` | Déconnecte-toi puis reconnecte-toi en SSH (l'ajout au groupe docker prend effet à la connexion suivante). |
| La VM a été arrêtée par Oracle | Compte resté en essai gratuit : passe en Pay As You Go (étape 1.3) et redémarre la VM depuis la console. |
| La transcription est lente | `WHISPER_MODEL=base` dans `.env`, puis `bash scripts/update-vm.sh`. |
