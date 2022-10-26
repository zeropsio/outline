import Revision from "@server/models/Revision";
import DocumentHelper from "./DocumentHelper";

describe("toEmailDiff", () => {
  test("toEmailDiff", () => {
    const before = new Revision({
      title: "Title",
      text: `
This is a test paragraph

- list item 1
- list item 2

:::info
Content in an info block
:::

!!This is a placeholder!!

==this is a highlight==

- [ ] checklist item 1
- [ ] checklist item 2
- [x] checklist item 3

same on both sides

same on both sides

same on both sides`,
    });

    const after = new Revision({
      title: "Title",
      text: `
This is a test paragraph

A new paragraph

- list item 1

This is a new paragraph.

!!This is a placeholder!!

==this is a highlight==

- [x] checklist item 1
- [x] checklist item 2
- [ ] checklist item 3
- [ ] checklist item 4
- [x] checklist item 5

same on both sides

same on both sides

same on both sides`,
    });

    const html = DocumentHelper.toEmailDiff(before, after);

    // marks breaks in diff
    expect(html).toContain("diff-context-break");

    // changed list
    expect(html).toContain("checklist item 1");
    expect(html).toContain("checklist item 5");

    // added
    expect(html).toContain("A new paragraph");

    // Retained for context above added paragraph
    expect(html).toContain("This is a test paragraph");

    // removed
    expect(html).toContain("Content in an info block");

    // unchanged
    expect(html).not.toContain("same on both sides");
    expect(html).not.toContain("this is a highlight");
  });
});
