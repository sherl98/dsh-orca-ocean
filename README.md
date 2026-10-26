# ASCII 虎鲸游弋

中文 | [English](README.en.md)

**让一头 ASCII 虎鲸游进你的 DeepSeek Harness。**

纯ASCII代码构成的虎鲸游弋动态背景，仅在新会话页面中生效。发出第一句提示词后，虎鲸将下潜深度求索。

![虎鲸游弋与下潜演示](assets/demo.gif)

[观看完整录屏](assets/demo.mp4)

| 浅色模式 | 深色模式 |
| --- | --- |
| ![浅色模式](assets/light.png) | ![深色模式](assets/dark.png) |

演示环境：DeepSeek Harness `0.2.1-rc.3`（macOS）。

兼容 DeepSeek Harness `0.2.1-rc.2` 及后续 `0.2.x` 版本。

## 安装

在 DeepSeek Harness 桌面版的 **插件 → 添加插件** 中输入：

```text
github:sherl98/dsh-orca-ocean
```

Web / CLI 用户运行：

```sh
dsh plugin --profile web add github:sherl98/dsh-orca-ocean
```

按宿主提示启用或重启，然后打开新会话。自动适配浅色与深色模式，遵循系统的「减少动态效果」设置。

卸载：在插件页面移除，或运行 `dsh plugin --profile web remove @sherl98/dsh-orca-ocean`。

## 开发

修改 `client.template.js` 或 `mask.json` 后运行 `npm run build`，生成随仓库分发的 `client.js`。运行时无需安装额外依赖。

## 致谢

灵感来自 [stackedlol/ascii-sharks](https://github.com/stackedlol/ascii-sharks)。

## 许可

[MIT](LICENSE) © 2026 sherl98
