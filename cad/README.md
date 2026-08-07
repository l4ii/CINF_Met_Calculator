# 炉体 CAD 原件（DGN）

本目录用于存放侧吹炉参数化 DGN 原件。打包时由 electron-builder 的 `extraResources`
整体复制到安装目录的 `resources/cad/`；开发期主进程直接读取仓库根目录的本目录。

## 运行时行为

「设备选型 → 三维方案 → 打开 DGN 模型」按钮走主进程 `cad:open-dgn`：

1. 在本目录（打包后为 `resources/cad/`）查找**第一个** `.dgn` 文件，找到就交给系统
   注册的 MicroStation / OpenPlant Modeler 打开；
2. 找不到时弹出文件选择框，由用户自行指定 DGN。

因此只放一个正式炉体模型即可；多个 `.dgn` 时命中顺序取决于文件名排序。

## 参数写回

软件**不解析也不修改** DGN。DGN V8 是 Bentley 私有格式，能读写它的只有闭源付费的
ODA Drawings SDK，或必须运行在已授权 MicroStation 内的 Bentley Python API。

参数联动走「导出 MicroStation 变量表」按钮生成的 CSV：

```
VARIABLES OVERWRITE <变量表 csv 路径>
```

前提是 DGN 已经用 Variables + 参数化 cell 建模，且变量名与 CSV 中的
`FurnaceLength`、`FurnaceWidth`、`FurnaceHeight`、`JacketPitch`、
`JacketCountOneSide`、`JacketCountTotal`、`TuyereCount` 对齐。
变量名与列头集中定义在 `frontend/src/utils/microstationVariablesCsv.ts`，
若你的模型导出表头不同，改那一处即可。
