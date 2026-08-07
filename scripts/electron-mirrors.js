/**
 * 为 @electron/get / electron-builder 设置国内镜像（环境变量，非 .npmrc）。
 * 在构建脚本开头 require 即可；已存在的环境变量不会被覆盖。
 */
const path = require('path')

const defaults = {
  ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR: 'https://npmmirror.com/mirrors/electron-builder-binaries/',
  ELECTRON_BUILDER_CACHE: path.join(__dirname, '..', '.electron-builder-cache'),
}

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value
}

module.exports = defaults
