export const demoMedia = {
  packing: "/images/packing-workflow.webp",
  manufacturing: "/images/manufacturing-workflow.webp",
  workbench: "/images/workbench-workflow.webp",
};

export type DemoId = "packing" | "manufacturing";

type DemoCheck = {
  id: string;
  title: string;
  requirement: string;
  status: "Observed" | "Not observed";
  explanation: string;
  box: { x: number; y: number; width: number; height: number };
  label: string;
};

export type DemoScenario = {
  id: DemoId;
  label: string;
  title: string;
  heading: string;
  referenceTitle: string;
  image: string;
  imageAlt: string;
  prompt: string;
  heroPrompt: string;
  draftReply: string;
  followupQuestion: string;
  followupReply: string;
  checks: readonly [DemoCheck, DemoCheck, DemoCheck];
};

// Scripted still-image illustrations, not live model results or video verification.
export const demoScenarios: Record<DemoId, DemoScenario> = {
  packing: {
    id: "packing",
    label: "Order packing",
    title: "Pack an order",
    heading: "One order. Three clear checks.",
    referenceTitle: "Order packing",
    image: demoMedia.packing,
    imageAlt: "AI-generated illustration of an open kraft box containing a green shirt and a paper packing slip",
    prompt: "Check that the product and packing slip are visible inside the box, and the box is closed.",
    heroPrompt: "Check the product, packing slip, and closed box.",
    draftReply: "Here’s your draft: product visible, packing slip visible, box closed. Ready to review?",
    followupQuestion: "Why isn’t the box check observed?",
    followupReply: "The flaps are open in this image. We can’t tell what happened before or afterward.",
    checks: [
      { id: "product", title: "Product visible inside box", requirement: "Look for the product within the open box.", status: "Observed", explanation: "The shirt is visible inside the box in this generated example. A still image cannot establish how or when it was placed there.", box: { x: 25, y: 24, width: 46, height: 50 }, label: "Product" },
      { id: "slip", title: "Packing slip visible inside box", requirement: "Look for the packing slip beside or on the product.", status: "Observed", explanation: "The paper slip is visible on the shirt. Its contents and correctness cannot be verified from this illustration.", box: { x: 40, y: 43, width: 20, height: 24 }, label: "Packing slip" },
      { id: "closed", title: "Box is closed", requirement: "Look for a visibly closed box.", status: "Not observed", explanation: "The box is open in this image. This says nothing about whether it was closed later; a real run needs your video evidence.", box: { x: 12, y: 1, width: 75, height: 91 }, label: "Open box" },
    ],
  },
  manufacturing: {
    id: "manufacturing",
    label: "Manufacturing",
    title: "Review an assembly station",
    heading: "One assembly. Three visible checks.",
    referenceTitle: "Electronics assembly",
    image: demoMedia.manufacturing,
    imageAlt: "AI-generated electronics assembly station with a circuit board in an open metal housing, a separate lid on the left, and a driver in its holder on the right",
    prompt: "Check that the circuit board is visible in the housing, the driver is in its holder, and the cover is fitted.",
    heroPrompt: "Check the circuit board, parked driver, and fitted cover.",
    draftReply: "Here’s your draft: board visible in the housing, driver in its holder, cover fitted. Ready to review?",
    followupQuestion: "Why isn’t the cover check observed?",
    followupReply: "The housing is open and its cover is lying beside it. This image can’t tell us whether the cover was fitted later, or whether the electronics work.",
    checks: [
      { id: "board", title: "Circuit board visible in housing", requirement: "Look for the board inside the metal housing.", status: "Observed", explanation: "The board is visible inside the housing in this generated example. This does not establish correct wiring, secure mounting, or electrical function.", box: { x: 40, y: 45, width: 35, height: 24 }, label: "Circuit board" },
      { id: "driver", title: "Driver in its holder", requirement: "Look for the driver resting in its holder.", status: "Observed", explanation: "The driver is visible in its holder at the right of the image. Its position does not establish whether it was used or whether fasteners were tightened.", box: { x: 83, y: 23, width: 13, height: 49 }, label: "Parked driver" },
      { id: "cover", title: "Cover fitted to housing", requirement: "Look for the cover visibly in place on the housing.", status: "Not observed", explanation: "The housing is open and the cover is separate at the left. This does not mean the cover was never fitted before or after this moment.", box: { x: 1, y: 43, width: 34, height: 34 }, label: "Separate cover" },
    ],
  },
};
