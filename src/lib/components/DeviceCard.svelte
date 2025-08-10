<script>
    export let node;

    let isOpen = false;

    // Reactive statements to ensure UI updates when `node` data changes
    $: isOnline = node.status === true;
    $: statusColor = isOnline ? "success" : "error";
    $: statusText = isOnline ? "Online" : "Offline";
    $: interfacesUp =
        node.interfaces?.filter((iface) => iface.ifOperStatus === true)
            .length || 0;
    $: interfacesTotal = node.interfaces?.length || 0;
</script>

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
                <h3 class="font-bold text-lg text-base-content">{node.name}</h3>
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

    {#if interfacesTotal > 0}
        <div class="bg-base-100 rounded-lg">
            <button
                class="w-full text-left p-3 flex justify-between items-center text-sm font-medium"
                on:click={() => (isOpen = !isOpen)}
            >
                <span>Interfaces ({interfacesTotal})</span>
                <svg
                    class="w-5 h-5 transition-transform transform {isOpen
                        ? 'rotate-180'
                        : ''}"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 9l-7 7-7-7"
                    ></path>
                </svg>
            </button>

            {#if isOpen}
                <div class="p-3 border-t border-base-200">
                    <div class="space-y-2">
                        {#each node.interfaces as iface (iface.ifIndex)}
                            <div
                                class="flex items-center justify-between py-2 px-3 bg-base-200 rounded-lg"
                            >
                                <div class="flex-1 overflow-hidden">
                                    <p class="font-mono text-sm truncate">
                                        {iface.ifName || "N/A"}
                                    </p>
                                    <p
                                        class="text-xs text-base-content/70 truncate"
                                    >
                                        {iface.ifDescr || "No description"}
                                    </p>
                                </div>
                                <div class="flex items-center gap-3 ml-2">
                                    <div
                                        class="text-xs font-mono text-base-content/70"
                                    >
                                        <div>
                                            Rx: {iface.opticalRx || "N/A"}
                                        </div>
                                        <div>
                                            Tx: {iface.opticalTx || "N/A"}
                                        </div>
                                    </div>
                                    <div
                                        class="badge badge-xs {iface.ifOperStatus ===
                                        1
                                            ? 'badge-success'
                                            : 'badge-error'}"
                                    >
                                        {iface.ifOperStatus === 1
                                            ? "UP"
                                            : "DOWN"}
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
    {:else}
        <div
            class="text-center py-4 text-sm text-base-content/60 bg-base-100 rounded-lg"
        >
            No interfaces configured
        </div>
    {/if}
</div>
