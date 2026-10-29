import { Children, isValidElement, memo, type ReactNode } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { Markdown, type MarkdownComponents } from "@tanstack/markdown/react";
import { streamingMarkdownExtension } from "@tanstack/markdown/extensions/streaming";
import type { UrlTransform } from "@tanstack/markdown";

const streamingExtensions = [streamingMarkdownExtension()];
// Model-authored image URLs must not initiate requests to arbitrary hosts.
const chatUrlTransform: UrlTransform = (_url, kind, safeUrl) => kind === "image" ? null : safeUrl;

function inlineText(children: ReactNode): string {
  return Children.toArray(children).map(child => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (!isValidElement<{ children?: ReactNode }>(child) || child.type === "code") return "";
    return inlineText(child.props.children);
  }).join("");
}

const components = {
  p: ({ children, className, ...props }) => {
    // Match sentence punctuation rather than question marks inside URL query strings.
    const question = /[?؟](?:\s|$|[”’"')\]])/u.test(inlineText(children));
    return question ? <p {...props} className={["chat-question", className].filter(Boolean).join(" ")}>
      <span className="chat-question-label"><MessageCircleQuestion className="size-3.5 shrink-0" aria-hidden="true" />Question for you</span>
      <span className="chat-question-content">{children}</span>
    </p> : <p {...props} className={className}>{children}</p>;
  },
  a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>,
  table: ({ children, ...props }) => <div className="chat-markdown-table" role="region" aria-label="Response table" tabIndex={0}><table {...props}>{children}</table></div>,
} satisfies MarkdownComponents;

export const ChatMarkdown = memo(function ChatMarkdown({ content, streaming = false }: { content: string; streaming?: boolean }) {
  return <div className="chat-markdown">
    <Markdown allowHtml={false} headingIds={false} urlTransform={chatUrlTransform} components={components} extensions={streaming ? streamingExtensions : undefined}>{content}</Markdown>
    {streaming && <span className="chat-cursor" aria-hidden="true" />}
  </div>;
});
