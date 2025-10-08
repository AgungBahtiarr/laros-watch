<script lang="ts">
    import type { Connection, Node, Odp, Interface } from "../types";

    type Props = {
        isOpen: boolean;
        isEdit: boolean;
        connection: Connection | null;
        nodes: Node[];
        odps: Odp[];
        onSave: (connection: any) => void;
        onClose: () => void;
    };

    const { isOpen, isEdit, connection, nodes, odps, onSave, onClose } =
        $props<Props>();

    let description = $state(connection?.description || "");
    let deviceAId = $state(connection?.deviceAId?.toString() || "");
    let portAId = $state(connection?.portAId?.toString() || "");
    let deviceBId = $state(connection?.deviceBId?.toString() || "");
    let portBId = $state(connection?.portBId?.toString() || "");
    let odpPathArray = $state([]);
    let selectedOdpId = $state("");

    const nodeMap = $derived(new Map(nodes.map((node) => [node.id, node])));

    let portsA = $derived(
        deviceAId ? nodeMap.get(parseInt(deviceAId))?.interfaces || [] : [],
    );
    let portsB = $derived(
        deviceBId ? nodeMap.get(parseInt(deviceBId))?.interfaces || [] : [],
    );

    function addOdpToPath() {
        if (selectedOdpId) {
            const odpToAdd = odps.find((o) => o.id === parseInt(selectedOdpId));
            if (odpToAdd) {
                odpPathArray = [...odpPathArray, odpToAdd];
                selectedOdpId = ""; // Reset dropdown
            }
        }
    }

    function removeOdpFromPath(index: number) {
        odpPathArray.splice(index, 1);
        odpPathArray = odpPathArray;
    }

    function handleSubmit() {
        // 1. Basic validation
        if (!deviceAId || !portAId || !deviceBId || !portBId || !description) {
            alert(
                "Please fill out all required fields: Description, Devices, and Ports.",
            );
            return;
        }

        // 2. Data parsing and creation
        const data = {
            id: connection?.id,
            deviceAId: parseInt(deviceAId),
            portAId: parseInt(portAId),
            deviceBId: parseInt(deviceBId),
            portBId: parseInt(portBId),
            description: description,
            odpPath: odpPathArray.map((odp) => odp.id),
        };

        // 3. Check for NaN values after parsing
        if (
            isNaN(data.deviceAId) ||
            isNaN(data.portAId) ||
            isNaN(data.deviceBId) ||
            isNaN(data.portBId)
        ) {
            alert("Invalid device or port selection.");
            console.error("handleSubmit parsed NaN values:", data);
            return;
        }

        console.log("Submitting connection data:", data);
        onSave(data);
    }

    $effect(() => {
        if (isOpen) {
            if (connection) {
                description = connection.description || "";
                deviceAId = connection.deviceAId?.toString() || "";
                portAId = connection.portAId?.toString() || "";
                deviceBId = connection.deviceBId?.toString() || "";
                portBId = connection.portBId?.toString() || "";
            } else {
                description = "";
                deviceAId = "";
                portAId = "";
                deviceBId = "";
                portBId = "";
                odpPathArray = [];
            }
        }
    });

    // Separate effect for odpPathArray to react to both connection and odps changes
    $effect(() => {
        if (isOpen && connection && connection.odpPath && odps.length > 0) {
            const mapped = connection.odpPath
                .map((item) => {
                    // If item is already an object with id, use it directly
                    if (typeof item === "object" && item.id) {
                        return item;
                    }
                    // If item is an ID, find the corresponding ODP
                    const found = odps.find((o) => o.id === item);
                    return found;
                })
                .filter((odp) => odp !== undefined);
            odpPathArray = mapped;
        } else if (isOpen && !connection) {
            odpPathArray = [];
        }
    });
</script>

{#if isOpen}
    <div class="modal modal-open">
        <div class="modal-box w-11/12 max-w-2xl">
            <h3 class="font-bold text-lg">
                {isEdit ? "Edit" : "Add New"} Connection
            </h3>
            <form onsubmit={handleSubmit}>
                <div class="form-control">
                    <label class="label" for="description">Description</label>
                    <input
                        type="text"
                        id="description"
                        class="input input-bordered"
                        required
                        bind:value={description}
                    />
                </div>
                <div class="grid grid-cols-2 gap-4 mt-4">
                    <div class="form-control">
                        <label class="label" for="deviceAId">Device A</label>
                        <select
                            id="deviceAId"
                            class="select select-bordered"
                            bind:value={deviceAId}
                            onchange={() => (portAId = "")}
                        >
                            <option disabled value="">Select Device</option>
                            {#each nodes as node}
                                <option value={node.id.toString()}
                                    >{node.name}</option
                                >
                            {/each}
                        </select>
                    </div>
                    <div class="form-control">
                        <label class="label" for="portAId">Port A</label>
                        <select
                            id="portAId"
                            class="select select-bordered"
                            bind:value={portAId}
                            disabled={!portsA.length}
                        >
                            <option disabled value="">Select Port</option>
                            {#each portsA as iface}
                                <option value={iface.id.toString()}
                                    >{iface.ifName} ({iface.ifDescr})</option
                                >
                            {/each}
                        </select>
                    </div>
                    <div class="form-control">
                        <label class="label" for="deviceBId">Device B</label>
                        <select
                            id="deviceBId"
                            class="select select-bordered"
                            bind:value={deviceBId}
                            onchange={() => (portBId = "")}
                        >
                            <option disabled value="">Select Device</option>
                            {#each nodes as node}
                                <option value={node.id.toString()}
                                    >{node.name}</option
                                >
                            {/each}
                        </select>
                    </div>
                    <div class="form-control">
                        <label class="label" for="portBId">Port B</label>
                        <select
                            id="portBId"
                            class="select select-bordered"
                            bind:value={portBId}
                            disabled={!portsB.length}
                        >
                            <option disabled value="">Select Port</option>
                            {#each portsB as iface}
                                <option value={iface.id.toString()}
                                    >{iface.ifName} ({iface.ifDescr})</option
                                >
                            {/each}
                        </select>
                    </div>
                </div>
                <div class="form-control mt-4">
                    <label class="label" for="odp-path-select">
                        <span class="label-text">ODP Path</span>
                    </label>
                    <div class="flex items-center gap-2">
                        <select
                            id="odp-path-select"
                            class="select select-bordered w-full max-w-xs"
                            bind:value={selectedOdpId}
                        >
                            <option disabled selected value=""
                                >Select ODP</option
                            >
                            {#each odps as odp}
                                <option value={odp.id}>{odp.name}</option>
                            {/each}
                        </select>
                        <button
                            type="button"
                            class="btn btn-secondary"
                            onclick={addOdpToPath}>Add</button
                        >
                    </div>
                    <div
                        class="mt-2 flex min-h-[40px] flex-wrap gap-2 rounded-lg bg-base-200 p-2"
                    >
                        {#each odpPathArray as odp, i}
                            <div class="badge badge-lg badge-outline gap-2">
                                <span>{odp.name}</span>
                                <button
                                    type="button"
                                    class="btn btn-xs btn-ghost"
                                    onclick={() => removeOdpFromPath(i)}
                                    aria-label="Remove ODP from path"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        class="inline-block h-4 w-4 stroke-current"
                                        ><path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M6 18L18 6M6 6l12 12"
                                        ></path></svg
                                    >
                                </button>
                            </div>
                        {/each}
                    </div>
                </div>
                <div class="modal-action">
                    <button type="button" class="btn" onclick={onClose}
                        >Cancel</button
                    >
                    <button
                        type="button"
                        class="btn btn-primary"
                        onclick={handleSubmit}>Save</button
                    >
                </div>
            </form>
        </div>
    </div>
{/if}
