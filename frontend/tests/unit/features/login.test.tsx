import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readCredentials, validateCredentials } from "@/features/auth/credentials";
import { LoginForm } from "@/features/auth/LoginForm";
import { LoginScreen } from "@/features/auth/LoginScreen";
import {
  createFakeFetch,
  jsonResponse,
  type RecordedCall,
  type Responder,
} from "../support/fakeFetch";
import { renderWithProviders } from "../support/render";

// next/navigation needs the App Router at runtime; it is the framework boundary here.
const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

function stubApi(responder: Responder): RecordedCall[] {
  const fake = createFakeFetch(responder);
  vi.stubGlobal("fetch", fake.fetchImpl);
  return fake.calls;
}

async function submit(username: string, password: string) {
  renderWithProviders(<LoginForm />);
  if (username) await userEvent.type(screen.getByLabelText("Benutzername"), username);
  if (password) await userEvent.type(screen.getByLabelText("Passwort"), password);
  await userEvent.click(screen.getByRole("button", { name: "Anmelden" }));
}

// The toast region is an always-present (empty) alert landmark, so match the alert by its text.
async function expectAlert(message: string) {
  const text = await screen.findByText(message);
  expect(text.closest('[role="alert"]')).not.toBeNull();
}

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.search = "";
});

describe("LoginForm", () => {
  it("asks for both fields before calling the server", async () => {
    const calls = stubApi(() => jsonResponse(200, { status: "ok" }));
    await submit("", "");
    expect(screen.getAllByText("Bitte ausfüllen.")).toHaveLength(2);
    expect(calls).toHaveLength(0);
  });

  it("shows a German message for wrong credentials, not the server text", async () => {
    stubApi(() => jsonResponse(401, { detail: "Incorrect username or password" }));
    await submit("admin", "falsch");
    await expectAlert("Benutzername oder Passwort ist falsch.");
    expect(screen.queryByText(/Incorrect/)).not.toBeInTheDocument();
  });

  it("asks the user to wait when rate limited", async () => {
    stubApi(() => jsonResponse(429, { error: "Rate limit exceeded: 5 per 1 minute" }));
    await submit("admin", "falsch");
    await expectAlert("Zu viele Anfragen, bitte kurz warten.");
  });

  it("returns to the page in ?next after a successful login", async () => {
    navigation.search = "next=%2Fsources%3Fquelle%3D3";
    stubApi(() => jsonResponse(200, { status: "ok" }));
    await submit("admin", "geheim");
    await vi.waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/sources?quelle=3"));
  });

  it("goes to the inbox when ?next points to another site", async () => {
    navigation.search = "next=%2F%2Fevil.example";
    stubApi(() => jsonResponse(200, { status: "ok" }));
    await submit("admin", "geheim");
    await vi.waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/inbox"));
  });
});

describe("LoginForm submit handling", () => {
  it("sends one request when submitted twice while the first is pending", async () => {
    const fetchSpy = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchSpy);
    await submit("admin", "geheim");
    await userEvent.type(screen.getByLabelText("Passwort"), "{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Anmelden" }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the first invalid field", async () => {
    stubApi(() => jsonResponse(200, { status: "ok" }));
    await submit("", "");
    expect(screen.getByLabelText("Benutzername")).toHaveFocus();
  });

  it("focuses the password when only it is missing", async () => {
    stubApi(() => jsonResponse(200, { status: "ok" }));
    await submit("admin", "");
    expect(screen.getByLabelText("Passwort")).toHaveFocus();
  });
});

describe("LoginScreen with an existing session", () => {
  it("redirects to the requested page without showing the form", async () => {
    navigation.search = "next=%2Fsources";
    stubApi(() => jsonResponse(200, { id: 1, username: "admin", is_admin: true }));
    renderWithProviders(<LoginScreen />);
    await vi.waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/sources"));
    expect(screen.queryByLabelText("Benutzername")).not.toBeInTheDocument();
  });

  it("shows the form when there is no session", async () => {
    // The 401 handler sends the browser to /login; jsdom cannot navigate.
    vi.stubGlobal("location", { ...window.location, assign: vi.fn() });
    stubApi(() => jsonResponse(401, { detail: "Not authenticated" }));
    renderWithProviders(<LoginScreen />);
    expect(await screen.findByLabelText("Benutzername")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

describe("readCredentials", () => {
  it("trims the username but keeps the password as typed", () => {
    const form = document.createElement("form");
    form.innerHTML =
      '<input name="username" value="  admin  "><input name="password" value=" pw ">';
    expect(readCredentials(form)).toEqual({ username: "admin", password: " pw " });
  });
});

describe("validateCredentials", () => {
  it("trims nothing from the password but requires both values", () => {
    expect(validateCredentials({ username: "admin", password: " " })).toEqual({});
    expect(validateCredentials({ username: "", password: "" })).toEqual({
      username: "login.required",
      password: "login.required",
    });
  });
});
