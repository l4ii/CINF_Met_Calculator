# 发布前命名与产物一致性核对（长沙院冶金智能配料软件 / met_calculator）

发版前请逐项确认，避免与 **CINF Flow** 等其它产品线名称混用。

| 字段 | 期望示例 | 来源文件 |
|------|----------|----------|
| 中文正式名 | 长沙院冶金智能配料软件 | [`frontend/src/constants/appCopy.ts`](../frontend/src/constants/appCopy.ts) 中 `APP_NAME_ZH` |
| 英文正式名 | CINF Metallurgical Intelligent Batching Software | 同上 `APP_NAME_EN` |
| `productName` / 快捷方式 | 与 `APP_NAME_ZH` 一致 | [`electron-builder.yml`](../electron-builder.yml)、[`electron-builder.win7.yml`](../electron-builder.win7.yml) |
| `appId` | `com.changsha.met.batching`（勿与 Flow 共用） | 同上 |
| `artifactName` | `${productName}-...` 或带 `Win7兼容` | 同上 |
| 安装协议内软件名 | 与 `APP_NAME_ZH` 一致 | [`LICENSE.txt`](../LICENSE.txt)、[`LICENSE.nsis.txt`](../LICENSE.nsis.txt) |
| 浏览器标题 / SEO | 与 `APP_NAME_ZH` 一致 | [`frontend/index.html`](../frontend/index.html) |
| Electron 对话框默认名 | 与 `APP_NAME_ZH` 一致 | [`electron/main.js`](../electron/main.js) 中 `APP_DISPLAY_NAME` |
| `description` | 与产品定位一致 | [`package.json`](../package.json) |
| Win7 更新渠道 | 构建为 `latest-win7.yml` 等时，运行环境 `autoUpdater.channel = 'win7'`（旧内核或 Win7 兼容包用户） | `electron/main.js` + `electron-builder.win7.yml` 中 `publish.channel` |
| 离线授权前缀 | `CINF-MET-LIC1.`（勿与 Flow 的 `CINF-LIC1.` 混用） | [`electron/license.js`](../electron/license.js)、[`frontend/src/constants/appCopy.ts`](../frontend/src/constants/appCopy.ts) 中 `LICENSE_TOKEN_PREFIX` |
| 授权公钥 | `electron/license-public.pem` 随包分发 | 由 `npm run license:gen-keys` 生成；私钥仅 `scripts/license-private.pem`（已在 .gitignore） |
| 许可存储 userData | 打包后固定为 `%AppData%\CINF_MetBatch` | `electron/main.js` 中 `prepareStableUserDataPath` |

**构建验证（建议）**

1. `npm run build --prefix frontend`（或根目录 `npm run build`）通过。
2. `npm run dist:win`：产物应在 `release/`，安装包名以 **长沙院冶金智能配料软件** 开头。
3. `npm run dist:win:legacy`：产物应在 `release-win7/`，包名带 **Win7兼容**。

**说明**：占位更新地址 `https://your-update-server.com/updates` 上线前须改为实际基址，且主线与 Win7 渠道目录需分别放置对应 `latest.yml` / `latest-win7.yml`。
