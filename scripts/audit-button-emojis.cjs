const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const interactive = new Set(["button", "Button", "a", "Link", "NavLink", "DropdownMenuTrigger", "DropdownMenuItem", "SelectTrigger", "TabsTrigger", "DialogClose", "SheetClose", "AlertDialogAction", "AlertDialogCancel"]);
const textIcons = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "ArrowUpDown", "ChevronLeft", "ChevronRight", "ChevronUp", "ChevronDown", "ExternalLink", "Download", "Upload", "Undo2", "Redo2"]);
const emoji = /\p{Extended_Pictographic}/u;
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const filename = path.join(dir, item.name);
    if (item.isDirectory()) walk(filename);
    else if (filename.endsWith(".tsx") && !filename.endsWith(".test.tsx")) files.push(filename);
  }
}
walk("src");
let issues = 0;
for (const filename of files) {
  const source = fs.readFileSync(filename, "utf8");
  if (!emoji.test(source) && !source.includes("EmojiIcons") && !source.includes("categoryEmoji")) continue;
  const ast = parser.parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const emojiIcons = new Set();
  for (const statement of ast.program.body) {
    if (statement.type === "ImportDeclaration" && statement.source.value.endsWith("EmojiIcons")) {
      for (const specifier of statement.specifiers) {
        if (specifier.type === "ImportSpecifier" && !textIcons.has(specifier.imported.name)) emojiIcons.add(specifier.local.name);
      }
    }
  }
  traverse(ast, {
    JSXElement(p) {
      const tag = p.node.openingElement.name;
      if (tag.type !== "JSXIdentifier" || !interactive.has(tag.name)) return;
      const block = source.slice(p.node.start, p.node.end);
      const matches = [...block.matchAll(/\p{Extended_Pictographic}/gu)].map((m) => m[0]);
      const nestedIcons = new Set();
      p.traverse({
        JSXOpeningElement(iconPath) {
          const name = iconPath.node.name;
          if (name.type === "JSXIdentifier" && emojiIcons.has(name.name)) nestedIcons.add(name.name);
        },
      });
      if (matches.length || block.includes("categoryEmoji(") || nestedIcons.size) {
        console.log(`${filename}:${p.node.loc.start.line} <${tag.name}> ${[...new Set(matches)].join(" ")} ${block.includes("categoryEmoji(") ? "categoryEmoji" : ""} ${[...nestedIcons].join(", ")}`);
        issues++;
      }
    },
  });
}
console.log(`Potential controls: ${issues}`);
if (issues) process.exitCode = 1;
