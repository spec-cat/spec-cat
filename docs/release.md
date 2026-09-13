# Release runbook

This runbook covers the account-owned steps that cannot be completed by a source checkout alone.

## One-time setup

1. Rename `spec-cat/spec-cat` to `spec-cat/sidings` on GitHub and verify the default branch is `main`.
2. Update the repository description to “The Git-native workbench for autonomous coding agents.”
3. Enable Issues and Discussions, then verify the issue forms and private security-report link.
4. Create a protected GitHub environment named `npm` with required reviewers.
5. For the first npm publish, authenticate an owner with two-factor authentication and publish `sidings@0.2.0`. Then configure npm trusted publishing for organization `spec-cat`, repository `sidings`, workflow `publish.yml`, environment `npm`, and allow direct publishing.
6. If trusted publishing is unavailable, perform the release manually with a short-lived granular token instead of adding a long-lived token to the workflow.

## Release candidate

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm verify-build
npm pack --dry-run
```

Confirm that `package.json` has the intended version, the working tree is clean, and the release commit is on `main`. Test the generated tarball on both macOS and Linux; test WSL before claiming WSL support.

## Publish and verify

1. Create and publish a GitHub release tagged exactly `v0.2.0`. The publish workflow rejects tags that do not match `package.json`.
2. Wait for the `Publish to npm` workflow to succeed.
3. From a clean temporary directory, run `npx sidings@latest --project /path/to/disposable/repository` and confirm the browser opens, the dashboard loads, and a disposable conversation can be created and removed.
4. Verify `npm view sidings name version dist-tags repository --json` reports the expected release and repository.
5. Attach `assets/demo/sidings-hero.webm` and the GIF fallback to the GitHub release, then replace the README placeholder.
6. Publish the prepared launch posts only after every linked URL is public and the quickstart succeeds from the registry.

## Rollback

Do not reuse or overwrite a published version. If the package is broken, deprecate the affected version with a clear message, publish a patched version, and update the GitHub release notes.
