import { config } from "../config.js";

type GitHubResponse<T> = {
  data: T;
  headers: Headers;
};

function validateRepository(repo: string): string {
  const value = repo.trim();
  const parts = value.split("/");
  if (
    parts.length !== 2 ||
    parts.some(part => !part || part === "." || part === ".." || !/^[A-Za-z0-9_.-]+$/.test(part))
  ) {
    throw new Error("Repository must use the owner/name format.");
  }
  return value;
}

function validateFilePath(path: string): string {
  const value = path.trim();
  const segments = value.split("/");
  if (
    !value ||
    value.startsWith("/") ||
    value.includes("\\") ||
    segments.some(segment => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Repository file path is invalid.");
  }
  return segments.map(encodeURIComponent).join("/");
}

export class GitHubClient {
  private readonly baseUrl = config.GITHUB_API_URL.replace(/\/$/, "");

  private headers(): Record<string, string> {
    if (!config.GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN is not configured.");
    }
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<GitHubResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(20000),
      headers: {
        ...this.headers(),
        ...(init.headers ?? {})
      }
    });

    const text = await response.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const message =
        typeof data === "object" && data !== null && "message" in data
          ? String((data as { message: unknown }).message)
          : `GitHub API request failed with HTTP ${response.status}.`;
      throw new Error(message);
    }

    return { data: data as T, headers: response.headers };
  }

  async listRepositories(limit = 20): Promise<unknown> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const result = await this.request<unknown>(`/user/repos?per_page=${safeLimit}&sort=updated`);
    return result.data;
  }

  async getFile(repo: string, path: string, ref?: string): Promise<unknown> {
    const safeRepo = validateRepository(repo);
    const encodedPath = validateFilePath(path);
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const result = await this.request<unknown>(`/repos/${safeRepo}/contents/${encodedPath}${query}`);
    return result.data;
  }

  async searchCode(repo: string, query: string, limit = 20): Promise<unknown> {
    const safeRepo = validateRepository(repo);
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const q = encodeURIComponent(`${query} repo:${safeRepo}`);
    const result = await this.request<unknown>(`/search/code?q=${q}&per_page=${safeLimit}`);
    return result.data;
  }

  private assertMutationAllowed(): void {
    if (!config.FRIDAY_ALLOW_GITHUB_MUTATIONS) {
      throw new Error("GitHub mutations are disabled. Set FRIDAY_ALLOW_GITHUB_MUTATIONS=true only when authorized.");
    }
  }

  async createBranch(repo: string, branch: string, base?: string): Promise<unknown> {
    this.assertMutationAllowed();
    const safeRepo = validateRepository(repo);
    const repository = await this.request<{ default_branch: string }>(`/repos/${safeRepo}`);
    const baseRef = base ?? repository.data.default_branch;
    const ref = await this.request<{ object: { sha: string } }>(
      `/repos/${safeRepo}/git/ref/heads/${encodeURIComponent(baseRef)}`
    );
    const result = await this.request<unknown>(`/repos/${safeRepo}/git/refs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.data.object.sha })
    });
    return result.data;
  }

  async upsertFile(
    repo: string,
    path: string,
    content: string,
    branch: string,
    message: string,
    sha?: string
  ): Promise<unknown> {
    this.assertMutationAllowed();
    const safeRepo = validateRepository(repo);
    const encodedPath = validateFilePath(path);
    const body: Record<string, unknown> = {
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch
    };
    if (sha) body.sha = sha;

    const result = await this.request<unknown>(`/repos/${safeRepo}/contents/${encodedPath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return result.data;
  }

  async createPullRequest(
    repo: string,
    head: string,
    base: string,
    title: string,
    body?: string
  ): Promise<unknown> {
    this.assertMutationAllowed();
    const safeRepo = validateRepository(repo);
    const result = await this.request<unknown>(`/repos/${safeRepo}/pulls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ head, base, title, body: body ?? "" })
    });
    return result.data;
  }
}
