# HOMEBREW_TAP_TOKEN Setup

The `HOMEBREW_TAP_TOKEN` GitHub Actions secret is used by `.github/workflows/release-build.yml` (the **Update Homebrew formula** step) to push an updated `Formula/gizmosql-ui.rb` to the [`gizmodata/homebrew-tap`](https://github.com/gizmodata/homebrew-tap) repository on every tagged release.

The workflow performs:
1. `git clone https://x-access-token:${GH_TOKEN}@github.com/gizmodata/homebrew-tap.git`
2. Overwrites `Formula/gizmosql-ui.rb`
3. `git commit` and `git push` back to the tap's default branch

## Required Permissions

Create the token under an account that has **write access** to `gizmodata/homebrew-tap`.

### Option A — Fine-grained Personal Access Token (recommended)

- **Resource owner**: `gizmodata`
- **Repository access**: *Only select repositories* → `gizmodata/homebrew-tap`
- **Repository permissions**:
  - **Contents**: **Read and write** (required — needed to push formula updates)
  - **Metadata**: Read-only (auto-selected)
- **Account permissions**: none required
- **Expiration**: set a calendar reminder; GitHub max is 1 year

### Option B — Classic Personal Access Token

- Scope: `repo` (full control of private repositories)
  - If `gizmodata/homebrew-tap` is **public**, `public_repo` alone is sufficient
- **Expiration**: set a calendar reminder

## Installing the Token

1. Generate the token at <https://github.com/settings/tokens> (classic) or <https://github.com/settings/personal-access-tokens> (fine-grained).
2. Copy the token value.
3. In this repo: **Settings → Secrets and variables → Actions → Secrets** → update or create the secret named `HOMEBREW_TAP_TOKEN` with the new value.

## Verification

After rotating, trigger the workflow by pushing a new tag (e.g. `git tag v2.5.6 && git push --tags`), or re-run the most recent failed release job from the Actions tab. Confirm the **Update Homebrew formula** step succeeds and a new commit appears in `gizmodata/homebrew-tap`.

## Notes

- The token is **not** used to create the GitHub Release in this repo — that step uses the built-in `GITHUB_TOKEN`. Only the cross-repo push to the tap needs `HOMEBREW_TAP_TOKEN`.
- If the tap repo is ever moved to a different org, regenerate the fine-grained token against the new owner.
