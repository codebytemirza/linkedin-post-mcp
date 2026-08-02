import type { Dashboard } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function fetchDashboard(token: string): Promise<Dashboard> {
  const res = await fetch("/api/dashboard", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (res.status === 401) {
    throw new ApiError(401, "Invalid token");
  }
  if (!res.ok) {
    throw new ApiError(res.status, `Request failed (${res.status})`);
  }
  return (await res.json()) as Dashboard;
}