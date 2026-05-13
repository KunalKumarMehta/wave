#!/bin/bash

# scripts/bump-version.sh 0.2.0

NEW_VERSION=$1

if [ -z "$NEW_VERSION" ]; then
  echo "Usage: ./scripts/bump-version.sh <version>"
  exit 1
fi

echo "🚀 Bumping version to $NEW_VERSION..."

# 1. Root package.json
sed -i '' "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json 2>/dev/null || \
sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json

# 2. apps/extension/manifest.json
sed -i '' "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" apps/extension/manifest.json 2>/dev/null || \
sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" apps/extension/manifest.json

# 3. apps/desktop/package.json
sed -i '' "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" apps/desktop/package.json 2>/dev/null || \
sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" apps/desktop/package.json

# 4. apps/desktop/src-tauri/tauri.conf.json
sed -i '' "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" apps/desktop/src-tauri/tauri.conf.json 2>/dev/null || \
sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" apps/desktop/src-tauri/tauri.conf.json

echo "✅ Updated version strings."

# 5. Create git tag
git add .
git commit -m "chore: bump version to $NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "version $NEW_VERSION"

echo "✅ Created git tag v$NEW_VERSION."
echo "👉 Run 'git push origin main --tags' to trigger release."
