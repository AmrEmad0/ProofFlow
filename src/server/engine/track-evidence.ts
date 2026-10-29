import type { ConceptTrack, TrackBox } from "../../shared/verification";
import type { TrackWindow } from "../../shared/diagnostics";

export const fullyFramed = (box: TrackBox) => box.left > 0 && box.top > 0 && box.right < 1 && box.bottom < 1;

export function continuousTrack(track: ConceptTrack | undefined, first: number, last: number, objectId?: string): TrackBox[] | null {
  if (!track || track.outcome !== "completed" || last - first < 1) return null;
  const boxes: TrackBox[] = [];
  for (let frame = first; frame <= last; frame++) {
    const matches = track.boxes.filter((box) => box.frameIndex === frame && (objectId === undefined || box.objectId === objectId));
    if (matches.length !== 1) return null;
    boxes.push(matches[0]!);
  }
  return new Set(boxes.map((box) => box.objectId)).size === 1 ? boxes : null;
}

export function visibleStateInstances(track: ConceptTrack | undefined, first: number, last: number): string[] {
  return [...new Set(track?.boxes.map(box => box.objectId))].filter(id => {
    const boxes = continuousTrack(track, first, last, id);
    // A frame-edge fragment cannot establish an object's visible before/after
    // states. Keep all fully framed continuous alternatives, regardless of size.
    return boxes && [boxes[0]!, boxes.at(-1)!].every(fullyFramed);
  });
}

export function describeTrack(concept: string, track: ConceptTrack | undefined, first: number, last: number): TrackWindow {
  const boxes = track?.boxes.filter((box) => box.frameIndex >= first && box.frameIndex <= last) ?? [];
  const frames = Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => index + first);
  const at = (frame: number) => boxes.filter((box) => box.frameIndex === frame);
  return {
    concept, outcome: track?.outcome ?? "missing", selectedObjectId: null,
    missingFrames: frames.filter((frame) => at(frame).length === 0),
    multipleFrames: frames.filter((frame) => at(frame).length > 1),
    objects: [...new Set(boxes.map((box) => box.objectId))].map((objectId) => {
      const object = boxes.filter((box) => box.objectId === objectId);
      return { objectId, frames: new Set(object.map((box) => box.frameIndex)).size,
        firstFrame: Math.min(...object.map((box) => box.frameIndex)), lastFrame: Math.max(...object.map((box) => box.frameIndex)),
        missingFrames: frames.filter((frame) => !object.some((box) => box.frameIndex === frame)),
        duplicateFrames: frames.filter((frame) => object.filter((box) => box.frameIndex === frame).length > 1) };
    }),
  };
}

