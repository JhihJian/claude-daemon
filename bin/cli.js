#!/usr/bin/env node

/**
 * claude-daemon CLI
 * npm 包的命令行入口
 */

const { execSync } = require('child_process');
const { join } = require('path');
const { existsSync } = require('fs');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(color, message) {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function printBanner() {
  log('blue', '╔════════════════════════════════════════╗');
  log('blue', '║  Claude Code 会话历史系统             ║');
  log('blue', '║  @jhihjian/claude-daemon               ║');
  log('blue', '╚════════════════════════════════════════╝');
  console.log('');
}

function printUsage() {
  console.log('使用方法:');
  console.log('');
  log('green', '  claude-daemon install');
  console.log('    安装 Claude Code 会话历史系统');
  console.log('');
  log('green', '  claude-daemon --help');
  console.log('    显示帮助信息');
  console.log('');
  log('green', '  claude-daemon --version');
  console.log('    显示版本信息');
  console.log('');
}

function install() {
  printBanner();
  log('green', '[1/3] 定位安装脚本...');

  // 获取包的安装路径
  const packageDir = join(__dirname, '..');
  const installScript = join(packageDir, 'install.sh');

  if (!existsSync(installScript)) {
    log('red', '✗ 找不到 install.sh');
    log('yellow', '请确保包安装正确');
    process.exit(1);
  }

  log('green', '  ✓ 找到安装脚本');
  console.log('');

  log('green', '[2/3] 执行安装...');
  console.log('');

  try {
    // 执行安装脚本
    execSync(`bash "${installScript}"`, {
      stdio: 'inherit',
      cwd: packageDir,
    });
  } catch (error) {
    log('red', '\n✗ 安装失败');
    log('yellow', '请查看错误信息并重试');
    process.exit(1);
  }

  console.log('');
  log('green', '[3/3] 安装完成！');
  console.log('');
  log('yellow', '下一步:');
  console.log('  1. 重新加载 shell: source ~/.bashrc');
  console.log('  2. 测试: claude-sessions recent 5');
  console.log('');
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'install':
      install();
      break;

    case '--version':
    case '-v':
      const pkg = require('../package.json');
      console.log(`v${pkg.version}`);
      break;

    case '--help':
    case '-h':
    case undefined:
      printBanner();
      printUsage();
      break;

    default:
      log('red', `未知命令: ${command}`);
      console.log('');
      printUsage();
      process.exit(1);
  }
}

main();
