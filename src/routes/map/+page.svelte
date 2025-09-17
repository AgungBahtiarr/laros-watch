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
    let selectedConnectionForDrawing = $state<Connection | null>(null);
    let newOdpCoordinates = $state<{ lat: number; lng: number } | null>(null);
    let newOdpLocation = $state<string>("");
    let isDrawingOdp = $state(false);

    // --- Leaflet Layers & Controls ---
    let markerLayer = L.layerGroup();
    let routingControls: L.Routing.Control[] = [];
    let routeControlCounter = 0;
    let drawControl: L.Control.Draw | null = null;
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
    const handleSaveOdp = async (detail: { name: string; location: string; notes: string }) => {
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

        drawControl = new L.Control.Draw({
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

        mapInstance.on(L.Draw.Event.CREATED, async (e: any) => {
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

        if (connection.customRoute?.coordinates?.length > 0) {
            const polyline = L.polyline(connection.customRoute.coordinates, {
                color: "orange",
            });
            drawnItems.addLayer(polyline);
        }

        drawControl = new L.Control.Draw({
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
        mapInstance.on(L.Draw.Event.EDITED, (e: any) =>
            e.layers.eachLayer((layer: any) =>
                handleSaveCustomRoute(
                    selectedConnectionForDrawing!.id,
                    layer.getLatLngs().map((ll: any) => [ll.lat, ll.lng]),
                ),
            ),
        );
        mapInstance.on(L.Draw.Event.DELETED, () =>
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
            .off(L.Draw.Event.CREATED)
            .off(L.Draw.Event.EDITED)
            .off(L.Draw.Event.DELETED);
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
            <div class="flex gap-2">
                <button
                    class="btn btn-primary"
                    onclick={() => (showEditCustomRoutesModal = true)}
                    >Edit Custom Routes</button
                >
                <button
                    class="btn btn-secondary"
                    onclick={() => (showAddConnectionModal = true)}
                    >Add Connection</button
                >
                <button class="btn btn-info" onclick={startDrawingOdp}>Add ODP</button>
                <button
                    class="btn btn-accent"
                    onclick={() => (showManageConnectionsModal = true)}
                    >Manage Connections</button
                >
            </div>
        {:else if selectedConnectionForDrawing}
            <button class="btn btn-error" onclick={stopDrawing}
                >Cancel Drawing</button
            >
        {:else if isDrawingOdp}
            <button class="btn btn-error" onclick={cancelOdpDrawing}>Cancel</button>
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
</style>