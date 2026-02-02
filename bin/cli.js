#!/usr/bin/env node

/**
 * claude-daemon CLI
 * npm 包的命令行入口
 * 支持 Windows、Linux、macOS
 */

const { execSync, spawn } = require('child_process');
const { join } = require('path');
const { existsSync } = require('fs');
const os = require('os');

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
  log('green', '安装:');
  console.log('  claude-daemon install');
  console.log('    安装 Claude Code 会话历史系统');
  console.log('');
  log('green', '会话管理:');
  console.log('  claude-daemon launch --agent <name>');
  console.log('    创建并启动新会话');
  console.log('');
  console.log('  claude-daemon resume <session-name>');
  console.log('    恢复现有会话');
  console.log('');
  console.log('  claude-daemon sessions list');
  console.log('    列出所有会话');
  console.log('');
  console.log('  claude-daemon sessions delete <session-name>');
  console.log('    删除会话');
  console.log('');
  log('green', '其他:');
  console.log('  claude-daemon --help');
  console.log('    显示帮助信息');
  console.log('');
  console.log('  claude-daemon --version');
  console.log('    显示版本信息');
  console.log('');
}

/**
 * 检测系统平台
 */
function detectPlatform() {
  const platform = os.platform();

  if (platform === 'win32') {
    return 'windows';
  } else if (platform === 'darwin') {
    return 'macos';
  } else if (platform === 'linux') {
    return 'linux';
  }

  return 'unknown';
}

/**
 * 安装函数
 */
function install() {
  printBanner();

  const platform = detectPlatform();
  log('green', `[1/4] 检测系统平台: ${platform}`);
  console.log('');

  log('green', '[2/4] 定位安装脚本...');

  // 获取包的安装路径
  const packageDir = join(__dirname, '..');

  let installScript;
  let useShell = false;

  if (platform === 'windows') {
    // Windows: 优先使用修复后的脚本
    const scripts = ['install-windows-final.ps1', 'install-windows-v2.ps1', 'install-windows.ps1', 'install.ps1'];

    for (const script of scripts) {
      installScript = join(packageDir, script);
      if (existsSync(installScript)) {
        const scriptName = script;
        log('green', `  ✓ 找到 Windows 安装脚本 (${scriptName})`);
        break;
      }
    }

    if (!existsSync(installScript)) {
      log('red', '✗ 找不到 Windows 安装脚本');
      log('yellow', '请确保包安装正确');
      process.exit(1);
    }
  } else {
    // Linux/macOS: 使用 bash 脚本
    installScript = join(packageDir, 'install.sh');
    useShell = true;

    if (!existsSync(installScript)) {
      log('red', '✗ 找不到 install.sh');
      log('yellow', '请确保包安装正确');
      process.exit(1);
    }

    log('green', '  ✓ 找到安装脚本 (install.sh)');
  }

  console.log('');
  log('green', '[3/4] 执行安装...');
  console.log('');

  try {
    if (platform === 'windows') {
      // Windows: 使用 PowerShell 执行
      const powershell = spawn('powershell.exe', [
        '-ExecutionPolicy', 'Bypass',
        '-File', installScript
      ], {
        stdio: 'inherit',
        cwd: packageDir,
      });

      powershell.on('close', (code) => {
        if (code !== 0) {
          log('red', '\n✗ 安装失败');
          log('yellow', '请查看错误信息并重试');
          log('yellow', '\n提示: 如果遇到权限问题，请以管理员身份运行 PowerShell');
          process.exit(1);
        }

        printSuccess(platform);
      });

    } else {
      // Linux/macOS: 使用 bash 执行
      execSync(`bash "${installScript}"`, {
        stdio: 'inherit',
        cwd: packageDir,
      });

      printSuccess(platform);
    }

  } catch (error) {
    log('red', '\n✗ 安装失败');
    log('yellow', '请查看错误信息并重试');

    if (platform === 'windows') {
      log('yellow', '\n提示: 如果遇到权限问题，请以管理员身份运行 PowerShell');
    }

    process.exit(1);
  }
}

/**
 * 打印安装成功信息
 */
function printSuccess(platform) {
  console.log('');
  log('green', '[4/4] 安装完成！');
  console.log('');
  log('yellow', '下一步:');

  if (platform === 'windows') {
    console.log('  1. 重启终端或重新加载 PowerShell 配置');
    console.log('  2. 测试: claude-sessions recent 5');
  } else {
    console.log('  1. 重新加载 shell: source ~/.bashrc  (或 source ~/.zshrc)');
    console.log('  2. 测试: claude-sessions recent 5');
  }

  console.log('');
  log('yellow', '查看文档:');
  console.log('  https://github.com/JhihJian/claude-daemon');
  console.log('');
}

/**
 * Execute a TypeScript tool using Bun
 */
function executeTool(toolName, args = []) {
  const packageDir = join(__dirname, '..');
  const toolPath = join(packageDir, 'tools', `${toolName}.ts`);

  if (!existsSync(toolPath)) {
    log('red', `✗ Tool not found: ${toolName}`);
    process.exit(1);
  }

  // Check if bun is available
  try {
    execSync('bun --version', { stdio: 'ignore' });
  } catch (error) {
    log('red', '✗ Bun is not installed or not in PATH');
    log('yellow', 'Please install Bun: https://bun.sh');
    process.exit(1);
  }

  // Execute the tool
  const child = spawn('bun', [toolPath, ...args], {
    stdio: 'inherit',
    cwd: packageDir,
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });

  child.on('error', (error) => {
    log('red', `✗ Failed to execute tool: ${error.message}`);
    process.exit(1);
  });
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];

  switch (command) {
    case 'install':
      install();
      break;

    case 'launch':
      // claude-daemon launch --agent <name> [options]
      executeTool('SessionLauncher', args.slice(1));
      break;

    case 'resume':
      // claude-daemon resume <session-name>
      if (!subcommand) {
        log('red', '✗ Session name is required');
        console.log('Usage: claude-daemon resume <session-name>');
        process.exit(1);
      }
      executeTool('SessionResume', args.slice(1));
      break;

    case 'sessions':
      // claude-daemon sessions <subcommand>
      if (!subcommand) {
        log('red', '✗ Subcommand is required');
        console.log('Available subcommands: list, delete');
        process.exit(1);
      }

      switch (subcommand) {
        case 'list':
          executeTool('SessionList', args.slice(2));
          break;

        case 'delete':
          if (!args[2]) {
            log('red', '✗ Session name is required');
            console.log('Usage: claude-daemon sessions delete <session-name>');
            process.exit(1);
          }
          executeTool('SessionDelete', args.slice(2));
          break;

        default:
          log('red', `✗ Unknown subcommand: ${subcommand}`);
          console.log('Available subcommands: list, delete');
          process.exit(1);
      }
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
