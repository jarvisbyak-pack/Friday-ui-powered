(() => {
  const STORAGE_KEY = "friday_api_url";
  const TOKEN_KEY = "friday_auth_token";
  const CONVERSATION_KEY = "friday_conversation_id";

  const normalizeBase = value => {
    const raw = (value || "").trim();
    if (!raw) return "/api";
    return raw.replace(/\/+$/, "").endsWith("/api") ? raw.replace(/\/+$/, "") : raw.replace(/\/+$/, "") + "/api";
  };

  const getConfiguredApiBase = () => {
  const runtime = window.FRIDAY_CONFIG?.API_BASE_URL;
  if (runtime) return runtime;
  const build = "__FRIDAY_API_BASE_URL__";
  return build !== "__FRIDAY_API_BASE_URL__" ? build : "";
};
const getApiBase = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  const configured = getConfiguredApiBase();
  if (stored) return normalizeBase(stored);
  if (configured) return normalizeBase(configured);
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") return "/api";
  throw new Error("Friday backend URL is not configured for this deployment.");
};
  const setApiBase = value => localStorage.setItem(STORAGE_KEY, normalizeBase(value));
  const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
  const setToken = token => token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);
  const getConversationId = () => localStorage.getItem(CONVERSATION_KEY) || "";
  const setConversationId = id => id ? localStorage.setItem(CONVERSATION_KEY, id) : localStorage.removeItem(CONVERSATION_KEY);

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const token = getToken();
    if (token) headers.set("Authorization", "Bearer " + token);

    let response;
    try {
      response = await fetch(getApiBase() + path, { ...options, headers });
    } catch (error) {
      throw new Error("Friday backend is unreachable. Check the API URL in Settings.");
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => ({}))
      : await response.text();

    if (!response.ok) {
      const message = payload && typeof payload === "object" && payload.error?.message
        ? payload.error.message
        : "Request failed (" + response.status + ").";
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async function health() {
    return request("/health", { headers: { Accept: "application/json" } });
  }

  async function register(email, password) {
    return request("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
  }

  async function login(email, password) {
    const result = await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    setToken(result.token);
    return result;
  }

  async function exchangeOAuthCode(code) {
    const result = await request("/auth/oauth/exchange", { method: "POST", body: JSON.stringify({ code }) });
    setToken(result.token);
    return result;
  }

  function startOAuth(provider) {
    window.location.assign(getApiBase() + "/auth/" + encodeURIComponent(provider) + "/start");
  }

  async function me() {
    return request("/auth/me");
  }

  async function logout() {
    try {
      if (getToken()) await request("/auth/logout", { method: "POST" });
    } finally {
      setToken("");
      setConversationId("");
    }
  }

  async function listConversations() {
    return request("/conversations");
  }

  async function createConversation(title) {
    const result = await request("/conversations", {
      method: "POST",
      body: JSON.stringify({ title })
    });
    setConversationId(result.conversation.id);
    return result;
  }

  async function listMessages(id) {
    return request("/conversations/" + encodeURIComponent(id) + "/messages");
  }

  async function addMessage(id, role, content, metadata) {
    return request("/conversations/" + encodeURIComponent(id) + "/messages", {
      method: "POST",
      body: JSON.stringify({ role, content, metadata })
    });
  }

  async function createAgentTask(messages, options = {}) {
    return request("/tasks", {
      method: "POST",
      body: JSON.stringify({
        type: "agent",
        input: {
          messages,
          model: options.model,
          temperature: options.temperature,
          maxSteps: options.maxSteps || 8
        }
      })
    });
  }

  async function getTask(id) {
    return request("/tasks/" + encodeURIComponent(id));
  }

  async function readTaskEvents(id, after, onEvent, signal) {
    const headers = new Headers({ Accept: "text/event-stream" });
    const token = getToken();
    if (token) headers.set("Authorization", "Bearer " + token);

    let response;
    try {
      response = await fetch(
        getApiBase() + "/tasks/" + encodeURIComponent(id) + "/events?after=" + encodeURIComponent(after || 0),
        { headers, signal }
      );
    } catch (error) {
      if (signal?.aborted) return;
      throw new Error("Unable to connect to the task event stream.");
    }

    if (!response.ok || !response.body) {
      throw new Error("Task event stream failed (" + response.status + ").");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";

      for (const chunk of chunks) {
        const dataLine = chunk.split("\n").find(line => line.startsWith("data:"));
        if (!dataLine) continue;
        try {
          onEvent(JSON.parse(dataLine.slice(5).trim()));
        } catch {
          // Ignore malformed individual events; the task status remains authoritative.
        }
      }
    }
  }

  async function uploadFile(file) {
    const contentBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(new Error("Could not read " + file.name));
      reader.readAsDataURL(file);
    });

    return request("/files", {
      method: "POST",
      body: JSON.stringify({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        contentBase64
      })
    });
  }

  async function listFiles() {
    return request("/files");
  }

  async function downloadFile(id) {
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set("Authorization", "Bearer " + token);

    const response = await fetch(getApiBase() + "/files/" + encodeURIComponent(id), { headers });
    if (!response.ok) {
      throw new Error("File download failed (" + response.status + ").");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/i);
    return { blob, filename: match ? match[1] : "download" };
  }

  async function listProjects() {
    return request("/projects");
  }

  async function listTools() {
    return request("/tools");
  }

  async function searchMemories(query) {
    return request("/memories?q=" + encodeURIComponent(query));
  }

  window.FridayApi = {
    getApiBase, setApiBase, getToken, getConversationId, setConversationId,
    health, register, login, exchangeOAuthCode, startOAuth, me, logout,
    listConversations, createConversation, listMessages, addMessage,
    createAgentTask, getTask, readTaskEvents, uploadFile,
    listFiles, downloadFile, listProjects, listTools, searchMemories
  };
})();
