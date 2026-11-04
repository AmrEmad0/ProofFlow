export const demoMedia = {
  packing: "/images/packing-workflow.webp",
  workbench: "/images/workbench-workflow.webp",
};

export type DemoId = "packing";

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
};
