# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Authenticator is a TypeScript/Vue 2 browser extension that generates 2-Step Verification codes for Chrome, Firefox, and Microsoft Edge. Safari is maintained in a separate repository and is not supported from this codebase.

The extension is bundled with Webpack. `webpack.config.js` defines the browser-extension entry points: `background`, `content`, `popup`, `import`, `options`, `permissions`, `qrdebug`, and `argon`. HTML shells live under `view/`, manifests under `manifests/`, and build artifacts are generated into platform directories such as `chrome/`, `firefox/`, `edge/`, `test/`, or `release/`.

## Common commands

Install dependencies:

```bash
npm ci
```

Build platform packages:

```bash
npm run chrome
npm run firefox
npm run edge
npm run prod
```

Reproduce a release build:

```bash
npm ci
npm run prod
```

Develop the Chrome extension:

```bash
npm run dev:chrome
```

`dev:chrome` compiles the Chrome test extension to `test/chrome`; load that directory manually as an unpacked extension in Chrome.

Run the test suite:

```bash
npm test
```

The test command first runs `pretest`, which builds test extensions under `test/chrome` and `test/firefox`, then `scripts/test-runner.js` launches Chrome through Puppeteer and opens `view/test.html` inside the test extension. Chrome extensions do not run headless here; CI uses a headful Puppeteer action.

There is no repository script for running one specific test. Tests are bundled from `src/test.ts` using `require.context("./test", true, /\.tsx?$/)`, so single-test work usually requires temporarily narrowing the test bundle or using Mocha `.only` locally and reverting it before commit.

Lint and formatting checks are embedded in `scripts/build.sh`:

```bash
./node_modules/.bin/eslint . --ext .js,.ts
./node_modules/.bin/prettier --check ./src/* ./src/**/* ./src/**/**/* ./src/**/**/**/* ./sass/*.scss
```

`build.sh` auto-runs `prettier --write` when its initial check fails. Avoid relying on this side effect unless formatting changes are intended.

On Windows, run build scripts from Git Bash, Cygwin, WSL, or another environment that can execute Bash scripts.

## Architecture notes

- `src/popup.ts` is the main UI bootstrap. It loads i18n, registers common Vue components, creates the Vuex store, updates OTP codes every second, handles encrypted-account unlock flow, backup reminders, search focus, popup sizing, and optional Google time sync.
- Vuex modules in `src/store/` coordinate UI state and domain actions. `Accounts` is the central account/code module; it loads persisted entries through `EntryStorage`, tracks encryption state, generates current OTP codes, prepares export data, and drives passphrase-related UI transitions.
- Domain logic lives mostly in `src/models/`. `storage.ts` abstracts `chrome.storage.local`/`chrome.storage.sync` selection, filters non-entry records, manages OTP entry serialization, encrypted exports, and key records. `encryption.ts`, `otp.ts`, `backup.ts`, `settings.ts`, and `migration.ts` handle the core account, encryption, backup, settings, and otpauth-migration behaviors.
- `src/background.ts` is the extension background boundary. It handles runtime messages for QR capture/import, otpauth URL ingestion, cached passphrase/autolock, backup OAuth token flows, context menus, and backup uploads.
- `src/import.ts`, `src/options.ts`, `src/permissions.ts`, and `src/qrdebug.ts` are separate Vue/browser-extension pages sharing models, i18n, and common components rather than sharing the popup Vuex store wholesale.
- `src/argon.ts` is built as an isolated entry for Argon/password hashing support and is loaded through the corresponding view when encryption workflows need it.
- `src/browser.ts` and `src/utils.ts` centralize browser/platform checks and cross-entry helpers used by both UI and background code.

## Tests

Tests live under `src/test/` and use Mocha, Chai, Sinon, Vue Test Utils, and Sinon Chrome. `src/test.ts` discovers all `.ts`/`.tsx` tests under `src/test/`, installs `MochaReporter`, and restores Sinon after each test. `scripts/test-runner.ts` collects results from the extension test page through `window.__mocha_test_results__` and exits nonzero on failures.

## Contribution-routing details from project docs

- Do not route lost codes or lost accounts to issues; the issue template points users to the lost-codes documentation.
- Feature requests go to GitHub Discussions.
- Translation fixes go through Crowdin.
- Potential vulnerabilities should be reported privately through GitHub Security Advisories and include reproduction details or a proof of concept where appropriate.

## Token 优化指南 (Token Optimization Guidelines)

在与 AI 协同开发时，由于子进程非交互执行环境下的 CLI 全局钩子拦截局限，请在运行任何可由 `rtk` 节省 Token 的开发终端命令前，**一律显式、手动在前面打上 `rtk ` 前缀**以强制触发代理脱水拦截，节省上下文开销。

* **版本控制 (VCS)**：
  - 必须执行 `rtk git status` (严禁直接执行原生 `git status`)
  - 必须执行 `rtk git diff` (严禁直接执行原生 `git diff`)
  - 必须执行 `rtk git log` (严禁直接执行原生 `git log`)
  - 推荐执行 `rtk git add` / `rtk git commit` / `rtk git push`
* **包管理器与构建流 (Build & Package)**：
  - 必须执行 `rtk npm ci` / `rtk npm install` / `rtk pnpm` / `rtk yarn` 等常用命令
  - 对本项目的高频构建命令必须使用 `rtk npm run chrome` / `rtk npm run prod`
* **测试与校验 (Testing & Linting)**：
  - 必须执行 `rtk npm test` / `rtk mocha` / `rtk playwright` / `rtk jest`
  - 包含对 Eslint 的校验必须执行 `rtk eslint` / `rtk tsc`
* **系统与文件检索 (VFS & Network)**：
  - 对文件结构查看应当使用 `rtk ls` / `rtk tree`
  - 在涉及检索时，若采用命令行，应使用 `rtk grep` / `rtk rg`
  - 在发起网络抓取时，应使用 `rtk curl` / `rtk wget` 以去除巨长进度条与 ANSI 垃圾序列
* **收益审计**：随时执行 `rtk gain` 或 `rtk gain --history` 查看令牌节省全局大盘。


