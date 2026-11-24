import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReplyText, replyBlocks } from "@/modules/assistant/ui/reply-text";

describe("Den's reply formatting", () => {
  it("splits paragraphs and lists", () => {
    expect(replyBlocks("Lead line.\n\n- one\n- **two**\n\nNext game: ward.\n1. a\n2) b")).toEqual([
      { kind: "p", text: "Lead line." },
      { kind: "ul", items: ["one", "**two**"] },
      { kind: "p", text: "Next game: ward." },
      { kind: "ol", items: ["a", "b"] },
    ]);
    expect(replyBlocks("## Build\ntext")).toEqual([{ kind: "p", text: "**Build**\ntext" }]);
  });

  it("renders bold and bullets as elements, and nothing else as markup", () => {
    const { container } = render(
      <ReplyText
        text={"Buy **BKB** early.\n- <b>raw</b> [link](https://x.example)\n- a ** stray"}
      />,
    );
    expect(screen.getByText("BKB").tagName).toBe("STRONG");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("<b>raw</b> [link](https://x.example)");
    expect(container.textContent).toContain("a ** stray");
  });
});
