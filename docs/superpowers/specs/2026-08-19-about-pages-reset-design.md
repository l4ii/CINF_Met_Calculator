# “了解我们”页面重置设计

## 目标

参考 `D:\软件\CINF_RockMass_Calculator` 的公司介绍、科研创新中心和矿山事业部页面，重置当前 Met 计算器中的三个“了解我们”页面，使三页使用一致的标题编号、Hero 结构和分节层级。

## 范围

- 公司介绍（`aboutDepartment === 'cinf'`）：直接复用参考项目的公司介绍页面结构、文案和图片路径。
- 科研创新中心（`aboutDepartment === 'research'`）：直接复用参考项目的科研创新中心结构、科研平台文案、图片展示和放大预览行为。
- 冶炼事业部（`aboutDepartment === 'metallurgy'`）：复制参考项目矿山事业部页面的结构、统计、专家、技术方向、服务领域和代表性工程列表；由于当前没有冶炼材料，只替换身份性标题为“冶炼事业部”，不把矿山事实改写成冶炼业绩。
- 不改变计算流程、侧栏导航的现有路由键（`cinf`、`research`、`metallurgy`）和设置页。

## 统一视觉与标题约定

三页使用参考项目的 `AboutDesignPrimitives`：

- 公司介绍：`ABOUT / 01`，Hero 标题为“有色金属全产业链技术与服务提供商”。
- 科研创新中心：`ABOUT / 02`，Hero 标题为“科研创新中心”。
- 冶炼事业部：`ABOUT / 03`，Hero 身份文案为“长沙有色院 · 冶炼事业部”，主标题为“冶炼事业部”。
- 页面分节统一使用 `SECTION / 01`、`SECTION / 02` 等编号标题，并保持参考项目的卡片、图文交替、深浅色模式和响应式布局。

## 内容与资源

参考项目使用的资源复制到当前项目 `frontend/public/about/` 下的对应目录：

- 公司介绍：`about/cinf/` 下的企业楼宇、企业精神和相关图片。
- 科研创新中心：`about/rdc/` 下的 `info1.jpg` 至 `info5.jpg` 及缩略图。
- 冶炼事业部沿用矿山素材：`about/2/` 下的矿山图片、专家肖像和宣传册图片。

所有图片仍通过相对 public 路径加载；研究中心和事业部的图片保留点击放大，代表性工程保留可展开的项目说明。

## 组件边界

- 新增 `frontend/src/components/shell/AboutDesignPrimitives.tsx`，只负责共享 Hero 与分节标题。
- 公司介绍与科研创新中心继续由 `AboutPage.tsx` 渲染，以保持现有懒加载入口和 props 接口不变。
- 新增 `frontend/src/components/shell/MiningAboutPage.tsx` 作为事业部页面主体，接收 `darkMode`、`appTitle`、`appSubtitle` 和 `onBackToHome`。
- 在当前 Met 项目中将事业部分支映射为 `metallurgy`，并将矿山页面的标题身份替换为冶炼事业部；不新增 `mining` 路由。

## 交互与兼容性

- 返回主页面按钮、深色模式和中英文应用标题继续使用当前应用的 props 与上下文。
- 研究中心、事业部的图片预览层使用现有可访问性属性和 Escape/点击关闭行为。
- 页面在现有 Electron/Vite 构建下工作，不引入新的运行时依赖；若参考页面依赖图标库，则在当前项目已有依赖范围内使用等价实现。

## 验收标准

1. 三个入口可从侧栏打开，且路由键仍为 `cinf`、`research`、`metallurgy`。
2. 三页首屏均出现连续一致的 `ABOUT / 01`、`ABOUT / 02`、`ABOUT / 03` 标题体系。
3. 公司介绍和科研创新中心的参考页面文案、图片和主要交互可用。
4. 冶炼事业部页面使用矿山页内容与素材，但页面身份标题明确显示“冶炼事业部”；页面正文不新增未经提供的冶炼工程事实。
5. `frontend` 的 TypeScript/Vite 构建通过，且新增的页面测试覆盖共享标题组件和三页关键标题。

