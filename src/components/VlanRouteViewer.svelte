<script lang="ts">
    import { createEventDispatcher } from "svelte";

    const dispatch = createEventDispatcher();

    type VlanTraceData = { [key: string]: { path: string[] }[] };
    let { vlanTraceData }: { vlanTraceData: VlanTraceData } = $props();

    // Search state
    let searchQuery = $state("");

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

    // Plain function for filtering, to be called from the template
    function getFilteredVlanGroups(groups: any[], query: string) {
        if (!query.trim()) {
            return groups;
        }
        const lowerQuery = query.toLowerCase();
        return groups.filter((group) =>
            group.vlanId.toString().toLowerCase().includes(lowerQuery),
        );
    }

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
</script>

<div class="p-2">
    <div class="flex justify-between items-center mb-4">
        <div class="form-control w-full md:w-auto md:flex-grow">
            <input
                type="text"
                placeholder="Search VLAN ID..."
                class="input input-bordered w-full pr-10"
                bind:value={searchQuery}
            />
        </div>

        <button class="btn btn-sm btn-ghost" onclick={clearHighlight}
            >Clear Highlight</button
        >
    </div>

    <div
        class="grid gap-4"
        style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))"
    >
        {#each getFilteredVlanGroups(allVlanGroups, searchQuery) as group (group.vlanId)}
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
                <p class="text-lg font-semibold">No VLANs found.</p>
            </div>
        {/each}
    </div>
</div>
