#!/bin/sh
set -e

echo "🚀 Starting application..."

# Attendre que la base de données soit prête (optionnel, Railway gère ça)
if [ -n "$DATABASE_URL" ]; then
  echo "⏳ Waiting for database to be ready..."
  DB_HOST=$(echo $DATABASE_URL | sed -e 's/.*@\([^:]*\).*/\1/')
  DB_PORT=$(echo $DATABASE_URL | sed -e 's/.*:\([0-9]*\).*/\1/' | head -1)
  
  if [ -n "$DB_HOST" ] && [ -n "$DB_PORT" ]; then
    timeout=30
    count=0
    while ! nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
      if [ $count -ge $timeout ]; then
        echo "⚠️ Database connection timeout, continuing anyway..."
        break
      fi
      echo "Waiting for database at $DB_HOST:$DB_PORT..."
      sleep 1
      count=$((count + 1))
    done
    if [ $count -lt $timeout ]; then
      echo "✅ Database is ready!"
    fi
  fi
fi

# Générer le client Prisma si nécessaire
echo "🔧 Generating Prisma client..."
npx prisma generate || echo "⚠️ Prisma generate failed, continuing anyway..."

# Exécuter les migrations Prisma
if [ -n "$DATABASE_URL" ]; then
  echo "📦 Running Prisma migrations..."
  npx prisma migrate deploy || echo "⚠️ Migration failed, continuing anyway..."
fi

echo "✅ Application is ready!"

# Exécuter la commande passée en argument
exec "$@"
