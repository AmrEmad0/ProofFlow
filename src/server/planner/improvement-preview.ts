import { improvementProgressSchema, type ImprovementProgress } from "../../shared/plan-improvement";
import { ReplyTextDecoder } from "./reply-text";

type Frame = { kind: "object" | "array"; key: string; field: string | null; expectingKey: boolean };

export class ImprovementPreviewDecoder {
  private explanation = new ReplyTextDecoder("explanation");
  private frames: Frame[] = [];
  private token: string | null = null;
  private escaped = false;
  private progress: ImprovementProgress = { explanation: "", scopeChanges: [], filmingAdvice: [] };
  private previous = "";

  constructor(private readonly emit: (progress: ImprovementProgress) => void) {}

  push(chunk: string) {
    this.progress = { ...this.progress, explanation: this.explanation.push(chunk) };
    for (const character of chunk) {
      const parent = this.frames.at(-1);
      if (this.token !== null) {
        this.token += character;
        if (this.escaped) { this.escaped = false; continue; }
        if (character === "\\") { this.escaped = true; continue; }
        if (character !== '"') continue;
        const value: unknown = JSON.parse(this.token);
        this.token = null;
        if (parent?.kind === "object" && parent.expectingKey) {
          parent.key = String(value);
          parent.expectingKey = false;
        } else if (this.frames.length === 2 && parent?.kind === "array" && (parent.field === "scopeChanges" || parent.field === "filmingAdvice")) {
          const field = parent.field;
          this.progress = { ...this.progress, [field]: [...this.progress[field], value] };
        }
        continue;
      }
      if (character === '"') this.token = '"';
      else if (character === "{" || character === "[") this.frames.push({ kind: character === "{" ? "object" : "array", key: "", field: this.frames.length === 1 ? parent?.key ?? null : null, expectingKey: true });
      else if (character === "}" || character === "]") this.frames.pop();
      else if (character === "," && parent?.kind === "object") parent.expectingKey = true;
    }
    const snapshot = improvementProgressSchema.parse(this.progress);
    const serialized = JSON.stringify(snapshot);
    if (serialized !== this.previous) { this.previous = serialized; this.emit(snapshot); }
  }
}
