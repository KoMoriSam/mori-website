import MarkdownItAbbr from "markdown-it-abbr";
import MarkdownItAttrs from "markdown-it-attrs";
import MarkdownItBracketedSpans from "markdown-it-bracketed-spans";
import { full as emojiPlugin } from "markdown-it-emoji";
import MarkdownItMark from "markdown-it-mark";
import MarkdownItSub from "markdown-it-sub";
import MarkdownItSup from "markdown-it-sup";

import { alertPlugin } from "./markdown-it-alert";
import { anchorPlugin } from "./markdown-it-anchor";
import {
  chatContainerPlugin,
  chatHeaderPlugin,
  momentsPlugin,
} from "./markdown-it-chat";
import { codePlugin } from "./markdown-it-code";
import { figurePlugin } from "./markdown-it-figure";
import { footnotePlugin } from "./markdown-it-footnote";
import { linkIconPlugin } from "./markdown-it-link-icon";
import { mermaidPlugin } from "./markdown-it-mermaid";
import { rubyPlugin } from "./markdown-it-ruby";
import { taskStatusPlugin } from "./markdown-it-task-status";

export function tableWrapperPlugin(md) {
  const defaultTableOpen =
    md.renderer.rules.table_open ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };
  const defaultTableClose =
    md.renderer.rules.table_close ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.table_open = function (tokens, idx, options, env, self) {
    return (
      '<section class="markdown-table-wrapper">' +
      defaultTableOpen(tokens, idx, options, env, self)
    );
  };

  md.renderer.rules.table_close = function (tokens, idx, options, env, self) {
    return defaultTableClose(tokens, idx, options, env, self) + "</section>";
  };
}

export function buildReaderMarkdownPlugins({
  hasExtension,
  allowedAttributes,
  translateTitle,
  mathJaxPlugin,
}) {
  return [
    ["abbreviations", MarkdownItAbbr],
    ["attributes", MarkdownItBracketedSpans],
    [
      "attributes",
      [
        MarkdownItAttrs,
        {
          allowedAttributes: allowedAttributes ?? ["id", "class", "data-tip"],
        },
      ],
    ],
    ["headingAnchors", anchorPlugin],
    ["alerts", [alertPlugin, { translateTitle }]],
    ["social", chatHeaderPlugin],
    ["social", chatContainerPlugin],
    ["social", momentsPlugin],
    ["code", codePlugin],
    ["emoji", emojiPlugin],
    ["footnotes", footnotePlugin],
    ["ruby", [rubyPlugin, { rp: ["（", "）"] }]],
    ["subscript", MarkdownItSub],
    ["superscript", MarkdownItSup],
    ["tasks", taskStatusPlugin],
    ["math", mathJaxPlugin],
    ["mark", MarkdownItMark],
    ["mermaid", mermaidPlugin],
    ["figures", figurePlugin],
    ["tables", tableWrapperPlugin],
    ["linkIcons", linkIconPlugin],
  ].flatMap(([name, plugin]) => (hasExtension(name) && plugin ? [plugin] : []));
}
