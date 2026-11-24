# Human LAIer — production release gate

## Two different products

The Signal Recorder V4 client demo at /streaming-demo/ and the nine-ticker ASR research bakeoff at /streaming-demo/nine-tickers/ have **different purposes, UIs, and acceptance suites**. Both belong to the published static site, but neither test suite should import the other's layout requirements. V4 uses its original three-panel video/group-chat/constellation UI. The nine-ticker page is an experimental comparison of genuine ASR variants.

## Active production release enforcement

GitHub Pages now publishes through **GitHub Actions**, not direct branch publishing. The production hostname remains `humanlaier.com`, with HTTPS enforcement and the existing `github-pages` environment restricted to `main`. Repository variable `HL_PAGES_ACTIONS_ENABLED=true` enables the publisher. The active `main` ruleset requires pull requests and the following three GitHub checks, with **zero required human approvals and no bypass actors**:

1. Website inventory and build integrity.
2. Main Signal Recorder V4 acceptance.
3. Separate nine-ticker research bakeoff acceptance.

All three run on every PR and every push to `main`. Failed, skipped, canceled or unrun required checks prevent the gated Pages publishing step; an old successful job cannot authorize a different SHA. A deployment job checks the current main SHA and serializes releases. Only the deploy job requests `pages:write` and `id-token:write`. The separate research experiment cannot block critical runtime initialization of the main V4 demo, but its own release tests still protect the separate public research page.

**Do not switch Pages back to branch publishing** unless performing a documented emergency recovery; that would bypass the deployment gate.

## Normal operation

Changes are proposed via PR. All source/site, main V4 and bakeoff tests run on every PR even if the PR modifies only one page. A failure, cancellation or missing gate blocks the Actions deployment. After merging, tests rerun on main before packaging and deployment. Publishing uses an allowlisted static artifact containing the original website, CNAME, .nojekyll, all archived media, both streaming experiences, and a commit-bound release manifest. Internal CI scripts and workflows are excluded from that artifact.

The main V4 browser suite runs against the generated, allowlisted `.pages-build` **production** artifact. The independent nine-ticker + lab browser suite runs against `.research-build`, which contains only those two research pages and their actual media; it deliberately does not include the default V4 transcript or client files. This keeps the suites diagnostically independent. **Only** `.pages-build` can be published to GitHub Pages, and its build is fail-closed on the default V4 evidence contract. The V4 browser suite verifies real elapsed-time video playback, seeking, pause/resume, mute and speed, source audio fallback, left/right conversation bubbles, transcript model selection, original archived captures and mobile layout. The distinct bakeoff suite validates nine genuine ASR outputs, source integrity, original video, and the dense research layout.

A successful Pages deployment action is not proof of site correctness. Post-deployment checks must verify the *exact* public commit, critical asset hashes, HTTP byte-range support, and actual browser playback. A failing post-deploy smoke test must be reported as a failed release.

## Mandatory default-showcase evidence contract

The default `/streaming-demo/` is a complete evidence bundle, **not simply a playable video**. It must simultaneously have original media, source-matched, nonempty ASR speech, individually recorded viewer activity, and a participant-level Constellation. Source-local ASR time must never be represented as a calibrated collector-event clock.

- The **single source of truth for the original main recording** is `streaming-demo/assets/nov17-participation.mp4` plus its original collector events in `streaming-demo/data.js`. `streaming-demo/participation-source-asr.js` declares its original source ID, video identity (SHA-256), ASR JSON path and minimum speech-span coverage. Do not borrow text from `nine-tickers` or other sessions.
- Source transcript `streaming-demo/assets/nov17-participation-asr.json` contains source-media seconds, real machine output, model identity and explicit unreviewed/uncalibrated flags. The default is explicitly the pinned nine-ticker Sing / CTX engine and focused prompt, with English transcription (not translation or automatic language selection). The exact eight 15-second block outputs are preserved verbatim. Same-source alternate engines may have irregular lengths and segment counts; truncated, wrong-language, empty, or mismatched-source text is not allowed.
- `streaming-demo/featured-bootstrap.js` independently initializes critical original speech and optional research data. The optional nine-ticker model comparison can fail without hiding core speech. Critical source loading has its own timeout/retry and publishes `window.HL_DEMO_READINESS.status` as `ready` or `failed`; the existing Conversation pane displays a visible **DEMO INCOMPLETE** error on a failure instead of quietly presenting comments only.
- `scripts/verify-recorded-activity.cjs` validates exact original MP4 hash, source transcript provenance and coverage, 140 recorded events, 42 original accounts and graph completeness. Its mutation matrix rejects unrelated source SHA, borrowed transcript, truncated ASR, false clock assertions, wrong default, and absent event records. `scripts/build-pages.cjs` invokes this contract **itself**, so a standalone packaging attempt cannot bypass it.
- `scripts/verify-pages-browser.cjs` checks the generated artifact and live default: real video playback, actual source words in native left-hand speech bubbles, 87 right-hand viewer comments, 42 Constellation nodes and 140 markers. Local browser fault injection also tests ASR HTTP failure, wrong media hash, truncated ASR, wrong-language or translation mode, wrong focused prompt, arbitrary alternate ASR resegmentation/rewording, source-local transcript switching with unchanged media/graph, and an unavailable optional research comparator. These tests are run automatically in the mandatory main-demo job.
- `release.json` records the deployed SHA, original media hash and speech model/passage count. Production smoke verifies this against the published ASR, MP4, exact HTTP asset hashes, byte-range seeking, and real-browser content. A passing Pages upload without matching public content is still a failed release.

### Changing the host transcript safely

1. Transcribe the **exact selected original recording**. Record model, source-media timestamps and video SHA; preserve collector records as a different clock. Never invent missing words or timestamps.
2. Update the *single* ASR JSON input. Add or update alternative tracks with actual same-source English recognition. Keep the default Sing / CTX revision and prompt pinned until an intentional, tested default policy change. Do not silently change language, switch to translation, or edit the verbatim block output.
3. If replacing the actual media or changing the default session, explicitly revise the source identity contract, data export, activity/graph evidence and tests together. Do not silently fall back to an activity-only or ASR-only capture.
4. Submit a PR. Validate all three required checks including the browser fault-injection matrix, then merge. Verify the public `release.json` and live browser smoke result before calling the change deployed.
5. If runtime source speech fails for an individual browser, the user must see the incomplete status in the existing Conversation pane; the original activity/Constellation remain viewable. Investigate network/cache/runtime errors instead of mislabeling speech as nonexistent.

## Recovery

Pre-deploy CI failures leave the last published Actions release in place. After a production regression, revert the offending commit via a new PR, rerun all gates, and deploy the new revert commit. There is deliberately **no silent automatic rollback** because an old artifact can supersede a newer healthy release. In a severe outage, an administrator may explicitly restore the prior branch publishing configuration as a documented break-glass action, then reinstate the Actions pipeline after correction.

## Negative test

To demonstrate enforcement, propose but do **not merge** a branch with deliberately incorrect source hash or broken video mapping. Confirm the appropriate required job fails, package and deploy remain skipped, and the published release SHA does not change. Repair that branch, confirm green results, and do not bypass the tests.

Future tests for the main client demo belong in scripts/verify-pages-browser.cjs with HL_TEST_TARGET=main and streaming-demo/verify-featured-chat.cjs. Nine-ticker research tests belong in HL_TEST_TARGET=bakeoff, scripts/verify-nine-contracts.cjs and scripts/verify-nine-viewport.cjs. Avoid coupling their presentation logic.
