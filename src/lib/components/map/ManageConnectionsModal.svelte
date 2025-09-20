
<script lang="ts">
    import Select from "svelte-select";
    import { createEventDispatcher } from "svelte";
    import type { Node, Connection, OdpPoint } from "$lib/types";
    import { updateConnection, deleteConnection as apiDeleteConnection } from "$lib/api";

    let { connections, allNodes, odpPoints } = $props<{ connections: Connection[]; allNodes: Node[]; odpPoints: OdpPoint[] }>();

    const dispatch = createEventDispatcher();

    let manageConnLoading = $state(false);
    let manageConnError = $state<string | null>(null);
    let deletingConnId = $state<number | null>(null);
    let editingConnection = $state<any | null>(null);
    let editConn = $state<{
        id: number | null;
        deviceAId: number | null;
        portAId: number | null;
        deviceBId: number | null;
        portBId: number | null;
        description: string;
        odpPath: number[];
    }>({
        id: null,
        deviceAId: null,
        portAId: null,
        deviceBId: null,
        portBId: null,
        description: "",
        odpPath: [],
    });

    const beginEdit = (conn: any) => {
        manageConnError = null;
        editingConnection = conn;
        editConn = {
            id: conn.id,
            deviceAId: conn.deviceAId,
            portAId: conn.portAId,
            deviceBId: conn.deviceBId,
            portBId: conn.portBId,
            description: conn.description ?? "",
            odpPath: conn.odpPath?.map((odp: any) => odp.id) ?? [],
        };
    };

    const cancelEdit = () => {
        editingConnection = null;
        editConn = {
            id: null,
            deviceAId: null,
            portAId: null,
            deviceBId: null,
            portBId: null,
            description: "",
            odpPath: [],
        };
    };

    const submitEditConnection = async () => {
        manageConnError = null;
        if (
            !editConn.id ||
            !editConn.deviceAId ||
            !editConn.portAId ||
            !editConn.deviceBId ||
            !editConn.portBId
        ) {
            manageConnError = "Please complete all required fields.";
            return;
        }
        manageConnLoading = true;
        try {
            await updateConnection(editConn as unknown as Connection);
            dispatch("update");
            cancelEdit();
        } catch (e) {
            manageConnError = (e as Error).message;
        } finally {
            manageConnLoading = false;
        }
    };

    const deleteConnection = async (id: number) => {
        if (!confirm("Are you sure you want to delete this connection?")) return;
        deletingConnId = id;
        manageConnError = null;
        try {
            await apiDeleteConnection(id);
            dispatch("delete");
        } catch (e) {
            manageConnError = (e as Error).message;
        } finally {
            deletingConnId = null;
        }
    };

    const filterDevices = (q: string) => {
        const s = (q || "").toLowerCase();
        if (!s) return allNodes;
        return allNodes.filter((n: any) => {
            return (
                (n.name && n.name.toLowerCase().includes(s)) ||
                (n.deviceId + "").includes(s) ||
                (n.ipMgmt && n.ipMgmt.toLowerCase().includes(s)) ||
                (n.popLocation && n.popLocation.toLowerCase().includes(s))
            );
        });
    };

    const availableInterfaces = (deviceId: number | null) => {
        const node = allNodes.find((n: any) => n.deviceId === deviceId);
        return node?.interfaces ?? [];
    };

    const filterInterfaces = (deviceId: number | null, q: string) => {
        const s = (q || "").toLowerCase();
        const list = availableInterfaces(deviceId);
        if (!s) return list;
        return list.filter((itf: any) => {
            return (
                (itf.ifName && itf.ifName.toLowerCase().includes(s)) ||
                (itf.ifDescr && itf.ifDescr.toLowerCase().includes(s)) ||
                (itf.id + "").includes(s) ||
                (itf.ifIndex + "").includes(s)
            );
        });
    };
</script>

<div class="modal modal-open" role="dialog">
    <div class="modal-box w-11/12 max-w-7xl max-h-[90vh] flex flex-col">
        <!-- Modal Header -->
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-bold text-base-content">Manage Connections</h3>
            <button
                class="btn btn-sm btn-circle btn-ghost"
                onclick={() => dispatch("close")}>✕</button
            >
        </div>

        <!-- Error Alert -->
        {#if manageConnError}
            <div class="alert alert-error mb-4 shadow-lg">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="stroke-current flex-shrink-0 h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
                <span>{manageConnError}</span>
            </div>
        {/if}

        <!-- Connections List -->
        <div class="flex-1 overflow-hidden flex flex-col">
            <div class="flex justify-between items-center mb-4">
                <h4 class="text-lg font-semibold">
                    <span class="text-secondary">🔗</span> Existing Connections
                    <span class="badge badge-neutral">{connections.length}</span>
                </h4>
            </div>

            <div
                class="overflow-x-auto overflow-y-auto flex-1 bg-base-100 rounded-xl shadow-sm border border-base-300"
            >
                <table class="table table-zebra w-full">
                    <thead class="sticky top-0 bg-base-200 z-10">
                        <tr>
                            <th class="w-12 text-center">#</th>
                            <th class="min-w-[200px]">Connection Details</th>
                            <th class="min-w-[150px]">Device A</th>
                            <th class="min-w-[100px]">Port A</th>
                            <th class="min-w-[150px]">Device B</th>
                            <th class="min-w-[100px]">Port B</th>
                            <th class="min-w-[140px] text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each connections as conn, i}
                            {@const nodeA = allNodes.find(
                                (n) => n.deviceId === conn.deviceAId,
                            )}
                            {@const nodeB = allNodes.find(
                                (n) => n.deviceId === conn.deviceBId,
                            )}

                            {#if editingConnection?.id === conn.id}
                                <!-- Edit Row -->
                                <tr class="bg-warning/10 border-l-4 border-warning">
                                    <td class="text-center font-bold">{i + 1}</td>
                                    <td colspan="5" class="p-4">
                                        <div
                                            class="bg-base-100 rounded-lg p-4 shadow-sm"
                                        >
                                            <div
                                                class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4"
                                            >
                                                 <!-- Description -->
                                                 <div class="form-control xl:col-span-3">
                                                     <label class="label">
                                                         <span class="label-text font-medium"
                                                             >Description</span
                                                         >
                                                     </label>
                                                     <input
                                                         class="input input-bordered"
                                                         bind:value={
                                                             editConn.description
                                                         }
                                                         placeholder="Connection description"
                                                     />
                                                 </div>

                                                 <!-- ODP Path Selection -->
                                                 <div class="form-control xl:col-span-3">
                                                     <label class="label">
                                                         <span class="label-text font-medium">ODP Path (optional)</span>
                                                     </label>
                                                     <Select
                    items={odpPoints.map((odp: OdpPoint) => ({
                        label: `${odp.name} — ${odp.location}`,
                        value: odp.id,
                        raw: odp,
                    }))}
                    value={odpPoints
                        .filter((odp: OdpPoint) => editConn.odpPath.includes(odp.id))
                        .map((odp: OdpPoint) => ({
                            label: `${odp.name} — ${odp.location}`,
                            value: odp.id,
                            raw: odp,
                        }))}
                                                         on:select={(e) => {
                                                             const selectedIds = e.detail?.map((item: any) => item.value) || [];
                                                             editConn.odpPath = selectedIds;
                                                         }}
                                                         multiple={true}
                                                         clearable={true}
                                                         searchable={true}
                                                         placeholder="Select ODP points..."
                                                         --listMaxHeight="300px"
                                                     />
                                                     <label class="label">
                                                         <span class="label-text-alt text-base-content/60"
                                                             >Selected: {editConn.odpPath.length} ODP point(s)</span
                                                         >
                                                     </label>
                                                 </div>

                                                <!-- Device A -->
                                                <div class="form-control">
                                                    <label class="label">
                                                        <span class="label-text font-medium"
                                                            >Device A</span
                                                        >
                                                    </label>
                                                     <Select
                                                         items={filterDevices(
                                                             "",
                                                         ).map((n: any) => ({
                                                             label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                                                             value: n.deviceId,
                                                             raw: n,
                                                         }))}
                                                         value={filterDevices(
                                                             "",
                                                         )
                                                             .map((n: any) => ({
                                                                 label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                                                                 value: n.deviceId,
                                                                 raw: n,
                                                             }))
                                                             .find(
                                                                 (o: any) =>
                                                                     o.value ===
                                                                     editConn.deviceAId,
                                                             )}
                                                         on:select={(e) => {
                                                             editConn.deviceAId =
                                                                 Number(
                                                                     e.detail
                                                                         ?.value ??
                                                                         null,
                                                                 );
                                                             editConn.portAId =
                                                                 null;
                                                         }}
                                                         clearable={true}
                                                         searchable={true}
                                                         placeholder="Select device..."
                                                         --listMaxHeight="300px"
                                                     />
                                                </div>

                                                <!-- Port A -->
                                                <div class="form-control">
                                                    <label class="label">
                                                        <span class="label-text font-medium"
                                                            >Port A</span
                                                        >
                                                    </label>
                                                     <Select
                                                         items={filterInterfaces(
                                                             editConn.deviceAId,
                                                             "",
                                                         ).map((itf: any) => ({
                                                             label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                                                             value: itf.id,
                                                             raw: itf,
                                                         }))}
                                                         value={filterInterfaces(
                                                             editConn.deviceAId,
                                                             "",
                                                         )
                                                             .map((itf: any) => ({
                                                                 label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                                                                 value: itf.id,
                                                                 raw: itf,
                                                             }))
                                                             .find(
                                                                 (o: any) =>
                                                                     o.value ===
                                                                     editConn.portAId,
                                                             )}
                                                         on:select={(e) =>
                                                             (editConn.portAId =
                                                                 Number(
                                                                     e.detail
                                                                         ?.value ??
                                                                         null,
                                                                 ))}
                                                         clearable={true}
                                                         searchable={true}
                                                         placeholder={editConn.deviceAId
                                                             ? "Select port..."
                                                             : "Select device first"}
                                                         disabled={!editConn.deviceAId}
                                                         --listMaxHeight="300px"
                                                     />
                                                </div>

                                                <!-- Device B -->
                                                <div class="form-control">
                                                    <label class="label">
                                                        <span class="label-text font-medium"
                                                            >Device B</span
                                                        >
                                                    </label>
                                                     <Select
                                                         items={filterDevices(
                                                             "",
                                                         ).map((n: any) => ({
                                                             label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                                                             value: n.deviceId,
                                                             raw: n,
                                                         }))}
                                                         value={filterDevices(
                                                             "",
                                                         )
                                                             .map((n: any) => ({
                                                                 label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                                                                 value: n.deviceId,
                                                                 raw: n,
                                                             }))
                                                             .find(
                                                                 (o: any) =>
                                                                     o.value ===
                                                                     editConn.deviceBId,
                                                             )}
                                                         on:select={(e) => {
                                                             editConn.deviceBId =
                                                                 Number(
                                                                     e.detail
                                                                         ?.value ??
                                                                         null,
                                                                 );
                                                             editConn.portBId =
                                                                 null;
                                                         }}
                                                         clearable={true}
                                                         searchable={true}
                                                         placeholder="Select device..."
                                                         --listMaxHeight="300px"
                                                     />
                                                </div>

                                                <!-- Port B -->
                                                <div class="form-control">
                                                    <label class="label">
                                                        <span class="label-text font-medium"
                                                            >Port B</span
                                                        >
                                                    </label>
                                                     <Select
                                                         items={filterInterfaces(
                                                             editConn.deviceBId,
                                                             "",
                                                         ).map((itf: any) => ({
                                                             label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                                                             value: itf.id,
                                                             raw: itf,
                                                         }))}
                                                         value={filterInterfaces(
                                                             editConn.deviceBId,
                                                             "",
                                                         )
                                                             .map((itf: any) => ({
                                                                 label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                                                                 value: itf.id,
                                                                 raw: itf,
                                                             }))
                                                             .find(
                                                                 (o: any) =>
                                                                     o.value ===
                                                                     editConn.portBId,
                                                             )}
                                                         on:select={(e) =>
                                                             (editConn.portBId =
                                                                 Number(
                                                                     e.detail
                                                                         ?.value ??
                                                                         null,
                                                                 ))}
                                                         clearable={true}
                                                         searchable={true}
                                                         placeholder={editConn.deviceBId
                                                             ? "Select port..."
                                                             : "Select device first"}
                                                         disabled={!editConn.deviceBId}
                                                         --listMaxHeight="300px"
                                                     />
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="p-4">
                                        <div class="flex flex-col gap-2">
                                            <button
                                                class="btn btn-sm btn-success"
                                                class:loading={manageConnLoading}
                                                disabled={manageConnLoading}
                                                onclick={() =>
                                                    submitEditConnection()}
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    class="h-4 w-4"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        stroke-width="2"
                                                        d="M5 13l4 4L19 7"
                                                    />
                                                </svg>
                                                Save
                                            </button>
                                            <button
                                                class="btn btn-sm btn-ghost"
                                                onclick={() => cancelEdit()}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            {:else}
                                <!-- Regular Row -->
                                <tr class="hover:bg-base-50">
                                    <td class="text-center font-mono text-sm">
                                        {i + 1}
                                    </td>
                                    <td>
                                        <div class="space-y-1">
                                            <div
                                                class="font-semibold text-base-content"
                                            >
                                                {conn.description ||
                                                    `Connection ${conn.id}`}
                                            </div>
                                            <div
                                                class="text-xs text-base-content/60 font-mono"
                                            >
                                                ID: {conn.id}
                                            </div>
                                             <div
                                                 class="flex items-center gap-2 text-xs"
                                             >
                                                 <span
                                                     class="badge badge-outline badge-xs"
                                                 >
                                                     {nodeA?.name ?? "Unknown"} ↔
                                                     {nodeB?.name ?? "Unknown"}
                                                 </span>
                                                 {#if conn.odpPath && conn.odpPath.length > 0}
                                                     <span
                                                         class="badge badge-info badge-xs"
                                                     >
                                                         {conn.odpPath.length} ODP point(s)
                                                     </span>
                                                 {/if}
                                             </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="space-y-1">
                                            <div class="font-medium text-sm">
                                                {nodeA?.name ?? "Unknown Device"}
                                            </div>
                                            <div class="text-xs text-base-content/60">
                                                {nodeA?.ipMgmt ?? "-"}
                                            </div>
                                            <div
                                                class="text-xs text-base-content/40 font-mono"
                                            >
                                                ID: {conn.deviceAId}
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div
                                            class="badge badge-neutral badge-sm font-mono"
                                        >
                                            {conn.portAId}
                                        </div>
                                    </td>
                                    <td>
                                        <div class="space-y-1">
                                            <div class="font-medium text-sm">
                                                {nodeB?.name ?? "Unknown Device"}
                                            </div>
                                            <div class="text-xs text-base-content/60">
                                                {nodeB?.ipMgmt ?? "-"}
                                            </div>
                                            <div
                                                class="text-xs text-base-content/40 font-mono"
                                            >
                                                ID: {conn.deviceBId}
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div
                                            class="badge badge-neutral badge-sm font-mono"
                                        >
                                            {conn.portBId}
                                        </div>
                                    </td>
                                    <td>
                                        <div class="flex justify-center gap-1">
                                            <button
                                                class="btn btn-xs btn-info"
                                                onclick={() => beginEdit(conn)}
                                                title="Edit connection"
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    class="h-3 w-3"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        stroke-width="2"
                                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                                    />
                                                </svg>
                                            </button>
                                            <button
                                                class="btn btn-xs btn-error"
                                                class:loading={deletingConnId ===
                                                    conn.id}
                                                onclick={() =>
                                                    deleteConnection(conn.id)}
                                                disabled={deletingConnId ===
                                                    conn.id}
                                                title="Delete connection"
                                            >
                                                {#if deletingConnId === conn.id}
                                                    <span
                                                        class="loading loading-spinner loading-xs"
                                                    ></span>
                                                {:else}
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        class="h-3 w-3"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            stroke-linecap="round"
                                                            stroke-linejoin="round"
                                                            stroke-width="2"
                                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                        />
                                                    </svg>
                                                {/if}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            {/if}
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Modal Footer -->
        <div class="flex justify-end mt-6 pt-4 border-t border-base-300">
            <button class="btn btn-neutral" onclick={() => dispatch("close")}>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                    />
                </svg>
                Close
            </button>
        </div>
    </div>
</div>
