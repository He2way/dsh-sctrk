# dsh-sctrk

A [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) client plugin: a floating **session scroll-track** on the right edge. Every chat node (user message, assistant step, tool call, command, compaction record, …) maps to a tick on the track; dense nodes merge into gradient **clusters** (with a steel-blue anchor when they contain user messages). Hover elongates the nearest tick, darkens it and pops a frosted-glass **preview card** (composition title + node rows); click jumps straight to that position.

一个 DeepSeek Harness (DSH) 客户端插件：界面右侧的悬浮「会话轨迹条」。当前会话的每个聊天节点（用户消息、助手回复、工具调用、命令、压缩记录等）对应轨道上的一个刻度；密集节点自动聚合成渐变簇点（含用户消息的簇带钢青蓝锚标）。悬停使最近的刻度伸长并加深、弹出毛玻璃**预览浮窗**（构成标题 + 节点条目）；点击即精确跳转到对应位置。

## Features / 功能

- **Scroll-track / 会话轨迹条** — 8px 轨道映射整个会话：单节点刻度按类型着色（莫兰迪低饱和色板：用户/助手/工具/命令/转向/压缩/错误/工作流等），密集节点聚合为渐变簇点。
- **Hover magnet / 悬停磁吸 + 伸长** — 鼠标进入轨道左侧交互带内，最近的刻度/簇点**总是**伸长（scaleX 4、约 40px）并颜色加深（brightness .72），明确标示"点击会跳到这个位置"；涟漪邻域同步联动。浮窗↔刻度整条区域内移动时伸长保持。
- **Preview card / 浮窗预览** — 悬停弹出毛玻璃浮窗：标题显示簇内构成（`用户×5 · 助手×4 · 工具×3`），条目行显示各节点类型圆点 + 内容预览（最多 12 条等距采样）。
- **Click to jump / 点击跳转** — 点刻度/簇点/浮窗条目精确跳转对应节点；浮窗显示时点击浮窗↔刻度之间区域（桥接带）即跳转当前悬浮位置；点轨道本体或按住拖动按比例滚动。
- **Theme aware / 明暗主题自适应** — 毛玻璃风格，自包含样式，跟随 DSH 主题。

## Install / 安装

Requires a DSH profile (default: `web`). The package declares `dsh.bundle`, so `dsh plugin` wires it into the profile's bundle list automatically — no manual patch editing.

需要 DSH profile（默认 `web`）。本包声明了 `dsh.bundle`，`dsh plugin` 会自动把它加入 profile 的 bundle 列表，无需手动改 patch。

### From npm / 从 npm 安装

```bash
dsh plugin --profile web add dsh-sctrk
```

### From GitHub / 从 GitHub 安装

```bash
dsh plugin --profile web add git+https://github.com/He2way/dsh-sctrk.git
```

> If pnpm blocks the build of a git-hosted dependency, add the exact key pnpm prints under `allowBuilds` in `$DSH_HOME/profiles/web/pnpm-workspace.yaml`, then re-run.
> 若 pnpm 阻止 git 依赖的构建，把 pnpm 打印的 key 加到 `$DSH_HOME/profiles/web/pnpm-workspace.yaml` 的 `allowBuilds` 下，再重跑一次。

Then restart the `dsh web` process (or reload the profile) so the new loader row mounts and the browser bundle is composed into `window.__DSH_BOOT__`. Hard-refresh the page (Ctrl+Shift+R).

然后重启 `dsh web` 进程（或重新加载 profile）使新 loader 行挂载、浏览器 bundle 进入启动清单，最后强制刷新页面（Ctrl+Shift+R）。

## Usage / 用法

1. 鼠标移到轨道（右侧 8px 竖条）或其左侧交互带内 —— 最近的刻度/簇点伸长、变深，浮窗弹出。
2. 点击刻度 / 簇点 / 浮窗条目 / 浮窗与刻度之间的区域 —— 跳转到对应节点。
3. 点击轨道本体或按住拖动 —— 按比例滚动会话。
4. 悬停期间浮窗常驻（keep-zone + 100ms 延迟隐藏）；鼠标移出后一切还原。

## How it works / 工作原理

- 浏览器半区注册为 `shell.overlay` 槽位（官方文档的可叠加全屏层座位）的 occupant，id `chat-scroll-track`，order 200。
- 直接测量会话滚动容器（`[data-conversation-scroll]`）与节点元素（`[data-chat-flow-key]` / `[data-chat-flow-kind]`），`ResizeObserver` + `MutationObserver` 自动响应窗口变化与新消息到达；无 Host 半区。
- 簇点 `clusterColor` 按簇内类型占比生成渐变；含用户消息的簇带钢青蓝锚标（`.dsh-sctClusterUser`）。

## Development / 开发

No build step — `lib/client.js` is both source and shipped bundle (ModuleLoader format, zero dependencies beyond React).

```bash
# 无构建步骤；lib/client.js 即源码即产物（ModuleLoader 格式，仅依赖 React）
# 迭代：改 lib/client.js + 升 package.json 版本号
```

## Changelog / 变更记录

- **v74** — 悬停磁吸：`trySnap` 垂直不再设 60px 上限，进入交互带内总是伸长最近的刻度/簇点。
- **v73** — 选中反馈：被选中的刻度/簇点颜色加深（brightness .72），提示点击跳转位置。
- **v72** — 光标优化：簇点刻度/轨道不再显示手型（动态伸长+浮窗已足够表示可交互）。
- **v71** — 浮窗区点击跳转：浮窗显示时点击浮窗↔刻度之间区域即跳转。
- **v70** — 簇点初始 10px 宽 × 2-3px 高（修长）。
- **v69** — 浮窗标题显示簇内构成（`用户×5 · 助手×4 · 工具×3`）。
- **v65** — 莫兰迪低饱和高级感配色（含用户锚点钢青蓝 `#6e8bb8`）。
- **v64** — 簇点伸长触发区扩展到浮窗↔刻度整条区域。
- **v63** — 修复浮窗条目点击"有时没反应"（`closest('[data-sct-mark]')`）。

## License / 许可证

MIT © He2way
