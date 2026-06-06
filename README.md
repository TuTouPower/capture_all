# Record All

Chrome MV3 浏览器扩展，结构化录制浏览器操作、网络请求、控制台日志、DOM/Storage/Cookie 变化。数据保存在浏览器本地，支持导出（JSON/JSONL/HAR/HTML）或通过 MCP 供本地 AI Agent 查询分析。

## 开发

```bash
npm install        # 安装依赖
npm run dev        # 开发模式
npm run build      # 构建
npm test           # 单元测试
npm run test:e2e   # E2E 测试
```

## 项目结构

```
src/
  agent/        # Bridge 服务 + MCP 服务端
  background/   # Service Worker，核心录制逻辑
  content/      # Content Script，页面内事件捕获
  detail/       # 录制详情页
  devtools/     # DevTools 面板
  popup/        # 扩展弹窗 UI
  shared/       # 共享类型、常量、工具函数
tests/          # 测试文件
docs/           # 文档
assets/         # 图标等静态资源
```
