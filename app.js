(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const sidebar = $("#sidebar");
  const activityPanel = $("#activity-panel");
  const scrim = $("#scrim");
  const stage = $("#stage");
  const prompt = $("#prompt");
  const composer = $("#composer");
  const composerWrap = $("#composerWrap");
  const sendBtn = $("#send");
  const stopBtn = $("#stopBtn");
  const loaderRow = $("#loader");
  const conversation = $("#conversation");
  const welcome = $("#welcome");
  const attachmentChips = $("#attachmentChips");
  const searchChats = $("#searchChats");
  const historyBox = $("#history");
  const toast = $("#toast");
  const fileInput = $("#file-input");

  const authOverlay = $("#auth-overlay");
  const authForm = $("#auth-form");
  const authEmail = $("#auth-email");
  const authPassword = $("#auth-password");
  const authMode = $("#auth-mode");
  const authSubmit = $("#auth-submit");
  const authSwitch = $("#auth-switch");
  const authError = $("#auth-error");

  const apiUrlInput = $("#api-url");
  const settingsPanel = $("#settings-panel");
  const settingsStatus = $("#settings-status");
  const connectionState = $("#connection-state");
  const connectionDot = $("#connectionDot");
  const taskState = $("#task-state");
  const statusText = $("#status-text");
  const statusDot = $("#status-dot");
  const profileAvatar = $("#profile-avatar");

  const runningTasksBox = $("#running-tasks");
  const recentTasksBox = $("#recent-tasks");
  const runningCountEl = $("#running-count");
  const recentCountEl = $("#recent-count");
  const tasksBadgeEl = $("#tasks-badge");
  const taskOverlay = $("#task-view-overlay");
  const taskLogEl = $("#task-log");
  const taskTitleEl = $("#task-view-title");
  const taskSubtitleEl = $("#task-view-subtitle");
  const taskProgressEl = $("#task-progress-bar");
  const taskProgressValueEl = $("#task-progress-value");
  const taskFooterEl = $("#task-footer-state");
  const taskToolEl = $("#task-tool");
  const taskMetaStatusEl = $("#task-meta-status");
  const taskTimelineEl = $("#task-timeline");

  let currentUser = null;
  let currentConversationId = FridayApi.getConversationId();
  let conversationsList = [];
  let currentMessages = [];
  let pendingFiles = [];
  let sessionTasks = [];
  let activityEvents = [];
  let activeView = "chat";
  let eventAbortController = null;
  let cancelRequested = false;
  let authRegisterMode = false;
  let sending = false;

  const showToast = message => {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
  };

  // Clipboard helper: use the modern API when available, with a legacy fallback
  // for browsers or hosted contexts that do not grant clipboard permissions.
  const copyText = async value => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(String(value));
        return true;
      } catch {
        // Continue to the fallback below.
      }
    }
    const fallback = document.createElement("textarea");
    fallback.value = String(value);
    fallback.setAttribute("readonly", "");
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.appendChild(fallback);
    fallback.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch { copied = false; }
    fallback.remove();
    return copied;
  };

  const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));

  const formatInline = text => {
    let out = escapeHtml(text);
    out = out.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    return out.replace(/\n/g, "<br>");
  };

  const renderMarkdownSafe = value => {
    const raw = String(value || "");
    const parts = raw.split(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g);
    if (parts.length === 1) return formatInline(raw);
    let html = "";
    for (let i = 0; i < parts.length; i += 3) {
      let text = parts[i];
      if (i > 0) text = text.replace(/^\n+/, "");
      if (i + 2 < parts.length) text = text.replace(/\n+$/, "");
      if (text) html += formatInline(text);
      if (i + 2 < parts.length) {
        html += "<pre><code>" + escapeHtml(parts[i + 2].replace(/^\n+|\n+$/g, "")) + "</code></pre>";
      }
    }
    return html;
  };

  const scrollStageBottom = () => {
    stage.scrollTop = stage.scrollHeight;
  };

  const updateSendState = () => {
    sendBtn.disabled = !prompt.value.trim() || sending;
    stopBtn.hidden = !sending;
  };

  const resize = () => {
    prompt.style.height = "auto";
    prompt.style.height = Math.min(prompt.scrollHeight, 140) + "px";
    updateSendState();
  };

  const syncScrim = () => {
    const anyOpen = sidebar.classList.contains("open") || activityPanel.classList.contains("open");
    scrim.classList.toggle("open", anyOpen);
  };

  const openSidebar = open => {
    if (open) openActivity(false);
    sidebar.classList.toggle("open", open);
    sidebar.setAttribute("aria-hidden", String(!open));
    syncScrim();
  };

  const openActivity = open => {
    if (open) {
      sidebar.classList.remove("open");
      sidebar.setAttribute("aria-hidden", "true");
    }
    activityPanel.classList.toggle("open", open);
    activityPanel.setAttribute("aria-hidden", String(!open));
    syncScrim();
  };

  const setStatus = (text, mode = "online") => {
    statusText.textContent = text;
    statusDot.classList.toggle("online", mode === "online");
    statusDot.classList.toggle("busy", mode === "busy");
    statusDot.classList.toggle("error", mode === "error");
    connectionDot.classList.toggle("online", mode === "online");
    connectionDot.classList.toggle("busy", mode === "busy");
    connectionDot.classList.toggle("error", mode === "error");
  };

  const setTaskState = (text, visible = true) => {
    taskState.textContent = text;
    taskState.hidden = !visible;
    const currentTaskEl = $("#currentTask");
    if (currentTaskEl) {
      currentTaskEl.textContent = text || "No task is running.";
    }
  };

  const addActivityEvent = text => {
    activityEvents.unshift({ text, time: new Date().toLocaleTimeString() });
    activityEvents = activityEvents.slice(0, 50);
    const logEl = $("#activityLog");
    if (!logEl) return;
    logEl.innerHTML = "";
    activityEvents.forEach(item => {
      const row = document.createElement("div");
      row.className = "file-row";
      row.innerHTML = '<span class="muted">' + escapeHtml(item.time) + "</span><span>" + escapeHtml(item.text) + "</span>";
      logEl.appendChild(row);
    });
  };

  const showAuth = message => {
    authOverlay.classList.add("visible");
    authError.textContent = message || "";
    authError.classList.toggle("visible", Boolean(message));
    authEmail.focus();
  };

  const hideAuth = () => {
    authOverlay.classList.remove("visible");
    authError.classList.remove("visible");
  };

  const renderAttachmentChips = () => {
    attachmentChips.innerHTML = "";
    pendingFiles.forEach((file, idx) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      const name = document.createElement("span");
      name.textContent = file.name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remove " + file.name);
      remove.onclick = () => {
        pendingFiles.splice(idx, 1);
        renderAttachmentChips();
        renderStagedFiles();
      };
      chip.append(name, remove);
      attachmentChips.appendChild(chip);
    });
  };

  const renderStagedFiles = () => {
    const box = $("#stagedFileList");
    if (!box) return;
    box.innerHTML = "";
    if (!pendingFiles.length) {
      box.innerHTML = '<div class="muted">No files attached to the composer.</div>';
      return;
    }
    pendingFiles.forEach((file, idx) => {
      const row = document.createElement("div");
      row.className = "file-row";
      row.innerHTML = '<div class="row-meta"><strong>' + escapeHtml(file.name) + "</strong><small>" + Math.max(1, Math.ceil(file.size / 1024)) + " KB · staged for next prompt</small></div>";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "small-btn";
      btn.textContent = "Remove";
      btn.onclick = () => {
        pendingFiles.splice(idx, 1);
        renderAttachmentChips();
        renderStagedFiles();
      };
      row.appendChild(btn);
      box.appendChild(row);
    });
  };

  const renderChatStage = () => {
    if (activeView !== "chat") return;
    const hasMessages = currentMessages.length > 0;
    welcome.hidden = hasMessages;
    conversation.hidden = !hasMessages;
  };

  const resetConversationView = () => {
    currentMessages = [];
    conversation.innerHTML = "";
    loaderRow.hidden = true;
    prompt.value = "";
    resize();
    setTaskState("", false);
    if (activeView === "chat") renderChatStage();
  };

  const createMessageNode = (role, content, extra = {}, index = -1) => {
    const row = document.createElement("div");
    row.className = "msg-row " + (role === "user" ? "user" : "assistant");
    if (extra.error) row.classList.add("error-message");
    row.dataset.messageRole = role;

    const attachmentHtml = Array.isArray(extra.attachments) && extra.attachments.length
      ? extra.attachments.map(name => '<div class="attachment-chip">📎 ' + escapeHtml(name) + "</div>").join(" ")
      : "";

    if (role === "user") {
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = content;
      row.appendChild(bubble);
      if (attachmentHtml) {
        const wrap = document.createElement("div");
        wrap.innerHTML = attachmentHtml;
        row.appendChild(wrap);
      }
      return row;
    }

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "F";

    const body = document.createElement("div");
    body.className = "assistant-body";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = "Friday";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = renderMarkdownSafe(content);

    const actions = document.createElement("div");
    actions.className = "actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "action";
    copyBtn.textContent = "Copy";
    copyBtn.onclick = async () => {
      const copied = await copyText(content);
      showToast(copied ? "Copied response" : "Clipboard unavailable");
    };

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "action";
    retryBtn.textContent = "Retry";
    retryBtn.onclick = () => {
      if (sending) return;
      const sliceEnd = index >= 0 ? index : currentMessages.length;
      const prevUser = currentMessages.slice(0, sliceEnd).reverse().find(m => m.role === "user");
      if (prevUser) {
        showView("chat");
        void handleSend(prevUser.content);
      }
    };

    actions.append(copyBtn, retryBtn);
    body.append(label, bubble, actions);
    row.append(avatar, body);
    return row;
  };

  const appendMessage = (role, content, extra = {}) => {
    const index = currentMessages.length;
    currentMessages.push({ role, content });
    if (activeView === "chat") renderChatStage();
    const node = createMessageNode(role, content, extra, index);
    conversation.appendChild(node);
    scrollStageBottom();
    return { node, index };
  };

  const showLoader = on => {
    loaderRow.hidden = !on;
    const statusEl = $("#taskStatus");
    if (statusEl) statusEl.textContent = on ? "Running" : "Idle";
    const barEl = $("#taskProgressBarView");
    if (barEl && !on && !sessionTasks[0]) barEl.style.width = "0%";
    updateSendState();
    scrollStageBottom();
  };

  const renderTasksUI = () => {
    const running = sessionTasks.filter(t => t.state === "running" || t.state === "queued");
    const recent = sessionTasks.filter(t => t.state === "completed" || t.state === "failed" || t.state === "stopped");

    if (runningCountEl) runningCountEl.textContent = String(running.length);
    if (recentCountEl) recentCountEl.textContent = String(recent.length);
    if (tasksBadgeEl) tasksBadgeEl.textContent = String(running.length);

    if (runningTasksBox) {
      runningTasksBox.innerHTML = "";
      if (!running.length) {
        runningTasksBox.innerHTML = '<div class="activity-empty"><strong>No active tasks</strong><small>Friday will show live work here.</small></div>';
      } else {
        running.forEach(task => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "activity-task running";
          btn.innerHTML = '<span class="task-status-icon">●</span><span class="task-copy"><strong>' + escapeHtml(task.title) + "</strong><small>" + escapeHtml(task.statusLabel) + '</small><span class="activity-task-progress"><span style="width:' + task.progress + '%"></span></span></span><span class="task-arrow">›</span>';
          btn.onclick = () => openTaskDetail(task);
          runningTasksBox.appendChild(btn);
        });
      }
    }

    if (recentTasksBox) {
      recentTasksBox.innerHTML = "";
      if (!recent.length) {
        recentTasksBox.innerHTML = '<div class="activity-empty"><strong>No recent tasks</strong><small>Completed and failed tasks from this session appear here.</small></div>';
      } else {
        recent.slice(0, 12).forEach(task => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "activity-task " + task.state;
          const icon = task.state === "completed" ? "✓" : "!";
          btn.innerHTML = '<span class="task-status-icon">' + icon + '</span><span class="task-copy"><strong>' + escapeHtml(task.title) + "</strong><small>" + escapeHtml(task.statusLabel) + '</small></span><span class="task-arrow">›</span>';
          btn.onclick = () => openTaskDetail(task);
          recentTasksBox.appendChild(btn);
        });
      }
    }

    const sessionListEl = $("#sessionTaskList");
    if (sessionListEl) {
      sessionListEl.innerHTML = "";
      if (!sessionTasks.length) {
        sessionListEl.innerHTML = '<div class="muted">No tasks triggered in this session yet.</div>';
      } else {
        sessionTasks.slice(0, 15).forEach(task => {
          const row = document.createElement("div");
          row.className = "task-row";
          row.innerHTML = '<div class="row-meta"><strong>' + escapeHtml(task.title) + "</strong><small>" + escapeHtml(task.statusLabel) + "</small></div>";
          const right = document.createElement("button");
          right.type = "button";
          right.className = "small-btn";
          right.textContent = "Inspect";
          right.onclick = () => openTaskDetail(task);
          row.appendChild(right);
          sessionListEl.appendChild(row);
        });
      }
    }

    const barEl = $("#taskProgressBarView");
    if (barEl && sessionTasks[0]) {
      barEl.style.width = sessionTasks[0].progress + "%";
    }
  };

  const openTaskDetail = task => {
    if (!task) return;
    taskTitleEl.textContent = task.title;
    taskSubtitleEl.textContent = task.statusLabel;
    taskToolEl.textContent = task.runner || "Friday agent";
    taskMetaStatusEl.textContent = task.state;
    taskProgressEl.style.width = Math.max(0, Math.min(100, task.progress)) + "%";
    taskProgressValueEl.textContent = Math.round(task.progress) + "%";
    taskFooterEl.textContent = task.statusLabel;
    taskLogEl.textContent = task.logs.length ? task.logs.join("\n") : "No task events logged yet.";

    taskTimelineEl.innerHTML = "";
    const steps = task.logs.length ? task.logs.slice(-6) : ["Task queued"];
    steps.forEach((entry, idx) => {
      const div = document.createElement("div");
      div.className = "timeline-step" + (idx === steps.length - 1 ? " active" : "");
      div.innerHTML = "<span>●</span><div><strong>" + escapeHtml(entry) + "</strong><small>Event " + (idx + 1) + "</small></div>";
      taskTimelineEl.appendChild(div);
    });

    taskOverlay.classList.add("visible");
    taskOverlay.setAttribute("aria-hidden", "false");
  };

  const closeTaskDetail = () => {
    taskOverlay.classList.remove("visible");
    taskOverlay.setAttribute("aria-hidden", "true");
  };

  const renderHistory = (filterText = searchChats?.value || "") => {
    if (!historyBox) return;
    historyBox.innerHTML = "";
    const q = filterText.trim().toLowerCase();
    const list = conversationsList.filter(item =>
      (item.title || "Untitled conversation").toLowerCase().includes(q)
    );

    if (!list.length) {
      historyBox.innerHTML = '<div class="empty">' + (q ? "No matching chats" : "No recent chats") + "</div>";
      return;
    }

    list.slice(0, 25).forEach(item => {
      const row = document.createElement("div");
      row.className = "history-row" + (item.id === currentConversationId ? " active" : "");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history-select";
      btn.dataset.conversationId = item.id;
      btn.textContent = item.title || "Untitled conversation";
      row.appendChild(btn);
      historyBox.appendChild(row);
    });
  };

  const refreshHistory = async () => {
    if (!currentUser) return;
    try {
      const result = await FridayApi.listConversations();
      conversationsList = Array.isArray(result.conversations) ? result.conversations : [];
      renderHistory();
    } catch {
      // Keep existing history if network check fails transiently.
    }
  };

  const refreshProjectsView = async () => {
    const projectBox = $("#projectList");
    const toolBox = $("#toolList");
    if (!currentUser) {
      if (projectBox) projectBox.innerHTML = '<div class="muted">Sign in to inspect your connected projects.</div>';
      if (toolBox) toolBox.innerHTML = '<div class="muted">Sign in to inspect available tools.</div>';
      return;
    }
    try {
      const [projRes, toolRes] = await Promise.all([FridayApi.listProjects(), FridayApi.listTools()]);
      const projects = projRes.projects || [];
      const tools = toolRes.tools || [];

      if (projectBox) {
        projectBox.innerHTML = projects.length ? "" : '<div class="muted">No active projects reported.</div>';
        projects.forEach(p => {
          const row = document.createElement("div");
          row.className = "file-row";
          row.innerHTML = '<div class="row-meta"><strong>' + escapeHtml(p.name || p.id) + "</strong><small>" + escapeHtml((p.repository || "") + (p.branch ? " · " + p.branch : "")) + '</small></div><span class="status-pill">' + escapeHtml(p.status || "active") + "</span>";
          projectBox.appendChild(row);
        });
      }

      if (toolBox) {
        toolBox.innerHTML = tools.length ? "" : '<div class="muted">No tools reported.</div>';
        tools.forEach(t => {
          const row = document.createElement("div");
          row.className = "file-row";
          row.innerHTML = '<div class="row-meta"><strong>' + escapeHtml(t.name) + "</strong><small>" + escapeHtml(t.description || "Agent capability") + "</small></div>";
          toolBox.appendChild(row);
        });
      }
    } catch (error) {
      if (projectBox) projectBox.innerHTML = '<div class="muted">' + escapeHtml(error.message) + "</div>";
    }
  };

  const refreshGithubView = async () => {
    const box = $("#githubSummary");
    if (!box) return;
    if (!currentUser) {
      box.innerHTML = '<div class="muted">Sign in to view repository context.</div>';
      return;
    }
    try {
      const projRes = await FridayApi.listProjects();
      const projects = projRes.projects || [];
      box.innerHTML = projects.length ? "" : '<div class="muted">No GitHub repository linked.</div>';
      projects.forEach(p => {
        const row = document.createElement("div");
        row.className = "file-row";
        row.innerHTML = '<div class="row-meta"><strong>' + escapeHtml(p.repository || p.name) + "</strong><small>" + escapeHtml(p.description || "Branch: " + (p.branch || "main")) + '</small></div><span class="status-pill">' + escapeHtml(p.branch || "main") + "</span>";
        box.appendChild(row);
      });
    } catch (error) {
      box.innerHTML = '<div class="muted">' + escapeHtml(error.message) + "</div>";
    }
  };

  const refreshFilesView = async () => {
    renderStagedFiles();
    const box = $("#fileList");
    if (!box) return;
    if (!currentUser) {
      box.innerHTML = '<div class="muted">Sign in to view uploaded files.</div>';
      return;
    }
    try {
      const result = await FridayApi.listFiles();
      const files = result.files || [];
      box.innerHTML = files.length ? "" : '<div class="muted">No files uploaded yet.</div>';
      files.forEach(file => {
        const row = document.createElement("div");
        row.className = "file-row";
        const sizeKb = file.size ? Math.max(1, Math.ceil(file.size / 1024)) + " KB" : file.mimeType || "file";
        row.innerHTML = '<div class="row-meta"><strong>' + escapeHtml(file.name) + "</strong><small>" + escapeHtml(sizeKb) + "</small></div>";
        const dlBtn = document.createElement("button");
        dlBtn.type = "button";
        dlBtn.className = "small-btn";
        dlBtn.textContent = "Download";
        dlBtn.onclick = async () => {
          try {
            const { blob, filename } = await FridayApi.downloadFile(file.id);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename || file.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          } catch (error) {
            showToast(error.message);
          }
        };
        row.appendChild(dlBtn);
        box.appendChild(row);
      });
    } catch (error) {
      box.innerHTML = '<div class="muted">' + escapeHtml(error.message) + "</div>";
    }
  };

  const showView = view => {
    activeView = view;
    ["welcome", "conversation", "loader", "projectsView", "tasksView", "filesView", "githubView"].forEach(id => {
      const el = $("#" + id);
      if (el) el.hidden = true;
    });

    composerWrap.hidden = view !== "chat";
    if (view === "chat") {
      renderChatStage();
      if (sending) loaderRow.hidden = false;
    } else {
      const target = $("#" + view + "View");
      if (target) target.hidden = false;
    }

    $$(".nav-item[data-nav]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.nav === view);
    });

    openSidebar(false);

    if (view === "projects") void refreshProjectsView();
    if (view === "files") void refreshFilesView();
    if (view === "github") void refreshGithubView();
    if (view === "tasks") renderTasksUI();
  };

  const loadConversation = async id => {
    if (!id) return;
    const result = await FridayApi.listMessages(id);
    currentMessages = [];
    conversation.innerHTML = "";
    const msgs = (result.messages || []).filter(m => m.role === "user" || m.role === "assistant");
    if (!msgs.length) {
      resetConversationView();
      return;
    }
    msgs.forEach(message => {
      appendMessage(message.role, message.content);
    });
    showView("chat");
  };

  const ensureConversation = async firstMessage => {
    if (currentConversationId) {
      try {
        await FridayApi.listMessages(currentConversationId);
        return currentConversationId;
      } catch (error) {
        if (error.status !== 404) throw error;
        currentConversationId = "";
      }
    }

    const title = firstMessage.length > 60 ? firstMessage.slice(0, 57) + "…" : firstMessage;
    const result = await FridayApi.createConversation(title || "Friday conversation");
    currentConversationId = result.conversation.id;
    return currentConversationId;
  };

  const updateConnection = async () => {
    try {
      const health = await FridayApi.health();
      connectionState.textContent = health.ok ? "Backend connected" : "Backend unavailable";
      setStatus(currentUser ? "Friday online" : health.ok ? "Sign-in required" : "Backend unavailable", health.ok ? "online" : "error");
    } catch {
      connectionState.textContent = "Backend unavailable";
      setStatus("Backend unavailable", "error");
    }
  };

  const handleSend = async text => {
    const value = (text ?? prompt.value).trim();
    if (!value || sending) return;

    if (!FridayApi.getToken()) {
      showAuth("Sign in to send tasks to Friday.");
      return;
    }

    if (activeView !== "chat") showView("chat");

    sending = true;
    cancelRequested = false;
    prompt.value = "";
    resize();
    setStatus("Friday is working…", "busy");

    const attachedNames = pendingFiles.map(f => f.name);
    const filesToUpload = pendingFiles.slice();
    pendingFiles = [];
    renderAttachmentChips();
    renderStagedFiles();

    const { node: userNode } = appendMessage("user", value, { attachments: attachedNames });
    showLoader(true);
    setTaskState("Preparing request…", true);
    addActivityEvent("Submitted prompt: " + value.slice(0, 72));

    const taskRecord = {
      id: "pending-" + Date.now(),
      title: value.slice(0, 64),
      state: "queued",
      statusLabel: "Queued",
      progress: 12,
      runner: "Friday agent",
      logs: ["Prompt submitted"]
    };
    sessionTasks.unshift(taskRecord);
    renderTasksUI();

    try {
      const conversationId = await ensureConversation(value);
      await FridayApi.addMessage(conversationId, "user", value);

      const uploaded = [];
      for (const file of filesToUpload) {
        setTaskState("Uploading " + file.name + "…", true);
        const result = await FridayApi.uploadFile(file);
        uploaded.push(result.file);
        taskRecord.logs.push("Uploaded file: " + file.name);
      }

      const attachmentContext = uploaded.length
        ? "\n\nAttached files: " + uploaded.map(file => file.name + " (" + file.id + ")").join(", ")
        : "";

      const messages = [
        { role: "system", content: "You are Friday, a web-based AI agent. Work carefully, use available tools when useful, and report concrete results. Do not claim an action succeeded unless the tool result confirms it." },
        { role: "user", content: value + attachmentContext }
      ];

      const created = await FridayApi.createAgentTask(messages, { maxSteps: 8 });
      const taskId = created.task.id;
      taskRecord.id = taskId;
      taskRecord.state = "running";
      taskRecord.progress = 28;
      taskRecord.statusLabel = "Task " + taskId.slice(0, 8) + " · queued";
      taskRecord.logs.push("Task queued (" + taskId.slice(0, 8) + ")");
      setTaskState(taskRecord.statusLabel, true);
      renderTasksUI();

      if (eventAbortController) eventAbortController.abort();
      eventAbortController = new AbortController();

      void FridayApi.readTaskEvents(
        taskId,
        0,
        event => {
          const label = event.type
            .replace(/^agent\./, "")
            .replace(/^task\./, "")
            .replace(/\./g, " ");
          taskRecord.statusLabel = "Task " + taskId.slice(0, 8) + " · " + label;
          taskRecord.progress = Math.min(92, taskRecord.progress + 14);
          taskRecord.logs.push(new Date().toLocaleTimeString() + " · " + event.type);
          setTaskState(taskRecord.statusLabel, true);
          addActivityEvent("Task " + taskId.slice(0, 8) + ": " + label);
          renderTasksUI();
        },
        eventAbortController.signal
      ).catch(error => {
        if (!eventAbortController?.signal.aborted) showToast(error.message);
      });

      let task;
      const deadline = Date.now() + 10 * 60 * 1000;
      while (Date.now() < deadline) {
        if (cancelRequested) break;
        task = (await FridayApi.getTask(taskId)).task;
        if (task.state === "completed" || task.state === "failed") break;
        await new Promise(resolve => setTimeout(resolve, 700));
      }

      if (cancelRequested) {
        taskRecord.state = "stopped";
        taskRecord.statusLabel = "Stopped waiting for response";
        taskRecord.logs.push("User stopped waiting");
        appendMessage("assistant", "Stopped waiting for task response.", { error: true });
        setStatus("Friday online", "online");
        renderTasksUI();
        return;
      }

      if (!task || (task.state !== "completed" && task.state !== "failed")) {
        throw new Error("Friday task timed out while waiting for the worker.");
      }

      if (task.state === "failed") {
        throw new Error(task.error || "Friday task failed.");
      }

      const result = task.result || {};
      const answer = typeof result.text === "string"
        ? result.text
        : "Friday completed the task, but returned no text response.";

      taskRecord.state = "completed";
      taskRecord.progress = 100;
      taskRecord.statusLabel = "Completed";
      taskRecord.runner = result.model || result.provider || "Friday agent";
      taskRecord.logs.push("Completed successfully");

      appendMessage("assistant", answer);
      await FridayApi.addMessage(conversationId, "assistant", answer, {
        taskId,
        provider: result.provider,
        model: result.model,
        steps: result.steps
      });

      await refreshHistory();
      setTaskState("Completed", true);
      setStatus("Friday online", "online");
      addActivityEvent("Completed task " + taskId.slice(0, 8));
      renderTasksUI();
    } catch (error) {
      taskRecord.state = "failed";
      taskRecord.statusLabel = "Failed: " + error.message;
      taskRecord.logs.push("Error: " + error.message);
      appendMessage("assistant", error.message, { error: true });
      setStatus("Connection/error", "error");
      addActivityEvent("Task failed: " + error.message);
      renderTasksUI();
      showToast(error.message);
    } finally {
      sending = false;
      showLoader(false);
      setTimeout(() => {
        if (!sending) setTaskState("", false);
      }, 2800);
      if (eventAbortController) {
        eventAbortController.abort();
        eventAbortController = null;
      }
      userNode.scrollIntoView({ block: "nearest", behavior: "smooth" });
      scrollStageBottom();
    }
  };

  const finishAuth = async result => {
    currentUser = result.user;
    hideAuth();
    setStatus("Friday online", "online");
    $(".profile-name").textContent = currentUser.email;
    $(".profile-sub").textContent = "Authenticated workspace";
    if (profileAvatar) {
      profileAvatar.textContent = (currentUser.email || "F").trim().charAt(0).toUpperCase();
    }
    await updateConnection();
    await refreshHistory();
    if (currentConversationId) {
      try {
        await loadConversation(currentConversationId);
      } catch {
        currentConversationId = "";
        FridayApi.setConversationId("");
      }
    }
  };

  prompt.addEventListener("input", resize);

  prompt.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && window.matchMedia("(hover: hover)").matches) {
      event.preventDefault();
      if (!sendBtn.disabled) composer.requestSubmit();
    }
  });

  composer.addEventListener("submit", event => {
    event.preventDefault();
    void handleSend();
  });

  stopBtn?.addEventListener("click", () => {
    if (!sending) return;
    cancelRequested = true;
    if (eventAbortController) eventAbortController.abort();
    addActivityEvent("Stop requested by user");
  });

  searchChats?.addEventListener("input", e => renderHistory(e.target.value));

  $$("[data-prompt]").forEach(button => {
    button.addEventListener("click", () => {
      prompt.value = button.dataset.prompt;
      resize();
      prompt.focus();
    });
  });

  $$("[data-run-prompt]").forEach(button => {
    button.addEventListener("click", () => {
      showView("chat");
      void handleSend(button.dataset.runPrompt);
    });
  });

  $("#refreshProjects")?.addEventListener("click", () => void refreshProjectsView());
  $("#refreshGithub")?.addEventListener("click", () => void refreshGithubView());

  authForm.addEventListener("submit", async event => {
    event.preventDefault();
    authError.classList.remove("visible");
    authSubmit.disabled = true;
    try {
      const result = authRegisterMode
        ? await FridayApi.register(authEmail.value.trim(), authPassword.value)
        : await FridayApi.login(authEmail.value.trim(), authPassword.value);

      if (authRegisterMode) {
        const loginResult = await FridayApi.login(authEmail.value.trim(), authPassword.value);
        await finishAuth(loginResult);
      } else {
        await finishAuth(result);
      }
      authPassword.value = "";
    } catch (error) {
      authError.textContent = error.message;
      authError.classList.add("visible");
    } finally {
      authSubmit.disabled = false;
    }
  });

  $("#google-auth").addEventListener("click", () => {
    try { FridayApi.startOAuth("google"); } catch (error) { showAuth(error.message); }
  });
  $("#github-auth").addEventListener("click", () => {
    try { FridayApi.startOAuth("github"); } catch (error) { showAuth(error.message); }
  });

  authSwitch.addEventListener("click", () => {
    authRegisterMode = !authRegisterMode;
    authMode.textContent = authRegisterMode ? "Create your Friday account" : "Sign in to Friday";
    authSubmit.textContent = authRegisterMode ? "Create account" : "Sign in";
    authSwitch.textContent = authRegisterMode ? "Already have an account? Sign in" : "Need an account? Create one";
    authError.classList.remove("visible");
  });

  $("#save-settings").addEventListener("click", async () => {
    const value = apiUrlInput.value.trim();
    if (!value) {
      showToast("Enter a backend URL.");
      return;
    }
    FridayApi.setApiBase(value);
    settingsPanel.classList.remove("visible");
    await updateConnection();
    showToast("Backend URL saved.");
  });

  $("#test-connection")?.addEventListener("click", async () => {
    const value = apiUrlInput.value.trim();
    if (value) FridayApi.setApiBase(value);
    settingsStatus.textContent = "Testing connection…";
    try {
      const health = await FridayApi.health();
      settingsStatus.textContent = health.ok ? "Backend health check passed." : "Backend responded unexpectedly.";
      await updateConnection();
    } catch (error) {
      settingsStatus.textContent = "Connection test failed: " + error.message;
    }
  });

  $("#cancel-settings").addEventListener("click", () => settingsPanel.classList.remove("visible"));
  $("#close-settings-x")?.addEventListener("click", () => settingsPanel.classList.remove("visible"));

  $("#logout-button").addEventListener("click", async () => {
    if (!FridayApi.getToken()) {
      showAuth();
      return;
    }
    await FridayApi.logout();
    currentUser = null;
    currentConversationId = "";
    conversationsList = [];
    renderHistory();
    $(".profile-name").textContent = "Signed out";
    $(".profile-sub").textContent = "Authentication required";
    if (profileAvatar) profileAvatar.textContent = "F";
    resetConversationView();
    showAuth("Signed out. Sign in to continue.");
  });

  scrim?.addEventListener("click", () => {
    openSidebar(false);
    openActivity(false);
  });

  taskOverlay?.addEventListener("click", e => {    if (e.target === taskOverlay) closeTaskDetail();
  });

  settingsPanel?.addEventListener("click", e => {
    if (e.target === settingsPanel) settingsPanel.classList.remove("visible");
  });

  document.addEventListener("click", event => {
    const historyItem = event.target.closest("[data-conversation-id]");
    if (historyItem) {
      currentConversationId = historyItem.dataset.conversationId;
      FridayApi.setConversationId(currentConversationId);
      renderHistory();
      void loadConversation(currentConversationId).catch(error => showToast(error.message));
      openSidebar(false);
      return;
    }

    const viewBtn = event.target.closest("[data-view]");
    if (viewBtn) {
      openActivity(false);
      showView(viewBtn.dataset.view);
      return;
    }

    const actionElement = event.target.closest("[data-action]");
    if (!actionElement) return;
    const action = actionElement.dataset.action;

    if (action === "toggle-sidebar") openSidebar(!sidebar.classList.contains("open"));
    if (action === "close-sidebar") openSidebar(false);
    if (action === "toggle-activity") openActivity(!activityPanel.classList.contains("open"));
    if (action === "close-task-view") closeTaskDetail();

    if (action === "new-chat" || action === "home") {
      currentConversationId = "";
      FridayApi.setConversationId("");
      renderHistory();
      resetConversationView();
      showView("chat");
      prompt.focus();
    }

    if (action === "toggle-theme") {
      document.body.classList.toggle("light");
      const isLight = document.body.classList.contains("light");
      localStorage.setItem("friday_theme", isLight ? "light" : "dark");
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", isLight ? "#fafafa" : "#000000");
      showToast(isLight ? "Light mode enabled" : "Pure black dark mode enabled");
    }

    if (action === "attach") fileInput.click();

    if (action === "voice") {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        showToast("Voice input is not supported in this browser.");
        return;
      }
      const rec = new SR();
      rec.lang = navigator.language || "en-US";
      rec.interimResults = true;
      rec.onresult = e => {
        const transcript = Array.from(e.results).map(r => r[0].transcript).join("");
        prompt.value = transcript;
        resize();
        const facePrompt = $("#face-prompt");
        if (facePrompt && $("#face-mode")?.classList.contains("visible")) {
          facePrompt.value = transcript;
        }
      };
      rec.start();
      showToast("Listening…");
    }

    if (action === "model") showToast("Gemini is the configured backend provider.");

    if (action === "settings") {
      openSidebar(false);
      try {
        const base = FridayApi.getApiBase();
        apiUrlInput.value = base.replace(/\/api$/, "") || window.location.origin;
        settingsStatus.textContent = "Configured base: " + base;
      } catch {
        apiUrlInput.value = window.location.origin;
        settingsStatus.textContent = "Backend URL is not configured yet.";
      }
      settingsPanel.classList.add("visible");
      apiUrlInput.focus();
    }

    if (action === "profile") {
      if (currentUser) showToast(currentUser.email);
      else showAuth();
    }
  });

  fileInput.addEventListener("change", async () => {
    const selected = Array.from(fileInput.files || []);
    fileInput.value = "";
    if (!selected.length) return;

    if (activeView === "files" && currentUser) {
      for (const file of selected) {
        try {
          await FridayApi.uploadFile(file);
          showToast("Uploaded " + file.name);
        } catch (error) {
          showToast(error.message);
        }
      }
      await refreshFilesView();
      return;
    }

    selected.forEach(file => {
      if (!pendingFiles.some(f => f.name === file.name && f.size === file.size)) {
        pendingFiles.push(file);
      }
    });
    renderAttachmentChips();
    renderStagedFiles();
    showToast(selected.length + " file" + (selected.length > 1 ? "s" : "") + " attached");
  });

  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (activeView !== "chat") showView("chat");
      prompt.focus();
    }
    if (event.key === "Escape") {
      openSidebar(false);
      openActivity(false);
      closeTaskDetail();
      settingsPanel.classList.remove("visible");
    }
  });

  if (localStorage.getItem("friday_theme") === "light") {
    document.body.classList.add("light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "#fafafa");
  }

  renderTasksUI();
  resize();

  void updateConnection();
  window.setInterval(() => {
    if (document.visibilityState !== "hidden") void updateConnection();
  }, 30000);

  try {
    apiUrlInput.value = (FridayApi.getApiBase().replace(/\/api$/, "") || window.location.origin);
  } catch {
    apiUrlInput.value = window.location.origin;
  }

  (async () => {
    const params = new URLSearchParams(window.location.search);
    const oauthCode = params.get("oauth_code");
    const oauthError = params.get("oauth_error");
    if (oauthCode) {
      try {
        const result = await FridayApi.exchangeOAuthCode(oauthCode);
        window.history.replaceState({}, document.title, window.location.pathname);
        await finishAuth(result);
        return;
      } catch (error) {
        window.history.replaceState({}, document.title, window.location.pathname);
        showAuth(error.message);
        return;
      }
    }
    if (oauthError) {
      window.history.replaceState({}, document.title, window.location.pathname);
      showAuth(oauthError);
      return;
    }
    if (!FridayApi.getToken()) {
      showAuth();
      return;
    }
    try {
      const result = await FridayApi.me();
      await finishAuth(result);
    } catch {
      await FridayApi.logout();
      showAuth("Your session expired. Please sign in again.");
    }
  })();
})();