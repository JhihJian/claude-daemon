/**
 * Frontend Application
 * Claude Code Session Dashboard
 */

const { createApp } = Vue;

createApp({
  data() {
    return {
      sessions: [],
      activeSessions: [],
      stats: {
        total_sessions: 0,
        total_duration_hours: 0,
        avg_session_duration_minutes: 0,
        by_type: {},
        by_directory: {},
      },
      timeline: [],
      typeDistribution: {},
      filter: {
        type: '',
        directory: '',
        limit: 20,
      },
      selectedSession: null,
      loading: false,
      wsConnected: false,
      ws: null,
      typeChart: null,
      timelineChart: null,
    };
  },

  mounted() {
    this.init();
  },

  methods: {
    async init() {
      await this.loadStats();
      await this.loadSessions();
      await this.loadActiveSessions();
      await this.loadTimeline();
      this.initCharts();
      this.connectWebSocket();
    },

    /**
     * 加载统计数据
     */
    async loadStats() {
      try {
        const response = await fetch('/api/stats/global');
        this.stats = await response.json();

        const typeRes = await fetch('/api/stats/types');
        this.typeDistribution = await typeRes.json();
      } catch (error) {
        console.error('Failed to load stats:', error);
      }
    },

    /**
     * 加载会话列表
     */
    async loadSessions() {
      this.loading = true;

      try {
        let url = `/api/sessions/recent?limit=${this.filter.limit}`;

        if (this.filter.type) {
          url = `/api/sessions/by-type?type=${this.filter.type}`;
        } else if (this.filter.directory) {
          url = `/api/sessions/by-directory?directory=${encodeURIComponent(this.filter.directory)}`;
        }

        const response = await fetch(url);
        this.sessions = await response.json();
      } catch (error) {
        console.error('Failed to load sessions:', error);
        this.sessions = [];
      } finally {
        this.loading = false;
      }
    },

    /**
     * 加载活跃会话列表
     */
    async loadActiveSessions() {
      try {
        const response = await fetch('/api/sessions/active');
        const data = await response.json();
        this.activeSessions = Array.isArray(data)
          ? data.map(session => ({ ...session, status: 'active' }))
          : [];
        this.refreshSelectedSession();
      } catch (error) {
        console.error('Failed to load active sessions:', error);
        this.activeSessions = [];
      }
    },

    /**
     * 加载时间线数据
     */
    async loadTimeline() {
      try {
        const response = await fetch('/api/stats/timeline?days=30');
        this.timeline = await response.json();
        this.updateTimelineChart();
      } catch (error) {
        console.error('Failed to load timeline:', error);
      }
    },

    /**
     * 初始化图表
     */
    initCharts() {
      // 类型分布饼图
      const typeCtx = document.getElementById('typeChart');
      if (typeCtx) {
        this.typeChart = new Chart(typeCtx, {
          type: 'doughnut',
          data: {
            labels: Object.keys(this.typeDistribution).map(this.getTypeName),
            datasets: [{
              data: Object.values(this.typeDistribution),
              backgroundColor: [
                '#667eea',
                '#764ba2',
                '#f093fb',
                '#4facfe',
                '#43e97b',
                '#fa709a',
                '#feca57',
              ],
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: {
                position: 'bottom',
              },
            },
          },
        });
      }

      // 时间线趋势图
      const timelineCtx = document.getElementById('timelineChart');
      if (timelineCtx) {
        this.timelineChart = new Chart(timelineCtx, {
          type: 'line',
          data: {
            labels: [],
            datasets: [{
              label: '会话数量',
              data: [],
              borderColor: '#667eea',
              backgroundColor: 'rgba(102, 126, 234, 0.1)',
              tension: 0.4,
              fill: true,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: {
                display: false,
              },
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  precision: 0,
                },
              },
            },
          },
        });
      }
    },

    /**
     * 更新时间线图表
     */
    updateTimelineChart() {
      if (!this.timelineChart) return;

      const labels = this.timeline.map(d => {
        const date = new Date(d.date);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      });

      const data = this.timeline.map(d => d.count);

      this.timelineChart.data.labels = labels;
      this.timelineChart.data.datasets[0].data = data;
      this.timelineChart.update();
    },

    /**
     * 连接 WebSocket
     */
    connectWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.wsConnected = true;
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('WebSocket message:', data);

        // 处理实时更新
        if (data.type === 'session_update') {
          this.loadSessions();
          this.loadStats();
          this.loadActiveSessions();
          this.refreshSelectedSession();
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.wsConnected = false;

        // 5秒后重连
        setTimeout(() => this.connectWebSocket(), 5000);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    },

    /**
     * 选择会话
     */
    async selectSession(session) {
      if (!session?.session_id) {
        this.selectedSession = null;
        return;
      }

      const isActive = session.status === 'active';
      const endpoint = isActive
        ? `/api/sessions/active/${session.session_id}`
        : `/api/sessions/${session.session_id}`;

      try {
        const response = await fetch(endpoint);
        const detail = await response.json();
        this.selectedSession = detail || session;
        if (isActive && this.selectedSession) {
          this.selectedSession.status = 'active';
        }
      } catch (error) {
        console.error('Failed to load session detail:', error);
        this.selectedSession = session;
      }
    },

    /**
     * 刷新当前选中会话的详情，避免活跃状态残留
     */
    async refreshSelectedSession() {
      if (!this.selectedSession?.session_id) {
        return;
      }

      const sessionId = this.selectedSession.session_id;
      const isActive = this.activeSessions.some(session => session.session_id === sessionId);
      const endpoint = isActive
        ? `/api/sessions/active/${sessionId}`
        : `/api/sessions/${sessionId}`;

      try {
        const response = await fetch(endpoint);
        const detail = await response.json();
        if (detail) {
          this.selectedSession = detail;
          if (isActive) {
            this.selectedSession.status = 'active';
          }
        }
      } catch (error) {
        console.error('Failed to refresh selected session:', error);
      }
    },

    /**
     * 重置过滤器
     */
    resetFilter() {
      this.filter = {
        type: '',
        directory: '',
        limit: 20,
      };
      this.loadSessions();
    },

    /**
     * 格式化日期
     */
    formatDate(timestamp) {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;

      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) {
        return `${days} 天前`;
      } else if (hours > 0) {
        return `${hours} 小时前`;
      } else if (minutes > 0) {
        return `${minutes} 分钟前`;
      } else {
        return '刚刚';
      }
    },

    /**
     * 格式化时长
     */
    formatDuration(seconds) {
      if (seconds < 60) {
        return `${seconds}秒`;
      } else if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}分钟`;
      } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}小时${minutes}分钟`;
      }
    },

    /**
     * 获取类型名称
     */
    getTypeName(type) {
      const names = {
        coding: '编码',
        debugging: '调试',
        research: '研究',
        writing: '写作',
        git: 'Git',
        refactoring: '重构',
        mixed: '混合',
      };
      return names[type] || type;
    },

    /**
     * 获取类型颜色
     */
    getTypeColor(type) {
      const colors = {
        coding: 'bg-blue-100 text-blue-800',
        debugging: 'bg-red-100 text-red-800',
        research: 'bg-green-100 text-green-800',
        writing: 'bg-purple-100 text-purple-800',
        git: 'bg-yellow-100 text-yellow-800',
        refactoring: 'bg-indigo-100 text-indigo-800',
        mixed: 'bg-gray-100 text-gray-800',
      };
      return colors[type] || colors.mixed;
    },

    /**
     * 构建对话列表
     */
    getConversationItems(conversation) {
      if (!conversation) {
        return [];
      }

      const items = [];
      const userMessages = Array.isArray(conversation.user_messages) ? conversation.user_messages : [];
      const assistantMessages = Array.isArray(conversation.assistant_responses) ? conversation.assistant_responses : [];
      const max = Math.max(userMessages.length, assistantMessages.length);

      for (let i = 0; i < max; i += 1) {
        if (userMessages[i]) {
          items.push({ role: 'user', text: userMessages[i] });
        }
        if (assistantMessages[i]) {
          items.push({ role: 'assistant', text: assistantMessages[i] });
        }
      }

      return items;
    },
  },
}).mount('#app');
