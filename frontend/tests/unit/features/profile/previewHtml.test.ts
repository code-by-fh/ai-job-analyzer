import { describe, expect, it } from "vitest";
import { previewDocument, withoutLinkTargets } from "@/features/profile/templates/previewHtml";

// The reviewer's probe cases (fix round 1, I1): a link and a SMIL setter inside a declarative
// shadow root navigated the sandboxed frame, because DOMParser leaves template content unparsed
// for selectors while the frame attaches it.
const SHADOW_LINK =
  '<div id="host"><template shadowrootmode="open"><a href="https://evil.example/shadow">click</a></template></div>';
const SHADOW_SET =
  '<div><template shadowrootmode="open"><svg><a><set attributeName="href" to="https://evil.example/smil"/>' +
  '<rect width="200" height="100"/></a></svg></template><p>kept</p></div>';

describe("preview sanitiser", () => {
  it("removes declarative shadow roots before the link pass", () => {
    const html = withoutLinkTargets(SHADOW_LINK + SHADOW_SET);
    expect(html).not.toMatch(/<template|shadowrootmode|evil\.example/i);
    expect(html).toContain("<p>kept</p>");
  });

  it.each([
    ["shadow link", SHADOW_LINK],
    ["shadow SMIL setter", SHADOW_SET],
  ])("the frame document of a %s carries no template and no remote target", (_name, html) => {
    const srcDoc = previewDocument(html);
    expect(srcDoc).not.toContain("shadowrootmode");
    expect(srcDoc).not.toContain("<template");
    expect(srcDoc).not.toContain("evil.example");
  });
});
