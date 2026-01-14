.PHONY: help build build-no-cache up down down-volumes logs logs-app restart restart-app ps exec-app prisma-generate prisma-push prisma-studio prisma-migrate clean clean-all test stats

# Variables
COMPOSE_FILE = docker-compose.yml

help: ## Affiche l'aide
	@echo "Commandes disponibles:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

build: ## Construire l'image Docker
	docker-compose -f $(COMPOSE_FILE) build

build-no-cache: ## Construire l'image Docker sans cache
	docker-compose -f $(COMPOSE_FILE) build --no-cache

up: ## Démarrer les services en arrière-plan
	docker-compose -f $(COMPOSE_FILE) up -d

down: ## Arrêter les services
	docker-compose -f $(COMPOSE_FILE) down

down-volumes: ## Arrêter les services et supprimer les volumes
	docker-compose -f $(COMPOSE_FILE) down -v

logs: ## Afficher les logs
	docker-compose -f $(COMPOSE_FILE) logs -f

logs-app: ## Afficher les logs de l'application
	docker-compose -f $(COMPOSE_FILE) logs -f app

restart: ## Redémarrer les services
	docker-compose -f $(COMPOSE_FILE) restart

restart-app: ## Redémarrer uniquement l'application
	docker-compose -f $(COMPOSE_FILE) restart app

ps: ## Afficher le statut des services
	docker-compose -f $(COMPOSE_FILE) ps

exec-app: ## Accéder au shell du conteneur app
	docker-compose -f $(COMPOSE_FILE) exec app sh

prisma-generate: ## Générer le client Prisma
	docker-compose -f $(COMPOSE_FILE) exec app npx prisma generate

prisma-push: ## Appliquer le schéma Prisma (dev uniquement)
	docker-compose -f $(COMPOSE_FILE) exec app npx prisma db push

prisma-migrate: ## Appliquer les migrations Prisma
	docker-compose -f $(COMPOSE_FILE) exec app npx prisma migrate deploy

prisma-studio: ## Ouvrir Prisma Studio
	docker-compose -f $(COMPOSE_FILE) exec app npx prisma studio

clean: ## Nettoyer les images et volumes non utilisés
	docker system prune -f
	docker volume prune -f

clean-all: down-volumes ## Nettoyer complètement (arrêter + supprimer volumes)
	docker-compose -f $(COMPOSE_FILE) down -v --rmi all

test: ## Tester la connexion à l'application
	@echo "Test de santé de l'application..."
	@curl -f http://localhost:3000/api/health || echo "❌ L'application n'est pas accessible"

stats: ## Afficher les statistiques d'utilisation
	docker stats
