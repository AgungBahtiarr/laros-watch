<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";
    import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
    import "leaflet-draw";
    import "leaflet-draw/dist/leaflet.draw.css";

    import type { Node, Connection, OdpPoint } from "$lib/types";
    import {
        fetchAllNodes,
        fetchAllConnections,
        saveCustomRoute,
        getEventSource,
        fetchAllOdpPoints,
        saveOdpPoint,
        updateOdpPoint,
        deleteOdpPoint,
    } from "$lib/api";
    import {
        greenIcon,
        redIcon,
        blueIcon,
        createRoute,
        clearHighlight,
        highlightRoute,
    } from "$lib/map";
    import AddConnectionModal from "$lib/components/map/AddConnectionModal.svelte";
    import ManageConnectionsModal from "$lib/components/map/ManageConnectionsModal.svelte";
    import EditCustomRoutesModal from "$lib/components/map/EditCustomRoutesModal.svelte";
    import AddOdpPointModal from "$lib/components/map/AddOdpPointModal.svelte";
    import EditOdpPointModal from "$lib/components/map/EditOdpPointModal.svelte";

    // --- Component State ---
    let mapContainer: HTMLElement;
    let mapInstance: L.Map | null = null;
    let allNodes = $state<Node[]>([]);
    let connections = $state<Connection[]>([]);
    let odpPoints = $state<OdpPoint[]>([]);
    let connectionError = $state<any>(null);

    // --- UI State ---
    let showAddConnectionModal = $state(false);
    let showManageConnectionsModal = $state(false);
    let showEditCustomRoutesModal = $state(false);
    let showAddOdpModal = $state(false);
    let showEditOdpModal = $state(false);
    let selectedConnectionForDrawing = $state<Connection | null>(null);
    let selectedOdpForEdit = $state<OdpPoint | null>(null);
    let newOdpCoordinates = $state<{ lat: number; lng: number } | null>(null);
    let newOdpLocation = $state<string>("");
    let isDrawingOdp = $state(false);

    // --- Leaflet Layers & Controls ---
    let markerLayer = L.layerGroup();
    let routingControls: any[] = [];
    let routeControlCounter = 0;
    let drawControl: any = null;
    let drawnItems: L.FeatureGroup | null = null;

    // --- Data Fetching ---
    const fetchAllData = async () => {
        connectionError = null;
        try {
            const [nodes, conns, odps] = await Promise.all([
                fetchAllNodes(),
                fetchAllConnections(),
                fetchAllOdpPoints(),
            ]);
            allNodes = nodes;
            connections = conns;
            odpPoints = odps;
        } catch (e) {
            console.error("Data fetch error:", e);
            connectionError = {
                title: "Data Fetch Error",
                subtitle: (e as Error).message,
            };
        }
    };

    // --- Map Drawing ---
    const drawMapContent = () => {
        if (!mapInstance) return;

        markerLayer.clearLayers();
        routingControls.forEach((control) => control.remove());
        routingControls = [];
        clearHighlight();

        odpPoints.forEach((odp) => {
            const lat = parseFloat(odp.lat);
            const lng = parseFloat(odp.lng);
            if (isNaN(lat) || isNaN(lng)) return;
            L.marker([lat, lng], { icon: blueIcon })
                .bindPopup(`<b>${odp.name}</b><br>(ODP)`)
                .on("click", () => {
                    selectedOdpForEdit = odp;
                    showEditOdpModal = true;
                })
                .addTo(markerLayer);
        });

        allNodes.forEach((node) => {
            const lat = parseFloat(node.lat);
            const lng = parseFloat(node.lng);
            if (isNaN(lat) || isNaN(lng)) return;
            const icon = node.status === true ? greenIcon : redIcon;
            L.marker([lat, lng], { icon })
                .bindPopup(
                    `<b>${node.name}</b><br>IP: ${node.ipMgmt}<br>Status: ${
                        node.status === true ? "Online" : "Offline"
                    }`,
                )
                .addTo(markerLayer);
        });

        connections.forEach((conn) => {
            const nodeA = allNodes.find((n) => n.deviceId === conn.deviceAId);
            const nodeB = allNodes.find((n) => n.deviceId === conn.deviceBId);
            if (!nodeA || !nodeB) return;

            const routeControl = createRoute(
                conn,
                nodeA,
                nodeB,
                mapInstance!,
                routeControlCounter++,
            );
            if (routeControl) {
                routeControl.addTo(mapInstance!);
                routingControls.push(routeControl);
            }
        });
    };

    // --- ODP Point Editing ---
    const handleSaveOdp = async (detail: {
        name: string;
        location: string;
        notes: string;
    }) => {
        if (!newOdpCoordinates) return;
        try {
            await saveOdpPoint({ ...detail, ...newOdpCoordinates });
            alert("ODP saved!");
            await fetchAllData();
        } catch (e) {
            console.error("Failed to save ODP:", e);
            alert("Failed to save ODP.");
        } finally {
            stopDrawing();
            showAddOdpModal = false;
            newOdpCoordinates = null;
            newOdpLocation = "";
        }
    };

    const startDrawingOdp = () => {
        if (!mapInstance) return;
        stopDrawing();
        isDrawingOdp = true;

        drawnItems = new L.FeatureGroup().addTo(mapInstance);

        drawControl = new (L.Control as any).Draw({
            edit: false,
            draw: {
                polyline: false,
                polygon: false,
                rectangle: false,
                circle: false,
                marker: { icon: blueIcon },
                circlemarker: false,
            },
        });
        mapInstance.addControl(drawControl);

        mapInstance.on((L as any).Draw.Event.CREATED, async (e: any) => {
            const { lat, lng } = e.layer.getLatLng();
            newOdpCoordinates = { lat, lng };

            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
                );
                if (response.ok) {
                    const data = await response.json();
                    newOdpLocation = data.display_name || "";
                } else {
                    newOdpLocation = "";
                }
            } catch (error) {
                console.error("Reverse geocoding error:", error);
                newOdpLocation = "";
            }

            showAddOdpModal = true;
        });
    };

    const cancelOdpDrawing = () => {
        stopDrawing();
        showAddOdpModal = false;
        newOdpCoordinates = null;
        newOdpLocation = "";
    };

    const handleUpdateOdp = async (detail: {
        id: number;
        name: string;
        location: string;
        notes: string;
    }) => {
        try {
            await updateOdpPoint(detail.id, {
                name: detail.name,
                location: detail.location,
                notes: detail.notes,
                lat: parseFloat(selectedOdpForEdit?.lat || "0"),
                lng: parseFloat(selectedOdpForEdit?.lng || "0"),
            });
            alert("ODP updated successfully!");
            await fetchAllData();
            showEditOdpModal = false;
            selectedOdpForEdit = null;
        } catch (e) {
            console.error("Failed to update ODP:", e);
            alert("Failed to update ODP.");
        }
    };

    const handleDeleteOdp = async (id: number) => {
        try {
            await deleteOdpPoint(id);
            alert("ODP deleted successfully!");
            await fetchAllData();
            showEditOdpModal = false;
            selectedOdpForEdit = null;
        } catch (e) {
            console.error("Failed to delete ODP:", e);
            alert("Failed to delete ODP.");
        }
    };

    // --- Custom Route Editing ---
    const handleSaveCustomRoute = async (
        connId: number,
        coords: [number, number][],
    ) => {
        try {
            await saveCustomRoute(connId, coords);
            alert("Custom route saved!");
            await fetchAllData();
        } catch (e) {
            console.error("Failed to save custom route:", e);
            alert("Failed to save custom route.");
        } finally {
            stopDrawing();
        }
    };

    const startDrawing = (connection: Connection) => {
        if (!mapInstance) return;
        stopDrawing();
        showEditCustomRoutesModal = false;
        selectedConnectionForDrawing = connection;

        drawnItems = new L.FeatureGroup().addTo(mapInstance);

        if (
            connection.customRoute?.coordinates &&
            connection.customRoute.coordinates.length > 0
        ) {
            const polyline = L.polyline(connection.customRoute.coordinates, {
                color: "orange",
            });
            drawnItems.addLayer(polyline);
        }

        drawControl = new (L.Control as any).Draw({
            edit: { featureGroup: drawnItems },
            draw: {
                polyline: { shapeOptions: { color: "orange" } },
                polygon: false,
                rectangle: false,
                circle: false,
                marker: false,
                circlemarker: false,
            },
        });
        mapInstance.addControl(drawControl);

        mapInstance.on(L.Draw.Event.CREATED, (e: any) =>
            handleSaveCustomRoute(
                selectedConnectionForDrawing!.id,
                e.layer.getLatLngs().map((ll: any) => [ll.lat, ll.lng]),
            ),
        );
        mapInstance.on((L as any).Draw.Event.EDITED, (e: any) =>
            e.layers.eachLayer((layer: any) =>
                handleSaveCustomRoute(
                    selectedConnectionForDrawing!.id,
                    layer.getLatLngs().map((ll: any) => [ll.lat, ll.lng]),
                ),
            ),
        );
        mapInstance.on((L as any).Draw.Event.DELETED, () =>
            handleSaveCustomRoute(selectedConnectionForDrawing!.id, []),
        );
    };

    const stopDrawing = () => {
        if (!mapInstance) return;
        drawControl?.remove();
        drawnItems?.remove();
        drawControl = null;
        drawnItems = null;
        selectedConnectionForDrawing = null;
        isDrawingOdp = false;
        mapInstance
            .off((L as any).Draw.Event.CREATED)
            .off((L as any).Draw.Event.EDITED)
            .off((L as any).Draw.Event.DELETED);
    };

    // --- Lifecycle & Effects ---
    onMount(() => {
        let eventSource: EventSource;

        const initializeMap = async () => {
            await tick();
            if (!mapContainer) return;

            mapInstance = L.map(mapContainer).setView([-8.3, 114.25], 10);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            }).addTo(mapInstance);

            markerLayer.addTo(mapInstance);

            mapInstance.on("click", (e) => {
                const target = e.originalEvent.target as HTMLElement;

                if (
                    target &&
                    target.tagName === "path" &&
                    target.classList.contains("leaflet-interactive")
                ) {
                    const dataControlId =
                        (target.dataset && target.dataset.controlId) || null;
                    let clickedConnection = null;
                    let clickedControl = null;

                    if (dataControlId) {
                        for (let i = 0; i < routingControls.length; i++) {
                            const control = routingControls[i] as any;
                            if (control._controlId === dataControlId) {
                                clickedControl = routingControls[i];
                                clickedConnection = control._connectionInfo;
                                break;
                            }
                        }
                    } else {
                        const targetColor = target.getAttribute("stroke");
                        for (let i = 0; i < routingControls.length; i++) {
                            const control = routingControls[i];
                            const connectionInfo = (control as any)
                                ._connectionInfo;
                            if (
                                connectionInfo &&
                                connectionInfo.color === targetColor
                            ) {
                                clickedConnection = connectionInfo;
                                clickedControl = control;
                                break;
                            }
                        }
                    }

                    if (clickedConnection && clickedControl) {
                        highlightRoute(clickedControl, clickedConnection.color);

                        const routes = (clickedControl as any)._routes;
                        if (routes && routes.length > 0 && routes[0].summary) {
                            const route = routes[0];
                            const distanceKm = (
                                route.summary.totalDistance / 1000
                            ).toFixed(2);

                            const popupContent = `
            							<div class="text-sm">
            								<div class="font-bold text-base mb-2">${clickedConnection.connection.description}</div>
            								<div><b>Jarak:</b> ${distanceKm} km</div>
            								<div class="text-xs mt-2 opacity-70">
            									${clickedConnection.nodeA.name} ↔ ${clickedConnection.nodeB.name}
            								</div>
            							</div>
            						`;

                            L.popup({
                                maxWidth: 250,
                                className: "route-popup",
                            })
                                .setLatLng(e.latlng)
                                .setContent(popupContent)
                                .openOn(mapInstance!);
                        }
                        return;
                    }
                }

                if (!selectedConnectionForDrawing && !isDrawingOdp) {
                    clearHighlight();
                }
            });

            fetchAllData();

            eventSource = getEventSource();
            eventSource.addEventListener("notification", (event) => {
                const data = JSON.parse(event.data);
                if (!data.nodeChanges) return;
                const change = data.nodeChanges[0];
                const nodeIndex = allNodes.findIndex(
                    (n) => n.ipMgmt === change.ipMgmt,
                );
                if (nodeIndex !== -1) {
                    const newNodes = [...allNodes];
                    newNodes[nodeIndex] = {
                        ...newNodes[nodeIndex],
                        status: change.status,
                    };
                    allNodes = newNodes;
                }
            });
        };

        initializeMap();

        return () => {
            eventSource?.close();
            mapInstance?.remove();
        };
    });

    $effect(() => {
        const _ = allNodes;
        const __ = connections;
        const ___ = odpPoints;
        if (mapInstance) {
            drawMapContent();
        }
    });
</script>

<div class="bg-base-100 rounded-2xl shadow-xl border border-base-300 p-6 mb-8">
    <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-bold text-base-content">Network Map</h2>
        {#if !selectedConnectionForDrawing && !isDrawingOdp}
            <div class="menu-bar">
                <!-- Connection Menu -->
                <div class="dropdown dropdown-end">
                    <div tabindex="0" role="button" class="btn btn-secondary">
                        Connection
                        <svg
                            class="w-4 h-4 ml-1"
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
                    <ul
                        tabindex="0"
                        class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52"
                    >
                        <li>
                            <a onclick={() => (showAddConnectionModal = true)}>
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
                                        d="M12 4v16m8-8H4"
                                    ></path>
                                </svg>
                                Add Connection</a
                            >
                        </li>
                        <li>
                            <a
                                onclick={() =>
                                    (showManageConnectionsModal = true)}
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
                                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                    ></path>
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                    ></path>
                                </svg>
                                Manage Connections</a
                            >
                        </li>
                    </ul>
                </div>

                <!-- Routes Menu -->
                <div class="dropdown dropdown-end">
                    <div tabindex="0" role="button" class="btn btn-primary">
                        Routes
                        <svg
                            class="w-4 h-4 ml-1"
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
                    <ul
                        tabindex="0"
                        class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52"
                    >
                        <li>
                            <a
                                onclick={() =>
                                    (showEditCustomRoutesModal = true)}
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
                                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                                    ></path>
                                </svg>
                                Edit Custom Routes</a
                            >
                        </li>
                    </ul>
                </div>

                <!-- ODP Menu -->
                <div class="dropdown dropdown-end">
                    <div tabindex="0" role="button" class="btn btn-info">
                        ODP
                        <svg
                            class="w-4 h-4 ml-1"
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
                    <ul
                        tabindex="0"
                        class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52"
                    >
                        <li>
                            <a onclick={startDrawingOdp}>
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
                                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                    ></path>
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                    ></path>
                                </svg>
                                Add ODP</a
                            >
                        </li>
                        <li class="divider"></li>
                        <li>
                            <a
                                onclick={() => {
                                    if (selectedOdpForEdit) {
                                        showEditOdpModal = true;
                                    } else {
                                        alert(
                                            "Please click on an ODP marker first to select it for editing.",
                                        );
                                    }
                                }}
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
                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    ></path>
                                </svg>
                                Edit ODP</a
                            >
                        </li>
                        <li>
                            <a
                                onclick={() => {
                                    if (selectedOdpForEdit) {
                                        showEditOdpModal = true;
                                    } else {
                                        alert(
                                            "Please click on an ODP marker first to select it for deletion.",
                                        );
                                    }
                                }}
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
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    ></path>
                                </svg>
                                Delete ODP</a
                            >
                        </li>
                    </ul>
                </div>
            </div>
        {:else if selectedConnectionForDrawing}
            <button class="btn btn-error" onclick={stopDrawing}
                >Cancel Drawing</button
            >
        {:else if isDrawingOdp}
            <button class="btn btn-error" onclick={cancelOdpDrawing}
                >Cancel</button
            >
        {/if}
    </div>

    {#if connectionError}
        <div class="alert alert-error shadow-lg rounded-xl">
            <div>
                <h3 class="font-bold">{connectionError.title}</h3>
                <p class="text-sm">{connectionError.subtitle}</p>
            </div>
        </div>
    {/if}

    <div
        bind:this={mapContainer}
        class="h-[calc(100vh-250px)] rounded-lg z-0 mt-4"
    ></div>
</div>

<!-- Modals -->
{#if showAddConnectionModal}
    <AddConnectionModal
        {allNodes}
        {odpPoints}
        on:close={() => (showAddConnectionModal = false)}
        on:save={() => {
            showAddConnectionModal = false;
            fetchAllData();
        }}
    />
{/if}

{#if showManageConnectionsModal}
    <ManageConnectionsModal
        {connections}
        {allNodes}
        {odpPoints}
        on:close={() => (showManageConnectionsModal = false)}
        on:update={fetchAllData}
        on:delete={fetchAllData}
    />
{/if}

{#if showEditCustomRoutesModal}
    <EditCustomRoutesModal
        {connections}
        {allNodes}
        on:close={() => (showEditCustomRoutesModal = false)}
        on:startdrawing={(e) => startDrawing(e.detail)}
        on:delete={fetchAllData}
    />
{/if}

{#if showAddOdpModal}
    <AddOdpPointModal
        location={newOdpLocation}
        on:close={cancelOdpDrawing}
        on:save={(e) => handleSaveOdp(e.detail)}
    />
{/if}

{#if showEditOdpModal}
    <div class="edit-odp-modal">
        <EditOdpPointModal
            odpPoint={selectedOdpForEdit}
            on:close={() => (showEditOdpModal = false)}
            on:save={(e) => handleUpdateOdp(e.detail)}
            on:delete={(e) => handleDeleteOdp(e.detail.id)}
        />
    </div>
{/if}

<style>
    :global(.leaflet-routing-container) {
        display: none;
    }
    :global(.leaflet-overlay-pane) {
        z-index: 450 !important;
        pointer-events: none;
    }
    :global(.leaflet-overlay-pane svg),
    :global(.leaflet-overlay-pane path),
    :global(path.leaflet-interactive) {
        pointer-events: auto !important;
        cursor: pointer !important;
    }
    :global(.leaflet-routing-container path),
    :global(.leaflet-overlay-pane g),
    :global(.leaflet-overlay-pane g path) {
        pointer-events: auto !important;
        cursor: pointer !important;
    }
    :global(.route-popup .leaflet-popup-content-wrapper) {
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    :global(.route-popup .leaflet-popup-content) {
        margin: 12px 16px;
        line-height: 1.4;
    }
    :global(.leaflet-routing-container-hide) {
        display: none;
    }
    :global(.leaflet-interactive) {
        cursor: pointer !important;
    }
    :global(.svelte-select .list-container) {
        max-height: 350px !important;
        z-index: 9999 !important;
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15) !important;
        border-radius: 8px !important;
        border: 1px solid hsl(var(--bc) / 0.2) !important;
    }
    :global(.svelte-select .option) {
        padding: 12px 16px !important;
        font-size: 14px !important;
        line-height: 1.4 !important;
        border-bottom: 1px solid hsl(var(--bc) / 0.1) !important;
    }
    :global(.svelte-select .option:hover) {
        background-color: hsl(var(--p) / 0.1) !important;
    }
    :global(.svelte-select .option.hover) {
        background-color: hsl(var(--p) / 0.15) !important;
    }
    :global(.svelte-select .option.active) {
        background-color: hsl(var(--p)) !important;
        color: hsl(var(--pc)) !important;
    }
    :global(.svelte-select .empty) {
        padding: 16px !important;
        text-align: center !important;
        color: hsl(var(--bc) / 0.6) !important;
        font-style: italic !important;
    }
    :global(.svelte-select input) {
        font-size: 14px !important;
        padding: 8px 12px !important;
    }
    :global(.svelte-select .multi-item) {
        background-color: hsl(var(--p) / 0.1) !important;
        border-radius: 6px !important;
        padding: 4px 8px !important;
        margin: 2px !important;
    }
    :global(.svelte-select.focused .list-container) {
        z-index: 10000 !important;
    }

    /* Menu Bar Styling */
    .menu-bar {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .menu-bar .dropdown {
        position: relative;
    }

    .menu-bar .dropdown .btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 120px;
        justify-content: space-between;
    }

    .menu-bar .dropdown-content {
        min-width: 180px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        border: 1px solid hsl(var(--b3) / 0.2);
    }

    .menu-bar .dropdown-content li {
        padding: 0;
    }

    .menu-bar .dropdown-content li a {
        padding: 0.75rem 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: hsl(var(--bc));
        transition: all 0.2s ease;
    }

    .menu-bar .dropdown-content li a:hover {
        background-color: hsl(var(--b2));
        color: hsl(var(--bc));
    }

    .menu-bar .dropdown-content li a svg {
        width: 16px;
        height: 16px;
        opacity: 0.7;
    }

    /* Edit ODP Modal Styling */
    .edit-odp-modal .modal-box {
        max-width: 500px;
    }

    .edit-odp-modal .form-control {
        margin-bottom: 1rem;
    }

    .edit-odp-modal .label {
        margin-bottom: 0.5rem;
    }

    .edit-odp-modal .input,
    .edit-odp-modal .textarea {
        width: 100%;
    }

    .edit-odp-modal .modal-action {
        justify-content: space-between;
    }

    .edit-odp-modal .btn-error {
        background-color: hsl(var(--er));
        border-color: hsl(var(--er));
    }

    .edit-odp-modal .btn-error:hover {
        background-color: hsl(var(--er) / 0.8);
    }

    /* Responsive Design */
    @media (max-width: 768px) {
        .menu-bar {
            flex-wrap: wrap;
            gap: 0.25rem;
        }

        .menu-bar .btn {
            min-width: 100px;
            font-size: 0.875rem;
            padding: 0.5rem 0.75rem;
        }

        .menu-bar .dropdown-content {
            min-width: 160px;
        }

        .menu-bar .dropdown-content li a {
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
        }
    }

    @media (max-width: 480px) {
        .menu-bar {
            flex-direction: column;
            align-items: stretch;
        }

        .menu-bar .btn {
            width: 100%;
            justify-content: center;
        }

        .menu-bar .dropdown-content {
            width: 100%;
            position: static;
            box-shadow: none;
            border: none;
            background: transparent;
            padding: 0;
            margin-top: 0.5rem;
        }

        .menu-bar .dropdown-content li a {
            justify-content: center;
            background: hsl(var(--b2));
            border-radius: 0.5rem;
            margin-bottom: 0.25rem;
        }
    }
</style>
