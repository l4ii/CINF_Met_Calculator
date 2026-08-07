; NSIS 安装脚本自定义部分
; 1) 强制仅当前用户安装
; 2) 无「安装序列号」页；产品许可在首次运行后于应用内激活（一机一许可）
; 3) 安装/卸载过程中统一使用"分阶段中文提示"
;    - 配合 apply-electron-builder-nsis-patches.js 对 installSection.nsh 的 v2 补丁，
;      底层 File/CopyFiles/Nsis7z 日志均被静音，只显示 DetailPrint 的中文阶段说明，
;      避免用户看到 "Can't modify ... files" / "Uninstall was not successful" 等
;      无害但易引起困惑的原始日志
; 4) customFinishPage：完成页用短文案，避免超长 productName 把标题/说明/运行复选框叠在一起
; 5) customHeader：仅缩短安装向导窗口标题 / 页眉 / 底栏 BrandingText 中的显示名
;    （不改 electron-builder productName，故安装包文件名、卸载显示名、快捷方式等仍用正式全称）
;
; 「解压程序文件」阶段进度条看似整块跳动：
; electron-builder 用 Nsis7z::Extract 解嵌入的 app 归档（多为单次大步进度回调），再 CopyFiles 到安装目录，
; NSIS/MUI 默认 solid 进度条只在整数刻度之间瞬时前移，会加重突兀感。
; 须在包含 MUI2.nsh 之前定义（本文件位于生成的脚本首部）。
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"
!define MUI_UNINSTFILESPAGE_PROGRESSBAR "smooth"

; 安装向导 UI 短显示名：将「长沙有色冶金设计研究院」替换为 CINF，避免顶部 banner 过长截断/叠字。
!define CINF_INSTALLER_DISPLAY_NAME "CINF冶金工艺计算与三维设计一体化平台"

; electron-builder 在 common.nsh 里用正式 productName 设置了 Name / BrandingText；
; customHeader 在其后执行，仅覆盖安装流程可见文案。
!macro customHeader
  Name "${CINF_INSTALLER_DISPLAY_NAME}"
  BrandingText "${CINF_INSTALLER_DISPLAY_NAME} ${VERSION}"
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; 隐藏"显示详细信息"按钮与详情面板：
; 配合 installSection.nsh v2 补丁已将底层 File/CopyFiles/Nsis7z 日志静音，
; 详情面板里原本只剩几条中文阶段提示，其价值不大；完全隐藏后用户界面只保留
; 进度条 + 底部状态栏文字（由 SetDetailsPrint textonly + DetailPrint 驱动），
; 最大限度降低"反复跳动的日志"带来的视觉困扰。
ShowInstDetails hide
ShowUninstDetails hide

; 不在「选目录」前插入序列号页（保留宏名以兼容现有 NSIS 补丁）
!macro customPageBeforeChangeDir
!macroend

; 完成页：默认文案会嵌入超长 productName，标题/说明/「运行」复选框控件高度不够而叠字。
; 用短文案覆盖，并保留「完成后运行」与更新参数（--updated）行为。
!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !ifndef HIDE_RUN_AFTER_FINISH
    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
    !define MUI_FINISHPAGE_RUN_TEXT "运行本程序"
  !endif

  !define MUI_FINISHPAGE_TITLE "安装完成"
  !define MUI_FINISHPAGE_TEXT "程序已成功安装到本计算机。$\r$\n$\r$\n单击「完成」关闭安装向导。"
  !insertmacro MUI_PAGE_FINISH
!macroend

; 预先强制关闭旧版进程，尽量避免安装中出现“无法关闭，请重试”
; - 主程序：${APP_EXECUTABLE_FILENAME}
; 使用 /T /F 结束主程序进程树；后端由主程序进程树带出，避免误杀其它软件的 backend.exe。
!macro customInit
  nsExec::ExecToLog 'taskkill /IM "${APP_EXECUTABLE_FILENAME}" /T /F'
  Pop $0
!macroend

; installSection.nsh v2 补丁在本宏之前已依次打印：
;   "正在清理旧版本..."
;   "正在解压程序文件..."
;   "正在配置注册信息与快捷方式..."
; 本宏在安装 Section 的末尾被调用，此处只需给出收尾状态
!macro customInstall
  ${IfNot} ${Silent}
    SetDetailsPrint textonly
    DetailPrint "安装即将完成..."
  ${endIf}

  ; The app EXE is intentionally not resource-edited during unsigned builds.
  ; Point shortcuts at the installed ICO so they do not fall back to Electron's icon.
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    ${if} ${FileExists} "$newStartMenuLink"
      CreateShortCut "$newStartMenuLink" "$appExe" "" "$INSTDIR\resources\build\icon.ico" 0 "" "" "${APP_DESCRIPTION}"
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    ${endIf}
  !endif

  !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
    ${ifNot} ${isNoDesktopShortcut}
      ${if} ${FileExists} "$newDesktopLink"
        CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\resources\build\icon.ico" 0 "" "" "${APP_DESCRIPTION}"
        WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
      ${endIf}
    ${endIf}
  !endif

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

; electron-builder 卸载钩子名称为 customUnInstall（UnInstall 中 I 大写），
; 旧版本这里写成 customUninstall 实际从未被调用，本次一并修复
!macro customUnInstall
  ${IfNot} ${Silent}
    SetDetailsPrint textonly
    DetailPrint "正在清理注册信息..."
    DetailPrint "卸载即将完成。"
  ${EndIf}
!macroend
