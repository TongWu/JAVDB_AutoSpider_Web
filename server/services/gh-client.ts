// GitHub REST API client for Workers
// Uses native fetch() — no external HTTP library needed

import { HTTPException } from "hono/http-exception";

export interface Workflow {
  id: number;
  name: string;
  path: string;
  state: string;
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  workflow_id: number;
}

interface GhClientConfig {
  token: string;
  repo: string; // "owner/repo"
}

interface ListRunsParams {
  workflow_id?: number;
  per_page?: number;
  page?: number;
}

interface WorkflowContent {
  content: string;
  sha: string;
}

export function createGhClient(config: GhClientConfig) {
  const baseUrl = `https://api.github.com/repos/${config.repo}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  async function request(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...init?.headers },
    });
    if (!res.ok && !(init?.redirect === "manual" && res.status === 302)) {
      const body = await res.text();
      throw new HTTPException(502, {
        message: `GitHub API ${res.status}: ${body.slice(0, 500)}`,
      });
    }
    return res;
  }

  return {
    async listWorkflows(): Promise<{ workflows: Workflow[] }> {
      const res = await request("/actions/workflows");
      const data = (await res.json()) as { workflows: Workflow[] };
      return { workflows: data.workflows };
    },

    async listRuns(params?: ListRunsParams): Promise<{ total_count: number; workflow_runs: WorkflowRun[] }> {
      const qs = new URLSearchParams();
      if (params?.workflow_id) qs.set("workflow_id", String(params.workflow_id));
      if (params?.per_page) qs.set("per_page", String(params.per_page));
      if (params?.page) qs.set("page", String(params.page));
      const query = qs.toString();
      const path = `/actions/runs${query ? `?${query}` : ""}`;
      const res = await request(path);
      return (await res.json()) as { total_count: number; workflow_runs: WorkflowRun[] };
    },

    async dispatchWorkflow(
      workflowFile: string,
      inputs: Record<string, string>,
      ref = "main",
    ): Promise<void> {
      await request(`/actions/workflows/${workflowFile}/dispatches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref, inputs }),
      });
    },

    async getRunLogsUrl(runId: number): Promise<string> {
      const res = await fetch(`${baseUrl}/actions/runs/${runId}/logs`, {
        headers,
        redirect: "manual",
      });
      const location = res.headers.get("Location");
      if (!location) {
        throw new Error(`No redirect Location for run ${runId} logs`);
      }
      return location;
    },

    async getWorkflowContent(filename: string): Promise<WorkflowContent> {
      const res = await request(`/contents/.github/workflows/${filename}`);
      const data = (await res.json()) as { content: string; sha: string };
      return { content: data.content, sha: data.sha };
    },

    async updateWorkflowContent(
      filename: string,
      content: string,
      sha: string,
      message: string,
    ): Promise<void> {
      await request(`/contents/.github/workflows/${filename}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, content, sha }),
      });
    },
  };
}

export type GhClient = ReturnType<typeof createGhClient>;
