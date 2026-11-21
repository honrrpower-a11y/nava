# NAVA Video Engine — render proofs

This folder contains two isolated proofs of NAVA's first real video-rendering path. HyperFrames (Apache-2.0) turns timed HTML/CSS/GSAP compositions into MP4 files.

## What is proven

- **Text/motion graphics:** timed Persian typography and animated design elements render to MP4.
- **Image-to-motion:** a photographic input is loaded as an image asset; camera-style zoom/pan, a light bloom, framing and timed titles animate over it.
- HyperFrames captures frames in headless Chromium and FFmpeg encodes H.264 MP4.
- CI validates both outputs as 1080×1920, approximately eight seconds, and uploads them as one workflow artifact.
- No paid video-generation API, GPU model, R2 bucket, or production Worker change is required for these deterministic rendering tests.

The image test is deliberately honest about its capability: it animates the photograph as a cinematic moving shot (Ken Burns/parallax-style presentation). It does **not** make people or objects inside the photo move. Generative image-to-video remains a separate future capability requiring a GPU-backed model/service.

## Demo inputs

- demo/ — the first Persian motion-graphics test.
- image-motion-demo/ — image-based cinematic motion test. CI downloads a sample landscape photograph from Unsplash into assets/landscape.jpg before rendering; the binary image is not committed to the repository.

## Run locally

Requirements: Node.js 22+, FFmpeg, and an available Chromium installation (the CLI can provision its browser).

Text demo:

```bash
cd video-engine/demo
npx --yes hyperframes@0.9.72 lint
npx --yes hyperframes@0.9.72 render --output nava-first-render.mp4 --fps 30 --quality draft --workers 1
```

Image-motion demo (first place a landscape image at image-motion-demo/assets/landscape.jpg):

```bash
cd video-engine/image-motion-demo
npx --yes hyperframes@0.9.72 lint
npx --yes hyperframes@0.9.72 render --output nava-image-motion.mp4 --fps 30 --quality draft --workers 1
```

## CI output

The Video Engine Smoke workflow renders both samples, verifies codec, dimensions and duration, and uploads both MP4s as the nava-video-engine-smoke artifact.

## Production integration boundary

NAVA's current AV page does not yet have a production renderer. Cloudflare Workers are not the place to run Chromium/FFmpeg rendering. A production integration needs a separate Node.js rendering service with bounded job size, queue, timeout, cleanup and output streaming, plus an authenticated Worker job API. This proof does not pretend that service is deployed or expose a non-working Generate button.

## Next stages

1. Validate both MP4 renders in CI and inspect their visual quality.
2. Package the renderer as a separately deployable Node service.
3. Connect the NAVA Worker through a secret-bound service URL; preserve authentication and project ownership checks.
4. Replace the current text-only AV brief with an image upload, scene direction, render status and MP4 download flow.
5. Add optional voice, music and footage providers. Keep local/open-source rendering available; generative image-to-video remains a separate optional GPU capability.
