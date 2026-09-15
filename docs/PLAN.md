# Open Sea 独立项目计划

> 确认日期：2026-09-15  
> 状态：已落地（脚手架 + 迁入 + SeaDock + demo 清理 + 生产构建通过）

## 目标

将 `procedural-modeling-demo` 中的 OpenSea 模块独立为项目，覆盖本仓库 `open-sea`；无路由、无返回按钮；首页即原 `OpenSeaLoader`；左上 Info + 右下 Control 合并为 lofi-room 式圆环 dock；保留全部海洋/鱼群/天气/性能能力与可调面板透明度。

## 决策

| 项 | 决定 |
| --- | --- |
| 落点 | 覆盖 `3D_projects/open-sea` |
| 栈 | Vue 3 + Vite + Three `0.185` WebGPU/TSL |
| 入口 | 无 `vue-router`；`App` → `OpenSeaLoader` → `OpenSea` |
| UI | 单圆环 + 可拖动玻璃面板；海洋青水色 `#8fe9e4` |
| 透明度 | 滑条 `0.05–0.95`，默认 `0.15`；`--console-alpha` 驱动底/边/模糊 |
| demo | 删除 OpenSea 路由、首页卡片、源码与 `ocean*` 工具；保留共用 Info/ControlPanel |

## 架构

```text
index.html → App.vue(wallpaper) → OpenSeaLoader → OpenSea.vue
                                              └→ SeaDock.vue (ring + console)
OpenSea → fish/* · weather/* · oceanPerf · oceanI18n
```

## 面板分组（功能全集）

1. 海洋 — 海况/漂流、时段/实时、语言
2. 天气 — 晴雪雨风暴、闪电、流星
3. 鱼群·沙丁鱼 — 数量与行为参数、鱼缸、边界、加载进度
4. 鱼群·锦鲤 — 对应滑条
5. 性能/动画 — FPS、播放、速度、画质、超高清
6. 相机 — 重置、鱼眼
7. 面板 — 透明度
8. 说明 — 操作与快捷键（圆环开控制台）

## 实施阶段

1. 脚手架 + PLAN
2. 迁入场景代码与资源
3. SeaDock UI 重构并接线
4. 清理 procedural-modeling-demo
5. 安装依赖并验收

## 刻意不做

- 不改写为 vanilla TS
- 不恢复旧 CDN whale/shark 方案
- 不改 lofi-room 仓库
- 本轮不做 Electron 打包
