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

    // Search states
    let deviceASearch = $state("");
    let deviceBSearch = $state("");
    let portASearch = $state("");
    let portBSearch = $state("");

    // Dropdown open states
    let deviceAOpen = $state(false);
    let deviceBOpen = $state(false);
    let portAOpen = $state(false);
    let portBOpen = $state(false);

    const nodeMap = $derived(new Map(nodes.map((node) => [node.id, node])));

    let portsA = $derived(
        deviceAId ? nodeMap.get(parseInt(deviceAId))?.interfaces || [] : [],
    );
    let portsB = $derived(
        deviceBId ? nodeMap.get(parseInt(deviceBId))?.interfaces || [] : [],
    );

    // Get display names
    const deviceAName = $derived(
        deviceAId
            ? nodeMap.get(parseInt(deviceAId))?.name || "Select Device"
            : "Select Device",
    );
    const deviceBName = $derived(
        deviceBId
            ? nodeMap.get(parseInt(deviceBId))?.name || "Select Device"
            : "Select Device",
    );
    const portAName = $derived(
        portAId
            ? portsA.find((p) => p.id.toString() === portAId)?.ifName +
                  " (" +
                  portsA.find((p) => p.id.toString() === portAId)?.ifDescr +
                  ")" || "Select Port"
            : "Select Port",
    );
    const portBName = $derived(
        portBId
            ? portsB.find((p) => p.id.toString() === portBId)?.ifName +
                  " (" +
                  portsB.find((p) => p.id.toString() === portBId)?.ifDescr +
                  ")" || "Select Port"
            : "Select Port",
    );

    // Filtered options
    const filteredNodesA = $derived(
        deviceASearch
            ? nodes.filter((node) =>
                  node.name.toLowerCase().includes(deviceASearch.toLowerCase()),
              )
            : nodes,
    );

    const filteredNodesB = $derived(
        deviceBSearch
            ? nodes.filter((node) =>
                  node.name.toLowerCase().includes(deviceBSearch.toLowerCase()),
              )
            : nodes,
    );

    const filteredPortsA = $derived(
        portASearch
            ? portsA.filter(
                  (iface) =>
                      iface.ifName
                          .toLowerCase()
                          .includes(portASearch.toLowerCase()) ||
                      iface.ifDescr
                          .toLowerCase()
                          .includes(portASearch.toLowerCase()),
              )
            : portsA,
    );

    const filteredPortsB = $derived(
        portBSearch
            ? portsB.filter(
                  (iface) =>
                      iface.ifName
                          .toLowerCase()
                          .includes(portBSearch.toLowerCase()) ||
                      iface.ifDescr
                          .toLowerCase()
                          .includes(portBSearch.toLowerCase()),
              )
            : portsB,
    );

    function selectDeviceA(node: Node) {
        deviceAId = node.id.toString();
        portAId = "";
        deviceASearch = "";
        deviceAOpen = false;
    }

    function selectDeviceB(node: Node) {
        deviceBId = node.id.toString();
        portBId = "";
        deviceBSearch = "";
        deviceBOpen = false;
    }

    function selectPortA(iface: Interface) {
        portAId = iface.id.toString();
        portASearch = "";
        portAOpen = false;
    }

    function selectPortB(iface: Interface) {
        portBId = iface.id.toString();
        portBSearch = "";
        portBOpen = false;
    }

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

    // Close dropdowns when clicking outside
    function handleClickOutside(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest(".searchable-select")) {
            deviceAOpen = false;
            deviceBOpen = false;
            portAOpen = false;
            portBOpen = false;
        }
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
            // Reset search states
            deviceASearch = "";
            deviceBSearch = "";
            portASearch = "";
            portBSearch = "";
            // Close dropdowns
            deviceAOpen = false;
            deviceBOpen = false;
            portAOpen = false;
            portBOpen = false;
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

<svelte:window onclick={handleClickOutside} />

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
                    <!-- Device A Searchable Select -->
                    <div class="form-control">
                        <label class="label">Device A</label>
                        <div class="searchable-select relative">
                            <div
                                class="select select-bordered w-full cursor-pointer flex items-center justify-between"
                                class:select-disabled={deviceAId === ""}
                                onclick={() => {
                                    deviceAOpen = !deviceAOpen;
                                    if (deviceAOpen) deviceASearch = "";
                                }}
                            >
                                <span class:text-gray-400={!deviceAId}
                                    >{deviceAName}</span
                                >
                                <svg
                                    class="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M19 9l-7 7-7-7"
                                    ></path>
                                </svg>
                            </div>
                            {#if deviceAOpen}
                                <div
                                    class="absolute top-full left-0 right-0 z-50 bg-white border border-gray-300 rounded-lg shadow-lg mt-1 max-h-60 overflow-hidden"
                                >
                                    <div class="p-2 border-b">
                                        <input
                                            type="text"
                                            placeholder="Search devices..."
                                            class="input input-sm input-bordered w-full"
                                            bind:value={deviceASearch}
                                            onclick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                    <div class="max-h-48 overflow-y-auto">
                                        {#each filteredNodesA as node}
                                            <div
                                                class="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                                                onclick={() =>
                                                    selectDeviceA(node)}
                                            >
                                                {node.name}
                                            </div>
                                        {/each}
                                        {#if filteredNodesA.length === 0}
                                            <div
                                                class="px-3 py-2 text-gray-500"
                                            >
                                                No devices found
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </div>
                    </div>

                    <!-- Port A Searchable Select -->
                    <div class="form-control">
                        <label class="label">Port A</label>
                        <div class="searchable-select relative">
                            <div
                                class="select select-bordered w-full cursor-pointer flex items-center justify-between"
                                class:select-disabled={!portsA.length}
                                onclick={() => {
                                    if (portsA.length) {
                                        portAOpen = !portAOpen;
                                        if (portAOpen) portASearch = "";
                                    }
                                }}
                            >
                                <span class:text-gray-400={!portAId}
                                    >{portAName}</span
                                >
                                <svg
                                    class="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M19 9l-7 7-7-7"
                                    ></path>
                                </svg>
                            </div>
                            {#if portAOpen && portsA.length}
                                <div
                                    class="absolute top-full left-0 right-0 z-50 bg-white border border-gray-300 rounded-lg shadow-lg mt-1 max-h-60 overflow-hidden"
                                >
                                    <div class="p-2 border-b">
                                        <input
                                            type="text"
                                            placeholder="Search ports..."
                                            class="input input-sm input-bordered w-full"
                                            bind:value={portASearch}
                                            onclick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                    <div class="max-h-48 overflow-y-auto">
                                        {#each filteredPortsA as iface}
                                            <div
                                                class="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                                                onclick={() =>
                                                    selectPortA(iface)}
                                            >
                                                {iface.ifName} ({iface.ifDescr})
                                            </div>
                                        {/each}
                                        {#if filteredPortsA.length === 0}
                                            <div
                                                class="px-3 py-2 text-gray-500"
                                            >
                                                No ports found
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </div>
                    </div>

                    <!-- Device B Searchable Select -->
                    <div class="form-control">
                        <label class="label">Device B</label>
                        <div class="searchable-select relative">
                            <div
                                class="select select-bordered w-full cursor-pointer flex items-center justify-between"
                                class:select-disabled={deviceBId === ""}
                                onclick={() => {
                                    deviceBOpen = !deviceBOpen;
                                    if (deviceBOpen) deviceBSearch = "";
                                }}
                            >
                                <span class:text-gray-400={!deviceBId}
                                    >{deviceBName}</span
                                >
                                <svg
                                    class="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M19 9l-7 7-7-7"
                                    ></path>
                                </svg>
                            </div>
                            {#if deviceBOpen}
                                <div
                                    class="absolute top-full left-0 right-0 z-50 bg-white border border-gray-300 rounded-lg shadow-lg mt-1 max-h-60 overflow-hidden"
                                >
                                    <div class="p-2 border-b">
                                        <input
                                            type="text"
                                            placeholder="Search devices..."
                                            class="input input-sm input-bordered w-full"
                                            bind:value={deviceBSearch}
                                            onclick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                    <div class="max-h-48 overflow-y-auto">
                                        {#each filteredNodesB as node}
                                            <div
                                                class="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                                                onclick={() =>
                                                    selectDeviceB(node)}
                                            >
                                                {node.name}
                                            </div>
                                        {/each}
                                        {#if filteredNodesB.length === 0}
                                            <div
                                                class="px-3 py-2 text-gray-500"
                                            >
                                                No devices found
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </div>
                    </div>

                    <!-- Port B Searchable Select -->
                    <div class="form-control">
                        <label class="label">Port B</label>
                        <div class="searchable-select relative">
                            <div
                                class="select select-bordered w-full cursor-pointer flex items-center justify-between"
                                class:select-disabled={!portsB.length}
                                onclick={() => {
                                    if (portsB.length) {
                                        portBOpen = !portBOpen;
                                        if (portBOpen) portBSearch = "";
                                    }
                                }}
                            >
                                <span class:text-gray-400={!portBId}
                                    >{portBName}</span
                                >
                                <svg
                                    class="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M19 9l-7 7-7-7"
                                    ></path>
                                </svg>
                            </div>
                            {#if portBOpen && portsB.length}
                                <div
                                    class="absolute top-full left-0 right-0 z-50 bg-white border border-gray-300 rounded-lg shadow-lg mt-1 max-h-60 overflow-hidden"
                                >
                                    <div class="p-2 border-b">
                                        <input
                                            type="text"
                                            placeholder="Search ports..."
                                            class="input input-sm input-bordered w-full"
                                            bind:value={portBSearch}
                                            onclick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                    <div class="max-h-48 overflow-y-auto">
                                        {#each filteredPortsB as iface}
                                            <div
                                                class="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                                                onclick={() =>
                                                    selectPortB(iface)}
                                            >
                                                {iface.ifName} ({iface.ifDescr})
                                            </div>
                                        {/each}
                                        {#if filteredPortsB.length === 0}
                                            <div
                                                class="px-3 py-2 text-gray-500"
                                            >
                                                No ports found
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </div>
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
