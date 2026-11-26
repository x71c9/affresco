# Contributing to affresco

## Development Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make the changes with conventional commit messages
4. Push and open a Pull Request

## Pull Request Requirements

### PR Title Format

PR titles must follow the [Conventional Commits](https://www.conventionalcommits.org/)
specification, since the title becomes the squash commit message:

```
feat: add a crop tool to the preview
fix: keep sticky table headers in the capture
docs: update installation guide
feat!: change the default fixed elements mode
```

### Code Quality Requirements

All PRs must pass the automated checks:

- Tests: `npm test` (build, page script test, end-to-end preview test)
- Lint: `npm run lint`

### Branch Configuration

- Target branch: `master`
- Merge strategy: squash merging (the PR title becomes the commit message)
- Status checks must pass before merging

## Development Environment

```bash
git clone https://github.com/YOUR_USERNAME/affresco.git
cd affresco
npm ci
npm run build
npm run start:firefox   # or start:chromium
```

The tests need Chromium or Chrome for Testing (`CHROMIUM` selects the
binary): branded Google Chrome ignores `--load-extension`.

## Release Process

Merging into `master` does not release anything. A release is started by hand,
once the previous version is out of review (the Chrome Web Store rejects
uploads while an item is pending review):

```bash
gh workflow run release.yml -f bump=minor   # or Actions > Release > Run workflow
```

1. `release.yml` bumps the version of `master` (`patch`, `minor` or `major`),
   commits it (`chore(release): release vX.Y.Z`) and pushes the `vX.Y.Z` tag
2. `publish.yml` runs on the tag: it builds the packages, creates the GitHub
   release and submits the new version to the Chrome Web Store and to
   addons.mozilla.org, where it goes live after review

Version bump, following the commits since the last release:

- `feat!:` or `fix!:` (breaking change): `major`
- `feat:`: `minor`
- everything else (`fix:`, `perf:`, `security:`, `docs:`, `style:`,
  `refactor:`, `test:`, `chore:`): `patch`

If the Chrome Web Store job fails because the previous version is still pending
review, cancel that review in the Developer Dashboard (Store listing > ⋮ >
Cancel review) and rerun the failed job:

```bash
gh run rerun <run-id> --failed
```
