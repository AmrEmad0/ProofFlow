import { useEffect, useState } from "react";
import { Film, ScanLine, Sparkles } from "lucide-react";
import "./reference-scan.css";

type Frame = { src: string; time: number };

function timestamp(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

function useReferenceFrames(url: string | null, isImage: boolean) {
  const [frames, setFrames] = useState<Frame[]>([]);
  useEffect(() => {
    setFrames([]);
    if (!url || isImage) return;
    const controller = new AbortController();
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const waitFor = (event: "loadeddata" | "seeked") => new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        video.removeEventListener(event, ready);
        video.removeEventListener("error", failed);
        controller.signal.removeEventListener("abort", aborted);
        if (error) reject(error); else resolve();
      };
      const ready = () => finish();
      const failed = () => finish(new Error("Reference preview unavailable"));
      const aborted = () => finish(new Error("Reference preview cancelled"));
      const timer = window.setTimeout(failed, 8000);
      video.addEventListener(event, ready, { once: true });
      video.addEventListener("error", failed, { once: true });
      controller.signal.addEventListener("abort", aborted, { once: true });
    });
    async function extract() {
      const loaded = waitFor("loadeddata");
      video.src = url!;
      await loaded;
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(720, video.videoWidth);
      canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
      const context = canvas.getContext("2d");
      if (!context || !canvas.width || !canvas.height) return;
      const captured: Frame[] = [];
      for (let index = 0; index < 5; index++) {
        if (controller.signal.aborted) return;
        const time = video.duration * (0.05 + index * 0.225);
        const sought = waitFor("seeked");
        video.currentTime = time;
        await sought;
        if (controller.signal.aborted) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        captured.push({ src: canvas.toDataURL("image/jpeg", 0.8), time });
        setFrames([...captured]);
      }
    }
    void extract().catch(() => { /* A local preview failure must not interrupt the reference request. */ });
    return () => {
      controller.abort();
      video.removeAttribute("src");
      video.load();
    };
  }, [url, isImage]);
  return frames;
}

export function ReferenceScan({ url, isImage, replying, drafting }: { url: string | null; isImage: boolean; replying: boolean; drafting: boolean }) {
  const frames = useReferenceFrames(url, isImage);
  const [active, setActive] = useState(0);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 30_000);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (frames.length < 2) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;
    const update = () => {
      window.clearInterval(timer);
      if (!motion.matches) timer = window.setInterval(() => setActive(index => (index + 1) % frames.length), 720);
    };
    update();
    motion.addEventListener("change", update);
    return () => { window.clearInterval(timer); motion.removeEventListener("change", update); };
  }, [frames.length]);
  const frame = frames[active] ?? frames[0];
  const source = isImage ? url : frame?.src;
  const label = drafting ? "Shaping your checks" : replying ? "Putting it into words" : "Scanning your reference";
  return <div className="reference-scan" aria-label="Reference review in progress">
    <div className="reference-scan-heading">
      <span className="reference-scan-icon"><ScanLine size={17} aria-hidden="true" /></span>
      <div><p className="reference-scan-eyebrow">REFERENCE REVIEW</p><h3>{label}</h3></div>
      <span className="reference-scan-live"><span className="reference-scan-signal" aria-hidden="true"><i /><i /><i /><i /></span>In progress</span>
    </div>
    <div className="reference-scan-view" aria-hidden="true">
      {source ? <img src={source} alt="" /> : <div className="reference-scan-placeholder"><Film size={28} /><span>Preparing video preview</span></div>}
      <div className="reference-scan-grid" />
      <div className="reference-scan-hud"><span><span className="reference-scan-pulse" />FRAME PREVIEW</span><span>{isImage ? "STILL IMAGE" : `${String(frame ? active + 1 : 0).padStart(2, "0")} / ${String(frames.length).padStart(2, "0")}`}</span></div>
      <span className="reference-scan-corner reference-scan-corner-tl" /><span className="reference-scan-corner reference-scan-corner-tr" /><span className="reference-scan-corner reference-scan-corner-bl" /><span className="reference-scan-corner reference-scan-corner-br" />
      <div key={active} className="reference-scan-beam" />
      <div className="reference-scan-overlay"><span><ScanLine size={12} />{isImage ? "Image reference" : "Video reference"}</span><span>{isImage ? "STILL" : frame ? timestamp(frame.time) : "--:--"}</span></div>
    </div>
    {!isImage && <div className="reference-scan-filmstrip" aria-label="Sampled reference frames">
      {Array.from({ length: 5 }, (_, index) => <div key={index} className={`reference-scan-frame ${index === active ? "is-active" : ""}`}>
        {frames[index] ? <img src={frames[index].src} alt={`Reference frame at ${timestamp(frames[index].time)}`} /> : <div className="reference-scan-frame-placeholder" />}
        <span>{frames[index] ? timestamp(frames[index].time) : "--:--"}</span>
      </div>)}
    </div>}
    <div className="reference-scan-footer" role="status"><Sparkles size={15} aria-hidden="true" /><p>{slow ? "Still reviewing. Your reference is taking a little longer." : drafting ? "Suggested checks are arriving. You’ll review them next." : "Muse Spark is reviewing your reference to suggest visible checks."}</p><span className="reference-scan-pulse" aria-hidden="true" /></div>
    <p className="reference-scan-note">A starting point for your plan · You approve the checks before verification</p>
  </div>;
}
