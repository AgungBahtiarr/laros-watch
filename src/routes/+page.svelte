<script>
    import Header from "$lib/components/Header.svelte";
    import StatsCard from "$lib/components/StatsCard.svelte";
    import DeviceCard from "$lib/components/DeviceCard.svelte";

    import { PUBLIC_API_BASE_URL } from "$env/static/public";
    let allNodes = $state([]);
    let currentFilter = $state(false);
    let lastUpdated = $state("Never");
    let connectionStatus = $state("Connecting...");
    let connectionError = $state(null);

    const fetchNodes = async () => {
        try {
            const response = await fetch(`${PUBLIC_API_BASE_URL}/nodes`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            allNodes = await response.json();
            lastUpdated = new Date().toLocaleTimeString();
            connectionError = null;
        } catch (e) {
            console.error("Failed to fetch nodes data:", e);
            connectionError = {
                title: "Data Fetch Error",
                subtitle: "Could not retrieve data from the server.",
            };
        }
    };

    $effect(() => {
        const eventSourceUrl = `${PUBLIC_API_BASE_URL}/nodes/status/events`;
        if (!PUBLIC_API_BASE_URL) {
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

        fetchNodes();

        eventSource.addEventListener("notification", (event) => {
            const data = JSON.parse(event.data);
            const updates = new Map();

            // Group all changes by ipMgmt
            if (data.nodeChanges) {
                for (const change of data.nodeChanges) {
                    if (!updates.has(change.ipMgmt)) {
                        updates.set(change.ipMgmt, {
                            node: {},
                            interfaces: new Map(),
                        });
                    }
                    updates.get(change.ipMgmt).node = change;
                }
            }

            if (data.interfaceChanges) {
                for (const change of data.interfaceChanges) {
                    if (!updates.has(change.ipMgmt)) {
                        updates.set(change.ipMgmt, {
                            node: {},
                            interfaces: new Map(),
                        });
                    }
                    updates
                        .get(change.ipMgmt)
                        .interfaces.set(change.ifIndex, change);
                }
            }

            // Apply updates in a batched manner
            for (const [
                ipMgmt,
                { node: nodeChanges, interfaces: interfaceChanges },
            ] of updates) {
                const nodeIndex = allNodes.findIndex(
                    (n) => n.ipMgmt === ipMgmt,
                );

                if (nodeIndex !== -1) {
                    const currentNode = allNodes[nodeIndex];
                    const newInterfaces = [...currentNode.interfaces];

                    for (const [ifIndex, change] of interfaceChanges) {
                        const ifaceIndex = newInterfaces.findIndex(
                            (i) => i.ifIndex === ifIndex,
                        );
                        if (ifaceIndex !== -1) {
                            newInterfaces[ifaceIndex] = {
                                ...newInterfaces[ifaceIndex],
                                ...change,
                            };
                        } else {
                            newInterfaces.push(change);
                        }
                    }

                    allNodes[nodeIndex] = {
                        ...currentNode,
                        ...nodeChanges,
                        interfaces: newInterfaces,
                    };
                } else {
                    // This case is for new nodes, assuming nodeChanges contains the full new node object
                    allNodes.push({
                        ...nodeChanges,
                        interfaces: Array.from(interfaceChanges.values()),
                    });
                }
            }

            lastUpdated = new Date().toLocaleTimeString();
        });

        // Initial data load
        fetchNodes();

        return () => {
            eventSource.close();
        };
    });

    const filteredNodes = $derived(
        currentFilter
            ? allNodes.filter((node) => node.status !== true)
            : allNodes,
    );

    const onlineCount = $derived(
        allNodes.filter((node) => node.status === true).length,
    );
    const offlineCount = $derived(
        allNodes.filter((node) => node.status !== true).length,
    );
    const interfacesCount = $derived(
        allNodes.reduce((sum, node) => sum + (node.interfaces?.length || 0), 0),
    );
    const locationsCount = $derived(
        new Set(allNodes.map((node) => node.popLocation).filter(Boolean)).size,
    );
</script>

<div
    class="min-h-screen bg-gradient-to-br from-base-300 via-base-200 to-base-100"
>
    <div class="container mx-auto px-4 py-8">
        <Header {connectionStatus} {lastUpdated} />

        <!-- Stats Overview -->
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            <StatsCard label="Online" value={onlineCount} color="success">
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
            </StatsCard>

            <StatsCard label="Offline" value={offlineCount} color="error">
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
            </StatsCard>

            <StatsCard label="Interfaces" value={interfacesCount} color="info">
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
            </StatsCard>

            <StatsCard label="Locations" value={locationsCount} color="warning">
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
            </StatsCard>
        </div>

        <!-- Devices Section -->
        <div
            class="bg-base-100 rounded-2xl shadow-xl border border-base-300 p-6"
        >
            <div
                class="flex flex-col sm:flex-row items-center justify-between mb-6"
            >
                <h2 class="text-2xl font-bold text-base-content mb-4 sm:mb-0">
                    Network Devices
                </h2>
                <div class="flex gap-4">
                    <div class="flex items-center gap-3">
                        <label class="label cursor-pointer gap-2">
                            <span class="label-text">Refresh</span>
                            <button onclick={fetchNodes}>click</button>
                        </label>
                    </div>
                    <div class="flex items-center gap-3">
                        <label class="label cursor-pointer gap-2">
                            <span class="label-text">Show offline only</span>
                            <input
                                type="checkbox"
                                class="toggle toggle-sm"
                                bind:checked={currentFilter}
                            />
                        </label>
                    </div>
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
                                <h3 class="font-bold">
                                    {connectionError.title}
                                </h3>
                                <p class="text-sm">
                                    {connectionError.subtitle}
                                </p>
                            </div>
                        </div>
                    </div>
                {:else if filteredNodes.length === 0}
                    <div class="text-center py-16">
                        <span
                            class="loading loading-spinner loading-lg text-primary"
                        ></span>
                        <p class="mt-4 text-base-content/70">
                            Connecting to monitoring stream...
                        </p>
                    </div>
                {:else}
                    <div
                        class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6"
                    >
                        {#each filteredNodes as node (node.ipMgmt)}
                            <DeviceCard {node} />
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>
    <div class="text-center mt-8 text-base-content/50">
        <p class="text-sm">LarosNdoo Network Monitoring System</p>
    </div>
</div>
