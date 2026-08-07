# 设备三维外观模型

三维视图（`frontend/src/components/modules/SmeltingFurnaceViewer.tsx`）会尝试加载：

```
./equipment/side-blown-furnace.glb
```

**文件缺失时静默降级**为纯参数化炉体（长方体炉壳 + 按计算个数排布的水套与风口），
功能可用，只是外观是示意的。把 `.glb` 放进本目录后无需改代码即会自动生效。

## 从 MicroStation / OpenPlant Modeler 导出

1. 只保留炉体本体，删除周边管道、平台、钢结构等无关图元，避免体积失控；
2. 导出 glTF 二进制（`.glb`），文件名固定为 `side-blown-furnace.glb`；
3. 建议开启 Draco 压缩。若压缩后仍超过约 20 MB，改走 electron-builder
   `extraResources` 分发（放到 `cad/` 旁的独立目录），而不是塞进前端 bundle。

## 对位约定

加载后组件会自动做归一化，不需要你在 CAD 里对齐坐标系：

- **长轴**：取包围盒较长的水平边作为炉长方向，必要时自动绕 Y 轴旋转 90°；
- **缩放**：整体缩放到当前计算所得的炉长；
- **落地**：包围盒底面贴到 Y=0，水平方向居中。

水套与风口始终由参数化几何生成叠加在外观模型上，所以导出的 `.glb`
**不需要**包含水套和风口。
