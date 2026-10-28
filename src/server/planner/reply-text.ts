// Expose only the top-level reply string, never plan fields or reasoning deltas.
export class ReplyTextDecoder {
  private depth = 0;
  private inString = false;
  private nextIsKey = false;
  private isKey = false;
  private key = "";
  private token = "";
  private escaped = false;
  private unicode: string | null = null;
  private readingReply = false;
  private text = "";

  push(chunk: string): string {
    for (const character of chunk) {
      if (!this.inString) {
        if (character === "{" || character === "[") {
          this.depth++;
          if (this.depth === 1) this.nextIsKey = true;
        } else if (character === "}" || character === "]") this.depth--;
        else if (character === "," && this.depth === 1) this.nextIsKey = true;
        else if (character === '"') {
          this.inString = true;
          this.isKey = this.depth === 1 && this.nextIsKey;
          this.nextIsKey = false;
          this.readingReply = !this.isKey && this.depth === 1 && this.key === "reply";
          this.token = "";
        }
        continue;
      }
      if (this.unicode !== null) {
        this.unicode += character;
        if (this.unicode.length === 4) {
          this.append(JSON.parse(`"\\u${this.unicode}"`) as string);
          this.unicode = null;
        }
      } else if (this.escaped) {
        this.escaped = false;
        if (character === "u") this.unicode = "";
        else this.append(JSON.parse(`"\\${character}"`) as string);
      } else if (character === "\\") this.escaped = true;
      else if (character === '"') {
        this.inString = false;
        if (this.isKey) this.key = this.token;
        this.readingReply = false;
      } else this.append(character);
    }
    // A Unicode escape pair can be split between chunks.
    return this.text.replace(/[\uD800-\uDBFF]$/, "");
  }

  private append(value: string) {
    if (this.isKey) this.token += value;
    if (this.readingReply) this.text += value;
  }
}
