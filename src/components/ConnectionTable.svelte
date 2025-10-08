<script lang="ts">
    import type { Connection, Node } from "../types";

    type Props = {
        connections: Connection[];
        nodes: Node[];
        onView: (id: number) => void;
        onEdit: (connection: Connection) => void;
        onDelete: (id: number) => void;
        onFindPoint: (connection: Connection) => void;
    };

    const { connections, nodes, onView, onEdit, onDelete, onFindPoint } =
        $props<Props>();

    const nodeMap = $derived(new Map(nodes.map((node) => [node.id, node])));
</script>

<div class="overflow-x-auto">
    <table class="table w-full">
        <thead>
            <tr>
                <th>Description</th>
                <th>Device A</th>
                <th>Device B</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            {#each connections as conn}
                <tr data-connection-id={conn.id}>
                    <td>{conn.description}</td>
                    <td>{nodeMap.get(conn.deviceAId)?.name || "Unknown"}</td>
                    <td>{nodeMap.get(conn.deviceBId)?.name || "Unknown"}</td>
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
