
<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { Node, Connection } from "$lib/types";
    import { deleteCustomRoute as apiDeleteCustomRoute } from "$lib/api";

    let { connections, allNodes } = $props<{ connections: Connection[]; allNodes: Node[] }>();

    const dispatch = createEventDispatcher();

    const startDrawing = (connection: Connection) => {
        dispatch("startdrawing", connection);
    };

    const deleteCustomRoute = async (connId: number) => {
        if (!confirm("Are you sure you want to delete this custom route?")) return;
        try {
            await apiDeleteCustomRoute(connId);
            dispatch("delete", connId);
        } catch (e) {
            console.error("Failed to delete custom route:", e);
            alert(`Failed to delete custom route: ${(e as Error).message}`);
        }
    };
</script>

<div class="modal modal-open" role="dialog">
    <div class="modal-box w-11/12 max-w-5xl">
        <h3 class="font-bold text-lg">Select Connection to Edit</h3>
        <div class="overflow-x-auto max-h-[60vh] py-4">
            <table class="table table-zebra w-full">
                <thead>
                    <tr>
                        <th>Connection</th>
                        <th>Has Custom Route</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {#each connections as conn}
                        {@const nodeA = allNodes.find(
                            (n) => n.deviceId === conn.deviceAId,
                        )}
                        {@const nodeB = allNodes.find(
                            (n) => n.deviceId === conn.deviceBId,
                        )}
                        <tr>
                            <td>
                                <div class="font-bold">
                                    {conn.description}
                                </div>
                                <div class="text-sm opacity-50">
                                    {nodeA?.name ?? "?"} &harr; {nodeB?.name ?? "?"}
                                </div>
                            </td>
                            <td>
                                {#if conn.customRoute?.coordinates?.length > 0}
                                    <span class="badge badge-success">Yes</span>
                                {:else}
                                    <span class="badge badge-ghost">No</span>
                                {/if}
                            </td>
                            <td>
                                <button
                                    class="btn btn-sm btn-info"
                                    onclick={() => startDrawing(conn)}
                                >
                                    {conn.customRoute?.coordinates?.length > 0
                                        ? "Edit"
                                        : "Create"}
                                </button>
                                {#if conn.customRoute?.coordinates?.length > 0}
                                    <button
                                        class="btn btn-sm btn-error ml-2"
                                        onclick={() => deleteCustomRoute(conn.id)}
                                    >
                                        Delete
                                    </button>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        <div class="modal-action">
            <button class="btn" onclick={() => dispatch("close")}>Close</button>
        </div>
    </div>
</div>
