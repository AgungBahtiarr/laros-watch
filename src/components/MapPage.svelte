<script lang="ts">
    import { onMount } from "svelte";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";
    import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
    import "leaflet-routing-machine";
    import "lrm-graphhopper";
    import * as turf from "@turf/turf";
    import type { Connection, Node, Waypoint } from "@/types";

    import {
        blueIcon,
        greenIcon,
        redIcon,
        yellowIcon,
    } from "@/assets/map-icon";

    import ConnectionTable from "./ConnectionTable.svelte";
    import ConnectionModal from "./ConnectionModal.svelte";
    import FindPointModal from "./FindPointModal.svelte";
    import WaypointModal from "./WaypointModal.svelte";

    type Props = {
        nodes: Node[];
        connections: Connection[];
        waypoints: Waypoint[];
        nodesWithLocation: Node[];
        apiBaseUrl: string;
        osrmApiUrl: string;
        graphhopperApiUrl: string;
        token: string;
    };

    const {
        nodes,
        connections,
        waypoints,
        nodesWithLocation,
        apiBaseUrl,
        osrmApiUrl,
        graphhopperApiUrl,
        token,
    } = $props<Props>();

    let map: L.Map;
    let mapElement: HTMLElement;
    let findPointMarker: L.Marker | null = null;
    let routingService = $state("osrm");

    // Map objects
    const routeLayers: { [key: number]: L.GeoJSON } = {};
    const routeControls: { [key: number]: L.Routing.Control } = {};
    const waypointMarkers = new Map<number, L.Marker>();

    // UI State
    let selectedRouteLayer: L.GeoJSON | null = null;
    const originalStyles = new Map<L.GeoJSON, L.PathOptions>();
    const routeGeometries: { [key: number]: any } = {};
    const routeDistances: { [key: number]: number } = {};
    const nodeMap = $derived(new Map(nodes.map((node) => [node.id, node])));

    // Editing State
    let editingConnectionId = $state<number | null>(null);
    let dirtyWaypoints = $state(
        new Map<number, { lat: number; lng: number }>(),
    );
    let originalWaypointPositions = $state(
        new Map<number, { lat: string; lng: string }>(),
    );

    // Modal State
    let showConnectionModal = $state(false);
    let showFindPointModal = $state(false);
    let showWaypointModal = $state(false);
    let isEditConnection = $state(false);
    let isEditWaypoint = $state(false);
    let isAddingWaypointMode = $state(false);
    let selectedConnection = $state<Connection | null>(null);
    let selectedWaypoint = $state<Waypoint | null>(null);
    let newWaypointLatLng = $state<{ lat: number; lng: number } | null>(null);

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

        waypoints.forEach((waypoint) => {
            if (waypoint.lat && waypoint.lng) {
                const marker = L.marker(
                    [parseFloat(waypoint.lat), parseFloat(waypoint.lng)],
                    {
                        icon: blueIcon,
                        draggable: true,
                    },
                ).addTo(map).bindPopup(`
                        <div>
                            <b>${waypoint.name}</b><br>
                            ${waypoint.location || ""}<br><br>
                            <div style="display: flex; gap: 8px; margin-top: 8px;">
                                <button onclick="window.editWaypoint(${waypoint.id})" class="btn btn-sm btn-primary" style="padding: 4px 8px; font-size: 12px;">Edit</button>
                                <button onclick="window.deleteWaypoint(${waypoint.id})" class="btn btn-sm btn-error" style="padding: 4px 8px; font-size: 12px;">Hapus</button>
                            </div>
                        </div>
                    `);

                // Initially disable dragging
                if (marker.dragging) {
                    marker.dragging.disable();
                }

                waypointMarkers.set(waypoint.id, marker);

                marker.on("dragend", (e) => {
                    if (editingConnectionId !== null) {
                        // Validate that this Waypoint is part of the connection being edited
                        const conn = connections.find(
                            (c) => c.id === editingConnectionId,
                        );
                        const isWaypointInPath = conn?.waypointPath?.some(
                            (p) => p.id === waypoint.id,
                        );

                        if (isWaypointInPath) {
                            handleWaypointDrag(
                                waypoint.id,
                                e.target.getLatLng(),
                            );
                        }
                    }
                });
            }
        });

        map.on("click", (e) => {
            if (isAddingWaypointMode) {
                newWaypointLatLng = e.latlng;
                isEditWaypoint = false;
                selectedWaypoint = null;
                showWaypointModal = true;
                isAddingWaypointMode = false;
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
                    const wps = [
                        L.latLng(parseFloat(nodeA.lat), parseFloat(nodeA.lng)),
                    ];
                    if (conn.waypointPath) {
                        // Ensure Waypoint waypoints are added in exact order
                        conn.waypointPath.forEach((pathWaypoint, index) => {
                            const waypoint = waypoints.find(
                                (o) => o.id === pathWaypoint.id,
                            );
                            if (waypoint?.lat && waypoint?.lng) {
                                wps.push(
                                    L.latLng(
                                        parseFloat(waypoint.lat),
                                        parseFloat(waypoint.lng),
                                    ),
                                );
                            }
                        });
                    }
                    wps.push(
                        L.latLng(parseFloat(nodeB.lat), parseFloat(nodeB.lng)),
                    );

                    const routingControl = L.Routing.control({
                        waypoints: wps,
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
                        if (
                            !route ||
                            !route.coordinates ||
                            route.coordinates.length < 2
                        ) {
                            console.error(
                                `Invalid route found for connection ${conn.id}:`,
                                e,
                            );
                            return;
                        }
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
        (window as any).editWaypoint = (waypointId: number) => {
            const waypoint = waypoints.find((o) => o.id === waypointId);
            if (waypoint) {
                handleEditWaypoint(waypoint);
            }
        };

        (window as any).deleteWaypoint = (waypointId: number) => {
            handleDeleteWaypoint(waypointId);
        };
    }

    function activateEditMode(connId: number) {
        const conn = connections.find((c) => c.id === connId);
        if (conn && conn.waypointPath && conn.waypointPath.length > 0) {
            const pathWaypointIds = conn.waypointPath.map((p) => p.id);

            // Store original positions before editing
            originalWaypointPositions.clear();
            pathWaypointIds.forEach((waypointId) => {
                const waypoint = waypoints.find((o) => o.id === waypointId);
                if (waypoint?.lat && waypoint?.lng) {
                    originalWaypointPositions.set(waypointId, {
                        lat: waypoint.lat,
                        lng: waypoint.lng,
                    });
                }
            });

            // Only enable editing for Waypoints that are in this connection's path
            for (const [waypointId, marker] of waypointMarkers.entries()) {
                if (pathWaypointIds.includes(waypointId)) {
                    if (marker.dragging) {
                        marker.dragging.enable();
                    }
                    marker.setIcon(yellowIcon);
                } else {
                    // Ensure other Waypoints remain non-editable
                    if (marker.dragging) {
                        marker.dragging.disable();
                    }
                    marker.setIcon(blueIcon);
                }
            }
        }
    }

    function deactivateEditMode() {
        for (const marker of waypointMarkers.values()) {
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
        if (dirtyWaypoints.size > 0) {
            if (confirm("You have unsaved changes. Save them now?")) {
                saveAllWaypointChanges();
                // Clean up after successful save
                deactivateEditMode();
                editingConnectionId = null;
                originalWaypointPositions.clear();
            } else {
                cancelEditing();
            }
        } else {
            // No changes made, just exit edit mode
            deactivateEditMode();
            editingConnectionId = null;
            originalWaypointPositions.clear();
        }
    }

    function cancelEditing() {
        // Check if there are unsaved changes and confirm cancellation
        if (dirtyWaypoints.size > 0) {
            if (
                !confirm(
                    "Are you sure you want to cancel? All unsaved changes will be lost.",
                )
            ) {
                return; // User chose not to cancel
            }
        }

        // Restore original positions
        for (const [
            waypointId,
            originalPos,
        ] of originalWaypointPositions.entries()) {
            const waypoint = waypoints.find((o) => o.id === waypointId);
            const marker = waypointMarkers.get(waypointId);

            if (waypoint && marker && originalPos) {
                // Restore Waypoint data
                waypoint.lat = originalPos.lat;
                waypoint.lng = originalPos.lng;

                // Restore marker position
                marker.setLatLng([
                    parseFloat(originalPos.lat),
                    parseFloat(originalPos.lng),
                ]);
            }
        }

        // Update routes with original positions
        connections.forEach((conn) => {
            if (
                conn.waypointPath?.some((p) =>
                    originalWaypointPositions.has(p.id),
                )
            ) {
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

                        conn.waypointPath.forEach((pathWaypoint) => {
                            const o = waypoints.find(
                                (waypoint) => waypoint.id === pathWaypoint.id,
                            );
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
        dirtyWaypoints.clear();
        originalWaypointPositions.clear();

        // Deactivate edit mode
        deactivateEditMode();
        editingConnectionId = null;
    }

    function handleWaypointDrag(waypointId: number, newLatLng: L.LatLng) {
        const waypointToUpdate = waypoints.find((o) => o.id === waypointId);
        if (waypointToUpdate) {
            waypointToUpdate.lat = newLatLng.lat.toString();
            waypointToUpdate.lng = newLatLng.lng.toString();
        }

        connections.forEach((conn) => {
            if (conn.waypointPath?.some((p) => p.id === waypointId)) {
                const routingControl = routeControls[conn.id];
                if (routingControl) {
                    const nodeA = nodeMap.get(conn.deviceAId);
                    const nodeB = nodeMap.get(conn.deviceBId);
                    if (nodeA?.lat && nodeB?.lat) {
                        // Build waypoints in exact order from connection's waypointPath
                        const newWps = [
                            L.latLng(
                                parseFloat(nodeA.lat),
                                parseFloat(nodeA.lng),
                            ),
                        ];

                        // Maintain exact order from conn.waypointPath
                        conn.waypointPath.forEach((pathWaypoint, index) => {
                            const o = waypoints.find(
                                (waypoint) => waypoint.id === pathWaypoint.id,
                            );
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

        dirtyWaypoints.set(waypointId, {
            lat: newLatLng.lat.toString(),
            lng: newLatLng.lng.toString(),
        });
    }

    async function saveAllWaypointChanges() {
        if (dirtyWaypoints.size === 0) return;
        const promises = Array.from(dirtyWaypoints.entries()).map(
            ([waypointId, latlng]) => {
                const waypoint = waypoints.find((o) => o.id === waypointId)!;
                const payload = {
                    name: waypoint.name,
                    location: waypoint.location,
                    notes: waypoint.notes,
                    type: waypoint.type,
                    spare: waypoint.spare,
                    lat: latlng.lat,
                    lng: latlng.lng,
                };
                return fetch(
                    `${apiBaseUrl}/api/nodes/waypoints/${waypointId}`,
                    {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Basic ${token}`,
                        },
                        body: JSON.stringify(payload),
                    },
                );
            },
        );
        try {
            const responses = await Promise.all(promises);
            for (const response of responses) {
                if (!response.ok) {
                    console.error(
                        "Failed to save Waypoint:",
                        await response.json(),
                    );
                    throw new Error(
                        `Failed to save Waypoint ${response.url}. Status: ${response.status}`,
                    );
                }
            }
            alert("All Waypoint changes saved successfully!");
            dirtyWaypoints.clear();
        } catch (error) {
            console.error(error);
            alert("Error saving Waypoint changes: " + (error as Error).message);
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
                headers: { Authorization: `Basic ${token}` },
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
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Basic ${token}`,
                },
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
    async function handleSaveWaypoint(waypoint: any) {
        const url = waypoint.id
            ? `${apiBaseUrl}/api/nodes/waypoints/${waypoint.id}`
            : `${apiBaseUrl}/api/nodes/waypoints`;
        const method = waypoint.id ? "PUT" : "POST";
        try {
            const r = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Basic ${token}`,
                },
                body: JSON.stringify(waypoint),
            });
            if (!r.ok) {
                throw new Error(await r.text());
            }
            showWaypointModal = false;
            location.reload();
        } catch (e) {
            alert("Error: " + (e as Error).message);
        }
    }
    async function handleDeleteWaypoint(waypointId: number) {
        if (confirm("Are you sure?")) {
            try {
                const r = await fetch(
                    `${apiBaseUrl}/api/nodes/waypoints/${waypointId}`,
                    {
                        method: "DELETE",
                        headers: {
                            Authorization: `Basic ${token}`,
                        },
                    },
                );
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
    function handleAddWaypoint() {
        mapElement.style.cursor = "crosshair";
        isAddingWaypointMode = true;
    }
    function handleEditWaypoint(waypoint: Waypoint) {
        isEditWaypoint = true;
        selectedWaypoint = waypoint;
        showWaypointModal = true;
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            if (editingConnectionId !== null) {
                event.preventDefault();
                cancelEditing();
            } else if (isAddingWaypointMode) {
                event.preventDefault();
                isAddingWaypointMode = false;
                mapElement.style.cursor = "";
            }
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-6">Nodes Map & Connections</h1>

    {#if isAddingWaypointMode}
        <div class="toast toast-top toast-center z-50">
            <div class="alert alert-info">
                <span>Click on the map to place the new Waypoint.</span>
                <button
                    class="btn btn-sm btn-ghost"
                    onclick={() => (isAddingWaypointMode = false)}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </div>
        </div>
    {/if}

    {#if editingConnectionId !== null}
        {@const editingConnection = connections.find(
            (c) => c.id === editingConnectionId,
        )}
        <div class="toast toast-top toast-center z-50">
            <div class="alert alert-warning">
                <div
                    class="flex w-full flex-col items-center gap-2 sm:flex-row"
                >
                    <div class="flex flex-col">
                        <div class="flex items-center gap-2">
                            <span class="font-semibold"
                                >Route Edit Mode Active</span
                            >
                            {#if dirtyWaypoints.size > 0}
                                <span class="badge badge-error badge-sm">
                                    {dirtyWaypoints.size} unsaved changes
                                </span>
                            {/if}
                        </div>

                        {#if editingConnection?.waypointPath && editingConnection.waypointPath.length > 0}
                            <span class="text-xs opacity-75">
                                Yellow pins can be dragged to reposition
                                Waypoints in sequence
                            </span>
                        {/if}
                    </div>
                    <div class="flex gap-2">
                        <button
                            class="btn btn-sm btn-error"
                            onclick={cancelEditing}>Cancel</button
                        >
                        <button
                            class="btn btn-sm btn-primary"
                            onclick={finishEditing}>Finish Editing</button
                        >
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <div class="flex flex-col lg:flex-row gap-8">
        <!-- Left Column: Map -->
        <div class="lg:w-3/5 xl:w-2/3 flex flex-col">
            <div
                bind:this={mapElement}
                class="h-[600px] lg:h-full rounded-lg shadow-lg z-10 relative flex-grow"
            ></div>
            <div class="mt-4">
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
        </div>

        <!-- Right Column: Table -->
        <div
            class="lg:w-2/5 xl:w-1/3 flex flex-col h-[700px] border-black border-1 p-3 rounded-md"
        >
            <div class="flex-col md:flex-row justify-between items-center mb-4">
                <h2 class="text-2xl font-bold">Connections</h2>
                <div class="flex gap-2">
                    <button
                        class="btn btn-primary btn-sm"
                        onclick={handleAddConnection}>Add Connection</button
                    >
                    <button
                        class="btn btn-secondary btn-sm"
                        onclick={handleAddWaypoint}>Add Waypoint</button
                    >
                </div>
            </div>
            <div class="flex-grow overflow-y-auto hide-scrollbar border-black">
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
        </div>
    </div>

    {#if editingConnectionId !== null && dirtyWaypoints.size > 0}
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
                onclick={saveAllWaypointChanges}
                title="Save all Waypoint position changes"
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
                Save Changes ({dirtyWaypoints.size})
            </button>
        </div>
    {/if}
</div>

<ConnectionModal
    isOpen={showConnectionModal}
    isEdit={isEditConnection}
    connection={selectedConnection}
    {nodes}
    {waypoints}
    onSave={handleSaveConnection}
    onClose={() => (showConnectionModal = false)}
    {token}
/>
<FindPointModal
    isOpen={showFindPointModal}
    connection={selectedConnection}
    {nodes}
    onFind={handleFindPoint}
    onClose={() => (showFindPointModal = false)}
/>
<WaypointModal
    isOpen={showWaypointModal}
    isEdit={isEditWaypoint}
    waypoint={selectedWaypoint}
    latlng={newWaypointLatLng}
    onSave={handleSaveWaypoint}
    onClose={() => (showWaypointModal = false)}
    {token}
/>

<style>
    .hide-scrollbar {
        -ms-overflow-style: none; /* IE and Edge */
        scrollbar-width: none; /* Firefox */
    }
    .hide-scrollbar::-webkit-scrollbar {
        display: none; /* Chrome, Safari, and Opera */
    }
</style>
