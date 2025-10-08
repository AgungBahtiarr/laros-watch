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

    const nodeMap = $derived(new Map(nodes.map((node) => [node.id, node])));
</script>

<div class="overflow-x-auto">
    <table class="table w-full">
        <thead>
            <tr>
                <th>Description</th>
                <th>Device A</th>
                <th>Device B</th>
                <th>ODP Path</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            {#each connections as conn}
                <tr
                    data-connection-id={conn.id}
                    class={editingConnectionId === conn.id
                        ? "bg-yellow-100 border-l-4 border-yellow-500"
                        : ""}
                >
                    <td>
                        {conn.description}
                        {#if editingConnectionId === conn.id}
                            <span class="badge badge-warning badge-sm ml-2"
                                >Editing Route</span
                            >
                        {/if}
                    </td>
                    <td>{nodeMap.get(conn.deviceAId)?.name || "Unknown"}</td>
                    <td>{nodeMap.get(conn.deviceBId)?.name || "Unknown"}</td>
                    <td>
                        {#if conn.odpPath && conn.odpPath.length > 0}
                            <div class="text-xs">
                                {conn.odpPath
                                    .map(
                                        (odp, index) =>
                                            `${index + 1}. ODP-${odp.id}`,
                                    )
                                    .join(" → ")}
                            </div>
                        {:else}
                            <span class="text-gray-500 italic">No ODP path</span
                            >
                        {/if}
                    </td>
                    <td class="flex gap-2">
                        <button
                            class="btn btn-sm btn-success"
                            onclick={() => onView(conn.id)}
                        >
                            View
                        </button>
                        <button
                            class="btn btn-sm btn-info"
                            onclick={() => onEdit(conn)}
                        >
                            Edit
                        </button>
                        <button
                            class="btn btn-sm btn-secondary"
                            onclick={() => onEditRoute(conn.id)}
                        >
                            Edit Route
                        </button>
                        <button
                            class="btn btn-sm btn-error"
                            onclick={() => onDelete(conn.id)}
                        >
                            Delete
                        </button>
                        <button
                            class="btn btn-sm btn-warning"
                            onclick={() => onFindPoint(conn)}
                        >
                            Find Point
                        </button>
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>
