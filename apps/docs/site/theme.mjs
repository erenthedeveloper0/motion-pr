// Syntax theme derived from the MotionPR palette (brand/README.md): the gradient's four stops
// on Ink, lifted where needed to keep at least 4.5:1 contrast against the code surface.
const C = {
  fg: "#E7E4F1",
  muted: "#8C88A3",
  comment: "#7A7690",
  blue: "#9AAFFA", // Blue #839CF6, lifted
  violet: "#B596F5", // Violet #7E4AE6, lifted for text on Ink
  pink: "#EDB8D2", // Pink #E5A9C7
  peach: "#F0B48E", // Peach #ECA67A
  paper: "#F3F1FA",
};

export const BRAND_THEME = {
  name: "motionpr",
  type: "dark",
  colors: { "editor.background": "#0D0D13", "editor.foreground": C.fg },
  tokenColors: [
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: C.comment, fontStyle: "italic" },
    },
    {
      scope: [
        "keyword",
        "storage",
        "storage.type",
        "storage.modifier",
        "keyword.control",
        "keyword.operator.new",
        "keyword.operator.expression",
      ],
      settings: { foreground: C.violet },
    },
    {
      scope: ["string", "string.quoted", "string.template", "punctuation.definition.string"],
      settings: { foreground: C.peach },
    },
    {
      scope: [
        "constant.numeric",
        "constant.language",
        "constant.character",
        "support.constant",
        "variable.other.constant",
      ],
      settings: { foreground: C.pink },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call entity.name.function",
        "variable.function",
      ],
      settings: { foreground: C.blue },
    },
    {
      scope: [
        "entity.name.type",
        "entity.name.class",
        "support.type",
        "support.class",
        "entity.other.inherited-class",
      ],
      settings: { foreground: C.blue },
    },
    {
      scope: [
        "variable.other.property",
        "meta.object-literal.key",
        "support.type.property-name",
        "entity.other.attribute-name",
        "meta.property-name",
      ],
      settings: { foreground: "#CFCADF" },
    },
    {
      scope: ["entity.name.tag", "punctuation.definition.tag"],
      settings: { foreground: C.violet },
    },
    {
      scope: [
        "keyword.operator",
        "punctuation",
        "meta.brace",
        "punctuation.separator",
        "punctuation.terminator",
      ],
      settings: { foreground: C.muted },
    },
    {
      scope: ["variable", "variable.other.readwrite", "variable.parameter"],
      settings: { foreground: C.fg },
    },
    {
      scope: [
        "entity.name.function.shell",
        "support.function.builtin.shell",
        "entity.name.command",
      ],
      settings: { foreground: C.blue },
    },
    {
      scope: ["variable.parameter.option", "constant.other.option"],
      settings: { foreground: C.pink },
    },
    {
      scope: ["markup.heading", "entity.name.section"],
      settings: { foreground: C.paper, fontStyle: "bold" },
    },
    { scope: ["markup.inserted"], settings: { foreground: "#9BD9B4" } },
    { scope: ["markup.deleted"], settings: { foreground: "#F2A3A3" } },
  ],
};
