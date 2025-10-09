<script lang="ts">
    import { onMount } from "svelte";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";
    import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
    import "leaflet-routing-machine";
    import "lrm-graphhopper";
    import * as turf from "@turf/turf";
    import type { Connection, Node, Odp } from "../types";

    import {
        blueIcon,
        greenIcon,
        redIcon,
        yellowIcon,
    } from "../assets/map-icon";

    import ConnectionTable from "./ConnectionTable.svelte";
    import ConnectionModal from "./ConnectionModal.svelte";
    import FindPointModal from "./FindPointModal.svelte";
    import OdpModal from "./OdpModal.svelte";

    type Props = {
        nodes: Node[];
        connections: Connection[];
        odps: Odp[];
        nodesWithLocation: Node[];
        apiBaseUrl: string;
        osrmApiUrl: string;
        graphhopperApiUrl: string;
    };

    const {
        nodes,
        connections,
        odps,
        nodesWithLocation,
        apiBaseUrl,
        osrmApiUrl,
        graphhopperApiUrl,
    } = $props<Props>();

    let map: L.Map;
    let mapElement: HTMLElement;
    let findPointMarker: L.Marker | null = null;
    let routingService = $state("osrm");

    // Map objects
    const routeLayers: { [key: number]: L.GeoJSON } = {};
    const routeControls: { [key: number]: L.Routing.Control } = {};
    const odpMarkers = new Map<number, L.Marker>();

    // UI State
    let selectedRouteLayer: L.GeoJSON | null = null;
    const originalStyles = new Map<L.GeoJSON, L.PathOptions>();
    const routeGeometries: { [key: number]: any } = {};
    const routeDistances: { [key: number]: number } = {};
    const nodeMap = $derived(new Map(nodes.map((node) => [node.id, node])));

    // Editing State
    let editingConnectionId = $state<number | null>(null);
    let dirtyOdps = $state(new Map<number, { lat: number; lng: number }>());
    let originalOdpPositions = $state(
        new Map<number, { lat: string; lng: string }>(),
    );

    // Modal State
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
        const savedService = localStorage.getItem("routingService");
        if (savedService === "osrm" || savedService === "graphhopper") {
            routingService = savedService;
        }

        // Expose global functions for popup buttons
        exposeGlobalFunctions();

        map = L.map(mapElement).setView(
            [-8.300408413489784, 114.28982906747387],
            11,
        );

        const streetLayer = L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            { attribution: "&copy; OpenStreetMap" },
        );
        const satelliteLayer = L.tileLayer(
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            { attribution: "&copy; Esri" },
        );
        L.control
            .layers({ Street: streetLayer, Satellite: satelliteLayer })
            .addTo(map);
        streetLayer.addTo(map);

        nodesWithLocation.forEach((node) => {
            L.marker([parseFloat(node.lat!), parseFloat(node.lng!)], {
                icon: node.status ? greenIcon : redIcon,
            })
                .addTo(map)
                .bindPopup(
                    `<b>${node.name}</b><br>Status: ${node.status ? "Up" : "Down"}`,
                );
        });

        odps.forEach((odp) => {
            if (odp.lat && odp.lng) {
                const marker = L.marker(
                    [parseFloat(odp.lat), parseFloat(odp.lng)],
                    {
                        icon: blueIcon,
                        draggable: true,
                    },
                ).addTo(map).bindPopup(`
                        <div>
                            <b>${odp.name}</b><br>
                            ${odp.location || ""}<br><br>
                            <div style="display: flex; gap: 8px; margin-top: 8px;">
                                <button onclick="window.editOdp(${odp.id})" class="btn btn-sm btn-primary" style="padding: 4px 8px; font-size: 12px;">Edit</button>
                                <button onclick="window.deleteOdp(${odp.id})" class="btn btn-sm btn-error" style="padding: 4px 8px; font-size: 12px;">Hapus</button>
                            </div>
                        </div>
                    `);

                // Initially disable dragging
                if (marker.dragging) {
                    marker.dragging.disable();
                }

                odpMarkers.set(odp.id, marker);

                marker.on("dragend", (e) => {
                    if (editingConnectionId !== null) {
                        // Validate that this ODP is part of the connection being edited
                        const conn = connections.find(
                            (c) => c.id === editingConnectionId,
                        );
                        const isOdpInPath = conn?.odpPath?.some(
                            (p) => p.id === odp.id,
                        );

                        if (isOdpInPath) {
                            handleOdpDrag(odp.id, e.target.getLatLng());
                        }
                    }
                });
            }
        });

        map.on("click", (e) => {
            if (isAddingOdpMode) {
                newOdpLatLng = e.latlng;
                isEditOdp = false;
                selectedOdp = null;
                showOdpModal = true;
                isAddingOdpMode = false;
                mapElement.style.cursor = "";
            } else if (selectedRouteLayer) {
                selectedRouteLayer.setStyle(
                    originalStyles.get(selectedRouteLayer)!,
                );
                selectedRouteLayer = null;
            }
        });
    });

    $effect(() => {
        if (!map) return; // Wait for map to be initialized

        // This effect reruns when `routingService` changes.
        // Clear all existing routes and controls before recreating them.
        Object.values(routeControls).forEach((control) => control.remove());
        Object.values(routeLayers).forEach((layer) => layer.remove());

        for (const prop in routeControls) delete routeControls[prop];
        for (const prop in routeLayers) delete routeLayers[prop];
        for (const prop in routeGeometries) delete routeGeometries[prop];
        for (const prop in routeDistances) delete routeDistances[prop];
        originalStyles.clear();
        selectedRouteLayer = null;

        // Recreate all routes with the selected routing engine
        if (connections && connections.length > 0) {
            connections.forEach((conn) => {
                const nodeA = nodeMap.get(conn.deviceAId);
                const nodeB = nodeMap.get(conn.deviceBId);
                if (
                    nodeA &&
                    nodeB &&
                    nodeA.lat &&
                    nodeA.lng &&
                    nodeB.lat &&
                    nodeB.lng
                ) {
                    const waypoints = [
                        L.latLng(parseFloat(nodeA.lat), parseFloat(nodeA.lng)),
                    ];
                    if (conn.odpPath) {
                        // Ensure ODP waypoints are added in exact order
                        conn.odpPath.forEach((pathOdp, index) => {
                            const odp = odps.find((o) => o.id === pathOdp.id);
                            if (odp?.lat && odp?.lng) {
                                waypoints.push(
                                    L.latLng(
                                        parseFloat(odp.lat),
                                        parseFloat(odp.lng),
                                    ),
                                );
                            }
                        });
                    }
                    waypoints.push(
                        L.latLng(parseFloat(nodeB.lat), parseFloat(nodeB.lng)),
                    );

                    const routingControl = L.Routing.control({
                        waypoints,
                        router:
                            routingService === "osrm"
                                ? L.Routing.osrmv1({ serviceUrl: osrmApiUrl })
                                : new L.Routing.GraphHopper("", {
                                      serviceUrl: graphhopperApiUrl,
                                      urlParameters: {
                                          profile: "car",
                                      },
                                  }),
                        lineOptions: { styles: [{ opacity: 0, weight: 0 }] },
                        createMarker: () => null,
                        addWaypoints: false,
                        routeWhileDragging: true,
                        show: false,
                    }).addTo(map);
                    routeControls[conn.id] = routingControl;

                    routingControl.on("routesfound", (e: any) => {
                        const route = e.routes[0];
                        if (!route) return;
                        const routeGeom = turf.lineString(
                            route.coordinates.map((c: any) => [c.lng, c.lat]),
                        );
                        routeGeometries[conn.id] = routeGeom;
                        routeDistances[conn.id] = route.summary.totalDistance;
                        let routeLayer = routeLayers[conn.id];
                        if (!routeLayer) {
                            const popup = `<b>${conn.description || "C"}</b><br>${(
                                route.summary.totalDistance / 1000
                            ).toFixed(2)} km`;
                            const style: L.PathOptions = {
                                color: stringToColor(conn.id.toString()),
                                weight: 5,
                                opacity: 0.8,
                            };
                            routeLayer = L.geoJSON(routeGeom, { style })
                                .addTo(map)
                                .bindPopup(popup);
                            originalStyles.set(routeLayer, style);
                            routeLayer.on("click", (ev) => {
                                if (selectedRouteLayer) {
                                    selectedRouteLayer.setStyle(
                                        originalStyles.get(selectedRouteLayer)!,
                                    );
                                }
                                routeLayer.setStyle({
                                    color: "#FFFF00",
                                    weight: 7,
                                    opacity: 1,
                                });
                                routeLayer.bringToFront();
                                selectedRouteLayer = routeLayer;
                                L.DomEvent.stopPropagation(ev);
                            });
                            routeLayers[conn.id] = routeLayer;
                        } else {
                            routeLayer
                                .clearLayers()
                                .addData(routeGeom.geometry);
                        }
                    });
                }
            });
        }
    });

    $effect(() => {
        // Persist the user's choice to localStorage
        localStorage.setItem("routingService", routingService);
    });

    // --- Imperative Edit Mode Functions ---
    // Expose functions to global window for popup buttons
    function exposeGlobalFunctions() {
        (window as any).editOdp = (odpId: number) => {
            const odp = odps.find((o) => o.id === odpId);
            if (odp) {
                handleEditOdp(odp);
            }
        };

        (window as any).deleteOdp = (odpId: number) => {
            handleDeleteOdp(odpId);
        };
    }

    function activateEditMode(connId: number) {
        const conn = connections.find((c) => c.id === connId);
        if (conn && conn.odpPath && conn.odpPath.length > 0) {
            const pathOdpIds = conn.odpPath.map((p) => p.id);

            // Store original positions before editing
            originalOdpPositions.clear();
            pathOdpIds.forEach((odpId) => {
                const odp = odps.find((o) => o.id === odpId);
                if (odp?.lat && odp?.lng) {
                    originalOdpPositions.set(odpId, {
                        lat: odp.lat,
                        lng: odp.lng,
                    });
                }
            });

            // Only enable editing for ODPs that are in this connection's path
            for (const [odpId, marker] of odpMarkers.entries()) {
                if (pathOdpIds.includes(odpId)) {
                    if (marker.dragging) {
                        marker.dragging.enable();
                    }
                    marker.setIcon(yellowIcon);
                } else {
                    // Ensure other ODPs remain non-editable
                    if (marker.dragging) {
                        marker.dragging.disable();
                    }
                    marker.setIcon(blueIcon);
                }
            }
        }
    }

    function deactivateEditMode() {
        for (const marker of odpMarkers.values()) {
            if (marker.dragging) {
                marker.dragging.disable();
            }
            marker.setIcon(blueIcon);
        }
    }

    function handleEditRoute(connId: number) {
        deactivateEditMode(); // Deactivate previous if any
        editingConnectionId = connId;
        activateEditMode(connId);
    }

    function finishEditing() {
        if (dirtyOdps.size > 0) {
            if (confirm("You have unsaved changes. Save them now?")) {
                saveAllOdpChanges();
                // Clean up after successful save
                deactivateEditMode();
                editingConnectionId = null;
                originalOdpPositions.clear();
            } else {
                cancelEditing();
            }
        } else {
            // No changes made, just exit edit mode
            deactivateEditMode();
            editingConnectionId = null;
            originalOdpPositions.clear();
        }
    }

    function cancelEditing() {
        // Check if there are unsaved changes and confirm cancellation
        if (dirtyOdps.size > 0) {
            if (
                !confirm(
                    "Are you sure you want to cancel? All unsaved changes will be lost.",
                )
            ) {
                return; // User chose not to cancel
            }
        }

        // Restore original positions
        for (const [odpId, originalPos] of originalOdpPositions.entries()) {
            const odp = odps.find((o) => o.id === odpId);
            const marker = odpMarkers.get(odpId);

            if (odp && marker && originalPos) {
                // Restore ODP data
                odp.lat = originalPos.lat;
                odp.lng = originalPos.lng;

                // Restore marker position
                marker.setLatLng([
                    parseFloat(originalPos.lat),
                    parseFloat(originalPos.lng),
                ]);
            }
        }

        // Update routes with original positions
        connections.forEach((conn) => {
            if (conn.odpPath?.some((p) => originalOdpPositions.has(p.id))) {
                const routingControl = routeControls[conn.id];
                if (routingControl) {
                    const nodeA = nodeMap.get(conn.deviceAId);
                    const nodeB = nodeMap.get(conn.deviceBId);
                    if (nodeA?.lat && nodeB?.lat) {
                        const newWps = [
                            L.latLng(
                                parseFloat(nodeA.lat),
                                parseFloat(nodeA.lng),
                            ),
                        ];

                        conn.odpPath.forEach((pathOdp) => {
                            const o = odps.find((odp) => odp.id === pathOdp.id);
                            if (o?.lat && o?.lng) {
                                newWps.push(
                                    L.latLng(
                                        parseFloat(o.lat),
                                        parseFloat(o.lng),
                                    ),
                                );
                            }
                        });

                        newWps.push(
                            L.latLng(
                                parseFloat(nodeB.lat),
                                parseFloat(nodeB.lng),
                            ),
                        );

                        routingControl.setWaypoints(newWps);
                    }
                }
            }
        });

        // Clear dirty state
        dirtyOdps.clear();
        originalOdpPositions.clear();

        // Deactivate edit mode
        deactivateEditMode();
        editingConnectionId = null;
    }

    function handleOdpDrag(odpId: number, newLatLng: L.LatLng) {
        const odpToUpdate = odps.find((o) => o.id === odpId);
        if (odpToUpdate) {
            odpToUpdate.lat = newLatLng.lat.toString();
            odpToUpdate.lng = newLatLng.lng.toString();
        }

        connections.forEach((conn) => {
            if (conn.odpPath?.some((p) => p.id === odpId)) {
                const routingControl = routeControls[conn.id];
                if (routingControl) {
                    const nodeA = nodeMap.get(conn.deviceAId);
                    const nodeB = nodeMap.get(conn.deviceBId);
                    if (nodeA?.lat && nodeB?.lat) {
                        // Build waypoints in exact order from connection's odpPath
                        const newWps = [
                            L.latLng(
                                parseFloat(nodeA.lat),
                                parseFloat(nodeA.lng),
                            ),
                        ];

                        // Maintain exact order from conn.odpPath
                        conn.odpPath.forEach((pathOdp, index) => {
                            const o = odps.find((odp) => odp.id === pathOdp.id);
                            if (o?.lat && o?.lng) {
                                newWps.push(
                                    L.latLng(
                                        parseFloat(o.lat),
                                        parseFloat(o.lng),
                                    ),
                                );
                            }
                        });

                        newWps.push(
                            L.latLng(
                                parseFloat(nodeB.lat),
                                parseFloat(nodeB.lng),
                            ),
                        );

                        // Update route with ordered waypoints
                        routingControl.setWaypoints(newWps);
                    }
                }
            }
        });

        dirtyOdps.set(odpId, {
            lat: newLatLng.lat.toString(),
            lng: newLatLng.lng.toString(),
        });
    }

    async function saveAllOdpChanges() {
        if (dirtyOdps.size === 0) return;
        const promises = Array.from(dirtyOdps.entries()).map(
            ([odpId, latlng]) => {
                const odp = odps.find((o) => o.id === odpId)!;
                const payload = {
                    name: odp.name,
                    location: odp.location,
                    notes: odp.notes,
                    lat: latlng.lat,
                    lng: latlng.lng,
                };
                return fetch(`${apiBaseUrl}/api/nodes/odp/${odpId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            },
        );
        try {
            const responses = await Promise.all(promises);
            for (const response of responses) {
                if (!response.ok) {
                    console.error("Failed to save ODP:", await response.json());
                    throw new Error(
                        `Failed to save ODP ${response.url}. Status: ${response.status}`,
                    );
                }
            }
            alert("All ODP changes saved successfully!");
            dirtyOdps.clear();
        } catch (error) {
            console.error(error);
            alert("Error saving ODP changes: " + (error as Error).message);
        }
    }

    function viewConnection(connId: number) {
        const routeLayer = routeLayers[connId];
        if (routeLayer) {
            if (selectedRouteLayer) {
                selectedRouteLayer.setStyle(
                    originalStyles.get(selectedRouteLayer)!,
                );
            }
            routeLayer.setStyle({ color: "#FFFF00", weight: 7, opacity: 1 });
            routeLayer.bringToFront();
            selectedRouteLayer = routeLayer;
            map.fitBounds(routeLayer.getBounds().pad(0.1));
            routeLayer.openPopup();
        }
    }

    // CRUD functions
    async function deleteConnection(connId: number) {
        if (confirm("Are you sure?")) {
            await fetch(`${apiBaseUrl}/api/nodes/connections/${connId}`, {
                method: "DELETE",
            });
            location.reload();
        }
    }
    function handleFindPoint(data: any) {
        const { connectionId, startNodeId, distance } = data;
        const distanceMeters = parseFloat(distance as any);
        if (isNaN(distanceMeters)) {
            alert("Invalid distance.");
            return;
        }
        const routeGeom = routeGeometries[connectionId];
        const routeDist = routeDistances[connectionId];
        if (!routeGeom) {
            alert("Route not found for this connection.");
            return;
        }
        if (distanceMeters > routeDist) {
            alert(
                `Distance is greater than route distance (${routeDist.toFixed(2)}m)`,
            );
            return;
        }
        const conn = connections.find((c) => c.id === connectionId);
        if (!conn) return;
        let line = routeGeom;
        if (startNodeId === conn.deviceBId) {
            line = turf.lineString([...line.geometry.coordinates].reverse());
        }
        const point = turf.along(line, distanceMeters, { units: "meters" });
        if (findPointMarker) {
            map.removeLayer(findPointMarker);
        }
        const lat = point.geometry.coordinates[1];
        const lng = point.geometry.coordinates[0];
        const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        const popupContent = document.createElement("div");
        popupContent.innerHTML = `Point at ${distanceMeters}m from ${nodeMap.get(startNodeId)!.name}<br><br><button class="btn btn-sm btn-primary" id="copy-gmaps-link-btn">Copy Link</button>`;
        popupContent
            .querySelector("#copy-gmaps-link-btn")!
            .addEventListener("click", () => {
                navigator.clipboard
                    .writeText(googleMapsUrl)
                    .then(() => alert("Link copied!"));
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
        const { id, ...payload } = conn;
        try {
            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "Failed to save connection");
            }
            showConnectionModal = false;
            location.reload();
        } catch (error) {
            alert("Error: " + (error as Error).message);
        }
    }
    async function handleSaveOdp(odp: any) {
        const url = odp.id
            ? `${apiBaseUrl}/api/nodes/odp/${odp.id}`
            : `${apiBaseUrl}/api/nodes/odp`;
        const method = odp.id ? "PUT" : "POST";
        try {
            const r = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(odp),
            });
            if (!r.ok) {
                throw new Error(await r.text());
            }
            showOdpModal = false;
            location.reload();
        } catch (e) {
            alert("Error: " + (e as Error).message);
        }
    }
    async function handleDeleteOdp(odpId: number) {
        if (confirm("Are you sure?")) {
            try {
                const r = await fetch(`${apiBaseUrl}/api/nodes/odp/${odpId}`, {
                    method: "DELETE",
                });
                if (!r.ok) {
                    throw new Error(await r.text());
                }
                location.reload();
            } catch (e) {
                alert("Error: " + (e as Error).message);
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
        mapElement.style.cursor = "crosshair";
        isAddingOdpMode = true;
    }
    function handleEditOdp(odp: Odp) {
        isEditOdp = true;
        selectedOdp = odp;
        showOdpModal = true;
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            if (editingConnectionId !== null) {
                event.preventDefault();
                cancelEditing();
            } else if (isAddingOdpMode) {
                event.preventDefault();
                isAddingOdpMode = false;
                mapElement.style.cursor = "";
            }
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-6">Nodes Map & Connections</h1>

    {#if isAddingOdpMode}
        <div class="toast toast-top toast-center z-50">
            <div class="alert alert-info">
                <span>Click on the map to place the new ODP.</span>
            </div>
        </div>
    {/if}

    {#if editingConnectionId !== null}
        {@const editingConnection = connections.find(
            (c) => c.id === editingConnectionId,
        )}
        <div
            class="sticky top-16 left-1/2 -translate-x-1/2 bg-warning text-warning-content p-3 rounded-lg shadow-lg z-40 flex items-center gap-4 w-max"
        >
            <div class="flex flex-col">
                <div class="flex items-center gap-2">
                    <span class="font-semibold">Route Edit Mode Active</span>
                    {#if dirtyOdps.size > 0}
                        <span class="badge badge-error badge-sm">
                            {dirtyOdps.size} unsaved changes
                        </span>
                    {/if}
                </div>

                {#if editingConnection?.odpPath && editingConnection.odpPath.length > 0}
                    <span class="text-xs opacity-75">
                        Yellow pins can be dragged to reposition ODPs in
                        sequence
                    </span>
                {/if}
            </div>
            <div class="flex gap-2">
                <button class="btn btn-sm btn-error" onclick={cancelEditing}
                    >Cancel</button
                >
                <button class="btn btn-sm btn-primary" onclick={finishEditing}
                    >Finish Editing</button
                >
            </div>
        </div>
    {/if}

    <div
        bind:this={mapElement}
        class="h-[600px] rounded-lg shadow-lg mb-8 z-10 relative"
    ></div>

    <div class="mb-4">
        <span class="mr-4 font-medium">Routing Engine:</span>
        <label class="mr-4">
            <input
                type="radio"
                name="routing-service"
                value="osrm"
                bind:group={routingService}
            />
            OSRM
        </label>
        <label>
            <input
                type="radio"
                name="routing-service"
                value="graphhopper"
                bind:group={routingService}
            />
            GraphHopper
        </label>
    </div>

    {#if editingConnectionId !== null && dirtyOdps.size > 0}
        <div class="fixed bottom-10 right-10 z-[1000] flex gap-2">
            <button
                class="btn btn-error shadow-lg"
                onclick={cancelEditing}
                title="Cancel and discard all changes"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 mr-2"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    ><path
                        fill-rule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                    /></svg
                >
                Cancel
            </button>
            <button
                class="btn btn-success shadow-lg"
                onclick={saveAllOdpChanges}
                title="Save all ODP position changes"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 mr-2"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    ><path
                        fill-rule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clip-rule="evenodd"
                    /></svg
                >
                Save Changes ({dirtyOdps.size})
            </button>
        </div>
    {/if}

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
        onEditRoute={handleEditRoute}
        {editingConnectionId}
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
