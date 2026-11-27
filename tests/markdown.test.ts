import { describe, expect, it } from "vitest";
// @ts-expect-error plain browser ES module, no type declarations
import { renderMarkdown } from "../public/markdown.js";

describe("renderMarkdown", () => {
  it("renders paragraphs, bold, italic and inline code", () => {
    const html = renderMarkdown("Hello **world** and *you*, try `npm i`.");
    expect(html).toBe("<p>Hello <strong>world</strong> and <em>you</em>, try <code>npm i</code>.</p>");
  });

  it("renders lists and headings", () => {
    expect(renderMarkdown("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(renderMarkdown("1. one\n2. two")).toBe("<ol><li>one</li><li>two</li></ol>");
    expect(renderMarkdown("# Title")).toBe("<h3>Title</h3>");
  });

  it("renders fenced code blocks with a copy button, without interpreting their contents", () => {
    const html = renderMarkdown("```js\nconst a = **1** < 2;\n```");
    expect(html).toContain('<span class="code-lang">js</span>');
    expect(html).toContain('class="code-copy"');
    expect(html).toContain("<pre><code>const a = **1** &lt; 2;</code></pre>");
  });

  it("renders pipe tables", () => {
    const html = renderMarkdown("| Name | Mood |\n| --- | --- |\n| Ann | **calm** |\n| Raj | happy |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Name</th><th>Mood</th>");
    expect(html).toContain("<td>Ann</td><td><strong>calm</strong></td>");
    expect(html.match(/<tr>/g)?.length).toBe(3);
  });

  it("escapes raw HTML so nothing can be injected", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)"> <script>alert(1)</script>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("only links http(s) and mailto URLs, never javascript:", () => {
    expect(renderMarkdown("[ok](https://example.com)")).toContain('href="https://example.com"');
    expect(renderMarkdown("[ok](https://example.com)")).toContain('rel="noopener noreferrer"');
    expect(renderMarkdown("[bad](javascript:alert(1))")).not.toContain("<a ");
  });

  it("keeps single line breaks and survives empty input", () => {
    expect(renderMarkdown("one\ntwo")).toBe("<p>one<br>two</p>");
    expect(renderMarkdown("")).toBe("");
  });
});
