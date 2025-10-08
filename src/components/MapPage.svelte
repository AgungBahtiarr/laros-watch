<script>
    import { onMount } from "svelte";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";
    import * as turf from "@turf/turf";

    export let nodes;
    export let connections;
    export let odps = [];
    export let nodesWithLocation;
    export let routes;
    export let apiBaseUrl;

    let map;
    let mapElement;
    let selectedRouteLayer = null;
    let findPointMarker = null;
    const routeLayers = {};
    $: nodeMap = new Map(nodes.map((node) => [node.id, node]));
    $: connectionMap = new Map(connections.map((conn) => [conn.id, conn]));

    let showAddConnectionModal = false;
    let showFindPointModal = false;
    let showOdpModal = false;
    let isEdit = false;
    let isEditingOdp = false;
    let editingOdpId = null;
    let isAddingOdpMode = false;
    let modalTitle = "Add New Connection";
    let odpModalTitle = "Add ODP";
    let connectionForm;
    let findPointForm;
    let odpForm;

    // Form fields
    let connectionId = "";
    let description = "";
    let deviceAId = "";
    let portAId = "";
    let deviceBId = "";
    let portBId = "";
    let odpPath = "";
    let odpPathArray = [];
    let selectedOdpId = "";

    $: odpPath = odpPathArray.map((o) => o.id).join(",");

    let findPointConnectionId = "";
    let startNodeId = "";
    let distance = "";

    let odpName = "";
    let odpLocation = "";
    let odpNotes = "";
    let odpLat = null;
    let odpLng = null;

    let portsA = [];
    let portsB = [];

    // Reactive statements to populate ports when device IDs change
    $: if (deviceAId && nodeMap) {
        portsA = populatePorts(deviceAId);
    }

    $: if (deviceBId && nodeMap) {
        portsB = populatePorts(deviceBId);
    }

    async function reverseGeocode(lat, lng) {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
            );
            if (!response.ok) {
                throw new Error("Reverse geocoding failed");
            }
            const data = await response.json();
            return data.display_name;
        } catch (error) {
            console.error("Reverse geocoding error:", error);
            return "";
        }
    }

    function stringToColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        let color = "#";
        for (let i = 0; i < 3; i++) {
            const value = (hash >> (i * 8)) & 0xff;
            color += ("00" + value.toString(16)).substr(-2);
        }
        return color;
    }

    onMount(() => {
        map = L.map(mapElement).setView([-8.21, 114.37], 13);
        if (nodesWithLocation.length > 0) {
            map.setView(
                [
                    parseFloat(nodesWithLocation[0].lat),
                    parseFloat(nodesWithLocation[0].lng),
                ],
                8,
            );
        }

        const streetLayer = L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            },
        );

        const satelliteLayer = L.tileLayer(
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            {
                attribution:
                    "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
            },
        );

        const terrainLayer = L.tileLayer(
            "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
            {
                attribution:
                    'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
            },
        );

        const baseLayers = {
            Street: streetLayer,
            Satellite: satelliteLayer,
            Terrain: terrainLayer,
        };

        streetLayer.addTo(map);
        L.control.layers(baseLayers).addTo(map);

        L.tileLayer("", {
            attribution: "PT. Lare Osing Ndo.",
        }).addTo(map);

        const greenIcon = new L.Icon({
            iconUrl:
                "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
            shadowUrl:
                "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41],
        });

        const redIcon = new L.Icon({
            iconUrl:
                "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
            shadowUrl:
                "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41],
        });

        const blueIcon = new L.Icon({
            iconUrl:
                "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
            shadowUrl:
                "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41],
        });

        nodesWithLocation.forEach((node) => {
            const icon = node.status ? greenIcon : redIcon;
            L.marker([parseFloat(node.lat), parseFloat(node.lng)], {
                icon: icon,
            })
                .addTo(map)
                .bindPopup(
                    `<b>${node.name}</b><br>Status: ${node.status ? "Up" : "Down"}`,
                );
        });

        odps.forEach((odp) => {
            if (odp.lat && odp.lng) {
                const popupContent = `
                <b>${odp.name}</b><br>
                ${odp.location || ""}
                <div class="mt-2 flex gap-2">
                    <button class="btn btn-xs btn-info btn-edit-odp" data-odp-id="${odp.id}">Edit</button>
                    <button class="btn btn-xs btn-error btn-delete-odp" data-odp-id="${odp.id}">Delete</button>
                </div>
            `;

                const marker = L.marker(
                    [parseFloat(odp.lat), parseFloat(odp.lng)],
                    { icon: blueIcon },
                )
                    .addTo(map)
                    .bindPopup(popupContent);

                marker.on("popupopen", () => {
                    const popupElem = marker.getPopup().getElement();
                    popupElem
                        .querySelector(".btn-edit-odp")
                        .addEventListener("click", (e) => {
                            const odpId = e.target.dataset.odpId;
                            openEditOdpModal(odpId);
                        });
                    popupElem
                        .querySelector(".btn-delete-odp")
                        .addEventListener("click", (e) => {
                            const odpId = e.target.dataset.odpId;
                            handleDeleteOdp(odpId);
                        });
                });
            }
        });

        map.on("click", (e) => {
            if (isAddingOdpMode) {
                openAddOdpModal(e.latlng);
                isAddingOdpMode = false; // Reset mode after click
            } else if (selectedRouteLayer) {
                selectedRouteLayer.setStyle(selectedRouteLayer.originalStyle);
                selectedRouteLayer = null;
                return;
            }
        });

        if (routes && routes.length > 0) {
            routes.forEach((routeData) => {
                if (routeData && routeData.geometry) {
                    const distanceInKm = (routeData.distance / 1000).toFixed(2);
                    const conn = connections.find(
                        (c) => c.id === routeData.connectionId,
                    );
                    const popupContent = `<b>${
                        conn?.description || "Connection"
                    }</b><br>Distance: ${distanceInKm} km`;
                    const color = stringToColor(
                        routeData.connectionId.toString(),
                    );

                    const routeLayer = L.geoJSON(routeData.geometry, {
                        style: { color: color, weight: 3, opacity: 0.8 },
                        onEachFeature: function (feature, layer) {
                            layer.bindPopup(popupContent);
                            layer.originalStyle = {
                                color: color,
                                weight: 3,
                                opacity: 0.8,
                            };

                            layer.on("click", (e) => {
                                if (selectedRouteLayer) {
                                    selectedRouteLayer.setStyle(
                                        selectedRouteLayer.originalStyle,
                                    );
                                }
                                layer.setStyle({
                                    color: "#FFFF00",
                                    weight: 5,
                                    opacity: 1,
                                });
                                layer.bringToFront();
                                selectedRouteLayer = layer;
                                if (e.originalEvent) {
                                    L.DomEvent.stopPropagation(e);
                                }
                            });
                        },
                    }).addTo(map);
                    routeLayers[routeData.connectionId] = routeLayer;
                }
            });
        }
    });

    function populatePorts(deviceId, portSelect) {
        const node = nodeMap.get(parseInt(deviceId));
        if (node && node.interfaces) {
            return node.interfaces;
        }
        return [];
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

    function removeOdpFromPath(index) {
        odpPathArray.splice(index, 1);
        odpPathArray = odpPathArray; // Trigger reactivity
    }

    function handleDeviceAChange() {
        portAId = "";
    }

    function handleDeviceBChange() {
        portBId = "";
    }

    function openAddModal() {
        isEdit = false;
        modalTitle = "Add New Connection";
        connectionId = "";
        description = "";
        deviceAId = "";
        portAId = "";
        deviceBId = "";
        portBId = "";
        odpPathArray = [];
        portsA = [];
        portsB = [];
        showAddConnectionModal = true;
    }

    function openEditModal(conn) {
        isEdit = true;
        modalTitle = "Edit Connection";
        connectionId = conn.id;
        description = conn.description;
        deviceAId = conn.deviceAId.toString();
        portAId = conn.portAId.toString();
        deviceBId = conn.deviceBId.toString();
        portBId = conn.portBId.toString();

        // Handle odpPath - API returns array of ODP objects, not IDs
        const path = conn.odpPath;

        if (path && Array.isArray(path) && path.length > 0) {
            // Check if first element is an object (ODP object) or number (ID)
            if (typeof path[0] === "object" && path[0].id !== undefined) {
                // Path contains ODP objects directly from API
                odpPathArray = [...path];
            } else {
                // Path contains IDs, need to map to ODP objects
                odpPathArray = path
                    .map((id) => odps.find((o) => o.id == id))
                    .filter(Boolean);
            }
        } else {
            odpPathArray = [];
        }

        showAddConnectionModal = true;
    }

    async function handleSubmit() {
        const data = {
            deviceAId: parseInt(deviceAId),
            portAId: parseInt(portAId),
            deviceBId: parseInt(deviceBId),
            portBId: parseInt(portBId),
            description: description,
            odpPath: odpPathArray.map((odp) => odp.id),
        };

        const url = isEdit
            ? `${apiBaseUrl}/api/nodes/connections/${connectionId}`
            : `${apiBaseUrl}/api/nodes/connections`;
        const method = isEdit ? "PUT" : "POST";

        try {
            const response = await fetch(url, {
                method: method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!response.ok)
                throw new Error(
                    `Failed to ${isEdit ? "update" : "save"} connection`,
                );
            showAddConnectionModal = false;
            location.reload();
        } catch (error) {
            console.error(error);
            alert("Error: " + error.message);
        }
    }

    function viewConnection(connId) {
        const routeLayer = routeLayers[connId];
        if (routeLayer) {
            const bounds = routeLayer.getBounds();
            map.fitBounds(bounds.pad(0.1));
            routeLayer.eachLayer((layer) => {
                layer.fire("click");
                layer.openPopup();
            });
        }
    }

    async function deleteConnection(connId) {
        if (confirm("Are you sure you want to delete this connection?")) {
            try {
                const response = await fetch(
                    `${apiBaseUrl}/api/nodes/connections/${connId}`,
                    { method: "DELETE" },
                );
                if (!response.ok)
                    throw new Error("Failed to delete connection");
                location.reload();
            } catch (error) {
                console.error(error);
                alert("Error: " + error.message);
            }
        }
    }

    function openFindPointModal(conn) {
        findPointConnectionId = conn.id;
        startNodeId = conn.deviceAId.toString();
        distance = "";
        showFindPointModal = true;
    }

    function handleFindPointSubmit() {
        const distanceMeters = parseFloat(distance);

        if (isNaN(distanceMeters)) {
            alert("Invalid distance.");
            return;
        }

        const routeData = routes.find(
            (r) => r.connectionId === findPointConnectionId,
        );
        if (!routeData) {
            alert("Route not found for this connection.");
            return;
        }

        if (distanceMeters > routeData.distance) {
            alert(
                `Distance is greater than route distance (${routeData.distance.toFixed(
                    2,
                )}m)`,
            );
            return;
        }

        const conn = connectionMap.get(findPointConnectionId);
        if (!conn) return;
        let line = routeData.geometry;

        if (parseInt(startNodeId) === conn.deviceBId) {
            const reversedCoords = [...line.coordinates].reverse();
            line = turf.lineString(reversedCoords);
        }

        const point = turf.along(line, distanceMeters, { units: "meters" });

        if (findPointMarker) {
            map.removeLayer(findPointMarker);
        }

        const lat = point.geometry.coordinates[1];
        const lng = point.geometry.coordinates[0];
        const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

        const popupContent = document.createElement("div");
        const startNode = nodeMap.get(parseInt(startNodeId));
        popupContent.innerHTML = `
            Point at ${distanceMeters}m from ${startNode.name}
            <br><br>
            <button class="btn btn-sm btn-primary" id="copy-gmaps-link-btn">Copy Google Maps Link</button>
        `;

        popupContent
            .querySelector("#copy-gmaps-link-btn")
            .addEventListener("click", () => {
                navigator.clipboard
                    .writeText(googleMapsUrl)
                    .then(() => {
                        alert("Google Maps link copied to clipboard!");
                    })
                    .catch((err) => {
                        console.error("Failed to copy text: ", err);
                        alert("Failed to copy link.");
                    });
            });

        findPointMarker = L.marker([lat, lng])
            .addTo(map)
            .bindPopup(popupContent)
            .openPopup();

        map.flyTo([lat, lng], 15);

        showFindPointModal = false;
    }

    async function openAddOdpModal(latlng) {
        isEditingOdp = false;
        odpModalTitle = "Add ODP";
        odpLat = latlng.lat;
        odpLng = latlng.lng;
        odpName = "";
        odpLocation = await reverseGeocode(odpLat, odpLng);
        odpNotes = "";
        showOdpModal = true;
    }

    async function openEditOdpModal(odpId) {
        const odp = odps.find((o) => o.id == odpId);
        if (!odp) return;
        isEditingOdp = true;
        editingOdpId = odpId;
        odpModalTitle = "Edit ODP";
        odpName = odp.name;
        odpLocation = odp.location || (await reverseGeocode(odp.lat, odp.lng));
        odpNotes = odp.notes;
        odpLat = odp.lat;
        odpLng = odp.lng;
        showOdpModal = true;
    }

    async function handleOdpSubmit() {
        const data = {
            name: odpName,
            location: odpLocation,
            notes: odpNotes,
            lat: odpLat.toString(),
            lng: odpLng.toString(),
        };

        const url = isEditingOdp
            ? `${apiBaseUrl}/api/nodes/odp/${editingOdpId}`
            : `${apiBaseUrl}/api/nodes/odp`;
        const method = isEditingOdp ? "PUT" : "POST";

        try {
            const response = await fetch(url, {
                method: method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Failed to save ODP: ${response.status} ${response.statusText} - ${errorText}`,
                );
            }
            showOdpModal = false;
            location.reload();
        } catch (error) {
            console.error(error);
            alert("Error: " + error.message);
        }
    }

    async function handleDeleteOdp(odpId) {
        if (confirm("Are you sure you want to delete this ODP?")) {
            try {
                const response = await fetch(
                    `${apiBaseUrl}/api/nodes/odp/${odpId}`,
                    { method: "DELETE" },
                );
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(
                        `Failed to delete ODP: ${response.status} ${response.statusText} - ${errorText}`,
                    );
                }
                location.reload();
            } catch (error) {
                console.error(error);
                alert("Error: " + error.message);
            }
        }
    }
</script>

<div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-6">Nodes Map & Connections</h1>
    <div
        bind:this={mapElement}
        class="h-[600px] rounded-lg shadow-lg mb-8 z-10 relative"
        class:cursor-crosshair={isAddingOdpMode}
    ></div>

    {#if isAddingOdpMode}
        <div
            class="absolute top-20 left-1/2 -translate-x-1/2 bg-warning text-warning-content p-2 rounded-lg shadow-lg z-20 flex items-center gap-2"
        >
            <span>Click on the map to place the ODP</span>
            <button
                class="btn btn-xs btn-circle"
                on:click={() => (isAddingOdpMode = false)}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                    /></svg
                >
            </button>
        </div>
    {/if}
    <!-- Connections Table -->
    <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold">Connections</h2>
        <div class="flex gap-2">
            <button class="btn btn-primary" on:click={openAddModal}
                >Add Connection</button
            >
            <button
                class="btn btn-secondary"
                on:click={() => (isAddingOdpMode = true)}>Add ODP</button
            >
        </div>
    </div>
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
                        <td>{nodeMap.get(conn.deviceAId)?.name || "Unknown"}</td
                        >
                        <td>{nodeMap.get(conn.deviceBId)?.name || "Unknown"}</td
                        >
                        <td class="flex gap-2">
                            <button
                                class="btn btn-sm btn-success"
                                on:click={() => viewConnection(conn.id)}
                            >
                                View
                            </button>
                            <button
                                class="btn btn-sm btn-info"
                                on:click={() => openEditModal(conn)}
                            >
                                Edit
                            </button>
                            <button
                                class="btn btn-sm btn-error"
                                on:click={() => deleteConnection(conn.id)}
                            >
                                Delete
                            </button>
                            <button
                                class="btn btn-sm btn-warning"
                                on:click={() => openFindPointModal(conn)}
                            >
                                Find Point
                            </button>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
</div>

<!-- Add/Edit Connection Modal -->
{#if showAddConnectionModal}
    <div class="modal modal-open">
        <div class="modal-box w-11/12 max-w-2xl">
            <h3 class="font-bold text-lg">{modalTitle}</h3>
            <form
                on:submit|preventDefault={handleSubmit}
                bind:this={connectionForm}
            >
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
                            required
                            bind:value={deviceAId}
                            on:change={handleDeviceAChange}
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
                            required
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
                            required
                            bind:value={deviceBId}
                            on:change={handleDeviceBChange}
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
                            required
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
                    <label class="label">
                        <span class="label-text">ODP Path</span>
                    </label>
                    <div class="flex items-center gap-2">
                        <select
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
                            on:click={addOdpToPath}>Add</button
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
                                    on:click={() => removeOdpFromPath(i)}
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
                    <button
                        type="button"
                        class="btn"
                        on:click={() => (showAddConnectionModal = false)}
                        >Cancel</button
                    >
                    <button type="submit" class="btn btn-primary">Save</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- Find Point Modal -->
{#if showFindPointModal}
    <div class="modal modal-open">
        <div class="modal-box">
            <h3 class="font-bold text-lg">Find Point on Route</h3>
            <form
                on:submit|preventDefault={handleFindPointSubmit}
                bind:this={findPointForm}
            >
                <div class="form-control">
                    <label class="label" for="start-node-select"
                        >Start From</label
                    >
                    <select
                        id="start-node-select"
                        class="select select-bordered"
                        bind:value={startNodeId}
                    >
                        {#if connectionMap.get(findPointConnectionId)}
                            {@const conn = connectionMap.get(
                                findPointConnectionId,
                            )}
                            {#if nodeMap.get(conn.deviceAId)}
                                <option value={conn.deviceAId}>
                                    {nodeMap.get(conn.deviceAId).name}
                                </option>
                            {/if}
                            {#if nodeMap.get(conn.deviceBId)}
                                <option value={conn.deviceBId}>
                                    {nodeMap.get(conn.deviceBId).name}
                                </option>
                            {/if}
                        {/if}
                    </select>
                </div>
                <div class="form-control mt-4">
                    <label class="label" for="distance-input"
                        >Distance (meters)</label
                    >
                    <input
                        type="number"
                        id="distance-input"
                        class="input input-bordered"
                        required
                        bind:value={distance}
                    />
                </div>
                <div class="modal-action">
                    <button
                        type="button"
                        class="btn"
                        on:click={() => (showFindPointModal = false)}
                        >Cancel</button
                    >
                    <button type="submit" class="btn btn-primary">Find</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- Add/Edit ODP Modal -->
{#if showOdpModal}
    <div class="modal modal-open">
        <div class="modal-box">
            <h3 class="font-bold text-lg">{odpModalTitle}</h3>
            <form
                on:submit|preventDefault={handleOdpSubmit}
                bind:this={odpForm}
            >
                <div class="form-control">
                    <label class="label" for="odpName">Name</label>
                    <input
                        type="text"
                        id="odpName"
                        class="input input-bordered"
                        required
                        bind:value={odpName}
                    />
                </div>
                <div class="form-control mt-4">
                    <label class="label" for="odpLocation">Location</label>
                    <input
                        type="text"
                        id="odpLocation"
                        class="input input-bordered"
                        bind:value={odpLocation}
                    />
                </div>
                <div class="form-control mt-4">
                    <label class="label" for="odpNotes">Notes</label>
                    <textarea
                        id="odpNotes"
                        class="textarea textarea-bordered"
                        bind:value={odpNotes}
                    ></textarea>
                </div>
                <div class="modal-action">
                    <button
                        type="button"
                        class="btn"
                        on:click={() => (showOdpModal = false)}>Cancel</button
                    >
                    <button type="submit" class="btn btn-primary">Save</button>
                </div>
            </form>
        </div>
    </div>
{/if}
