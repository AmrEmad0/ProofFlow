# ProofFlow

Turn a visible task into a reviewable Proof Plan through chat with Meta Muse Spark. Attach a reference image or video to suggest a draft, or start from PackProof (product in, packing slip in, box closed), refine up to five checks, and explicitly approve a frozen version. Upload a short recording, then inspect findings with timestamp links and SAM object boxes.

Requires Bun 1.4.4+, FFmpeg with libx264 and the subtitles filter (libass), FFprobe, and a Meta Model API key with Muse Spark Contributor and SAM 3.1 access.

```sh
bun install
cp .env.example .env
# Set MODEL_API_KEY in .env; credentials stay on the server.
bun run dev
```

Open http://localhost:5173. Drafts and conversations are stored in SQLite and scoped to a private browser cookie, valid for 30 days. Clearing or losing the cookie loses access to that workspace; there are no user accounts or cross-device recovery yet. The PackProof starter and approval work without a model key.

Configuration: `MODEL_API_KEY`, `META_API_BASE_URL`, `DATABASE_PATH`, `STORAGE_PATH`, `HOST`, `PORT`, `WEB_ORIGIN`, `FFMPEG_PATH`, `FFPROBE_PATH`, and `MEDIA_RETENTION_HOURS` (default 24); defaults are in `.env.example`. Keep SQLite and storage private. Run one application process per database; an expiring lease prevents duplicate verification workers.

Commands: `bun run typecheck` generates routes and runs Bun's native type checker; `bun check --no-script` checks types directly. `bun run check` runs type-checking, tests, and the production build. Other commands: `bun test`, `bun run build`, and `bun run db:migrate`. For production, build first, then run `NODE_ENV=production bun start`.

Reference planning accepts JPG, PNG, or WebP images up to 10 MB and MP4, MOV, or WebM clips up to 30 seconds and 25 MB, with explicit sharing consent. Temporary reference files are removed after drafting; process notes remain with the conversation for refinement. Images cannot establish motion or step order. Reference analysis produces proposals, not verified findings. Verification uploads require an approved plan and explicit consent. MP4, MOV, and WebM recordings are limited to 30 seconds and 25 MB. Analysis uses a 6 fps H.264 copy with audio removed. Video, tracking artifacts, and receipts expire after the configured retention period; the worker removes expired local data and retries remote-file deletion after analysis. A server restart marks interrupted runs failed; queued runs resume. Keep the process running for cleanup.

Muse proposes events; SAM supplies geometry; conservative application rules classify evidence as observed, not observed, or uncertain. Missing tracks, occlusion, ambiguous insertion, or conflicting step order cannot support a positive finding. Sampling can miss fast events. This is a prototype, not a certification system, and accuracy on real packing recordings has not been established.

The configured Muse model is `muse-spark-1.3-contributor`: submitted content may be used to train future Meta models. See [Meta model modes](https://dev.meta.ai/docs/models). API keys remain server-side. Exported receipts contain model/rule provenance and the analysis video hash; inspect their video evidence while the private run is retained.

Built with Meta Model API (Muse Spark and SAM 3.1), React, TanStack, Elysia, Bun SQLite, and shadcn/ui. Native media processing uses FFmpeg and FFprobe.
