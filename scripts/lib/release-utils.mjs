import { spawn } from "node:child_process";
import { PROJECT_ROOT } from "./commands.mjs";

export const formatLocalIso = (date = new Date(), { milliseconds = true } = {}) => {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const pad = (value) => String(value).padStart(2, "0");
  const ms = milliseconds ? `.${String(date.getMilliseconds()).padStart(3, "0")}` : "";

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${ms}`,
    `${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`,
  ].join("");
};

export const parseEditorCommand = (value) =>
  String(value || "").match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, "")) || [];

export const openEditor = async (path, { label = "文件", cwd = PROJECT_ROOT } = {}) => {
  const configuredEditor = process.env.VISUAL || process.env.EDITOR;
  const parts = configuredEditor
    ? parseEditorCommand(configuredEditor)
    : process.platform === "win32"
      ? ["notepad.exe"]
      : ["vi"];
  const [command, ...args] = parts;

  if (!command) {
    console.log(`${label}已保存，请手动编辑：${path}`);
    return;
  }

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, [...args, path], {
      cwd,
      stdio: "inherit",
      windowsHide: false,
    });
    child.on("error", rejectPromise);
    child.on("exit", (code) =>
      code === 0
        ? resolvePromise()
        : rejectPromise(new Error(`编辑器退出，状态码：${code}`)),
    );
  });
};

export const printDiff = (
  { added = [], changed = [], removed = [] } = {},
  options = {},
) => {
  const {
    formatItem = (item) => `${item.id || item.version} · ${item.title || item.summary}`,
    emptyMessage = "内容已与网站一致。",
  } = typeof options === "function" ? { formatItem: options } : options;

  const printGroup = (symbol, label, items) => {
    if (!items?.length) return;
    console.log(`\n${label}（${items.length}）`);
    for (const item of items) {
      console.log(`  ${symbol} ${formatItem(item)}`);
    }
  };

  printGroup("+", "新增", added);
  printGroup("~", "修改", changed);
  printGroup("-", "移除", removed);
  if (!added?.length && !changed?.length && !removed?.length) {
    console.log(emptyMessage);
  }
};
