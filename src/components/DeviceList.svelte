<script>
  let { baseUrl } = $props();

  let allNodes = $state([]);
  let currentFilter = $state(false);
  let lastUpdated = $state("Never");
  let connectionStatus = $state("Connecting...");
  let connectionError = $state(null);

  $effect(() => {
    const eventSourceUrl = `${baseUrl}/nodes/status/events`;
    if (!baseUrl) {
      connectionError = {
        title: "Configuration Error",
        subtitle: "BASE_API_URL environment variable is missing.",
      };
      return;
    }

    const eventSource = new EventSource(eventSourceUrl);

    eventSource.onopen = () => {
      connectionStatus = "Live Monitoring";
      connectionError = null;
      lastUpdated = new Date().toLocaleTimeString();
    };

    eventSource.onerror = () => {
      connectionStatus = "Connection Lost";
      connectionError = {
        title: "Connection Lost",
        subtitle: "Attempting to reconnect...",
      };
    };

    eventSource.addEventListener("update-list", (event) => {
      try {
        allNodes = JSON.parse(event.data);
        lastUpdated = new Date().toLocaleTimeString();
        connectionError = null;
      } catch (e) {
        console.error("Failed to parse or render SSE data:", e);
        connectionError = {
          title: "Data Error",
          subtitle: "Received invalid data from server.",
        };
      }
    });

    return () => {
      eventSource.close();
    };
  });

  const filteredNodes = $derived(
    currentFilter
      ? allNodes.filter((node) => node.status !== 1)
      : allNodes
  );

  const onlineCount = $derived(allNodes.filter((node) => node.status === 1).length);
  const offlineCount = $derived(allNodes.filter((node) => node.status !== 1).length);
  const interfacesCount = $derived(allNodes.reduce(
    (sum, node) => sum + (node.interfaces?.length || 0),
    0
  ));
  const locationsCount = $derived(new Set(
    allNodes.map((node) => node.popLocation).filter(Boolean)
  ).size);

</script>

<div class="container mx-auto px-4 py-8">
  <!-- Header -->
  <div class="text-center mb-12">
    <div class="flex items-center justify-center gap-3 mb-4">
      <div
        class="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center shadow-lg"
      >
        <svg
          class="w-6 h-6 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          ></path>
        </svg>
      </div>
    </div>
    <h1 class="text-4xl font-bold text-base-content mb-2">Laros Watch</h1>
    <p class="text-base-content/70 text-lg">Network Monitoring Dashboard</p>
    <div class="flex items-center justify-center gap-4 mt-4">
      <div class="badge badge-success gap-2">
        <div class="w-2 h-2 bg-success rounded-full animate-pulse"></div>
        {connectionStatus}
      </div>
      <div class="text-sm text-base-content/60">
        Last updated: {lastUpdated}
      </div>
    </div>
  </div>

  <!-- Stats Overview -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
    <div class="bg-base-100 rounded-2xl p-6 shadow-xl border border-base-300">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-base-content/60 text-sm font-medium">Online</p>
          <p class="text-2xl font-bold text-success">{onlineCount}</p>
        </div>
        <div
          class="w-12 h-12 bg-success/20 rounded-full flex items-center justify-center"
        >
          <svg
            class="w-6 h-6 text-success"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
        </div>
      </div>
    </div>

    <div class="bg-base-100 rounded-2xl p-6 shadow-xl border border-base-300">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-base-content/60 text-sm font-medium">Offline</p>
          <p class="text-2xl font-bold text-error">{offlineCount}</p>
        </div>
        <div
          class="w-12 h-12 bg-error/20 rounded-full flex items-center justify-center"
        >
          <svg
            class="w-6 h-6 text-error"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
            ></path>
          </svg>
        </div>
      </div>
    </div>

    <div class="bg-base-100 rounded-2xl p-6 shadow-xl border border-base-300">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-base-content/60 text-sm font-medium">Interfaces</p>
          <p class="text-2xl font-bold text-info">{interfacesCount}</p>
        </div>
        <div
          class="w-12 h-12 bg-info/20 rounded-full flex items-center justify-center"
        >
          <svg
            class="w-6 h-6 text-info"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            ></path>
          </svg>
        </div>
      </div>
    </div>

    <div class="bg-base-100 rounded-2xl p-6 shadow-xl border border-base-300">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-base-content/60 text-sm font-medium">Locations</p>
          <p class="text-2xl font-bold text-warning">{locationsCount}</p>
        </div>
        <div
          class="w-12 h-12 bg-warning/20 rounded-full flex items-center justify-center"
        >
          <svg
            class="w-6 h-6 text-warning"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            ></path>
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            ></path>
          </svg>
        </div>
      </div>
    </div>
  </div>

  <!-- Devices Section -->
  <div class="bg-base-100 rounded-2xl shadow-xl border border-base-300 p-6">
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold text-base-content">Network Devices</h2>
      <div class="flex items-center gap-3">
        <label class="label cursor-pointer gap-2">
          <span class="label-text">Show offline only</span>
          <input
            type="checkbox"
            class="toggle toggle-sm"
            bind:checked={currentFilter}
            on:change={toggleFilter}
          />
        </label>
      </div>
    </div>

    <!-- Devices List -->
    <div id="devices-list-container">
      {#if connectionError}
        <div class="alert alert-error shadow-lg rounded-xl">
          <div class="flex items-center gap-3">
            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              ></path>
            </svg>
            <div>
              <h3 class="font-bold">{connectionError.title}</h3>
              <p class="text-sm">{connectionError.subtitle}</p>
            </div>
          </div>
        </div>
      {:else if filteredNodes.length === 0}
        <div class="text-center py-16">
          <span class="loading loading-spinner loading-lg text-primary"></span>
          <p class="mt-4 text-base-content/70">
            Connecting to monitoring stream...
          </p>
        </div>
      {:else}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {#each filteredNodes as node (node.ipMgmt)}
            {@const isOnline = node.status === 1}
            {@const statusColor = isOnline ? "success" : "error"}
            {@const statusText = isOnline ? "Online" : "Offline"}
            {@const interfacesUp =
              node.interfaces?.filter((iface) => iface.ifOperStatus === 1)
                .length || 0}
            {@const interfacesTotal = node.interfaces?.length || 0}
            <div
              class="bg-base-200 rounded-xl p-6 border border-base-300 hover:shadow-lg transition-all duration-300"
            >
              <div class="flex items-start justify-between mb-4">
                <div class="flex items-center gap-4">
                  <div
                    class="w-12 h-12 bg-{statusColor}/20 rounded-xl flex items-center justify-center"
                  >
                    <svg
                      class="w-6 h-6 text-{statusColor}"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      ></path>
                    </svg>
                  </div>
                  <div>
                    <h3 class="font-bold text-lg text-base-content">
                      {node.name}
                    </h3>
                    <p class="text-base-content/60">
                      {node.popLocation || "Unknown Location"}
                    </p>
                    <p class="text-sm text-primary font-mono">{node.ipMgmt}</p>
                  </div>
                </div>
                <div class="badge badge-{statusColor} gap-2">
                  <div
                    class="w-2 h-2 bg-{statusColor} rounded-full {isOnline
                      ? 'animate-pulse'
                      : ''}"
                  ></div>
                  {statusText}
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="text-center">
                  <p class="text-2xl font-bold text-base-content">
                    {interfacesUp}/{interfacesTotal}
                  </p>
                  <p class="text-sm text-base-content/60">Interfaces Up</p>
                </div>
                <div class="text-center">
                  <p class="text-2xl font-bold text-base-content">
                    {isOnline ? "99.9%" : "0%"}
                  </p>
                  <p class="text-sm text-base-content/60">Uptime</p>
                </div>
              </div>

              {#if node.interfaces?.length > 0}
                <div class="collapse collapse-arrow bg-base-100 rounded-lg">
                  <input type="checkbox" class="peer" />
                  <div
                    class="collapse-title text-sm font-medium peer-checked:bg-base-200/50"
                  >
                    Interfaces ({interfacesTotal})
                  </div>
                  <div class="collapse-content">
                    <div class="space-y-2 pt-2">
                      {#each node.interfaces as iface}
                        <div
                          class="flex items-center justify-between py-2 px-3 bg-base-200 rounded-lg"
                        >
                          <div class="flex-1">
                            <p class="font-mono text-sm">
                              {iface.ifName || "N/A"}
                            </p>
                            <p class="text-xs text-base-content/70 truncate">
                              {iface.ifDescr || "No description"}
                            </p>
                          </div>
                          <div class="flex items-center gap-3">
                            <div class="text-xs font-mono text-base-content/70">
                              <div>Rx: {iface.opticalRx || "N/A"}</div>
                              <div>Tx: {iface.opticalTx || "N/A"}</div>
                            </div>
                            <div
                              class="badge badge-xs {iface.ifOperStatus === 1
                                ? 'badge-success'
                                : 'badge-error'}"
                            >
                              {iface.ifOperStatus === 1 ? "UP" : "DOWN"}
                            </div>
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>
              {:else}
                <div
                  class="text-center py-4 text-sm text-base-content/60 bg-base-100 rounded-lg"
                >
                  No interfaces configured
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
