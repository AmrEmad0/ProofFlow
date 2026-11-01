import { useEffect, useRef, useState } from "react";
import { AlertCircle, Focus, Pause, Play, ScanLine } from "lucide-react";
import { demoBoxesAt, demoMedia, demoTime } from "./demo-content";

type Props = { annotations: boolean; autoPlay: boolean; seek: { seconds: number; request: number }; onTime: (seconds: number) => void };

export function DemoEvidencePlayer({ annotations, autoPlay, seek, onTime }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showBoxes, setShowBoxes] = useState(true);
  const [failed, setFailed] = useState(false);
  const latestTime = useRef(onTime);
  latestTime.current = onTime;

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const position = () => { element.pause(); element.currentTime = seek.seconds; setTime(seek.seconds); latestTime.current(seek.seconds); };
    if (element.readyState >= 1) position();
    else element.addEventListener("loadedmetadata", position, { once: true });
    return () => element.removeEventListener("loadedmetadata", position);
  }, [seek]);

  useEffect(() => {
    const element = video.current;
    if (!element?.requestVideoFrameCallback) return;
    let frame = 0;
    const update: VideoFrameRequestCallback = (_now, metadata) => {
      if (!element.paused && !element.seeking) { setTime(metadata.mediaTime); latestTime.current(metadata.mediaTime); }
      frame = element.requestVideoFrameCallback(update);
    };
    frame = element.requestVideoFrameCallback(update);
    return () => element.cancelVideoFrameCallback(frame);
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (autoPlay) void element.play().catch(() => setPlaying(false));
    else element.pause();
  }, [autoPlay]);

  function scrub(value: number) {
    if (!video.current) return;
    video.current.currentTime = value; setTime(value); onTime(value);
  }

  return <div className="film-demo-player">
    <div className="film-player-top"><span><span className="film-live-dot" />{annotations ? "Evidence player" : "Reference recording"}</span><span>24 sec · audio removed</span></div>
    <div className="film-video-stage"><div className="film-video-content">
      <video ref={video} src={demoMedia.video} poster={demoMedia.poster} playsInline muted preload="metadata" aria-label="Sample recording of a drink being poured and the carafe returned to the counter" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setFailed(true)} onTimeUpdate={event => { const value = event.currentTarget.currentTime; setTime(value); onTime(value); }} />
      {annotations && showBoxes && <div className="film-box-layer" aria-hidden="true">{demoBoxesAt(time).map(box => <div key={box.label} className="film-object-box" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%`, borderColor: box.color }}><span style={{ background: box.color }}>{box.label}</span><i /><i /><i /><i /></div>)}</div>}
      {!playing && !failed && <button className="film-center-play" type="button" onClick={() => { void video.current?.play().catch(() => setPlaying(false)); }} aria-label="Play demo recording"><Play size={24} fill="currentColor" /></button>}
    </div>{failed && <p className="film-media-error" role="alert"><AlertCircle size={20} />The sample video could not load. Reload to try again.</p>}<span className="film-video-tag">{annotations ? "Illustrative object boxes" : "Real reference footage"}</span></div>
    <div className="film-player-controls"><button type="button" disabled={failed} aria-label={playing ? "Pause demo recording" : "Play demo recording"} onClick={() => { if (video.current?.paused) void video.current.play().catch(() => setPlaying(false)); else video.current?.pause(); }}>{playing ? <Pause size={16} /> : <Play size={16} />}</button><span>{demoTime(time)}</span><input type="range" aria-label="Sample video position" min={0} max={demoMedia.duration} step={.04} value={time} onChange={event => scrub(Number(event.target.value))} disabled={failed} /><span>{demoTime(demoMedia.duration)}</span>{annotations && <button type="button" aria-label="Toggle demo object boxes" aria-pressed={showBoxes} onClick={() => setShowBoxes(value => !value)}><Focus size={18} /></button>}</div>
    {annotations && <div className="film-tracking-legend"><span><i />Glass</span><span><i />Carafe</span><span><ScanLine size={12} aria-hidden="true" />Hand-authored demo annotations</span></div>}
  </div>;
}
