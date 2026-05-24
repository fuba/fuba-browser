---
name: fuba-browser-release
description: |
  fuba-browser 専用のリリースフロー。オープン PR (主に dependabot) をマージし、
  Playwright のアップデートを確認・適用し、バージョンを bump して PR 経由で main を更新、
  タグを切って GitHub Release を作成する。
  トリガー: "リリース", "release", "PR をマージしてリリース", "playwright アップデート", "バージョンアップ"
  使用場面: (1) dependabot PR の一括マージ、(2) Playwright 更新確認、(3) バージョン bump + タグ + Release
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *), Bash(npm *), Bash(jq *), Bash(grep *), Read, Glob, Grep, AskUserQuestion
argument-hint: "[--bump=major|minor|patch] (省略時は patch)"
---

# fuba-browser Release

fuba-browser のルーティンリリースを実行する。
「PR を確認してマージ → Playwright 更新確認 → バージョン bump → タグ → GitHub Release → main 更新」
の一連を、このリポジトリの規約に沿って行う。

## このリポジトリ固有の前提（重要）

- **マージ方式は squash**。最近のコミットは `Title (#NN)` 形式（squash merge）。
- **バージョンは root の `package.json` のみが正**。`package-lock.json` は `npm version` で同期される。
- **`cli/package.json` は独立バージョン**（root とは別系統）。root リリースでは **触らない**。
- バージョン bump は **初回リリース後ルールにより PR 経由**（直 push しない）。過去例: PR #141 "Bump version to v3.4.1"。
- バージョン番号にプレフィックス `v` を含めない（package.json は `3.4.2`、タグは `v3.4.2`）。
- CHANGELOG ファイルは無い。Release ノートは `gh release create --generate-notes` で自動生成。
- CI ジョブ: `build` / `typecheck` / `lint` / `test` / `gitleaks`。`e2e-offline` は通常 `skipping`（正常）。

## 手順

### 1. 現状把握

```bash
git fetch origin --tags
git status                       # working tree が clean か
git tag --sort=-version:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1   # 最新タグ
gh pr list --state open --json number,title,author,isDraft,mergeable,mergeStateStatus --limit 50
```

clean でない場合はユーザーに commit / stash / discard を確認する。

### 2. オープン PR のマージ

各 PR について以下を確認し、安全なものをマージする:

```bash
gh pr checks <PR番号>            # build/typecheck/lint/test/gitleaks が pass、e2e-offline は skipping でOK
```

マージ可否の判断:
- `mergeable: MERGEABLE` かつ `mergeStateStatus: CLEAN` かつ CI 全 pass のものをマージ対象とする。
- dependabot の依存バンプは基本マージ。ただし **major バージョンの更新やアプリ依存（playwright 等）の更新は内容を確認**し、必要ならユーザーに相談する。
- draft / コンフリクト / CI 失敗のものはスキップし、理由を報告する。

```bash
gh pr merge <PR番号> --squash --delete-branch
```

**注意: root の `package-lock.json` を触る PR が複数ある場合**（例: deps 系と dev-deps 系）、
1 件マージするともう片方が rebase 必要になることがある。
1 件ずつマージし、都度残りの `mergeable` を再確認する（GitHub の再計算に数秒かかるので待つ）:

```bash
sleep 8; gh pr view <次のPR番号> --json mergeable,mergeStateStatus -q '{m:.mergeable,s:.mergeStateStatus}'
```

`CONFLICTING` になったら `gh pr comment <PR番号> --body "@dependabot rebase"` で rebase を依頼し、
完了を待ってから再度マージする。

マージ後、main を更新:

```bash
git checkout main && git pull --ff-only origin main
```

### 3. Playwright アップデート確認

```bash
grep '"playwright"' package.json                 # 現在の指定 (例: "playwright": "^1.60.0")
npm ls playwright 2>/dev/null | grep playwright   # インストール済みバージョン
npm view playwright version                       # npm 上の最新
npm view @playwright/test version                 # （参照用）
```

- 最新と一致していれば **更新不要**。その旨を報告する。
- 新しいバージョンがある場合:
  ```bash
  npm install playwright@latest         # package.json + package-lock.json を更新
  ```
  `@playwright/test` を使っていればそれも合わせる。
  Dockerfile はバージョンを pin せず `npx playwright install chromium` で取得するので Dockerfile の編集は不要。
  更新したら **必ずローカルで build/typecheck/test を通す**（下記 step 4）。
  Playwright 更新は破壊的変更を含みうるので、**バージョン bump とは別 PR** にし、内容をユーザーに報告して進める。

### 4. リリース前のローカル検証

main 最新の状態で:

```bash
npm ci
npm run build
npm run typecheck
npm test
```

いずれか失敗したらリリースを中断し、原因を報告する。

### 5. バージョン bump（PR 経由）

bump レベルは `--bump=` 引数（省略時 **patch**）。依存バンプだけのルーティンリリースは patch が妥当。
判断に迷う場合はユーザーに確認する。

```bash
# 新バージョン = 現行 package.json の version を bump したもの（v なし）
git checkout -b bump-v<新バージョン>
npm version <新バージョン> --no-git-tag-version       # package.json + package-lock.json を更新
git add package.json package-lock.json
git commit -m "$(printf 'Bump version to v<新バージョン>\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>')"
git push -u origin bump-v<新バージョン>
gh pr create --base main --head bump-v<新バージョン> \
  --title "Bump version to v<新バージョン>" \
  --body "<マージ済み PR と Playwright 確認結果の要約。末尾に 🤖 Generated with [Claude Code](https://claude.com/claude-code)>"
```

CI が pass するのを待ってマージし、main を更新:

```bash
gh pr checks <bumpPR番号>                 # 全 pass を待つ
gh pr merge <bumpPR番号> --squash --delete-branch
git checkout main && git pull --ff-only origin main
grep -m1 '"version"' package.json         # 新バージョンであることを確認
```

### 6. タグ & GitHub Release

```bash
git tag v<新バージョン>
git push origin v<新バージョン>
gh release create v<新バージョン> --generate-notes --title "v<新バージョン>"
```

Release URL をユーザーに報告する。

## 完了報告

- マージした PR 一覧
- Playwright の状態（最新だった / 更新した）
- 新バージョンとタグ
- GitHub Release URL
- main が最新であること

## エラーハンドリング

- **タグが既に存在**: `git tag` で確認し、別バージョンを指定するかユーザーに確認する。
- **CI 失敗**: 失敗ジョブのログ（`gh run view <run-id> --log-failed`）を確認し、原因を報告。リリースは中断。
- **PR コンフリクト**: dependabot は `@dependabot rebase` コメント、自前ブランチは `git rebase origin/main` で解消。
- **working tree が dirty**: commit / stash / discard をユーザーに確認してから進める。

## 使用例

```
# dependabot PR を捌いて patch リリース
/fuba-browser-release

# minor リリースにする
/fuba-browser-release --bump=minor
```
