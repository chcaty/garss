export function createPwa(context) {
  const { state, byId, navigator, window, document, fetch, showToast, CANDIDATE_ENDPOINT, ROUTE_ENDPOINT } = context;
  function updateConnectionStatus() {
    const offline = !navigator.onLine;
    document.body.classList.toggle("is-offline", offline);
    byId("connection-status").textContent = offline
      ? "离线模式 · 使用最近一次缓存目录"
      : "在线 · 目录会优先读取最新版本";
  }

  async function wirePwa() {
    updateConnectionStatus();
    window.addEventListener("online", updateConnectionStatus);
    window.addEventListener("offline", updateConnectionStatus);

    const installButton = byId("install-app");
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      installButton.hidden = false;
    });
    installButton.addEventListener("click", async () => {
      if (!state.deferredInstallPrompt) return;
      state.deferredInstallPrompt.prompt();
      await state.deferredInstallPrompt.userChoice;
      state.deferredInstallPrompt = null;
      installButton.hidden = true;
    });
    window.addEventListener("appinstalled", () => {
      state.deferredInstallPrompt = null;
      installButton.hidden = true;
      showToast("审核台 App 已安装");
    });

    if (
      "serviceWorker" in navigator &&
      (window.location.protocol === "https:" ||
        ["localhost", "127.0.0.1"].includes(window.location.hostname))
    ) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        // Cache already-loaded catalogs when the first visit gains a controller.
        const endpoints = [CANDIDATE_ENDPOINT];
        if (state.routesLoaded || state.routesLoading) endpoints.push(ROUTE_ENDPOINT);
        Promise.allSettled(endpoints.map((url) => fetch(url, { cache: "no-cache" })));
      });
      try {
        await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
      } catch {
        showToast("离线缓存初始化失败，在线审核仍可正常使用");
      }
    }
  }


  return { wirePwa };
}
