import { useRef, useState } from "react";
import { ArrowUpRight, Play, ScanLine } from "lucide-react";

const videoSource = "/videos/packing-tracked.mp4";

export function TrackedVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);

  async function play() {
    try {
      await videoRef.current?.play();
    } catch {
      setPlaybackError(true);
    }
  }

  return <figure className="home-tracked-video" aria-label="Tracked packing video example">
    <div className="tracked-video-heading"><span><ScanLine size={15} aria-hidden="true" />A CLOSER LOOK AT THE WORK</span><span>10 SEC / MP4</span></div>
    <div className="tracked-video-frame">
      <div className="tracked-video-toolbar"><span className="tracked-video-dots" aria-hidden="true"><i /><i /><i /></span><span>Packing workflow</span><span className="tracked-video-badge">Tracked example</span></div>
      <div className="tracked-video-screen">
        <video ref={videoRef} controls={started || playbackError} playsInline preload="none" poster="/images/packing-tracked-poster.webp" width={640} height={360} aria-label="Packing workflow with object tracking overlays" aria-describedby="tracked-video-caption" onPlay={() => setStarted(true)} onError={() => setPlaybackError(true)}>
          <source src={videoSource} type="video/mp4" />
          Your browser does not support embedded video. <a href={videoSource}>Open the tracked packing video.</a>
        </video>
        {!started && !playbackError && <button type="button" className="tracked-video-play" onClick={() => void play()} aria-label="Play the 10-second tracked packing example"><span className="tracked-video-play-icon"><Play size={20} fill="currentColor" aria-hidden="true" /></span><span><strong>Watch the tracks in action</strong><small>10 seconds. Look closer.</small></span><ArrowUpRight size={18} aria-hidden="true" /></button>}
      </div>
      <div className="tracked-video-legend" aria-label="Objects labeled in the clip"><span><i className="track-box" />Shipping box</span><span><i className="track-container" />Blue container</span><span><i className="track-slip" />Packing slip</span></div>
    </div>
    <figcaption id="tracked-video-caption">Follow the objects. Inspect the moment.<span>Object tracks show what’s visible; they aren’t a verdict on their own.</span></figcaption>
    {playbackError && <p className="tracked-video-error" role="status">Unable to play here. <a href={videoSource}>Open the video directly</a> to inspect the clip.</p>}
  </figure>;
}
