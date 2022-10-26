import {
  updateYFragment,
  yDocToProsemirrorJSON,
} from "@getoutline/y-prosemirror";
import { JSDOM } from "jsdom";
import { escapeRegExp } from "lodash";
import diff from "node-htmldiff";
import { Node, DOMSerializer } from "prosemirror-model";
import * as React from "react";
import { renderToString } from "react-dom/server";
import styled, { ServerStyleSheet, ThemeProvider } from "styled-components";
import * as Y from "yjs";
import EditorContainer from "@shared/editor/components/Styles";
import GlobalStyles from "@shared/styles/globals";
import light from "@shared/styles/theme";
import { isRTL } from "@shared/utils/rtl";
import unescape from "@shared/utils/unescape";
import { parser, schema } from "@server/editor";
import Logger from "@server/logging/Logger";
import Document from "@server/models/Document";
import type Revision from "@server/models/Revision";
import parseAttachmentIds from "@server/utils/parseAttachmentIds";
import { getSignedUrl } from "@server/utils/s3";
import Attachment from "../Attachment";

type HTMLOptions = {
  /** Whether to include the document title in the generated HTML (defaults to true) */
  includeTitle?: boolean;
  /** Whether to include style tags in the generated HTML (defaults to true) */
  includeStyles?: boolean;
  /** Whether to include styles to center diff (defaults to true) */
  centered?: boolean;
};

export default class DocumentHelper {
  /**
   * Returns the document as a Prosemirror Node. This method uses the
   * collaborative state if available, otherwise it falls back to Markdown->HTML.
   *
   * @param document The document or revision to convert
   * @returns The document content as a Prosemirror Node
   */
  static toProsemirror(document: Document | Revision) {
    if ("state" in document && document.state) {
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, document.state);
      return Node.fromJSON(schema, yDocToProsemirrorJSON(ydoc, "default"));
    }
    return parser.parse(document.text);
  }

  /**
   * Returns the document as Markdown. This is a lossy conversion and should
   * only be used for export.
   *
   * @param document The document or revision to convert
   * @returns The document title and content as a Markdown string
   */
  static toMarkdown(document: Document | Revision) {
    const text = unescape(document.text);

    if (document.version) {
      return `# ${document.title}\n\n${text}`;
    }

    return text;
  }

  /**
   * Returns the document as plain HTML. This is a lossy conversion and should
   * only be used for export.
   *
   * @param document The document or revision to convert
   * @param options Options for the HTML output
   * @returns The document title and content as a HTML string
   */
  static toHTML(document: Document | Revision, options?: HTMLOptions) {
    const node = DocumentHelper.toProsemirror(document);
    const sheet = new ServerStyleSheet();
    let html, styleTags;

    const Centered = options?.centered
      ? styled.article`
          max-width: 46em;
          margin: 0 auto;
          padding: 0 1em;
        `
      : "article";

    const rtl = isRTL(document.title);
    const children = (
      <>
        {options?.includeTitle !== false && (
          <h1 dir={rtl ? "rtl" : "ltr"}>{document.title}</h1>
        )}
        <EditorContainer dir={rtl ? "rtl" : "ltr"} rtl={rtl}>
          <div id="content" className="ProseMirror"></div>
        </EditorContainer>
      </>
    );

    // First render the containing document which has all the editor styles,
    // global styles, layout and title.
    try {
      html = renderToString(
        sheet.collectStyles(
          <ThemeProvider theme={light}>
            <>
              {options?.includeStyles === false ? (
                <article>{children}</article>
              ) : (
                <>
                  <GlobalStyles />
                  <Centered>{children}</Centered>
                </>
              )}
            </>
          </ThemeProvider>
        )
      );
      styleTags = sheet.getStyleTags();
    } catch (error) {
      Logger.error("Failed to render styles on document export", error, {
        id: document.id,
      });
    } finally {
      sheet.seal();
    }

    // Render the Prosemirror document using virtual DOM and serialize the
    // result to a string
    const dom = new JSDOM(
      `<!DOCTYPE html>${
        options?.includeStyles === false ? "" : styleTags
      }${html}`
    );
    const doc = dom.window.document;
    const target = doc.getElementById("content");

    DOMSerializer.fromSchema(schema).serializeFragment(
      node.content,
      {
        document: doc,
      },
      // @ts-expect-error incorrect library type, third argument is target node
      target
    );

    return dom.serialize();
  }

  /**
   * Generates a HTML diff between documents or revisions.
   *
   * @param before The before document
   * @param after The after document
   * @param options Options passed to HTML generation
   * @returns The diff as a HTML string
   */
  static diff(
    before: Document | Revision | null,
    after: Revision,
    options?: HTMLOptions
  ) {
    if (!before) {
      return DocumentHelper.toHTML(after, options);
    }

    const beforeHTML = DocumentHelper.toHTML(before, options);
    const afterHTML = DocumentHelper.toHTML(after, options);
    const beforeDOM = new JSDOM(beforeHTML);
    const afterDOM = new JSDOM(afterHTML);

    // Extract the content from the article tag and diff the HTML, we don't
    // care about the surrounding layout and stylesheets.
    const diffedContentAsHTML = diff(
      beforeDOM.window.document.getElementsByTagName("article")[0].innerHTML,
      afterDOM.window.document.getElementsByTagName("article")[0].innerHTML
    );

    // Inject the diffed content into the original document with styling and
    // serialize back to a string.
    const article = beforeDOM.window.document.querySelector("article");
    if (article) {
      article.innerHTML = diffedContentAsHTML;
    }
    return beforeDOM.serialize();
  }

  /**
   * Generates a compact HTML diff between documents or revisions, the
   * diff is reduced up to show only the parts of the document that changed and
   * the immediate context. Breaks in the diff are denoted with
   * "div.diff-context-break" nodes.
   *
   * @param before The before document
   * @param after The after document
   * @param options Options passed to HTML generation
   * @returns The diff as a HTML string
   */
  static toEmailDiff(
    before: Document | Revision | null,
    after: Revision,
    options?: HTMLOptions
  ) {
    if (!before) {
      return "";
    }

    const html = DocumentHelper.diff(before, after, options);
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const containsDiffElement = (node: Element | null) => {
      return node && node.innerHTML.includes("data-operation-index");
    };

    // We use querySelectorAll to get a static NodeList as we'll be modifying
    // it as we iterate, rather than getting content.childNodes.
    const contents = doc.querySelectorAll("#content > *");
    let previousNodeRemoved = false;
    let previousDiffClipped = false;

    const br = doc.createElement("div");
    br.innerHTML = "…";
    br.className = "diff-context-break";

    for (const childNode of contents) {
      // If the block node contains a diff tag then we want to keep it
      if (containsDiffElement(childNode as Element)) {
        if (previousNodeRemoved && previousDiffClipped) {
          childNode.parentElement?.insertBefore(br.cloneNode(true), childNode);
        }
        previousNodeRemoved = false;
        previousDiffClipped = true;

        // If the block node does not contain a diff tag and the previous
        // block node did not contain a diff tag then remove the previous.
      } else {
        if (
          childNode.nodeName === "P" &&
          childNode.textContent &&
          childNode.nextElementSibling?.nodeName === "P" &&
          containsDiffElement(childNode.nextElementSibling)
        ) {
          if (previousDiffClipped) {
            childNode.parentElement?.insertBefore(
              br.cloneNode(true),
              childNode
            );
          }
          previousNodeRemoved = false;
          continue;
        }
        if (
          childNode.nodeName === "P" &&
          childNode.textContent &&
          childNode.previousElementSibling?.nodeName === "P" &&
          containsDiffElement(childNode.previousElementSibling)
        ) {
          previousNodeRemoved = false;
          continue;
        }
        previousNodeRemoved = true;
        childNode.remove();
      }
    }

    const head = doc.querySelector("head");
    const body = doc.querySelector("body");
    return `${head?.innerHTML} ${body?.innerHTML}`;
  }

  /**
   * Converts attachment urls in documents to signed equivalents that allow
   * direct access without a session cookie
   *
   * @param text The text either html or markdown which contains urls to be converted
   * @param teamId The team context
   * @param expiresIn The time that signed urls should expire in (ms)
   * @returns The replaced text
   */
  static async attachmentsToSignedUrls(
    text: string,
    teamId: string,
    expiresIn = 3000
  ) {
    const attachmentIds = parseAttachmentIds(text);
    await Promise.all(
      attachmentIds.map(async (id) => {
        const attachment = await Attachment.findOne({
          where: {
            id,
            teamId,
          },
        });

        if (attachment) {
          const signedUrl = await getSignedUrl(attachment.key, expiresIn);
          text = text.replace(
            new RegExp(escapeRegExp(attachment.redirectUrl), "g"),
            signedUrl
          );
        }
      })
    );
    return text;
  }

  /**
   * Applies the given Markdown to the document, this essentially creates a
   * single change in the collaborative state that makes all the edits to get
   * to the provided Markdown.
   *
   * @param document The document to apply the changes to
   * @param text The markdown to apply
   * @param append If true appends the markdown instead of replacing existing
   * content
   * @returns The document
   */
  static applyMarkdownToDocument(
    document: Document,
    text: string,
    append = false
  ) {
    document.text = append ? document.text + text : text;

    if (document.state) {
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, document.state);
      const type = ydoc.get("default", Y.XmlFragment) as Y.XmlFragment;
      const doc = parser.parse(document.text);

      if (!type.doc) {
        throw new Error("type.doc not found");
      }

      // apply new document to existing ydoc
      updateYFragment(type.doc, type, doc, new Map());

      const state = Y.encodeStateAsUpdate(ydoc);
      document.state = Buffer.from(state);
      document.changed("state", true);
    }

    return document;
  }
}
