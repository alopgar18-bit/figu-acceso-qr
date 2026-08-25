const RELOAD_KEY = "figurarte:fresh-reload";
const CLEANUP_KEY = "figurarte:legacy-cache-cleaned";
const SESSION_NOTICE_KEY = "figurarte:session-notice";
const RELOAD_WINDOW_MS = 15_000;
const VERSION_CHECK_INTERVAL_MS = 60_000;
const STALE_MODULE_PATTERN =
  /failed to fetch dynamically imported module|importing a module script failed|loading chunk \d+ failed|error loading dynamically imported module/i;

function assetFingerprint(root: ParentNode): string {
  return Array.from(
    root.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
      'script[type="module"][src], link[rel="modulepreload"][href]',
    ),
  )
    .map((element) =>
      element instanceof HTMLScriptElement ? element.src : element.href,
    )
    .filter((url) => url.includes("/assets/"))
    .sort()
    .join("|");
}

function recentlyReloaded(): boolean {
  const previous = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
  return Number.isFinite(previous) && Date.now() - previous < RELOAD_WINDOW_MS;
}

export async function forceFreshReload(options: { manual?: boolean } = {}): Promise<boolean> {
  if (!options.manual && recentlyReloaded()) return false;
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));

  try {
    const url = new URL(window.location.href);
    url.searchParams.set("__figurarte_reload", Date.now().toString(36));
    await fetch(url.toString(), {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "x-figurarte-version-check": "reload" },
    });
  } finally {
    const destination = new URL(window.location.href);
    destination.searchParams.set("__figurarte_reload", Date.now().toString(36));
    window.location.replace(destination.toString());
  }
  return true;
}

async function removeLegacyBrowserCaches(): Promise<void> {
  if (sessionStorage.getItem(CLEANUP_KEY) === "1") return;
  sessionStorage.setItem(CLEANUP_KEY, "1");

  const work: Array<Promise<unknown>> = [];
  if ("serviceWorker" in navigator) {
    work.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.allSettled(registrations.map((registration) => registration.unregister())),
        ),
    );
  }
  if ("caches" in window) {
    work.push(
      caches.keys().then((names) =>
        Promise.allSettled(names.map((name) => caches.delete(name))),
      ),
    );
  }
  await Promise.allSettled(work);
}

export async function hasNewPublishedVersion(): Promise<boolean> {
  if (document.visibilityState !== "visible" || recentlyReloaded()) return false;

  const currentFingerprint = assetFingerprint(document);
  if (!currentFingerprint) return false;

  try {
    const response = await fetch(window.location.href, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "x-figurarte-version-check": "check" },
    });
    if (!response.ok) return false;

    const nextDocument = new DOMParser().parseFromString(await response.text(), "text/html");
    const nextFingerprint = assetFingerprint(nextDocument);
    if (nextFingerprint && nextFingerprint !== currentFingerprint) {
      return true;
    }
  } catch (error) {
    console.warn("[version] No se pudo comprobar la publicación actual", error);
  }
  return false;
}

async function checkForNewVersion(): Promise<void> {
  if (await hasNewPublishedVersion()) await forceFreshReload();
}

export function installClientRecovery(): () => void {
  void removeLegacyBrowserCaches();

  let lastCheck = 0;
  const checkWhenNeeded = () => {
    if (Date.now() - lastCheck < VERSION_CHECK_INTERVAL_MS) return;
    lastCheck = Date.now();
    void checkForNewVersion();
  };
  const onPreloadError = (event: Event) => {
    event.preventDefault();
    void forceFreshReload();
  };
  const onWindowError = (event: ErrorEvent) => {
    const detail = `${event.message} ${event.error instanceof Error ? event.error.message : ""}`;
    if (STALE_MODULE_PATTERN.test(detail)) void forceFreshReload();
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const detail = reason instanceof Error ? `${reason.name} ${reason.message}` : String(reason);
    if (STALE_MODULE_PATTERN.test(detail)) void forceFreshReload();
  };

  window.addEventListener("vite:preloadError", onPreloadError);
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  window.addEventListener("focus", checkWhenNeeded);
  window.addEventListener("pageshow", checkWhenNeeded);
  document.addEventListener("visibilitychange", checkWhenNeeded);

  return () => {
    window.removeEventListener("vite:preloadError", onPreloadError);
    window.removeEventListener("error", onWindowError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    window.removeEventListener("focus", checkWhenNeeded);
    window.removeEventListener("pageshow", checkWhenNeeded);
    document.removeEventListener("visibilitychange", checkWhenNeeded);
  };
}

export function storeSessionNotice(message: string): void {
  sessionStorage.setItem(SESSION_NOTICE_KEY, message);
}

export function consumeSessionNotice(): string | null {
  const message = sessionStorage.getItem(SESSION_NOTICE_KEY);
  sessionStorage.removeItem(SESSION_NOTICE_KEY);
  return message;
}