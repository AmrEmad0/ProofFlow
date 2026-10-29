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

Describe visible actions or conditions in natural language; Muse drafts editable evidence requirements for approval. Custom visual checks support actions and conditions at a visible moment, at the start, or at the end. The existing movement, state-change, and final-presence checks remain available as templates. Custom findings are model assessments grounded by timestamped footage and SAM object tracks, not independent proof of the action's meaning. Exact counts, measurements, duration guarantees, and hidden outcomes are not supported.

Choose **Build manually** to enter a plan name and your own checks from an empty form, without an example or AI drafting. Add up to five checks, save for review, and approve before uploading video. **Edit manually** reopens the full editor for a saved plan; changed approved checks become a new draft.

Choose a start and finish trigger in the sidebar beside the plan chat: manual button, barcode scanner (keyboard input ending in Enter), or API link. Selecting API automatically generates a private URL; requesting it with GET or POST fires the trigger without headers or a body. Links persist when you reopen a plan and can be regenerated; switching away from API disables the corresponding link. Anyone with the URL can fire it, so keep it private. Starting requires an approved plan and freezes its version for that task. Finished tasks can be linked to manually uploaded videos. Select a video source during setup or use **Edit trigger settings** later. The run panel shows only the saved trigger. Demo and camera sources automatically finish at the clip limit (1–30 seconds) and queue verification with the frozen plan and its sharing consent. One task may be active per plan, with a limit of 200 starts per plan per day; manual upload remains available independently.

For demo replay, set `DEMO_VIDEO_PATH` to a private folder containing MP4, MOV, or WebM files (default `./data/demos`). Select **Demo · Folder feed** to cycle through all videos in filename order, looping after the last. Each scan, manual start, or API trigger takes the next video; **Start demo feed** advances automatically at the configured clip interval until **Stop demo feed** is pressed. Both modes share a persisted position. Stop cancels waiting automatic feed captures and queued verification runs and pauses playback. A recording already being verified finishes; individual scan/API tasks are unaffected. A single-file source still replays that file. Demo replay is labeled in the UI and uses real verification. Configure cameras with server-only `CAMERA_SOURCES`, a JSON object such as `{"overhead":"rtsp://camera-host/live"}`. Only camera names reach the browser. RTSP/RTSPS and HTTP(S) video inputs supported by FFmpeg are accepted; browser camera devices are not supported. Reload the page after adding sources. Keep source folders outside public static assets and Git.

Capture jobs are persisted in SQLite. Queued jobs resume after restart; interrupted captures fail visibly rather than substituting footage. Completed captures wait for verification capacity without recording again. Automatic feeding pauses at 20 pending captures per plan (60 globally); existing verification limits of 20 runs per workspace per day still apply. Feed state and position survive restarts; changing the approved plan stops automatic feeding until it is reviewed and restarted. Camera capture must begin within five seconds of its trigger or the task fails; concurrent captures are serialized. Camera hardware and network compatibility require testing with your actual stream.

Configuration: `DEMO_VIDEO_PATH`, `CAMERA_SOURCES`, `MODEL_API_KEY`, `META_API_BASE_URL`, `DATABASE_PATH`, `STORAGE_PATH`, `HOST`, `PORT`, `WEB_ORIGIN`, `FFMPEG_PATH`, `FFPROBE_PATH`, and `MEDIA_RETENTION_HOURS` (default 24); defaults are in `.env.example`. Keep SQLite and storage private. Run one application process per database; an expiring lease prevents duplicate verification workers.

Live verification updates use an authenticated SSE connection at `/api/events`, with polling as a disconnect fallback. Reverse proxies must allow streaming without response buffering and keep connections open between 15-second heartbeats.

Commands: `bun run typecheck` generates routes and runs Bun's native type checker; `bun check --no-script` checks types directly. `bun run check` runs type-checking, tests, and the production build. Other commands: `bun test`, `bun run build`, and `bun run db:migrate`. For production, build first, then run `NODE_ENV=production bun start`.

Reference planning accepts JPG, PNG, or WebP images up to 10 MB and MP4, MOV, or WebM clips up to 30 seconds and 25 MB, with explicit sharing consent. Temporary reference files are removed after drafting; process notes remain with the conversation for refinement. Images cannot establish motion or step order. Reference analysis produces proposals, not verified findings. Verification uploads require an approved plan and explicit consent. MP4, MOV, and WebM recordings are limited to 30 seconds and 25 MB. Analysis uses a 6 fps H.264 copy with audio removed. Video, tracking artifacts, and receipts expire after the configured retention period; the worker removes expired local data and retries remote-file deletion after analysis. A server restart marks interrupted runs failed; queued runs resume. Keep the process running for cleanup.

Muse proposes events; SAM supplies geometry; conservative application rules classify evidence as observed, not observed, or uncertain. Missing tracks, occlusion, ambiguous insertion, or conflicting step order cannot support a positive finding. Sampling can miss fast events. This is a prototype, not a certification system, and accuracy on real packing recordings has not been established. **Download analysis** saves the exact MP4 identified by the exported evidence's `media.sha256`; **Download video** saves a separately re-encoded copy with SAM boxes.

The configured Muse model is `muse-spark-1.3`: submitted content may be used to train future Meta models. See [Meta model modes](https://dev.meta.ai/docs/models). API keys remain server-side. Exported receipts contain model/rule provenance and the analysis video hash; inspect their video evidence while the private run is retained.

Built with Meta Model API (Muse Spark and SAM 3.1), React, TanStack, Elysia, Bun SQLite, and shadcn/ui. Native media processing uses FFmpeg and FFprobe.
