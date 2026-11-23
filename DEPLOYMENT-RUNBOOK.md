# Human LAIer — production release gate

## Two different products

The Signal Recorder V4 client demo at /streaming-demo/ and the nine-ticker ASR research bakeoff at /streaming-demo/nine-tickers/ have **different purposes, UIs, and acceptance suites**. Both belong to the published static site, but neither test suite should import the other's layout requirements. V4 uses its original three-panel video/group-chat/constellation UI. The nine-ticker page is an experimental comparison of genuine ASR variants.

## Safety latch and staging status

The staged GitHub Actions workflow is named **CI-Gated Pages Release**. Its deployment job will **not** publish until GitHub Pages' source is switched to GitHub Actions AND the repository variable HL_PAGES_ACTIONS_ENABLED is set to true. Before cutover, Pages still publishes the main branch directly. Do not describe the current production setup as fail-closed while that source remains active.

A release requires all three independent jobs:
1. Website inventory and build integrity.
2. Main Signal Recorder V4 acceptance.
3. Separate nine-ticker research bakeoff acceptance.

The package job runs only after all three pass. The deployment job runs only for main, checks that its tested commit is still the latest main SHA, serializes deployments, and uses the existing github-pages environment. It alone requests pages:write and id-token:write permissions. Every PR runs the same independent acceptance suites; no paid infrastructure or mandatory human reviews are required.

## Administrative cutover for Work mode

**Do this only after the staged PR has passed and has been merged.** Verify the new release-gate workflow completed three green required jobs on main with deployment skipped. Record the production URL, main SHA, Pages configuration, and custom domain.

1. GitHub Settings → Pages → Build and deployment → Source: select **GitHub Actions**. Keep humanlaier.com, HTTPS, and the existing main-only github-pages environment.
2. Settings → Secrets and variables → Actions → Variables: set repository variable HL_PAGES_ACTIONS_ENABLED to true.
3. In Actions → CI-Gated Pages Release, manually run workflow on main. Changing settings alone does not start a new push workflow. The three checks must pass and the first gated deployment must succeed.
4. Verify the public release manifest at https://humanlaier.com/release.json, matching its commit to the workflow SHA; confirm the custom domain and the production HTTPS/browser smoke tests pass.
5. In repository Rulesets create an Active ruleset targeting main. Require pull request before merging, **zero approvals**, no reviewer requirement, no bypass list. Require the three status checks named above. This protects main without introducing two-person reviews.

If settings access is blocked, do not disable the old publishing method or change DNS. Report the exact blocker.

## Normal operation

Changes are proposed via PR. All source/site, main V4 and bakeoff tests run on every PR even if the PR modifies only one page. A failure, cancellation or missing gate blocks the Actions deployment. After merging, tests rerun on main before packaging and deployment. Publishing uses an allowlisted static artifact containing the original website, CNAME, .nojekyll, all archived media, both streaming experiences, and a commit-bound release manifest. Internal CI scripts and workflows are excluded from that artifact.

The main and bakeoff browser suites run against the generated, allowlisted .pages-build artifact, not against unreleased repository paths. The V4 browser suite verifies real elapsed-time video playback, seeking, pause/resume, mute and speed, source audio fallback, left/right conversation bubbles, transcript model selection, original archived captures and mobile layout. The distinct bakeoff suite validates nine genuine ASR outputs, source integrity, original video, and the dense research layout.

A successful Pages deployment action is not proof of site correctness. Post-deployment checks must verify the *exact* public commit, critical asset hashes, HTTP byte-range support, and actual browser playback. A failing post-deploy smoke test must be reported as a failed release.

## Recovery

Pre-deploy CI failures leave the last published Actions release in place. After a production regression, revert the offending commit via a new PR, rerun all gates, and deploy the new revert commit. There is deliberately **no silent automatic rollback** because an old artifact can supersede a newer healthy release. In a severe outage, an administrator may explicitly restore the prior branch publishing configuration as a documented break-glass action, then reinstate the Actions pipeline after correction.

## Negative test

To demonstrate enforcement, propose but do **not merge** a branch with deliberately incorrect source hash or broken video mapping. Confirm the appropriate required job fails, package and deploy remain skipped, and the published release SHA does not change. Repair that branch, confirm green results, and do not bypass the tests.

Future tests for the main client demo belong in scripts/verify-pages-browser.cjs with HL_TEST_TARGET=main and streaming-demo/verify-featured-chat.cjs. Nine-ticker research tests belong in HL_TEST_TARGET=bakeoff, scripts/verify-nine-contracts.cjs and scripts/verify-nine-viewport.cjs. Avoid coupling their presentation logic.
