import { proofPlanSchema } from "./proof-plan";

export const packproofTemplate = proofPlanSchema.parse({
  schemaVersion: 1,
  title: "PackProof",
  goal: "Show a visible product and packing slip being placed in an open box, then close the box.",
  steps: [
    {
      id: "insert-product",
      label: "Insert the visible product",
      checkType: "object_enters_region",
      subjectConcept: "blue product",
      targetConcept: "cardboard box",
      beforeState: null,
      afterState: null,
      observableEvidence: "The blue product is visible outside the open box, crosses its opening, and is visibly placed inside.",
    },
    {
      id: "insert-slip",
      label: "Insert the visible packing slip",
      checkType: "object_enters_region",
      subjectConcept: "white paper sheet",
      targetConcept: "cardboard box",
      beforeState: null,
      afterState: null,
      observableEvidence: "The white paper sheet visibly moves from outside the box through its opening and into the box.",
    },
    {
      id: "close-box",
      label: "Close the box",
      checkType: "visible_state_change",
      subjectConcept: "cardboard box",
      targetConcept: null,
      beforeState: "Box flaps visibly open",
      afterState: "Box flaps visibly closed",
      observableEvidence: "The box is visibly open before the action and its flaps are visibly closed afterward.",
    },
  ],
  limitations: [
    "Only visible actions can be assessed; internal condition and hidden contents cannot be established.",
    "2D overlap or disappearance behind the box does not prove insertion. Occluded actions remain uncertain.",
  ],
});
