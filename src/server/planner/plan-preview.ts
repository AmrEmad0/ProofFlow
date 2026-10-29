import { proofPlanSchema, proofStepSchema } from "../../shared/proof-plan";
import type { PlannerPreview } from "../../shared/planner";

type Frame = { kind: "object" | "array"; path: (string | number)[]; start: number; key: string; expectingKey: boolean; index: number };

// Only complete display fields are exposed. The full plan still needs validation and saving.
export class PlanPreviewDecoder {
  private source = "";
  private frames: Frame[] = [];
  private stringStart: number | null = null;
  private escaped = false;
  private preview: PlannerPreview = { title: null, checks: [] };

  constructor(private readonly emit: (preview: PlannerPreview) => void) {}

  push(chunk: string) {
    const offset = this.source.length;
    this.source += chunk;
    for (let index = offset; index < this.source.length; index++) {
      const character = this.source[index];
      const parent = this.frames.at(-1);
      if (this.stringStart !== null) {
        if (this.escaped) { this.escaped = false; continue; }
        if (character === "\\") { this.escaped = true; continue; }
        if (character !== '"') continue;
        const value: unknown = JSON.parse(this.source.slice(this.stringStart, index + 1));
        this.stringStart = null;
        if (parent?.kind === "object" && parent.expectingKey) {
          parent.key = String(value);
          parent.expectingKey = false;
        } else if (parent?.path.length === 1 && parent.path[0] === "plan" && parent.key === "title") {
          const title = proofPlanSchema.shape.title.safeParse(value);
          if (title.success) { this.preview = { ...this.preview, title: title.data }; this.emit(this.preview); }
        }
        continue;
      }
      if (character === '"') this.stringStart = index;
      else if (character === "{" || character === "[") {
        const path = parent ? [...parent.path, parent.kind === "array" ? parent.index : parent.key] : [];
        this.frames.push({ kind: character === "{" ? "object" : "array", path, start: index, key: "", expectingKey: true, index: 0 });
      } else if (character === "}" || character === "]") {
        const frame = this.frames.pop();
        if (frame?.kind === "object" && frame.path.length === 3 && frame.path[0] === "plan" && frame.path[1] === "steps") {
          const step = proofStepSchema.safeParse(JSON.parse(this.source.slice(frame.start, index + 1)));
          if (step.success) {
            this.preview = { ...this.preview, checks: [...this.preview.checks, step.data.label] };
            this.emit(this.preview);
          }
        }
      } else if (character === "," && parent) {
        if (parent.kind === "object") parent.expectingKey = true;
        else parent.index++;
      }
    }
  }
}
