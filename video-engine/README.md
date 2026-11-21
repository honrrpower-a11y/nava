# NAVA Video Engine — first render proof

This folder is an isolated proof of the first real video-rendering path for NAVA. It uses [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0) to turn a timed HTML/CSS/GSAP composition into an MP4.

## What this proves

- A video scene is authored with HTML, CSS and a finite GSAP timeline.
- HyperFrames captures frames in headless Chromium and encodes an actual MP4 with FFmpeg.
- The GitHub Actions smoke workflow validates the output dimensions and duration and uploads the MP4 as a workflow artifact.
- No paid video-generation API, GPU model, R2 bucket, or production Worker change is required for this first rendering proof.

The demo is a motion-graphics video, not yet text-to-video or image-to-video generation. It deliberately proves the render pipeline before adding AI-generated footage, voice, music, subtitles, project persistence, or the NAVA UI.

## Run locally

Requirements: Node.js 22+, FFmpeg, and an available Chromium installation (the CLI can provision its browser).

From this directory:

```bash
npx --yes hyperframes@0.9.78 doctor
npx --yes hyperframes@0.9.78 lint
npx --yes hyperframes@0.9.78 render --output nava-first-render.mp4 --fps 30 --quality draft --workers 1
```

## CI output

The `Video Engine Smoke` workflow renders this sample on pull requests and manual dispatch, verifies that it is an 1080×1920 MP4 of approximately eight seconds, and uploads `nava-video-engine-smoke.mp4` as a downloadable workflow artifact.

## Integration boundary

NAVA's current `avPage` only sends a brief to NAVI; it explicitly has no renderer. Cloudflare Workers are not the place to run Chromium/FFmpeg rendering. A production integration therefore needs a separate Node.js rendering service (HyperFrames producer) and a small authenticated Worker job API. This proof does not pretend that service is deployed or expose a non-working Generate button.

## Next implementation stages

1. Validate this MP4 render in CI.
2. Package the renderer as a separately deployable Node service with bounded job size, queue, timeout, cleanup, and output streaming.
3. Connect the NAVA Worker to that service through a secret-bound service URL; keep auth and project ownership checks in NAVA.
4. Replace the current text-only AV brief with a real production form and job status / MP4 download UI.
5. Add optional voice and footage providers. Keep local/open-source rendering available without paid AI APIs; AI video generation remains a separate optional GPU capability.
