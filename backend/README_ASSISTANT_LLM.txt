Met 嵌入式助手（Flask + llama-cpp-python + GGUF）

要点（与 Flow 项目一致）
----------------------------
1. AI 打包前将 GGUF 放到 `backend/models/assistant.gguf`，或设置环境变量 `CINF_ASSISTANT_GGUF`。
2. Windows 推荐使用上游 CPU 预编译 wheel：
   ```bash
   pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu
   ```
3. `npm run dist:win:ai-full`：`CINF_PACK_LOCAL_AI=1` 构建 backend.exe（打入 llama_cpp），再运行 `scripts/stage-pack-resources.js` 复制 GGUF。
4. `npm run dist:win:full`：No-AI 后端（requirements.noai.txt），不打 GGUF。
5. Electron 启动时为后端注入 `CINF_RESOURCE_ROOT` 指向 `resources/backend`，模型默认路径 `backend/models/`。
6. 路由：`GET /api/assistant/status`、`POST /api/assistant/chat`（NDJSON 流式）。
7. 知识库：`backend/assistant_knowledge/` 下递归加载 `.txt`/`.md`。

详见上游仓库 Flow 内 `backend/README_ASSISTANT_LLM.txt` 的故障排查章节（访问冲突、VC++ 运行库、路径含中文等）。
