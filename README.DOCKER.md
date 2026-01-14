# 🐳 Docker & Railway Deployment

Ce projet est entièrement containerisé et prêt pour un déploiement sur Railway via un simple push GitHub.

## 📋 Prérequis

- Docker & Docker Compose installés
- Variables d'environnement configurées (voir `.env.example`)

## 🚀 Déploiement Local avec Docker

### Commandes Make disponibles

```bash
# Afficher l'aide
make help

# Construire l'image
make build

# Construire sans cache
make build-no-cache

# Démarrer les services
make up

# Voir les logs
make logs
make logs-app

# Arrêter les services
make down

# Accéder au shell du conteneur
make exec-app

# Commandes Prisma
make prisma-generate
make prisma-migrate
make prisma-studio

# Nettoyer
make clean
```

### Démarrage rapide

1. **Configurer les variables d'environnement** :
   ```bash
   cp .env.example .env
   # Éditer .env avec vos valeurs
   ```

2. **Construire et démarrer** :
   ```bash
   make build
   make up
   ```

3. **Vérifier que l'application fonctionne** :
   ```bash
   make test
   # ou ouvrir http://localhost:3000
   ```

## 🚂 Déploiement sur Railway

### Méthode 1 : Via GitHub (Recommandé)

1. **Pousser le code sur GitHub** :
   ```bash
   git add .
   git commit -m "Add Docker configuration"
   git push origin main
   ```

2. **Sur Railway** :
   - Créer un nouveau projet
   - Sélectionner "Deploy from GitHub repo"
   - Choisir votre repository
   - Railway détectera automatiquement le `Dockerfile` et `railway.json`

3. **Configurer les variables d'environnement** :
   - Aller dans "Variables" du projet Railway
   - Ajouter toutes les variables nécessaires :
     - `DATABASE_URL` (Railway peut créer une DB PostgreSQL)
     - `BETTER_AUTH_SECRET`
     - `BETTER_AUTH_URL`
     - `BETTER_AUTH_GITHUB_CLIENT_ID`
     - `BETTER_AUTH_GITHUB_CLIENT_SECRET`
     - `COMPOSIO_API_KEY`
     - `LANGFLOW_API_KEY` (optionnel)
     - `LANGFLOW_API_URL` (optionnel)
     - `NEXT_PUBLIC_APP_URL`

4. **Déploiement automatique** :
   - Railway déploiera automatiquement à chaque push sur la branche principale
   - Les migrations Prisma s'exécuteront automatiquement au démarrage

### Méthode 2 : Via Railway CLI

```bash
# Installer Railway CLI
npm i -g @railway/cli

# Se connecter
railway login

# Initialiser le projet
railway init

# Lier à un projet existant ou créer un nouveau
railway link

# Déployer
railway up
```

## 🔧 Configuration

### Variables d'environnement requises

| Variable | Description | Exemple |
|----------|-------------|---------|
| `DATABASE_URL` | URL de connexion PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `BETTER_AUTH_SECRET` | Secret pour Better Auth | `random-secret-32-chars` |
| `BETTER_AUTH_URL` | URL publique de l'app | `https://your-app.railway.app` |
| `BETTER_AUTH_GITHUB_CLIENT_ID` | GitHub OAuth Client ID | `github_client_id` |
| `BETTER_AUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret | `github_client_secret` |
| `COMPOSIO_API_KEY` | Clé API Composio | `composio_api_key` |
| `LANGFLOW_API_KEY` | Clé API Langflow (optionnel) | `langflow_api_key` |
| `LANGFLOW_API_URL` | URL API Langflow (optionnel) | `https://api.langflow.com` |
| `NEXT_PUBLIC_APP_URL` | URL publique de l'app | `https://your-app.railway.app` |

### Health Check

L'application expose un endpoint de santé à `/api/health` qui vérifie :
- La connexion à la base de données
- Le statut général de l'application

## 📦 Structure Docker

- **Dockerfile** : Build multi-stage optimisé pour production
- **docker-compose.yml** : Configuration pour développement local
- **docker-entrypoint.sh** : Script d'initialisation (migrations Prisma)
- **.dockerignore** : Fichiers exclus du build
- **railway.json** : Configuration Railway

## 🔍 Dépannage

### Les migrations ne s'exécutent pas

```bash
make exec-app
npx prisma migrate deploy
```

### L'application ne démarre pas

Vérifier les logs :
```bash
make logs-app
```

### Problème de connexion à la base de données

Vérifier que `DATABASE_URL` est correctement configuré et que la base de données est accessible.

### Rebuild complet

```bash
make clean-all
make build-no-cache
make up
```

## 📝 Notes

- Le build utilise `output: "standalone"` pour Next.js (image optimisée)
- Les migrations Prisma s'exécutent automatiquement au démarrage
- Le healthcheck vérifie `/api/health` toutes les 30 secondes
- Railway détecte automatiquement le port via la variable `PORT`
