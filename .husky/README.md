# Husky Git Hooks

Ce projet utilise [Husky](https://typicode.github.io/husky/) pour exécuter des vérifications automatiques avant chaque commit et push.

## Hooks configurés

### Pre-commit (`pre-commit`)
Exécuté avant chaque commit :
- ✅ **Lint-staged** : Lint et formatage automatique des fichiers modifiés
  - ESLint avec auto-fix
  - Prettier pour le formatage
- ✅ **Prisma** : Formatage et génération du client si le schéma a changé

### Pre-push (`pre-push`)
Exécuté avant chaque push :
- ✅ **Linting complet** : Vérification de tout le projet
- ✅ **Formatage** : Vérification du formatage (avertissement seulement)
- ✅ **Prisma** : Validation du schéma

## Commandes utiles

```bash
# Tester le hook pre-commit manuellement
npm run pre-commit

# Tester le hook pre-push manuellement
npm run pre-push

# Formater tous les fichiers
npm run format:write

# Linter avec auto-fix
npm run lint:fix

# Vérifier les types TypeScript
npm run typecheck
```

## Désactiver temporairement

Si vous devez désactiver temporairement les hooks (non recommandé) :

```bash
# Pour un commit spécifique
git commit --no-verify

# Pour un push spécifique
git push --no-verify
```

## Configuration

La configuration de `lint-staged` se trouve dans `package.json` :

```json
"lint-staged": {
  "*.{ts,tsx,js,jsx}": [
    "eslint --fix --max-warnings=0",
    "prettier --write"
  ],
  "*.{json,md,mdx,css,html,yml,yaml,scss}": [
    "prettier --write"
  ],
  "prisma/schema.prisma": [
    "bash -c 'npx prisma format'"
  ]
}
```
