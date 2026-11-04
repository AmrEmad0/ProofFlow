# ProofFlow

Built for the [Meta Global AI Developer Hackathon 2026](https://dev.meta.ai/events/global-hackathon).

**[Working demo → proofflow.amremad.com](https://proofflow.amremad.com/)**

**[Watch the demo on YouTube](https://www.youtube.com/watch?v=wi8pMcWhSlk)**

Turn visible procedures into user-approved Proof Plans, then review short videos with timestamped findings and tracked object evidence. Meta Muse Spark 1.3 proposes visual events, SAM 3.1 supplies tracked object geometry, and application rules classify evidence as **observed**, **not observed**, or **uncertain**.

## For judges: try the demo

1. Open the [live demo](https://proofflow.amremad.com/) and go directly to [Pack an order · Demo](https://proofflow.amremad.com/plans/fcc11d86-2898-4d8a-8188-63c5bb51dc0d).
2. In **Videos & evidence**, select each of the two sample videos.
3. Select a check or a timed evidence window to inspect the supporting footage, tracked objects, and finding. Open the frame inspector and model diagnostics to examine the evidence in more detail.

The shared demo contains an approved plan and **saved Muse Spark/SAM 3.1 evidence**. Inspecting it requires no API key or account and does not launch a new model request. It is read-only and is also installed automatically when running locally or with Docker. The interactive walkthrough on the homepage uses scripted, illustrative results; use the workspace demo above to inspect saved model evidence.

## Run locally

### Requirements

- [Bun](https://bun.sh/) **1.4.4 or newer** and Git.
- FFmpeg with **libx264** and **libass**, plus FFprobe, available on your `PATH`.
- A [Meta Model API](https://dev.meta.ai/) key with access to **Muse Spark 1.3** and **SAM 3.1** for fresh AI planning and video verification. The saved demo works without a key.

### Setup

```sh
git clone https://github.com/AmrEmad0/ProofFlow.git
cd ProofFlow
bun install --frozen-lockfile
cp .env.example .env
```

For fresh model requests, edit `.env` and replace `MODEL_API_KEY=replace-with-your-own-key` with your own key. Keep the default `META_API_BASE_URL=https://api.meta.ai/v1` and `WEB_ORIGIN=http://localhost:5173` for local development. Never put the key in frontend code or commit `.env`.

```sh
bun run dev
```

Open **http://localhost:5173**. This command starts both Vite and the API on port **3000**. SQLite migrations and the shared demo are installed automatically at server startup; no separate database service is needed. Select **Pack an order · Demo** in the sidebar to follow the judge walkthrough locally.

### Try a fresh verification

1. Select **Copy demo plan** to make your own editable copy, or choose **Create your Proof Plan** and describe a visible procedure.
2. Review the checks and their limitations. Accept the sharing terms only for videos you have permission to send to Meta, then choose **Approve & add video**. Approval freezes the plan version used by the run.
3. Choose an **MP4, MOV, or WebM**, up to **30 seconds and 25 MB**, then choose **Check video**. To reproduce the packing example, use `assets/demo/pack-order/demo-1-pack.mp4` from the clone.
4. Wait for processing to complete, then inspect each finding alongside its timestamped video evidence and SAM tracks. Model failures and unclear evidence remain visible; a missing track does not establish that an action never happened.

Fresh requests use the server's configured Meta key. Availability and processing time depend on model access and the API; saved demo findings do not promise identical results on a new run.

### Commands and configuration

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the frontend and API for development. |
| `bun run check` | Run type checking, repository tests, and the production build. |
| `bun run meta:check` | Probe model listing and Muse planning/analysis access using the configured key; sends small diagnostic requests, not a full SAM verification. |
| `bun run build` | Build the frontend into `dist/`. |
| `NODE_ENV=production WEB_ORIGIN=http://localhost:3000 bun start` | Serve the built frontend and API together at http://localhost:3000. |

All configuration defaults are in [`.env.example`](.env.example). `DATABASE_PATH` and `STORAGE_PATH` control local persistence; `FFMPEG_PATH` and `FFPROBE_PATH` override binary locations. Run one application process per database. For deployment, set `WEB_ORIGIN` to the public HTTPS origin. Check `/api/health` for database/media readiness and whether a model key is configured; a healthy response alone does not prove model invocation access.

## Hackathon contributions

During the event, we built the Proof Plan editor and approval/versioning flow, Muse Spark and SAM 3.1 integrations, video processing and evidence evaluation, timestamped evidence review, human review tools, reports, and task triggers.

We reused existing libraries and components: React, Vite, TanStack Router/Query, Elysia/Eden, Bun SQLite, Tailwind, shadcn/ui, Lucide icons, FFmpeg, FFprobe, and Meta's existing models. No custom model training or fine-tuning was performed.

Both bundled packing videos—`demo-1-pack.mp4` and `Person_packing_order_in_box_dc37aa78.mp4`—are AI-generated demonstrations, not filmed recordings of real work. Their saved Muse Spark/SAM results show analysis of those synthetic inputs, not measured performance on real-world footage. Homepage illustrations are also AI-generated; the homepage's interactive walkthrough uses scripted results. The social preview uses a screenshot of the saved demo workspace.

## Limitations and attribution

- This prototype assesses visible evidence and does not certify hidden outcomes. Occlusion, sampling, and model uncertainty can limit findings.
- Workspaces use browser cookies; losing the cookie loses access. Saved media remains until manually deleted. Keep SQLite, uploaded media, and camera credentials private.
- Model requests share submitted content with Meta; the configured Muse model may use content for training.
- **Videos & evidence → Send results** can POST JSON reports to a public HTTPS endpoint after a new video completes, with up to three delivery attempts and a stable `Idempotency-Key`. Destination settings are frozen per video; evidence paths still require workspace access. Custom authentication headers and webhook signatures are not supported.

Built with Meta Model API (Muse Spark and SAM 3.1), React, Vite, TanStack Router/Query, Elysia/Eden, Bun SQLite, Tailwind, shadcn/ui, FFmpeg, and FFprobe. Homepage illustrations are AI-generated.

Application code is licensed under the [MIT License](LICENSE). Third-party components retain their own licenses; use of Meta models and services remains subject to Meta's applicable terms.

## Run with Docker

Requires Docker Engine or Docker Desktop with **Docker Compose v2** and Git. Bun, FFmpeg, and FFprobe are installed inside the image.

1. Clone the repository and prepare configuration:

   ```sh
   git clone https://github.com/AmrEmad0/ProofFlow.git
   cd ProofFlow
   cp .env.example .env
   ```

2. Edit `.env`: set `WEB_ORIGIN=http://localhost:3100` and, for fresh verification, your own `MODEL_API_KEY`. Leave `PROOFFLOW_HTTP_PORT=3100` and `PROOFFLOW_BIND_IP=127.0.0.1` for local judging. If you already cloned and configured the app, reuse that checkout and update its origin.

3. Build and start:

   ```sh
   docker compose up --build -d
   docker compose ps
   docker compose logs --tail=50 proofflow
   ```

4. Open **http://localhost:3100** and follow the judge walkthrough. Check readiness at **http://localhost:3100/api/health**. The image build runs the application's checks and bundles both sample videos and saved evidence.

5. Stop the app when finished:

   ```sh
   docker compose down
   ```

SQLite and media persist in the `proofflow-data` named volume after shutdown. `docker compose down --volumes` deletes that stored data. The default port binding allows access only from the Docker host; for an HTTPS deployment, configure a reverse proxy or tunnel and set `WEB_ORIGIN` to its public origin.
