/**
 * Fetch a URL, parse the JSON response, and throw a structured error on !response.ok.
 */
export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const error = new Error(`HTTP ${response.status}`);
    (error as Error & { status: number; body: unknown }).status = response.status;
    (error as Error & { status: number; body: unknown }).body = body;
    throw error;
  }

  return response.json() as Promise<T>;
}

/**
 * Join truthy class names with spaces.
 */
export function cn(...args: Array<string | undefined | null | false>): string {
  return args.filter(Boolean).join(" ");
}

/**
 * Return a human-readable relative timestamp like "2 days ago".
 */
export function timeAgo(date: Date | string | number): string {
  const then = typeof date === "object" ? date.getTime() : new Date(date).getTime();
  const diffMs = Date.now() - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) {
    return "just now";
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  }
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  }
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) {
    return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  }
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) {
    return `${diffMonth} month${diffMonth === 1 ? "" : "s"} ago`;
  }
  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear} year${diffYear === 1 ? "" : "s"} ago`;
}

/**
 * Stub i18n hook — returns the key verbatim. Translations land in a future PR.
 */
export function useI18n(key: string): string {
  return key;
}
