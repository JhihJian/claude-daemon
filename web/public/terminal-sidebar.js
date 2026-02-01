/**
 * Terminal Sidebar Component
 *
 * Displays terminal output from multiple agents in a tabbed sidebar.
 */

class TerminalSidebar {
  constructor(options = {}) {
    this.containerId = options.containerId || 'terminal-sidebar';
    this.agents = new Map(); // sessionId -> { name, buffer, connected }
    this.activeAgentId = null;
    this.maxBufferSize = options.maxBufferSize || 10000;
    this.wsUrl = options.wsUrl || `ws://${window.location.hostname}:3000/ws`;
    this.ws = null;

    this.init();
  }

  init() {
    this.render();
    this.connectWebSocket();
  }

  /**
   * Render the sidebar HTML
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.warn(`Terminal sidebar container #${this.containerId} not found`);
      return;
    }

    container.innerHTML = `
      <div class="terminal-sidebar">
        <div class="ts-header">
          <span class="ts-title">Agent Terminals</span>
          <div class="ts-actions">
            <button class="ts-btn ts-btn-clear" onclick="terminalSidebar.clearActive()">Clear</button>
            <button class="ts-btn ts-btn-pause" onclick="terminalSidebar.togglePause()">Pause</button>
            <button class="ts-btn ts-btn-close" onclick="terminalSidebar.close()">×</button>
          </div>
        </div>
        <div class="ts-tabs" id="ts-tabs"></div>
        <div class="ts-content">
          <div class="ts-terminal" id="ts-terminal">
            <div class="ts-empty">Select an agent to view its terminal</div>
          </div>
        </div>
      </div>
      <style>
        .terminal-sidebar {
          position: fixed;
          right: 0;
          top: 0;
          bottom: 0;
          width: 400px;
          background: #0a0a0a;
          border-left: 1px solid #1a1a1a;
          display: flex;
          flex-direction: column;
          z-index: 1000;
          font-family: 'Courier New', 'Consolas', monospace;
        }

        .ts-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 15px;
          background: #0f0f0f;
          border-bottom: 1px solid #1a1a1a;
        }

        .ts-title {
          color: #ffb000;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .ts-actions {
          display: flex;
          gap: 5px;
        }

        .ts-btn {
          background: transparent;
          border: 1px solid #1a1a1a;
          color: #666666;
          padding: 4px 8px;
          font-size: 9px;
          font-family: inherit;
          cursor: pointer;
          text-transform: uppercase;
        }

        .ts-btn:hover {
          border-color: #333333;
          color: #c9c9c9;
        }

        .ts-btn-clear:hover {
          border-color: #ff3333;
          color: #ff3333;
        }

        .ts-btn-pause:hover {
          border-color: #ffb000;
          color: #ffb000;
        }

        .ts-btn-close {
          border: none;
          font-size: 14px;
        }

        .ts-tabs {
          display: flex;
          background: #0f0f0f;
          border-bottom: 1px solid #1a1a1a;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .ts-tabs::-webkit-scrollbar {
          display: none;
        }

        .ts-tab {
          padding: 8px 12px;
          font-size: 10px;
          color: #666666;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.1s;
        }

        .ts-tab:hover {
          color: #c9c9c9;
          background: #1a1a1a;
        }

        .ts-tab.active {
          color: #ffb000;
          border-bottom-color: #ffb000;
        }

        .ts-tab.status-busy {
          color: #33ff33;
        }

        .ts-tab.status-error {
          color: #ff3333;
        }

        .ts-content {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .ts-terminal {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
          font-size: 11px;
          line-height: 1.4;
        }

        .ts-terminal::-webkit-scrollbar {
          width: 6px;
        }

        .ts-terminal::-webkit-scrollbar-track {
          background: #0a0a0a;
        }

        .ts-terminal::-webkit-scrollbar-thumb {
          background: #1a1a1a;
        }

        .ts-terminal::-webkit-scrollbar-thumb:hover {
          background: #2a2a2a;
        }

        .ts-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #666666;
          font-size: 11px;
        }

        .ts-line {
          margin-bottom: 2px;
          white-space: pre-wrap;
          word-break: break-all;
        }

        /* ANSI colors */
        .ts-fg-black { color: #000000; }
        .ts-fg-red { color: #cd3131; }
        .ts-fg-green { color: #0dbc79; }
        .ts-fg-yellow { color: #e5e510; }
        .ts-fg-blue { color: #2472c8; }
        .ts-fg-magenta { color: #bc3fbc; }
        .ts-fg-cyan { color: #11a8cd; }
        .ts-fg-white { color: #e5e5e5; }
        .ts-fg-bright-black { color: #666666; }
        .ts-fg-bright-red { color: #f14c4c; }
        .ts-fg-bright-green { color: #23d18b; }
        .ts-fg-bright-yellow { color: #f5f543; }
        .ts-fg-bright-blue { color: #3b8eea; }
        .ts-fg-bright-magenta { color: #d670d6; }
        .ts-fg-bright-cyan { color: #29b8db; }
        .ts-fg-bright-white { color: #ffffff; }

        .ts-bg-black { background-color: #000000; }
        .ts-bg-red { background-color: #cd3131; }
        .ts-bg-green { background-color: #0dbc79; }
        .ts-bg-yellow { background-color: #e5e510; }
        .ts-bg-blue { background-color: #2472c8; }
        .ts-bg-magenta { background-color: #bc3fbc; }
        .ts-bg-cyan { background-color: #11a8cd; }
        .ts-bg-white { background-color: #e5e5e5; }

        .ts-bold { font-weight: bold; }
        .ts-italic { font-style: italic; }
        .ts-underline { text-decoration: underline; }

        .ts-closed {
          display: none;
        }

        .ts-paused .ts-pause-indicator {
          display: block;
        }
      </style>
    `;
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  connectWebSocket() {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('Terminal sidebar: WebSocket connected');
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'agent_event' && data.event === 'agent_terminal_output') {
          this.appendOutput(data.data.sessionId, data.data.output);
        }
      };

      this.ws.onclose = () => {
        console.log('Terminal sidebar: WebSocket disconnected, will retry');
        setTimeout(() => this.connectWebSocket(), 5000);
      };

      this.ws.onerror = (error) => {
        console.error('Terminal sidebar: WebSocket error', error);
      };
    } catch (error) {
      console.error('Terminal sidebar: Failed to connect WebSocket', error);
    }
  }

  /**
   * Add an agent to the sidebar
   */
  addAgent(agentId, name, status = 'idle') {
    if (this.agents.has(agentId)) {
      return;
    }

    this.agents.set(agentId, {
      id: agentId,
      name,
      status,
      buffer: [],
      connected: true,
    });

    this.renderTabs();

    // Auto-select if first agent
    if (this.agents.size === 1) {
      this.selectAgent(agentId);
    }
  }

  /**
   * Remove an agent from the sidebar
   */
  removeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.connected = false;
    }

    if (this.activeAgentId === agentId) {
      const nextAgent = Array.from(this.agents.values()).find(a => a.connected);
      if (nextAgent) {
        this.selectAgent(nextAgent.id);
      } else {
        this.activeAgentId = null;
        this.renderTerminal();
      }
    }

    this.renderTabs();
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId, status) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      this.renderTabs();
    }
  }

  /**
   * Select an agent to view
   */
  selectAgent(agentId) {
    this.activeAgentId = agentId;
    this.renderTabs();
    this.renderTerminal();
  }

  /**
   * Append output to an agent's buffer
   */
  appendOutput(agentId, output) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    // Add to buffer
    agent.buffer.push({
      text: output,
      timestamp: Date.now(),
    });

    // Trim buffer if needed
    if (agent.buffer.length > this.maxBufferSize) {
      agent.buffer = agent.buffer.slice(-this.maxBufferSize);
    }

    // Render if active
    if (this.activeAgentId === agentId && !this.paused) {
      this.appendOutputToTerminal(output);
    }
  }

  /**
   * Append output directly to the terminal DOM
   */
  appendOutputToTerminal(output) {
    const terminal = document.getElementById('ts-terminal');
    if (!terminal) return;

    // Remove empty state
    const empty = terminal.querySelector('.ts-empty');
    if (empty) {
      empty.remove();
    }

    const line = document.createElement('div');
    line.className = 'ts-line';
    line.innerHTML = this.parseAnsiColors(output);
    terminal.appendChild(line);

    // Auto-scroll to bottom
    terminal.scrollTop = terminal.scrollHeight;
  }

  /**
   * Parse ANSI color codes
   */
  parseAnsiColors(text) {
    // Simple ANSI escape sequence handling
    // This is a basic implementation; a full implementation would be more complex
    let result = text
      .replace(/\x1b\[(\d+)m/g, (match, code) => {
        const c = parseInt(code);
        switch (c) {
          case 0: return '</span>';
          case 1: return '<span class="ts-bold">';
          case 3: return '<span class="ts-italic">';
          case 4: return '<span class="ts-underline">';
          case 30: return '<span class="ts-fg-black">';
          case 31: return '<span class="ts-fg-red">';
          case 32: return '<span class="ts-fg-green">';
          case 33: return '<span class="ts-fg-yellow">';
          case 34: return '<span class="ts-fg-blue">';
          case 35: return '<span class="ts-fg-magenta">';
          case 36: return '<span class="ts-fg-cyan">';
          case 37: return '<span class="ts-fg-white">';
          case 90: return '<span class="ts-fg-bright-black">';
          case 91: return '<span class="ts-fg-bright-red">';
          case 92: return '<span class="ts-fg-bright-green">';
          case 93: return '<span class="ts-fg-bright-yellow">';
          case 94: return '<span class="ts-fg-bright-blue">';
          case 95: return '<span class="ts-fg-bright-magenta">';
          case 96: return '<span class="ts-fg-bright-cyan">';
          case 97: return '<span class="ts-fg-bright-white">';
          default: return '';
        }
      })
      .replace(/\x1b\[(\d+)m/g, '') // Remove any unhandled codes
      .replace(/[\x00-\x1F\x7F]/g, ''); // Remove other control characters

    return result;
  }

  /**
   * Render tabs
   */
  renderTabs() {
    const tabsContainer = document.getElementById('ts-tabs');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = Array.from(this.agents.values())
      .filter(agent => agent.connected)
      .map(agent => `
        <button
          class="ts-tab ${agent.id === this.activeAgentId ? 'active' : ''} status-${agent.status}"
          onclick="terminalSidebar.selectAgent('${agent.id}')"
        >
          ${this.escapeHtml(agent.name)}
        </button>
      `).join('');
  }

  /**
   * Render terminal content
   */
  renderTerminal() {
    const terminal = document.getElementById('ts-terminal');
    if (!terminal) return;

    const agent = this.agents.get(this.activeAgentId);

    if (!agent) {
      terminal.innerHTML = '<div class="ts-empty">Select an agent to view its terminal</div>';
      return;
    }

    terminal.innerHTML = agent.buffer
      .map(line => `<div class="ts-line">${this.parseAnsiColors(line.text)}</div>`)
      .join('');

    // Scroll to bottom
    terminal.scrollTop = terminal.scrollHeight;
  }

  /**
   * Clear active terminal
   */
  clearActive() {
    const agent = this.agents.get(this.activeAgentId);
    if (agent) {
      agent.buffer = [];
      this.renderTerminal();
    }
  }

  /**
   * Toggle pause state
   */
  togglePause() {
    this.paused = !this.paused;

    const btn = document.querySelector('.ts-btn-pause');
    if (btn) {
      btn.textContent = this.paused ? 'Resume' : 'Pause';
    }
  }

  /**
   * Close the sidebar
   */
  close() {
    const sidebar = document.querySelector('.terminal-sidebar');
    if (sidebar) {
      sidebar.classList.add('ts-closed');
    }
  }

  /**
   * Open the sidebar
   */
  open() {
    const sidebar = document.querySelector('.terminal-sidebar');
    if (sidebar) {
      sidebar.classList.remove('ts-closed');
    }
  }

  /**
   * Destroy the sidebar
   */
  destroy() {
    if (this.ws) {
      this.ws.close();
    }

    const container = document.getElementById(this.containerId);
    if (container) {
      container.innerHTML = '';
    }
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Auto-initialize if container exists
if (typeof window !== 'undefined') {
  window.terminalSidebar = new TerminalSidebar();
}
