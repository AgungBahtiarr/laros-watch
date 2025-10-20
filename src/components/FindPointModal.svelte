<script lang="ts">
    import type { Connection, Node } from "@/types";

    type Props = {
        isOpen: boolean;

        connection: Connection | null;

        nodes: Node[];

        routeDistance: number;

        totalRouteDistance: number;

        onFind: (data: {
            connectionId: number;

            startNodeId: number;

            distance: number;
        }) => void;

        onClose: () => void;
    };

    const {
        isOpen,
        connection,
        nodes,
        routeDistance,
        totalRouteDistance,
        onFind,
        onClose,
    } = $props<Props>();

    let startNodeId = $state(connection?.deviceAId.toString() || "");
    let distance = $state("");

    const nodeMap = $derived(new Map(nodes.map((node) => [node.id, node])));

    function handleSubmit(event) {
        event.preventDefault();
        if (!connection) return;
        onFind({
            connectionId: connection.id,
            startNodeId: parseInt(startNodeId),
            distance: parseFloat(distance),
        });
    }

    $effect(() => {
        if (isOpen) {
            startNodeId = connection?.deviceAId.toString() || "";
            distance = "";
        }
    });

    let dialog = $state();

    $effect(() => {
        if (dialog) {
            if (isOpen) {
                dialog.showModal();
            } else {
                dialog.close();
            }
        }
    });
</script>

{#if connection}
    <dialog
        bind:this={dialog}
        onclose={onClose}
        class="modal modal-bottom sm:modal-middle"
    >
        <div class="modal-box w-full max-w-lg">
            <h3 class="font-bold text-lg">Find Point on Route</h3>
            <form onsubmit={handleSubmit}>
                <div class="form-control mt-2">
                    <div class="flex flex-col gap-2">
                        <label class="label" for="start-node-select"
                            >Start From</label
                        >
                        <select
                            id="start-node-select"
                            class="select select-bordered w-full"
                            bind:value={startNodeId}
                        >
                            {#if nodeMap.get(connection.deviceAId)}
                                <option value={connection.deviceAId}>
                                    {nodeMap.get(connection.deviceAId)!.name}
                                </option>
                            {/if}
                            {#if nodeMap.get(connection.deviceBId)}
                                <option value={connection.deviceBId}>
                                    {nodeMap.get(connection.deviceBId)!.name}
                                </option>
                            {/if}
                        </select>
                    </div>
                </div>
                <div class="form-control mt-2">
                    <div class="flex flex-col gap-2">
                        <label class="label" for="distance-input"
                            >Distance (meters)</label
                        >
                        <input
                            type="number"
                            id="distance-input"
                            class="input input-bordered w-full"
                            required
                            bind:value={distance}
                            max={routeDistance}
                            step="any"
                        />
                        {#if totalRouteDistance > 0}
                            <div class="text-xs text-opacity-75 mt-1 space-y-1">
                                <p>
                                    Map route distance:
                                    <strong>{routeDistance.toFixed(2)} m</strong
                                    >
                                </p>
                                <p>
                                    Total distance (with spare):
                                    <strong
                                        >{totalRouteDistance.toFixed(2)} m</strong
                                    >
                                </p>
                                <p class="italic mt-2">
                                    Note: The distance is measured along the
                                    visible map route.
                                </p>
                            </div>
                        {/if}
                    </div>
                </div>
                <div class="modal-action">
                    <button type="button" class="btn" onclick={onClose}
                        >Cancel</button
                    >
                    <button type="submit" class="btn btn-primary">Find</button>
                </div>
            </form>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>
{/if}
