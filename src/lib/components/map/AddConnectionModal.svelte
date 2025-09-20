
<script lang="ts">
    import Select from "svelte-select";
    import { createEventDispatcher } from "svelte";
    import type { Node, OdpPoint } from "$lib/types";
    import { createConnection } from "$lib/api";

    let { allNodes, odpPoints } = $props<{ allNodes: Node[]; odpPoints: OdpPoint[] }>();

    const dispatch = createEventDispatcher();

    let addConnLoading = $state(false);
    let addConnError = $state<string | null>(null);
    let newConn = $state<{
        deviceAId: number | null;
        portAId: number | null;
        deviceBId: number | null;
        portBId: number | null;
        description: string;
        odpPath: number[];
    }>({
        deviceAId: null,
        portAId: null,
        deviceBId: null,
        portBId: null,
        description: "",
        odpPath: [],
    });

    // Helpers for device/port selection
    const nodeByDeviceId = (deviceId: number | null) =>
        allNodes.find((n: any) => n.deviceId === deviceId);

    const availableInterfaces = (deviceId: number | null) => {
        const node = nodeByDeviceId(deviceId ?? null);
        return node?.interfaces ?? [];
    };

    // Search queries
    let qDeviceA = $state("");
    let qDeviceB = $state("");
    let qPortA = $state("");
    let qPortB = $state("");

    // Filtering helpers
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

    const closeAddConnection = () => {
        dispatch("close");
    };

    const onSelectDeviceA = (value: string) => {
        const idNum = value ? Number(value) : null;
        newConn.deviceAId = idNum;
        newConn.portAId = null;
    };

    const onSelectDeviceB = (value: string) => {
        const idNum = value ? Number(value) : null;
        newConn.deviceBId = idNum;
        newConn.portBId = null;
    };

    const onSelectPortA = (value: string) => {
        newConn.portAId = value ? Number(value) : null;
    };

    const onSelectPortB = (value: string) => {
        newConn.portBId = value ? Number(value) : null;
    };

    const submitNewConnection = async () => {
        addConnError = null;

        if (
            !newConn.deviceAId ||
            !newConn.portAId ||
            !newConn.deviceBId ||
            !newConn.portBId
        ) {
            addConnError =
                "Please select Device A, Port A, Device B, and Port B.";
            return;
        }

        const payload: any = {
            deviceAId: Number(newConn.deviceAId),
            portAId: Number(newConn.portAId),
            deviceBId: Number(newConn.deviceBId),
            portBId: Number(newConn.portBId),
            description: newConn.description,
            odpPath: newConn.odpPath,
        };

        addConnLoading = true;
        try {
            await createConnection(payload);
            dispatch("save");
        } catch (err) {
            addConnError = (err as Error).message;
        } finally {
            addConnLoading = false;
        }
    };
</script>

<div class="modal modal-open" role="dialog">
    <div class="modal-box w-11/12 max-w-4xl">
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold">Add Connection</h3>
            <button
                class="btn btn-sm btn-circle btn-ghost"
                onclick={closeAddConnection}>✕</button
            >
        </div>

        {#if addConnError}
            <div class="alert alert-error mb-4 shadow-sm">
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
                <span>{addConnError}</span>
            </div>
        {/if}

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Device A -->
            <div class="form-control">
                <label class="label">
                    <span class="label-text font-medium"
                        >Device A <span class="text-error">*</span></span
                    >
                </label>
                 <Select
                     items={filterDevices(qDeviceA).map((n: any) => ({
                         label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                         value: n.deviceId,
                         raw: n,
                     }))}
                     value={filterDevices(qDeviceA)
                         .map((n: any) => ({
                             label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                             value: n.deviceId,
                             raw: n,
                         }))
                         .find((o: any) => o.value === newConn.deviceAId)}
                     on:select={(e) => onSelectDeviceA(e.detail?.value)}
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
                        >Port A <span class="text-error">*</span></span
                    >
                </label>
                 <Select
                     items={filterInterfaces(newConn.deviceAId, qPortA).map(
                         (itf: any) => ({
                             label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                             value: itf.id,
                             raw: itf,
                         }),
                     )}
                     value={filterInterfaces(newConn.deviceAId, qPortA)
                         .map((itf: any) => ({
                             label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                             value: itf.id,
                             raw: itf,
                         }))
                         .find((o: any) => o.value === newConn.portAId)}
                     on:select={(e) => onSelectPortA(e.detail?.value)}
                     clearable={true}
                     searchable={true}
                     placeholder={newConn.deviceAId
                         ? "Select port..."
                         : "Select device first"}
                     disabled={!newConn.deviceAId}
                     --listMaxHeight="300px"
                 />
            </div>

            <!-- Device B -->
            <div class="form-control">
                <label class="label">
                    <span class="label-text font-medium"
                        >Device B <span class="text-error">*</span></span
                    >
                </label>
                 <Select
                     items={filterDevices(qDeviceB).map((n: any) => ({
                         label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                         value: n.deviceId,
                         raw: n,
                     }))}
                     value={filterDevices(qDeviceB)
                         .map((n: any) => ({
                             label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                             value: n.deviceId,
                             raw: n,
                         }))
                         .find((o: any) => o.value === newConn.deviceBId)}
                     on:select={(e) => onSelectDeviceB(e.detail?.value)}
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
                        >Port B <span class="text-error">*</span></span
                    >
                </label>
                 <Select
                     items={filterInterfaces(newConn.deviceBId, qPortB).map(
                         (itf: any) => ({
                             label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                             value: itf.id,
                             raw: itf,
                         }),
                     )}
                     value={filterInterfaces(newConn.deviceBId, qPortB)
                         .map((itf: any) => ({
                             label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                             value: itf.id,
                             raw: itf,
                         }))
                         .find((o: any) => o.value === newConn.portBId)}
                     on:select={(e) => onSelectPortB(e.detail?.value)}
                     clearable={true}
                     searchable={true}
                     placeholder={newConn.deviceBId
                         ? "Select port..."
                         : "Select device first"}
                     disabled={!newConn.deviceBId}
                     --listMaxHeight="300px"
                 />
            </div>

             <!-- Description -->
             <div class="form-control md:col-span-2">
                 <label class="label">
                     <span class="label-text font-medium"
                         >Description (optional)</span
                     >
                 </label>
                 <input
                     class="input input-bordered w-full"
                     bind:value={newConn.description}
                     placeholder="Enter connection description..."
                 />
             </div>

             <!-- ODP Path Selection -->
             <div class="form-control md:col-span-2">
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
                        .filter((odp: OdpPoint) => newConn.odpPath.includes(odp.id))
                        .map((odp: OdpPoint) => ({
                            label: `${odp.name} — ${odp.location}`,
                            value: odp.id,
                            raw: odp,
                        }))}
                     on:select={(e) => {
                         const selectedIds = e.detail?.map((item: any) => item.value) || [];
                         newConn.odpPath = selectedIds;
                     }}
                     multiple={true}
                     clearable={true}
                     searchable={true}
                     placeholder="Select ODP points..."
                     --listMaxHeight="300px"
                 />
                 <label class="label">
                     <span class="label-text-alt text-base-content/60"
                         >Selected: {newConn.odpPath.length} ODP point(s)</span
                     >
                 </label>
             </div>
        </div>

        <div class="modal-action">
            <button class="btn btn-ghost" onclick={closeAddConnection}
                >Cancel</button
            >
            <button
                class="btn btn-primary"
                onclick={submitNewConnection}
                class:loading={addConnLoading}
                disabled={addConnLoading}
            >
                {addConnLoading ? "Creating..." : "Create Connection"}
            </button>
        </div>
    </div>
</div>
