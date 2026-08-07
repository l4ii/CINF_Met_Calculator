Electron 打包资源目录

请将以下文件放在本目录（electron/build/）：
- icon.ico   （Windows 必选：用于 exe、安装包和窗口标题栏）
- icon.png   （Linux 等）
- icon.icns  （macOS，可选）
- installer.nsh  （NSIS 安装脚本，已包含）

【重要】Windows 打包时 icon.ico 必须至少包含 256x256 尺寸
- 开发时（start.bat）用当前 icon 可以正常显示窗口图标。
- 打安装包时 electron-builder 会报错 "icon.ico must be at least 256x256"，
  这是硬性要求：安装包、exe、快捷方式需要高分辨率图标，无法绕过。
- 解决：用至少 256x256 的图做成 .ico（建议包含 256/48/32/16 多尺寸）。

若打包后软件图标仍为默认：请确认本目录下存在符合上述要求的 icon.ico，然后重新打包。

制作 .ico（必须含 256）：
- 在线：上传 256x256 或更大的 PNG，生成多尺寸 ICO。
- ImageMagick：magick icon.png -define icon:auto-resize=256,48,32,16 icon.ico
  （源图 icon.png 建议至少 256x256）
