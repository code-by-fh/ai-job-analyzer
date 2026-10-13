import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aiSettingsQueryOptions,
  cleanupCrawls,
  clearAiError,
  createUser,
  deleteCompanyProfile,
  deleteUser,
  openRouterModelsQueryOptions,
  renameCompany,
  saveAiSettings,
  systemStatusQueryOptions,
  testLocalModel,
  testOpenRouter,
  usersQueryOptions,
  wipeDatabase,
} from "@/api/admin";
import { AI_TASKS, companyJobsPath } from "@/api/adminPaths";
import { companyJobsQueryOptions, companySummariesQueryOptions } from "@/api/companies";
import { ApiError } from "@/api/errors";
import { queryKeys } from "@/api/queryKeys";
import { searchQueryOptions } from "@/api/search";
import { jsonResponse } from "../support/fakeFetch";
import { stubRoutes } from "../support/stubRoutes";

afterEach(() => vi.unstubAllGlobals());

const bodyOf = (call: { body: string | null } | undefined) => JSON.parse(call?.body ?? "null");
const pathOf = (call: { url: string } | undefined) => {
  const url = new URL(call?.url ?? "");
  return `${url.pathname}${url.search}`;
};

const STORED_SETTINGS = {
  status: "updated",
  openrouter_model: "openai/gpt-4o",
  openrouter_api_key_set: true,
  openrouter_api_key: "x",
  ollama_model: "llama3.1:8b",
  ollama_base_url: "http://llm.lan:1234/v1",
  ai_task_routing: { job_analysis: "local", cv_tailoring: "gpu", jobs: "local" },
};

describe("AI settings", () => {
  it("reads booleans and the merged routing, never a key", async () => {
    stubRoutes({ "GET /admin/settings": STORED_SETTINGS });
    const settings = await new QueryClient().fetchQuery(aiSettingsQueryOptions());
    expect(settings).not.toHaveProperty("openrouter_api_key");
    expect(settings).not.toHaveProperty("status");
    expect(settings.openrouter_api_key_set).toBe(true);
    expect(Object.keys(settings.ai_task_routing)).toEqual([...AI_TASKS]);
    expect(settings.ai_task_routing.job_analysis).toBe("local");
    expect(settings.ai_task_routing.cv_tailoring).toBe("cloud");
    expect(settings.ai_task_routing.deep_dive).toBe("cloud");
  });

  it("saves only the patch and answers the stored state", async () => {
    const calls = stubRoutes({ "POST /admin/settings": STORED_SETTINGS });
    const saved = await saveAiSettings({ openrouter_api_key: "sk-neu" });
    expect(bodyOf(calls[0])).toEqual({ openrouter_api_key: "sk-neu" });
    expect(JSON.stringify(saved)).not.toContain("sk-neu");
    expect(saved.ollama_base_url).toBe("http://llm.lan:1234/v1");
  });
});

describe("connection tests", () => {
  it("a failed test is a result, not an error", async () => {
    stubRoutes({ "POST /admin/test/openrouter": { ok: false, reason: "auth" } });
    await expect(testOpenRouter()).resolves.toEqual({ ok: false, reason: "auth" });
  });

  it("reads an unknown reason as failed", async () => {
    stubRoutes({ "POST /admin/test/openrouter": { ok: false, reason: "weird" } });
    await expect(testOpenRouter()).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("reads the local model list", async () => {
    const answer = { ok: true, model: "m", model_found: false, available_models: ["a"] };
    stubRoutes({ "POST /admin/test/ollama": answer });
    await expect(testLocalModel()).resolves.toEqual(answer);
  });
});

describe("OpenRouter models", () => {
  it("loads only once it is enabled and keeps a model without pricing", async () => {
    stubRoutes({
      "GET /admin/openrouter/models": [{ id: "a/b", name: "B", context_length: null, pricing: 1 }],
    });
    expect(openRouterModelsQueryOptions(false).enabled).toBe(false);
    const models = await new QueryClient().fetchQuery(openRouterModelsQueryOptions(true));
    expect(models).toEqual([{ id: "a/b", name: "B", context_length: null, pricing: {} }]);
  });

  it("an odd provider value degrades one field, not the whole list", async () => {
    const odd = { id: "a/b", name: "B", context_length: "128k", pricing: { prompt: "0" } };
    stubRoutes({ "GET /admin/openrouter/models": [odd] });
    const models = await new QueryClient().fetchQuery(openRouterModelsQueryOptions(true));
    expect(models).toEqual([
      { id: "a/b", name: "B", context_length: null, pricing: { prompt: "0" } },
    ]);
  });

  it("rejects with the code when no key is stored", async () => {
    stubRoutes({ "GET /admin/openrouter/models": jsonResponse(400, { detail: "no_key" }) });
    const query = new QueryClient().fetchQuery(openRouterModelsQueryOptions(true));
    await expect(query).rejects.toMatchObject({ status: 400, message: "no_key" });
  });
});

describe("system status", () => {
  it("reads an unknown code as unknown and no error as null", async () => {
    stubRoutes({ "GET /admin/system-status": { ai_error: "weird" } });
    await expect(new QueryClient().fetchQuery(systemStatusQueryOptions())).resolves.toEqual({
      ai_error: "unknown",
    });
    stubRoutes({ "GET /admin/system-status": { ai_error: null } });
    await expect(new QueryClient().fetchQuery(systemStatusQueryOptions())).resolves.toEqual({
      ai_error: null,
    });
  });

  it("reads a missing ai_error as no error", async () => {
    stubRoutes({ "GET /admin/system-status": {} });
    const status = await new QueryClient().fetchQuery(systemStatusQueryOptions());
    expect(status).toEqual({ ai_error: null });
  });

  it("clears the stored AI error", async () => {
    const calls = stubRoutes({ "DELETE /admin/clear-ai-error": { status: "cleared" } });
    await clearAiError();
    expect(calls.map((call) => `${call.method} ${pathOf(call)}`)).toEqual([
      "DELETE /admin/clear-ai-error",
    ]);
  });

  it("an unavailable status carries no server text", async () => {
    stubRoutes({
      "GET /admin/system-status": jsonResponse(503, { detail: "status_unavailable" }),
    });
    const query = new QueryClient().fetchQuery(systemStatusQueryOptions());
    await expect(query).rejects.toMatchObject({ code: "SERVER_ERROR", message: "" });
  });
});

describe("maintenance", () => {
  it("cleans up and answers how many runs went", async () => {
    stubRoutes({ "POST /admin/redis/cleanup": { removed: 2 } });
    await expect(cleanupCrawls()).resolves.toBe(2);
  });

  it("wipes with the password and the scope", async () => {
    const calls = stubRoutes({ "POST /admin/database/wipe": { status: "success" } });
    await wipeDatabase({ password: "geheim", allUsers: true });
    expect(bodyOf(calls[0])).toEqual({ password: "geheim", wipe_all_users: true });
  });

  it("a wrong wipe password stays an ApiError with the code", async () => {
    stubRoutes({ "POST /admin/database/wipe": jsonResponse(400, { detail: "wrong_password" }) });
    const wipe = wipeDatabase({ password: "falsch", allUsers: false });
    await expect(wipe).rejects.toMatchObject({ status: 400, message: "wrong_password" });
  });
});

describe("users", () => {
  it("lists the users, asking for the server's largest page (R10)", async () => {
    const users = [{ id: 1, username: "admin", is_admin: true, hashed_password: "h" }];
    const calls = stubRoutes({ "GET /users": users });
    const listed = await new QueryClient().fetchQuery(usersQueryOptions());
    expect(listed).toEqual([{ id: 1, username: "admin", is_admin: true }]);
    expect(new URL(calls[0]?.url ?? "").search).toBe("?limit=200");
  });

  it("createUser maps nothing itself (refusals stay ApiError)", async () => {
    stubRoutes({ "POST /users": jsonResponse(409, { detail: "username_taken" }) });
    const created = createUser({ username: "jonas", password: "lang-genug" });
    await expect(created).rejects.toBeInstanceOf(ApiError);
    await expect(created).rejects.toMatchObject({ status: 409, message: "username_taken" });
  });

  it("creates with the username and password and deletes by id", async () => {
    const calls = stubRoutes({
      "POST /users": { id: 5, username: "jonas", is_admin: false },
      "DELETE /users/5": { status: "deleted" },
    });
    await expect(createUser({ username: "jonas", password: "lang-genug" })).resolves.toEqual({
      id: 5,
      username: "jonas",
      is_admin: false,
    });
    await deleteUser(5);
    expect(bodyOf(calls[0])).toEqual({ username: "jonas", password: "lang-genug" });
    expect(calls[1]?.method).toBe("DELETE");
  });
});

describe("company profiles (admin)", () => {
  it("renames with the name and deletes the profile", async () => {
    const calls = stubRoutes({
      "PATCH /admin/companies/acme.de": { domain: "acme.de", name: "ACME SE" },
      "DELETE /admin/companies/acme.de": { status: "deleted" },
    });
    await expect(renameCompany({ domain: "acme.de", name: "ACME SE" })).resolves.toEqual({
      domain: "acme.de",
      name: "ACME SE",
    });
    await deleteCompanyProfile("acme.de");
    expect(bodyOf(calls[0])).toEqual({ name: "ACME SE" });
    expect(calls[1]?.method).toBe("DELETE");
  });
});

describe("company directory", () => {
  const ITEM = {
    domain: "acme.de",
    name: "ACME",
    has_profile: true,
    analyzed_at: null,
    job_count: 2,
  };

  it("requests ?scope=all only for the installation-wide list", async () => {
    const calls = stubRoutes({ "GET /companies": { items: [ITEM] } });
    await expect(
      new QueryClient().fetchQuery(companySummariesQueryOptions("all")),
    ).resolves.toEqual([ITEM]);
    await new QueryClient().fetchQuery(companySummariesQueryOptions("own"));
    expect(calls.map(pathOf)).toEqual(["/companies?scope=all", "/companies"]);
    expect(companySummariesQueryOptions("own").queryKey).toEqual(["companies", "own"]);
  });

  it("asks for the active or the archived jobs at one company", () => {
    const archived = new URLSearchParams(companyJobsPath("acme.de", true).split("?")[1]);
    const active = new URLSearchParams(companyJobsPath("acme.de", false).split("?")[1]);
    expect(archived.get("company_domain")).toBe("acme.de");
    expect(archived.get("is_archived")).toBe("true");
    expect(archived.get("limit")).toBe("100");
    expect(archived.get("sort_by")).toBe("date");
    expect(active.has("is_archived")).toBe(false);
  });

  it("keys the company's jobs under the jobs root", () => {
    expect(companyJobsQueryOptions("acme.de", true).queryKey).toEqual(
      queryKeys.companyJobs("acme.de", true),
    );
    expect(queryKeys.companyJobs("acme.de", false)).toEqual(["jobs", "company", "acme.de", false]);
  });
});

describe("search", () => {
  it("encodes the query", async () => {
    const calls = stubRoutes({ "GET /search": { jobs: [], companies: [] } });
    await new QueryClient().fetchQuery(searchQueryOptions("a&b"));
    expect(pathOf(calls[0])).toBe("/search?q=a%26b");
  });

  it("sends nothing under two characters, counted in code points after the trim", () => {
    expect(searchQueryOptions("k").enabled).toBe(false);
    expect(searchQueryOptions("😀").enabled).toBe(false);
    expect(searchQueryOptions(" k ").enabled).toBe(false);
    expect(searchQueryOptions("ko").enabled).toBe(true);
  });

  it("keys and sends the trimmed query, so a leading space needs no second request", async () => {
    const calls = stubRoutes({ "GET /search": { jobs: [], companies: [] } });
    const queryClient = new QueryClient();
    await queryClient.fetchQuery(searchQueryOptions("ko"));
    await queryClient.fetchQuery(searchQueryOptions(" ko"));
    expect(searchQueryOptions(" ko ").queryKey).toEqual(searchQueryOptions("ko").queryKey);
    expect(calls.map(pathOf)).toEqual(["/search?q=ko"]);
  });

  it("reads the hits", async () => {
    const hit = {
      id: "j1",
      title: "Kotlin Dev",
      company: null,
      company_domain: "acme.de",
      status: "OPEN",
      is_archived: false,
    };
    const answer = { jobs: [hit], companies: [{ domain: "acme.de", name: "ACME" }] };
    stubRoutes({ "GET /search": answer });
    await expect(new QueryClient().fetchQuery(searchQueryOptions("kotl"))).resolves.toEqual(answer);
  });
});
