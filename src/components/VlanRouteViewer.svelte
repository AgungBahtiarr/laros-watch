<script lang="ts">
    import { createEventDispatcher } from "svelte";

    const dispatch = createEventDispatcher();

    type VlanTraceData = { [key: string]: { path: string[] }[] };
    let { vlanTraceData }: { vlanTraceData: VlanTraceData } = $props();

    // Search and pagination states
    let searchQuery = $state("");
    let currentPage = $state(1);
    let itemsPerPage = $state(10);

    // Base data processing
    const allVlanGroups = vlanTraceData
        ? Object.keys(vlanTraceData).map((vlanKey) => {
              const pathData = vlanTraceData[vlanKey];
              const vlanId = vlanKey.replace("vlan_", "");
              const paths =
                  pathData && pathData.length > 0
                      ? pathData.map((p) => p.path)
                      : [];
              const hasPaths = paths.length > 0;
              return { vlanId, paths, hasPaths };
          })
        : [];

    // Filtered VLAN groups
    const filteredVlanGroups = $derived(
        searchQuery.trim()
            ? allVlanGroups.filter((group) =>
                  group.vlanId.toString().toLowerCase().includes(searchQuery.toLowerCase()),
              )
            : allVlanGroups
    );

    // Pagination calculations
    const totalItems = $derived(filteredVlanGroups.length);
    const totalPages = $derived(Math.ceil(totalItems / itemsPerPage));
    const startIndex = $derived((currentPage - 1) * itemsPerPage);
    const endIndex = $derived(Math.min(startIndex + itemsPerPage, totalItems));
    const paginatedVlanGroups = $derived(
        filteredVlanGroups.slice(startIndex, endIndex),
    );

    function highlightVlan(paths: string[][]) {
        const pairs = new Set<string>();
        paths.forEach((path) => {
            for (let i = 0; i < path.length - 1; i++) {
                const pair = [path[i], path[i + 1]].sort().join("--");
                pairs.add(pair);
            }
        });
        dispatch("highlightVlan", {
            connectionsToHighlight: Array.from(pairs),
        });
    }

    function clearHighlight() {
        dispatch("highlightVlan", { connectionsToHighlight: [] });
    }

    // Page navigation functions
    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
        }
    }

    function previousPage() {
        if (currentPage > 1) {
            currentPage--;
        }
    }

    function nextPage() {
        if (currentPage < totalPages) {
            currentPage++;
        }
    }

    const getPageNumbers = $derived(() => {
        const pages = [];
        const showPages = 5;

        if (totalPages <= showPages) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            const start = Math.max(1, currentPage - Math.floor(showPages / 2));
            const end = Math.min(totalPages, start + showPages - 1);

            if (start > 1) {
                pages.push(1);
                if (start > 2) pages.push("...");
            }

            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            if (end < totalPages) {
                if (end < totalPages - 1) pages.push("...");
                pages.push(totalPages);
            }
        }

        return pages;
    });

    // Reset to first page when search changes
    $effect(() => {
        searchQuery;
        currentPage = 1;
    });
</script>

<div class="max-w-7xl mx-auto">
    <!-- Search and Controls -->
    <div
        class="sticky top-0 z-10 mb-6 flex flex-col items-center justify-between gap-4 bg-base-100 py-4 md:flex-row"
    >
        <div class="form-control w-full md:w-auto md:flex-grow">
            <div class="relative">
                <input
                    type="text"
                    placeholder="Search VLAN ID..."
                    class="input input-bordered w-full pr-10"
                    bind:value={searchQuery}
                />
                <span
                    class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="w-5 h-5 text-base-content/40"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                        ></path>
                    </svg>
                </span>
            </div>
        </div>
        <div class="flex items-center gap-4">
            <div class="form-control w-full md:w-auto">
                <select
                    class="select select-bordered"
                    bind:value={itemsPerPage}
                >
                    <option value={10}>10 per page</option>
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                </select>
            </div>
            <button class="btn btn-sm btn-ghost" onclick={clearHighlight}
                >Clear Highlight</button
            >
        </div>
    </div>

    <div
        class="grid gap-4"
        style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))"
    >
        {#each paginatedVlanGroups as group (group.vlanId)}
            <div class="card bg-base-100 shadow-md border border-base-300">
                <div class="card-body p-4">
                    <h3 class="card-title text-base font-bold">
                        VLAN {group.vlanId}
                    </h3>

                    <div
                        class="text-sm space-y-2 mt-2 max-h-32 overflow-y-auto pr-2"
                    >
                        {#each group.paths as path}
                            <div
                                class="font-mono text-xs whitespace-normal break-words bg-base-200 p-1 rounded"
                            >
                                {path.join(" → ")}
                            </div>
                        {:else}
                            <p class="italic text-xs">No paths found.</p>
                        {/each}
                    </div>

                    <div class="card-actions justify-end mt-4">
                        {#if group.hasPaths}
                            <button
                                class="btn btn-xs btn-outline"
                                onclick={() => highlightVlan(group.paths)}
                            >
                                View on Map
                            </button>
                        {/if}
                    </div>
                </div>
            </div>
        {:else}
            <div class="col-span-full text-center py-16 bg-base-200 rounded-lg">
                <p class="text-lg font-semibold">
            {#if searchQuery.trim()}
                No VLANs found matching your search.
            {:else}
                No VLANs available.
            {/if}
        </p>
            </div>
        {/each}
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
        <div
            class="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4"
        >
            <div class="text-sm opacity-70">
                Showing {startIndex + 1}-{endIndex} of {totalItems} VLANs
            </div>

            <div class="join">
                <button
                    class="join-item btn btn-sm"
                    class:btn-disabled={currentPage === 1}
                    onclick={previousPage}
                >
                    « Previous
                </button>

                {#each getPageNumbers as pageNum}
                    {#if pageNum === "..."}
                        <button class="join-item btn btn-sm btn-disabled">…</button>
                    {:else}
                        <button
                            class="join-item btn btn-sm"
                            class:btn-active={pageNum === currentPage}
                            onclick={() => goToPage(pageNum)}
                        >
                            {pageNum}
                        </button>
                    {/if}
                {/each}

                <button
                    class="join-item btn btn-sm"
                    class:btn-disabled={currentPage === totalPages}
                    onclick={nextPage}
                >
                    Next »
                </button>
            </div>

            <div class="text-sm opacity-70">
                Page {currentPage} of {totalPages}
            </div>
        </div>
    {/if}
</div>
