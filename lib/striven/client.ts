/*
 * 009_Striven_Client.ts
 * Server-only Striven adapter. Tokens never cross the client boundary.
 */

import "server-only";
import { getEnv } from "@/lib/config/serviceops-config";
import { StrivenApiError } from "./errors";

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

export class StrivenClient {
  private baseUrl = getEnv().strivenBaseUrl.replace(/\/+$/, "");

  async request<T>(method: string, pathOrUrl: string, body?: unknown, retry401 = true): Promise<T> {
    const url = this.buildUrl(pathOrUrl);
    const token = await this.getAccessToken();
    const response = await fetch(url, {
      method: method.toUpperCase(),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store"
    });

    const text = await response.text();

    if (response.status === 401 && retry401) {
      tokenCache = null;
      return this.request<T>(method, pathOrUrl, body, false);
    }

    if (response.status >= 400) {
      throw new StrivenApiError(response.status, method, url, text);
    }

    if (!text.trim()) return {} as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Expected JSON from Striven but received non-JSON text from ${url}: ${text.slice(0, 500)}`);
    }
  }

  async getAccessToken(): Promise<string> {
    const env = getEnv();
    if (!env.strivenClientId || !env.strivenClientSecret) {
      throw new Error("Missing STRIVEN_CLIENT_ID or STRIVEN_CLIENT_SECRET.");
    }

    if (tokenCache?.accessToken && Date.now() < tokenCache.expiresAt - 60_000) {
      return tokenCache.accessToken;
    }

    const url = `${this.baseUrl}/accesstoken`;
    const basic = Buffer.from(`${env.strivenClientId}:${env.strivenClientSecret}`).toString("base64");
    const form = new URLSearchParams();
    form.set("grant_type", "client_credentials");
    form.set("ClientId", env.strivenClientId);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: "application/json"
      },
      body: form,
      cache: "no-store"
    });
    const text = await response.text();

    if (!response.ok) {
      throw new StrivenApiError(response.status, "POST", url, text);
    }

    const json = JSON.parse(text || "{}");
    const accessToken = String(json.access_token || json.AccessToken || json.token || "");
    if (!accessToken) throw new Error(`Striven token refresh response did not include an access token: ${text}`);

    const expiresIn = Number(json.expires_in || json.ExpiresIn || 3600);
    tokenCache = {
      accessToken,
      expiresAt: Date.now() + Math.max(60, expiresIn) * 1000
    };

    return accessToken;
  }

  clearToken() {
    tokenCache = null;
  }

  private buildUrl(pathOrUrl: string) {
    const raw = String(pathOrUrl || "").trim();
    if (!raw) throw new Error("Missing Striven path or URL.");
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${this.baseUrl}${raw.startsWith("/") ? raw : "/" + raw}`;
  }
}

export const strivenClient = new StrivenClient();
