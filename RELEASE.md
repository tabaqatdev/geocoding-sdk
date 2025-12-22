# Quick Start: NPM Release

## Setup (One-time)

1. **Create NPM Token**
   - Go to: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Generate "Granular Access Token"
   - Permissions: Read & Write for `@tabaqat/geocoding-sdk`

2. **Add to GitHub Secrets**
   - Go to: Repository Settings → Secrets → Actions
   - Name: `NPM_TOKEN`
   - Value: Your token

## Release Process

```bash
# 1. Update version
npm version patch  # or minor/major

# 2. Update CHANGELOG.md
# Add release notes

# 3. Commit and push
git add package.json CHANGELOG.md
git commit -m "chore: release v0.1.1"
git push

# 4. Create GitHub release
gh release create v0.1.1 \
  --title "v0.1.1" \
  --notes-file CHANGELOG.md

# ✅ Workflow runs automatically and publishes to npm!
```

## Verify

```bash
# Check npm
npm view @tabaqat/geocoding-sdk

# Check provenance
npm view @tabaqat/geocoding-sdk --json | grep provenance
```

## Workflow Jobs

- **Test** - Runs on every push/PR
- **Build** - Runs after tests pass
- **Publish** - Runs only on GitHub releases

All configured with latest best practices! 🚀
