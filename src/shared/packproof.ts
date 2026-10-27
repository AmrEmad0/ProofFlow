import { proofPlanSchema } from "./proof-plan";

export const packproofTemplate = proofPlanSchema.parse({
  schemaVersion: 1,
  title: "PackProof",
  goal: "Show a visible product and packing slip being placed in an open box, then close the box.",
  steps: [
    {
      id: "insert-product",
      label: "Put the blue product in the box",
      checkType: "object_enters_region",
      subjectConcept: "blue product",
      targetConcept: "cardboard box",
      beforeState: null,
      afterState: null,
      observableEvidence: "Show the blue product outside the open box. Keep it in view as you put it through the opening and into the box.",
    },
    {
      id: "insert-slip",
      label: "Put the packing slip in the box",
      checkType: "object_enters_region",
      subjectConcept: "white paper sheet",
      targetConcept: "cardboard box",
      beforeState: null,
      afterState: null,
      observableEvidence: "Show the white paper sheet outside the box. Keep it in view as you put it through the opening and into the box.",
    },
    {
      id: "close-box",
      label: "Close the box",
      checkType: "visible_state_change",
      subjectConcept: "cardboard box",
      targetConcept: null,
      beforeState: "Box flaps visibly open",
      afterState: "Box flaps visibly closed",
      observableEvidence: "Start with the box open. Keep it in view as you close its flaps, then show the closed box.",
    },
  ],
  limitations: [
    "Only visible actions can be assessed; internal condition and hidden contents cannot be established.",
    "2D overlap or disappearance behind the box does not prove insertion. Occluded actions remain uncertain.",
  ],
});
