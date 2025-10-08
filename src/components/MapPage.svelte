<script lang="ts">
    import { onMount } from "svelte";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";
    import * as turf from "@turf/turf";
    import type { Connection, Node, Odp, CustomRoute } from "../types";

    import ConnectionTable from "./ConnectionTable.svelte";
    import ConnectionModal from "./ConnectionModal.svelte";
    import FindPointModal from "./FindPointModal.svelte";
    import OdpModal from "./OdpModal.svelte";

    type Props = {
        nodes: Node[];
        connections: Connection[];
        odps: Odp[];
        nodesWithLocation: Node[];
        routes: (CustomRoute & {
            geometry: any;
            distance: number;
            connectionId: number;
        })[];
        apiBaseUrl: string;
    };

    const { nodes, connections, odps, nodesWithLocation, routes, apiBaseUrl } =
        $props<Props>();

    let map: L.Map;
    let mapElement: HTMLElement;
    let selectedRouteLayer: L.GeoJSON | null = null;
    let findPointMarker: L.Marker | null = null;
    const routeLayers: { [key: number]: L.GeoJSON } = {};
    const nodeMap = $derived(new Map(nodes.map((node) => [node.id, node])));

    let showConnectionModal = $state(false);
    let showFindPointModal = $state(false);
    let showOdpModal = $state(false);
    let isEditConnection = $state(false);
    let isEditOdp = $state(false);
    let isAddingOdpMode = $state(false);
    let selectedConnection = $state<Connection | null>(null);
    let selectedOdp = $state<Odp | null>(null);
    let newOdpLatLng = $state<{ lat: number; lng: number } | null>(null);

    function stringToColor(str: string) {
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
                    const popupElem = marker.getPopup()!.getElement();
                    popupElem
                        .querySelector(".btn-edit-odp")!
                        .addEventListener("click", (e) => {
                            const odpId = (e.target as HTMLElement).dataset
                                .odpId;
                            handleEditOdp(
                                odps.find((o) => o.id === parseInt(odpId!))!,
                            );
                        });
                    popupElem
                        .querySelector(".btn-delete-odp")!
                        .addEventListener("click", (e) => {
                            const odpId = (e.target as HTMLElement).dataset
                                .odpId;
                            handleDeleteOdp(parseInt(odpId!));
                        });
                });
            }
        });

        map.on("click", (e) => {
            if (isAddingOdpMode) {
                newOdpLatLng = e.latlng;
                isEditOdp = false;
                selectedOdp = null;
                showOdpModal = true;
                isAddingOdpMode = false; // Reset mode after click
            } else if (selectedRouteLayer) {
                selectedRouteLayer.setStyle(selectedRouteLayer.options.style);
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

                            layer.on("click", (e) => {
                                if (selectedRouteLayer) {
                                    selectedRouteLayer.setStyle(
                                        selectedRouteLayer.options.style,
                                    );
                                }
                                layer.setStyle({
                                    color: "#FFFF00",
                                    weight: 5,
                                    opacity: 1,
                                });
                                (layer as L.Path).bringToFront();
                                selectedRouteLayer = layer as L.GeoJSON;
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

    function viewConnection(connId: number) {
        const routeLayer = routeLayers[connId];
        if (routeLayer) {
            const bounds = routeLayer.getBounds();
            map.fitBounds(bounds.pad(0.1));
            routeLayer.eachLayer((layer) => {
                (layer as any).fire("click");
                layer.openPopup();
            });
        }
    }

    async function deleteConnection(connId: number) {
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

    function handleFindPoint(data: {
        connectionId: number;
        startNodeId: number;
        distance: number;
    }) {
        const { connectionId, startNodeId, distance } = data;
        const distanceMeters = parseFloat(distance as any);

        if (isNaN(distanceMeters)) {
            alert("Invalid distance.");
            return;
        }

        const routeData = routes.find((r) => r.connectionId === connectionId);
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

        const conn = connections.find((c) => c.id === connectionId);
        if (!conn) return;
        let line = routeData.geometry;

        if (startNodeId === conn.deviceBId) {
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
        const startNode = nodeMap.get(startNodeId);
        popupContent.innerHTML = `
            Point at ${distanceMeters}m from ${startNode!.name}
            <br><br>
            <button class="btn btn-sm btn-primary" id="copy-gmaps-link-btn">Copy Google Maps Link</button>
        `;

        popupContent
            .querySelector("#copy-gmaps-link-btn")!
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

    async function handleSaveConnection(conn: any) {
        const url = conn.id
            ? `${apiBaseUrl}/api/nodes/connections/${conn.id}`
            : `${apiBaseUrl}/api/nodes/connections`;
        const method = conn.id ? "PUT" : "POST";

        try {
            const response = await fetch(url, {
                method: method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(conn),
            });
            if (!response.ok)
                throw new Error(
                    `Failed to ${conn.id ? "update" : "save"} connection`,
                );
            showConnectionModal = false;
            location.reload();
        } catch (error) {
            console.error(error);
            alert("Error: " + error.message);
        }
    }

    async function handleSaveOdp(odp: any) {
        const url = odp.id
            ? `${apiBaseUrl}/api/nodes/odp/${odp.id}`
            : `${apiBaseUrl}/api/nodes/odp`;
        const method = odp.id ? "PUT" : "POST";

        try {
            const response = await fetch(url, {
                method: method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(odp),
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

    async function handleDeleteOdp(odpId: number) {
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

    function handleAddConnection() {
        isEditConnection = false;
        selectedConnection = null;
        showConnectionModal = true;
    }

    function handleEditConnection(conn: Connection) {
        isEditConnection = true;
        selectedConnection = conn;
        showConnectionModal = true;
    }

    function handleFindPointModal(conn: Connection) {
        selectedConnection = conn;
        showFindPointModal = true;
    }

    function handleAddOdp() {
        isAddingOdpMode = true;
    }

    function handleEditOdp(odp: Odp) {
        isEditOdp = true;
        selectedOdp = odp;
        showOdpModal = true;
    }
</script>

<div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-6">Nodes Map & Connections</h1>
    {#if isAddingOdpMode}
        <div
            class="sticky top-16 left-1/2 mb-4 -translate-x-1/2 bg-warning text-warning-content p-2 rounded-lg shadow-lg z-40 flex items-center gap-2 w-max"
        >
            <span>Click on the map to place the ODP</span>
            <button
                class="btn btn-xs btn-circle"
                onclick={() => (isAddingOdpMode = false)}
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

    <div
        bind:this={mapElement}
        class="h-[600px] rounded-lg shadow-lg mb-8 z-10 relative"
        class:cursor-crosshair={isAddingOdpMode}
    ></div>
    <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold">Connections</h2>
        <div class="flex gap-2">
            <button class="btn btn-primary" onclick={handleAddConnection}
                >Add Connection</button
            >
            <button class="btn btn-secondary" onclick={handleAddOdp}
                >Add ODP</button
            >
        </div>
    </div>

    <ConnectionTable
        {connections}
        {nodes}
        onView={viewConnection}
        onEdit={handleEditConnection}
        onDelete={deleteConnection}
        onFindPoint={handleFindPointModal}
    />
</div>

<ConnectionModal
    isOpen={showConnectionModal}
    isEdit={isEditConnection}
    connection={selectedConnection}
    {nodes}
    {odps}
    onSave={handleSaveConnection}
    onClose={() => (showConnectionModal = false)}
/>

<FindPointModal
    isOpen={showFindPointModal}
    connection={selectedConnection}
    {nodes}
    onFind={handleFindPoint}
    onClose={() => (showFindPointModal = false)}
/>

<OdpModal
    isOpen={showOdpModal}
    isEdit={isEditOdp}
    odp={selectedOdp}
    latlng={newOdpLatLng}
    onSave={handleSaveOdp}
    onClose={() => (showOdpModal = false)}
/>
