# NAVA studio architecture baseline

This document defines the responsibility boundaries for the NAVA studios. It is the product baseline for future implementation work; new features must fit these boundaries rather than create overlapping studios.

## Product structure

NAVI is the shared assistant and orchestration layer. It is not counted as a studio. The homepage contains the twelve existing studio destinations plus one dedicated Social Media Management destination.

### Create and design
- **Logo Design:** visual mark and logo execution.
- **Brand Strategy:** positioning, audience, promise, values, differentiation and brand system.
- **Content Creation:** concepts, copy, scripts and content packages. The destination platform may be selected to adapt the format, but account operations do not belong here.
- **Articles and Blog:** long-form editorial planning, drafting, revision and article-ready outputs.
- **Story Maker:** visual story composition and export.

### Media and music
- **Video and Audio:** media creation, editing, rendering, subtitles and audio processing.
- **Music Production:** audio/music creation and production tools.
- **Composition and Notation:** melody, harmony, arrangement and score/notation workflows.

### Management and growth
- **Social Media Management:** platform-specific operating workspaces:
  - Instagram: profile strategy, posts/Reels/Stories planning, engagement and performance review.
  - YouTube: channel strategy, long-form/Shorts planning, packaging, retention and channel performance.
  - Telegram: channel strategy, message planning, member engagement and channel performance.
- **SEO:** search visibility, technical/content audits, keyword and page optimization.
- **Advertising:** campaign planning, audience, creative, budget, measurement and optimization.
- **Business:** sales, finance, customer, inventory and operational workflows.

### Productivity
- **Office:** document, spreadsheet, presentation and file workflows.

## Non-overlapping responsibility rules

1. Content Creation creates the asset. Social Media Management plans how, where and when an asset is used, then reviews its results.
2. Articles and Blog owns long-form editorial documents; Content Creation owns campaign/social copy and short-form scripts.
3. Story Maker owns story layout/composition; Social Media Management owns the Instagram story publishing plan.
4. Brand Strategy defines the brand; Logo Design executes the logo.
5. Video and Audio creates/edits media files; YouTube/Instagram/Telegram workspaces plan the platform-specific use of those files.
6. NAVI receives the active studio context and advises; it does not replace the specialist tools in each studio.

## Social media implementation boundary

The first implementation provides three distinct workspaces and contextual NAVI requests. It does **not** claim live account connection, automatic publishing, live analytics, comment moderation or persistent account profiles.

Those capabilities require platform API access, user authorization, secure token handling, account-scoped server persistence and operational error handling. They must not be simulated with hardcoded metrics or browser-only storage. No credentials or raw platform tokens may be placed in frontend code.

## Delivery sequence

1. Establish studio boundaries and add the Social Media Management workspace.
2. Connect content creation handoff to the three platform workspaces without duplicating content-generation tools.
3. Complete Articles and Blog as a real editorial workflow.
4. Implement measurable SEO workflows using actual site data where access is granted.
5. Implement advertising planning and reporting without pretending campaigns are live.
6. Complete Story Maker's visual output workflow.
7. Define and implement actual Music Production and notation capabilities.
8. Improve Logo Studio output quality without adding superficial controls.
9. Preserve the tested Office, Business and Video workflows; regression fixes take priority over new options.

## Acceptance rules for future studio changes

- Every studio has one explicit job and a defined input/output contract.
- Shared brand/project facts are reused rather than repeatedly requested.
- Platform accounts, settings, calendars and metrics remain isolated per platform and per NAVA user.
- Real integrations are labeled active only after authenticated end-to-end testing.
- No new paid API, R2 bucket, preview deployment or test database is introduced without explicit approval.
- A feature is not complete because its form exists; its processing, error handling, output and persistence must work.
