export const demoMedia = {
  video: "/demo/coffee-routine.mp4",
  reference: "/demo/coffee-reference.jpg",
  poster: "/demo/coffee-poster.jpg",
  duration: 24,
  source: "https://www.pexels.com/video/a-person-pouring-coffee-into-a-glass-4796418/",
  license: "https://www.pexels.com/license/",
  author: "cottonbro studio",
};

export const demoPrompt = "Use this video and photo as a reference. I want to check that the drink is poured into the glass, the carafe is put back on the counter, and the drink is stirred.";

// Authored walkthrough data, grounded in the public stock clip; not Muse or SAM output.
export const demoChecks = [
  { id: "pour", title: "Drink is poured into the glass", before: "Carafe away from glass", after: "Liquid visibly entering glass", status: "Observed", start: 6, end: 14, thumbnail: "/demo/coffee-pour.jpg", explanation: "A visible stream moves from the tilted carafe into the glass. Inspect the pouring sequence; this does not establish the drink’s temperature or quantity." },
  { id: "return", title: "Carafe is returned to the counter", before: "Carafe held above counter", after: "Carafe resting on counter", status: "Observed", start: 14, end: 20, thumbnail: "/demo/coffee-return.jpg", explanation: "The carafe is lowered back onto the counter beside the glass. Inspect the transition and the final position." },
  { id: "stir", title: "Drink is stirred", before: "Drink in glass", after: "Visible stirring action", status: "Not observed", start: 0, end: 24, thumbnail: "/demo/coffee-end.jpg", explanation: "No stirring action is visible in this clip. Review the full recording; this does not mean stirring never happened before or after it." },
] as const;

export type DemoObjectBox = { label: string; color: string; x: number; y: number; width: number; height: number };
type Keyframe = { time: number; glass: readonly [number, number, number, number]; carafe: readonly [number, number, number, number] };
const keyframes: readonly Keyframe[] = [
  { time: 0, glass: [.09,.48,.37,.40], carafe: [.49,.34,.49,.48] },
  { time: 4, glass: [.17,.50,.38,.40], carafe: [.53,.05,.47,.61] },
  { time: 8, glass: [.21,.44,.41,.46], carafe: [.34,0,.57,.45] },
  { time: 12, glass: [.19,.50,.42,.43], carafe: [.31,0,.61,.46] },
  { time: 16, glass: [.17,.42,.41,.46], carafe: [.45,.01,.48,.65] },
  { time: 20, glass: [.15,.28,.42,.53], carafe: [.54,.08,.46,.65] },
  { time: 24, glass: [.15,.28,.42,.53], carafe: [.54,.08,.46,.65] },
];

export function demoBoxesAt(time: number): DemoObjectBox[] {
  const next = keyframes.findIndex(frame => frame.time > time);
  const first = keyframes[Math.max(0, next === -1 ? keyframes.length - 1 : next - 1)]!;
  const last = keyframes[next === -1 ? keyframes.length - 1 : next]!;
  const blend = first === last ? 0 : Math.max(0, Math.min(1, (time - first.time) / (last.time - first.time)));
  return (["glass", "carafe"] as const).map((key, index) => {
    const coordinates = first[key].map((value, coordinate) => value + (last[key][coordinate]! - value) * blend);
    return { label: key === "glass" ? "Glass" : "Carafe", color: index === 0 ? "#c5ed8b" : "#95d8ff", x: coordinates[0]!, y: coordinates[1]!, width: coordinates[2]!, height: coordinates[3]! };
  });
}

export function demoTime(time: number) { return `0:${Math.floor(time).toString().padStart(2, "0")}`; }
