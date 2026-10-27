import type { ApprovedPlan, ProofStep } from "../../shared/proof-plan";
import { findingSchema, type Finding } from "../../shared/receipt";
import { ANALYSIS_FPS, type ConceptTrack, type TrackBox } from "../../shared/verification";
import type { Observation } from "../meta/observe";

export const VERIFICATION_RULE_VERSION = "2026-10-27.1";
type Candidate = Observation["candidates"][number];
const canonical = (concept: string) => concept.trim().toLowerCase();

function continuousTrack(track: ConceptTrack | undefined, first: number, last: number): TrackBox[] | null {
  if (!track || track.outcome !== "completed" || last - first < 1) return null;
  const boxes: TrackBox[] = [];
  for (let frame = first; frame <= last; frame++) {
    const matches = track.boxes.filter((box) => box.frameIndex === frame);
    if (matches.length !== 1) return null;
    boxes.push(matches[0]!);
  }
  return new Set(boxes.map((box) => box.objectId)).size === 1 ? boxes : null;
}

function overlap(subject: TrackBox, region: TrackBox): number {
  const width = Math.max(0, Math.min(subject.right, region.right) - Math.max(subject.left, region.left));
  const height = Math.max(0, Math.min(subject.bottom, region.bottom) - Math.max(subject.top, region.top));
  return width * height / ((subject.right - subject.left) * (subject.bottom - subject.top));
}

function evaluate(step: ProofStep, candidate: Candidate | undefined, tracks: ConceptTrack[], frameCount: number): Finding {
  const base: Finding = { stepId: step.id, status: "uncertain", startMs: candidate?.startMs ?? null, endMs: candidate?.endMs ?? null,
    explanation: "Muse did not locate a usable event window. This does not establish that the action never happened.", evidence: [] };
  if (!candidate || candidate.startMs === null || candidate.endMs === null) return base;
  if (candidate.actionVisible && candidate.nonOccurrenceVisible) return { ...base, explanation: "The visual proposal contains contradictory action evidence. Human review is needed." };
  if (candidate.visibility !== "clear" || candidate.ambiguities.length > 0) {
    return { ...base, explanation: "The proposed evidence is occluded or ambiguous. Review the recording; a missed or hidden action cannot be ruled out." };
  }
  const first = Math.max(0, Math.floor(candidate.startMs * ANALYSIS_FPS / 1000));
  const last = Math.min(frameCount - 1, Math.ceil(candidate.endMs * ANALYSIS_FPS / 1000));
  const subjectTrack = tracks.find((track) => canonical(track.concept) === canonical(step.subjectConcept));
  const subject = continuousTrack(subjectTrack, first, last);
  if (!subject) return { ...base, explanation: "A single continuous subject track could not be grounded across the event. Missing tracks are not evidence that the action never happened." };
  const refs = (boxes: TrackBox[], concept: string) => [boxes[0]!, boxes.at(-1)!].map((box) => ({ concept, objectId: box.objectId, frameIndex: box.frameIndex }));
  base.evidence = refs(subject, step.subjectConcept);
  const supported = candidate.actionVisible && candidate.beforeMatches && candidate.afterMatches;

  if (step.checkType === "object_present_at_end") {
    const ending = continuousTrack(subjectTrack, Math.max(0, frameCount - 3), frameCount - 1);
    if (candidate.afterMatches && ending && ending[0]!.objectId === subject[0]!.objectId) {
      return { ...base, status: "observed", startMs: Math.round(ending[0]!.frameIndex * 1000 / ANALYSIS_FPS),
        endMs: Math.round((frameCount - 1) * 1000 / ANALYSIS_FPS), evidence: refs(ending, step.subjectConcept),
        explanation: "Muse's final-state proposal is grounded by the same visible object across the final sampled frames." };
    }
    return { ...base, explanation: "Presence at the end could not be grounded. Disappearance or a missing final track remains uncertain." };
  }

  if (step.checkType === "visible_state_change") {
    if (supported) return { ...base, status: "observed", explanation: "Muse proposes the required visible before/after change, grounded by one continuous SAM subject track. Inspect the clip to review those states." };
    // Negative findings require continuous positive scene coverage, never a missing detection.
    if (!candidate.actionVisible && candidate.beforeMatches && !candidate.afterMatches && candidate.nonOccurrenceVisible && candidate.searchComplete
      && continuousTrack(subjectTrack, 0, frameCount - 1)) {
      return { ...base, status: "not_observed", startMs: 0, endMs: Math.round((frameCount - 1) * 1000 / ANALYSIS_FPS),
        explanation: "The requested state change was not observed in the sampled clip. The subject remains continuously grounded and Muse reports the before-state persists; this does not certify events outside the recording." };
    }
    return { ...base, explanation: "The tracked object is visible, but the required before/after change is not sufficiently supported." };
  }

  const regionTrack = tracks.find((track) => canonical(track.concept) === canonical(step.targetConcept ?? ""));
  const region = continuousTrack(regionTrack, first, last);
  if (!region) return { ...base, explanation: "The target region could not be tracked continuously. Overlap or disappearance cannot establish entry." };
  base.evidence.push(...refs(region, step.targetConcept!));
  const ratios = subject.map((box, index) => overlap(box, region[index]!));
  if (supported && ratios.length >= 4 && ratios[0]! <= 0.05 && ratios.slice(-3).every((ratio) => ratio >= 0.95)) {
    return { ...base, status: "observed", explanation: "The visible entry proposal has a continuous outside-to-inside track sustained for three sampled frames. This supports visible movement; 2D geometry does not certify hidden contents." };
  }
  const allSubjects = continuousTrack(subjectTrack, 0, frameCount - 1);
  const allRegions = continuousTrack(regionTrack, 0, frameCount - 1);
  if (!candidate.actionVisible && candidate.nonOccurrenceVisible && candidate.searchComplete && allSubjects && allRegions
    && allSubjects.every((box, index) => overlap(box, allRegions[index]!) <= 0.05)) {
    return { ...base, status: "not_observed", startMs: 0, endMs: Math.round((frameCount - 1) * 1000 / ANALYSIS_FPS),
      explanation: "Entry was not observed in this sampled clip: the continuously tracked subject stays outside the continuously tracked region. This does not rule out actions between sampled frames or outside the recording." };
  }
  return { ...base, explanation: "The geometry does not show a sustained, continuously visible outside-to-inside transition. Simple overlap or disappearance is insufficient." };
}

export function verifyEvidence(plan: ApprovedPlan, observation: Observation, tracks: ConceptTrack[], frameCount: number): Finding[] {
  const findings = plan.steps.map((step) => evaluate(step, observation.candidates.find((candidate) => candidate.stepId === step.id), tracks, frameCount));
  let latestEnd = -1;
  for (const finding of findings) {
    if (finding.status !== "observed" || finding.startMs === null) continue;
    if (finding.startMs < latestEnd) {
      finding.status = "uncertain";
      finding.explanation = "The proposed event conflicts with the approved step order. Review the recording to resolve the sequence.";
    } else latestEnd = finding.endMs ?? finding.startMs;
  }
  return findings.map((finding) => findingSchema.parse(finding));
}
