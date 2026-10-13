import { describe, expect, it } from "vitest";
import { prepareForEditing, serializeDocument } from "@/features/job/documents/editDocument";

const HOSTILE =
  '<!DOCTYPE html><html><head><script>window.top.pwned=1</script><meta http-equiv="refresh" content="0;url=https://evil.example"><style>p{color:red}</style></head>' +
  '<body onload="steal()"><p onclick="steal()">alt</p><img src="x" onerror="steal()">' +
  '<a href="javascript:steal()">l</a><a href=" JaVaScRiPt:steal()">m</a><a href="https://ok.example">ok</a>' +
  "<script>steal()</script></body></html>";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("serializeDocument", () => {
  it("keeps head styles and the edited body, with a doctype", () => {
    const doc = parse(
      "<!DOCTYPE html><html><head><style>p{color:red}</style></head><body><p>alt</p></body></html>",
    );
    doc.body.querySelector("p")!.textContent = "neu";
    const html = serializeDocument(doc);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<style>p{color:red}</style>");
    expect(html).toContain("<p>neu</p>");
  });

  it("does not store the editor's own policy tag", () => {
    const doc = parse(prepareForEditing("<html><head></head><body><p>x</p></body></html>"));
    expect(serializeDocument(doc)).not.toContain("Content-Security-Policy");
  });
});

describe("prepareForEditing", () => {
  it("adds a policy tag that allows only inline styles and local images and fonts", () => {
    const doc = parse(prepareForEditing("<html><head></head><body></body></html>"));
    const policy = doc.head.firstElementChild;
    expect(policy?.getAttribute("http-equiv")).toBe("Content-Security-Policy");
    expect(policy?.getAttribute("content")).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:",
    );
  });

  it("removes embedding, remote-loading and form elements and their loading attributes", () => {
    const html = prepareForEditing(
      '<html><head><base href="https://evil.example/"><link rel="stylesheet" href="https://evil.example/a.css"></head>' +
        '<body><iframe srcdoc="<script>1</script>"></iframe><object data="x"></object><embed src="x">' +
        '<form action="https://evil.example"><button formaction="https://evil.example">go</button></form>' +
        '<img srcset="https://evil.example/a.png 2x" src="data:image/png;base64,AA=="><p>text</p></body></html>',
    );
    expect(html).not.toMatch(/<(base|link|iframe|object|embed|form)\b/i);
    expect(html).not.toMatch(/srcdoc|srcset|formaction|evil\.example/i);
    expect(html).toContain("<p>text</p>");
    expect(html).toContain('src="data:image/png;base64,AA=="');
  });

  it("removes scripts, event handlers, javascript: links and meta refresh", () => {
    const html = prepareForEditing(HOSTILE);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\bon[a-z]+=/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/http-equiv="refresh"/i);
  });

  // A declarative shadow root is a <template> to DOMParser, whose content no selector reaches;
  // the frame attaches it as live DOM, so a link or SMIL inside it would escape every check.
  it("removes declarative shadow DOM templates with everything inside", () => {
    const html = prepareForEditing(
      '<div><template shadowrootmode="open"><a href="https://evil.example">x</a>' +
        '<img src="x" onerror="steal()"></template><p>text</p></div>',
    );
    expect(html).not.toMatch(/<template|shadowrootmode|evil\.example|onerror/i);
    expect(html).toContain("<p>text</p>");
  });

  // In the designMode frame a click on an SVG link navigates, and SMIL can put a link target back.
  it("removes SVG animation setters, upper-case ones included", () => {
    const html = prepareForEditing(
      '<svg><a><set attributeName="href" to="https://evil.example/s1"/>' +
        '<animate attributeName="xlink:href" values="https://evil.example/s2"/>' +
        '<SET attributeName="href" to="https://evil.example/s3"/><rect width="9" height="9"></rect></a></svg>',
    );
    expect(html).not.toMatch(/<set|<animate|evil\.example/i);
    expect(html).toContain("<rect");
  });

  it("removes frames of a frameset document", () => {
    const html = prepareForEditing(
      '<html><frameset cols="100%"><frame src="https://evil.example/f"></frameset></html>',
    );
    expect(html).not.toMatch(/<frame\b|evil\.example/i);
  });

  it("strips the link targets of SVG links and keeps the HTML links of a stored CV", () => {
    const html = prepareForEditing(
      '<p><a href="https://ok.example/cv">cv</a></p><svg><a href="https://evil.example/svg" ' +
        'xlink:href="https://evil.example/xl"><rect width="9" height="9"></rect></a></svg>',
    );
    expect(html).not.toMatch(/evil\.example|xlink:href/i);
    expect(html).toContain('<a href="https://ok.example/cv">cv</a>');
    expect(html).toContain("<rect");
  });

  // Firefox follows an href on any MathML element, not only on links.
  it("strips the link targets of MathML elements", () => {
    const html = prepareForEditing(
      '<math href="https://evil.example/m"><mi xlink:href="https://evil.example/x">m</mi></math>',
    );
    expect(html).not.toMatch(/evil\.example|href/i);
    expect(html).toContain(">m</mi>");
  });

  it("keeps the content, styles and harmless links", () => {
    const html = prepareForEditing(HOSTILE);
    expect(html).toContain("<style>p{color:red}</style>");
    expect(html).toContain(">alt</p>");
    expect(html).toContain('href="https://ok.example"');
  });
});
