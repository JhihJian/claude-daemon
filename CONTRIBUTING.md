# Contributing to Claude Daemon

Thank you for your interest in contributing to Claude Daemon! This document provides guidelines and instructions for contributing.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)

## 🤝 Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code. Please be respectful and constructive in all interactions.

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0.0 or higher
- Git
- Basic knowledge of TypeScript
- Familiarity with Claude Code

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/claude-daemon.git
   cd claude-daemon
   ```

2. **Install Dependencies**
   ```bash
   bun install
   ```

3. **Run in Development Mode**
   ```bash
   # Start daemon with Web UI
   bun daemon/main.ts --web --port 3001

   # Or use npm script
   npm run dev
   ```

4. **Test Your Changes**
   ```bash
   # Run tests
   bun test

   # Test daemon functionality
   ./test-daemon.sh
   ```

## 💡 How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/JhihJian/claude-daemon/issues)
2. Use the bug report template
3. Include:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Platform and version information
   - Relevant logs from `~/.claude/daemon.log`

### Suggesting Features

1. Check existing feature requests
2. Use the feature request template
3. Explain:
   - The problem you're trying to solve
   - Your proposed solution
   - Alternative approaches considered
   - Use cases and benefits

### Submitting Changes

1. Create a new branch from `main`
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. Make your changes following our [coding standards](#coding-standards)

3. Test thoroughly on your platform

4. Commit with clear messages (see [commit guidelines](#commit-guidelines))

5. Push and create a pull request

## 📝 Coding Standards

### TypeScript Style

- Use TypeScript for all new code
- 2-space indentation
- Use semicolons
- camelCase for variables and functions
- PascalCase for classes and types
- kebab-case for file names

### File Organization

```
daemon/          # Core daemon services
hooks-push/      # Hook implementations
lib/             # Shared utilities
tools/           # CLI tools
plugins/         # Plugin implementations
web/             # Web UI
docs/            # Documentation
```

### Code Quality

- Write self-documenting code
- Add comments for complex logic
- Keep functions small and focused
- Avoid deep nesting (max 3 levels)
- Handle errors gracefully
- Use meaningful variable names

### Example

```typescript
// Good
async function analyzeSession(sessionId: string): Promise<SessionSummary> {
  const events = await loadSessionEvents(sessionId);
  const analysis = classifySession(events);
  return generateSummary(analysis);
}

// Avoid
async function doStuff(id: string) {
  const x = await load(id);
  const y = classify(x);
  return gen(y);
}
```

## 📝 Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes

### Examples

```bash
feat(daemon): add plugin hot-reload support

Implement hot-reload functionality for plugins without
restarting the daemon. Plugins can now be reloaded via
IPC command.

Closes #123
```

```bash
fix(hooks): handle empty stdin in SessionRecorder

Add defensive error handling to prevent crashes when
hooks receive empty or invalid input.

Fixes #456
```

### Co-authoring

When working with AI assistance:
```
Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

## 🔄 Pull Request Process

1. **Before Submitting**
   - Update documentation if needed
   - Add tests for new features
   - Ensure all tests pass
   - Update CHANGELOG.md if applicable
   - Test on multiple platforms if possible

2. **PR Description**
   - Use the PR template
   - Link related issues
   - Describe changes clearly
   - Include test results
   - Add screenshots for UI changes

3. **Review Process**
   - Address review comments
   - Keep PR focused and small
   - Rebase on main if needed
   - Be responsive to feedback

4. **After Approval**
   - Squash commits if requested
   - Ensure CI passes
   - Wait for maintainer to merge

## 🧪 Testing

### Running Tests

```bash
# Run all tests
bun test

# Test daemon startup
bun daemon/main.ts

# Test specific hook
echo '{"session_id":"test"}' | bun hooks-push/SessionRecorder.hook.ts

# Run daemon tests
./test-daemon.sh
```

### Writing Tests

- Add tests for new features
- Test edge cases
- Test error handling
- Test cross-platform compatibility

### Test Locations

- `test/` - Unit and integration tests
- `test-*.ts` - Ad-hoc test scripts
- `test-daemon.sh` - Daemon smoke tests

## 📚 Documentation

### What to Document

- New features and APIs
- Configuration options
- Breaking changes
- Migration guides
- Usage examples

### Documentation Locations

- `README.md` - Project overview
- `docs/guides/` - User guides
- `docs/architecture/` - Technical docs
- `CHANGELOG.md` - Version history
- Code comments - Complex logic

### Documentation Style

- Clear and concise
- Include examples
- Use proper markdown formatting
- Add diagrams for complex concepts
- Keep up to date

## 🎯 Areas for Contribution

### High Priority

- Cross-platform testing (Windows, Linux, macOS)
- Plugin development and examples
- Web UI improvements
- Performance optimizations
- Documentation improvements

### Good First Issues

Look for issues labeled `good-first-issue` or `help-wanted`

### Feature Ideas

- Additional session classification types
- More plugin examples
- Enhanced Web UI features
- Better error messages
- Improved logging

## 🐛 Debugging

### Daemon Logs

```bash
# Linux/macOS
tail -f ~/.claude/daemon.log

# Windows
Get-Content -Tail 50 -Wait $env:USERPROFILE\.claude\daemon.log
```

### Enable Debug Logging

```bash
export SESSION_LOG_LEVEL=DEBUG
bun daemon/main.ts --web
```

### Common Issues

1. **Socket connection failed**
   - Check if daemon is running
   - Verify socket path/port
   - Check permissions

2. **Hooks not executing**
   - Verify hook permissions (755)
   - Check Claude Code settings
   - Test hooks manually

3. **Web UI not loading**
   - Check port availability
   - Verify daemon is running with --web flag
   - Check browser console for errors

## 📞 Getting Help

- 📚 [Documentation](https://github.com/JhihJian/claude-daemon#readme)
- 💬 [Discussions](https://github.com/JhihJian/claude-daemon/discussions)
- 🐛 [Issues](https://github.com/JhihJian/claude-daemon/issues)

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Claude Daemon! 🎉
