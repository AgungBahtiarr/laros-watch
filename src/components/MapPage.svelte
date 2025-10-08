<script>
    import { onMount } from "svelte";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";
    import * as turf from "@turf/turf";

    export let nodes;
    export let connections;
    export let nodesWithLocation;
    export let routes;
    export let apiBaseUrl;

    let map;
    let mapElement;
    let selectedRouteLayer = null;
    let findPointMarker = null;
    const routeLayers = {};
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const connectionMap = new Map(connections.map((conn) => [conn.id, conn]));

    let showAddConnectionModal = false;
    let showFindPointModal = false;
    let isEdit = false;
    let modalTitle = "Add New Connection";
    let connectionForm;
    let findPointForm;

    // Form fields
    let connectionId = "";
    let description = "";
    let deviceAId = "";
    let portAId = "";
    let deviceBId = "";
    let portBId = "";
    let odpPath = "";

    let findPointConnectionId = "";
    let startNodeId = "";
    let distance = "";

    let portsA = [];
    let portsB = [];

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

        map.on("click", () => {
            if (selectedRouteLayer) {
                selectedRouteLayer.setStyle(selectedRouteLayer.originalStyle);
                selectedRouteLayer = null;
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

    function handleDeviceAChange() {
        portsA = populatePorts(deviceAId);
        portAId = "";
    }

    function handleDeviceBChange() {
        portsB = populatePorts(deviceBId);
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
        odpPath = "";
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
        odpPath = conn.odpPath?.join(", ") || "";
        portsA = populatePorts(deviceAId);
        portsB = populatePorts(deviceBId);
        showAddConnectionModal = true;
    }

    async function handleSubmit() {
        const data = {
            deviceAId: parseInt(deviceAId),
            portAId: parseInt(portAId),
            deviceBId: parseInt(deviceBId),
            portBId: parseInt(portBId),
            description: description,
            odpPath: odpPath
                .split(",")
                .map((s) => parseInt(s.trim()))
                .filter((n) => !isNaN(n)),
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
</script>

<div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-6">Nodes Map & Connections</h1>
    <div
        bind:this={mapElement}
        class="h-[600px] rounded-lg shadow-lg mb-8 z-10 relative"
    ></div>

    <!-- Connections Table -->
    <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold">Connections</h2>
        <button class="btn btn-primary" on:click={openAddModal}
            >Add Connection</button
        >
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

<!-- Add/Edit Modal -->
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
                                <option value={node.id}>{node.name}</option>
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
                                <option value={iface.id}
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
                                <option value={node.id}>{node.name}</option>
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
                                <option value={iface.id}
                                    >{iface.ifName} ({iface.ifDescr})</option
                                >
                            {/each}
                        </select>
                    </div>
                </div>
                <div class="form-control mt-4">
                    <label class="label" for="odpPath"
                        >ODP Path (comma-separated IDs)</label
                    >
                    <input
                        type="text"
                        id="odpPath"
                        class="input input-bordered"
                        bind:value={odpPath}
                    />
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
                                <option value={conn.deviceAId}
                                    >{nodeMap.get(conn.deviceAId).name}</option
                                >
                            {/if}
                            {#if nodeMap.get(conn.deviceBId)}
                                <option value={conn.deviceBId}
                                    >{nodeMap.get(conn.deviceBId).name}</option
                                >
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
