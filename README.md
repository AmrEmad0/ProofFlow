# ProofFlow

Turn visible procedures into user-approved Proof Plans, then review short videos with timestamped findings and tracked object evidence. Meta Muse Spark proposes visual events, SAM 3.1 supplies object geometry, and application rules classify evidence as observed, not observed, or uncertain.

Requires Bun 1.4.4+, FFmpeg with libx264 and libass, FFprobe, and a Meta Model API key with Muse Spark and SAM 3.1 access.

```sh
bun install
cp .env.example .env
# Set MODEL_API_KEY in .env.
bun run dev
```

Open http://localhost:5173. Configuration defaults are in `.env.example`. Keep API keys server-side and SQLite, uploaded media, and camera credentials private. Run one application process per database. For production, set `WEB_ORIGIN` to the public HTTPS origin.

Run `bun run check` for type checking, tests, and the production build. For production startup, run `bun run build`, then `NODE_ENV=production bun start`.

The built-in **Pack an order** demo is included in the repository and Docker image and installed automatically at startup, including `demo-1-pack.mp4`, `Person_packing_order_in_box_dc37aa78.mp4`, the approved plan, and saved Muse Spark/SAM 3.1 evidence for both videos. Anyone can inspect it without a cookie or API key. The shared example cannot be edited or deleted; copy its plan and download the sample video to run your own verification (requires model access and consent).

Video verification requires an approved plan and sharing consent. MP4, MOV, and WebM uploads are limited to 30 seconds and 25 MB. Workspaces use browser cookies; losing the cookie loses access. Saved media remains until manually deleted. Model requests share submitted content with Meta; the configured Muse model may use content for training.

This is a prototype, not certification of hidden outcomes. Occlusion, sampling, and model uncertainty can limit findings. Homepage walkthroughs contain scripted, illustrative results; they are not live model outputs or accuracy benchmarks. Homepage illustrations are AI-generated.

Built with Meta Model API, React, TanStack, Elysia, Bun SQLite, Tailwind, shadcn/ui, FFmpeg, and FFprobe.
