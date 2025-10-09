<script lang="ts">
    import type { Connection, Node } from "../types";

    type Props = {
        connections: Connection[];
        nodes: Node[];
        onView: (id: number) => void;
        onEdit: (connection: Connection) => void;
        onDelete: (id: number) => void;
        onFindPoint: (connection: Connection) => void;
        onEditRoute: (id: number) => void;
        editingConnectionId?: number | null;
    };

    const {
        connections,
        nodes,
        onView,
        onEdit,
        onDelete,
        onFindPoint,
        onEditRoute,
        editingConnectionId = null,
    } = $props<Props>();

    // Search and filter states
    let searchQuery = $state("");
    let statusFilter = $state("all");
    let currentPage = $state(1);
    let itemsPerPage = $state(10);

    const nodeMap = $derived(new Map(nodes.map((node) => [node.id, node])));

    // Filtered connections based on search and filter
    const filteredConnections = $derived(
        (() => {
            let filtered = connections || [];

            // Apply search filter
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase();
                filtered = filtered.filter((conn) => {
                    const deviceA =
                        nodeMap.get(conn.deviceAId)?.name?.toLowerCase() || "";
                    const deviceB =
                        nodeMap.get(conn.deviceBId)?.name?.toLowerCase() || "";
                    const description = conn.description?.toLowerCase() || "";

                    return (
                        description.includes(query) ||
                        deviceA.includes(query) ||
                        deviceB.includes(query)
                    );
                });
            }

            // Apply status filter (you can extend this for different statuses)
            if (statusFilter !== "all") {
                // Example: filter by editing status or other criteria
                if (statusFilter === "editing") {
                    filtered = filtered.filter(
                        (conn) => editingConnectionId === conn.id,
                    );
                }
            }

            return filtered;
        })(),
    );

    // Pagination calculations
    const totalItems = $derived(filteredConnections.length);
    const totalPages = $derived(Math.ceil(totalItems / itemsPerPage));
    const startIndex = $derived((currentPage - 1) * itemsPerPage);
    const endIndex = $derived(Math.min(startIndex + itemsPerPage, totalItems));
    const paginatedConnections = $derived(
        filteredConnections.slice(startIndex, endIndex),
    );

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

    // Reset to first page when search changes
    $effect(() => {
        searchQuery;
        statusFilter;
        currentPage = 1;
    });

    // Generate page numbers for pagination
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
</script>

<div class="max-w-7xl mx-auto">
    <!-- Search, Filter, and Controls -->
    <div
        class="sticky top-0 z-10 mb-6 flex flex-col items-center justify-between gap-4 bg-base-100 py-4 md:flex-row"
    >
        <div class="form-control w-full md:w-auto md:flex-grow">
            <div class="relative">
                <input
                    type="text"
                    placeholder="Search connections..."
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
                    bind:value={statusFilter}
                >
                    <option value="all">All Connections</option>
                    <option value="editing">Being Edited</option>
                </select>
            </div>
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
        </div>
    </div>

    <!-- Cards Layout -->
    <div
        class="grid gap-4"
        style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))"
    >
        {#each paginatedConnections as conn (conn.id)}
            <div
                data-connection-id={conn.id}
                class="card bg-base-100 shadow-md border transition-all duration-300 {editingConnectionId ===
                conn.id
                    ? 'border-yellow-500 border-2'
                    : 'border-base-300'}"
            >
                <div class="card-body p-4">
                    <h3 class="card-title text-base font-bold truncate">
                        {conn.description}
                        {#if editingConnectionId === conn.id}
                            <span class="badge badge-warning badge-sm ml-2"
                                >Editing</span
                            >
                        {/if}
                    </h3>

                    <div class="text-sm space-y-2 mt-2">
                        <div class="flex justify-between">
                            <span class="font-semibold text-base-content/70"
                                >Device A:</span
                            >
                            <span class="font-mono text-right"
                                >{nodeMap.get(conn.deviceAId)?.name ||
                                    "Unknown"}</span
                            >
                        </div>
                        <div class="flex justify-between">
                            <span class="font-semibold text-base-content/70"
                                >Device B:</span
                            >
                            <span class="font-mono text-right"
                                >{nodeMap.get(conn.deviceBId)?.name ||
                                    "Unknown"}</span
                            >
                        </div>
                        <div>
                            <span class="font-semibold text-base-content/70"
                                >ODP Path:</span
                            >
                            {#if conn.odpPath && conn.odpPath.length > 0}
                                <div class="text-xs font-mono mt-1">
                                    {conn.odpPath
                                        .map(
                                            (odp, index) =>
                                                `${index + 1}. ODP-${odp.id}`,
                                        )
                                        .join(" → ")}
                                </div>
                            {:else}
                                <span
                                    class="text-base-content/50 italic text-xs"
                                    >No ODP path</span
                                >
                            {/if}
                        </div>
                    </div>

                    <div class="card-actions justify-end mt-4">
                        <div class="flex flex-wrap gap-1 justify-end">
                            <button
                                class="btn btn-xs btn-success"
                                onclick={() => onView(conn.id)}
                            >
                                View
                            </button>
                            <button
                                class="btn btn-xs btn-info"
                                onclick={() => onEdit(conn)}
                            >
                                Edit
                            </button>
                            <button
                                class="btn btn-xs btn-secondary"
                                onclick={() => onEditRoute(conn.id)}
                            >
                                Route
                            </button>
                            <button
                                class="btn btn-xs btn-warning"
                                onclick={() => onFindPoint(conn)}
                            >
                                Find
                            </button>
                            <button
                                class="btn btn-xs btn-error"
                                onclick={() => onDelete(conn.id)}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        {:else}
            <div class="col-span-full text-center py-16 bg-base-200 rounded-lg">
                <p class="text-lg font-semibold">
                    {#if searchQuery.trim()}
                        No connections found matching your search.
                    {:else}
                        No connections available.
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
                Showing {startIndex + 1}-{endIndex} of {totalItems} connections
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
                        <button class="join-item btn btn-sm btn-disabled"
                            >…</button
                        >
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
