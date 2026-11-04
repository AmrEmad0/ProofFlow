export const PACK_DEMO = {
  planId: "fcc11d86-2898-4d8a-8188-63c5bb51dc0d",
  versionId: "7bfb8473-88d5-42ad-8a06-7f5edb68854c",
  runId: "ae7105f1-ca8b-4d9d-b788-eb7a750a7a63",
  title: "Pack an order",
} as const;

export const PACK_DEMO_VIDEOS = [
  { runId: PACK_DEMO.runId, filename: "demo-1-pack.mp4", label: "Demo video 1" },
  { runId: "d44281b7-8c16-42ea-938b-b001de3fd086", filename: "Person_packing_order_in_box_dc37aa78.mp4", label: "Demo video 2" },
] as const;

export function demoVideo(runId: string) {
  return PACK_DEMO_VIDEOS.find(video => video.runId === runId);
}
