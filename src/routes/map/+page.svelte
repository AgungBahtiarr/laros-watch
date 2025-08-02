<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";
    import "leaflet-routing-machine";
    import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
    import "leaflet-draw";
    import "leaflet-draw/dist/leaflet.draw.css";

    // --- State ---
    let mapContainer: HTMLElement;
    let mapInstance: L.Map | null = null;
    let allNodes = $state<any[]>([]);
    let connections = $state<any[]>([]);
    let connectionError = $state<any>(null);
    let editingCustomRoute = $state(false);
    let selectedConnectionForDrawing = $state<any>(null);

    // --- Leaflet Layers & Controls ---
    let markers: L.Marker[] = [];
    let routingControls: any[] = [];
    let customPolylines: L.Polyline[] = [];
    let drawControl: L.Control.Draw | null = null;
    let drawnItems: L.FeatureGroup | null = null;

    const API_BASE_URL = "http://localhost:3000/api";

    // --- Data Fetching ---
    const fetchAllData = async () => {
        console.log("STEP 1: Starting to fetch all data...");
        connectionError = null;
        try {
            const [nodesRes, connsRes] = await Promise.all([
                fetch(`${API_BASE_URL}/nodes`),
                fetch(`${API_BASE_URL}/nodes/connections`),
            ]);

            if (!nodesRes.ok)
                throw new Error(`Nodes fetch failed: HTTP ${nodesRes.status}`);
            if (!connsRes.ok)
                throw new Error(
                    `Connections fetch failed: HTTP ${connsRes.status}`,
                );

            const fetchedNodes = await nodesRes.json();
            const rawConns = await connsRes.json();

            const unique = new Map();
            rawConns.forEach((c: any) => {
                const key = [c.deviceAId, c.deviceBId]
                    .sort((a, b) => a - b)
                    .join("-");
                if (!unique.has(key)) unique.set(key, c);
            });
            const fetchedConnections = Array.from(unique.values());

            allNodes = fetchedNodes;
            connections = fetchedConnections;

            console.log(
                `STEP 2: Fetch complete. Found ${allNodes.length} nodes and ${connections.length} connections.`,
            );
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
        if (!mapInstance) {
            console.warn("Draw function called before map was ready.");
            return;
        }
        console.log(
            `STEP 3: Redrawing map with ${allNodes.length} nodes and ${connections.length} connections.`,
        );

        // Clear existing layers
        markers.forEach((m) => m.remove());
        markers = [];
        routingControls.forEach((c) => c.remove());
        routingControls = [];
        customPolylines.forEach((p) => p.remove());
        customPolylines = [];

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

        allNodes.forEach((node) => {
            const lat = parseFloat(node.lat);
            const lng = parseFloat(node.lng);
            if (isNaN(lat) || isNaN(lng)) return;
            const icon = node.status === 1 ? greenIcon : redIcon;
            const marker = L.marker([lat, lng], { icon })
                .addTo(mapInstance!)
                .bindPopup(
                    `<b>${node.name}</b><br>IP: ${node.ipMgmt}<br>Status: ${node.status === 1 ? "Online" : "Offline"}`,
                );
            markers.push(marker);
        });

        connections.forEach((conn) => {
            const nodeA = allNodes.find((n) => n.deviceId === conn.deviceAId);
            const nodeB = allNodes.find((n) => n.deviceId === conn.deviceBId);
            if (!nodeA || !nodeB) return;

            const latA = parseFloat(nodeA.lat);
            const lngA = parseFloat(nodeA.lng);
            const latB = parseFloat(nodeB.lat);
            const lngB = parseFloat(nodeB.lng);
            if ([latA, lngA, latB, lngB].some(isNaN)) return;

            const isOnline = nodeA.status === 1 && nodeB.status === 1;
            const color = isOnline
                ? `#${Math.floor(Math.random() * 16777215)
                      .toString(16)
                      .padStart(6, "0")}`
                : "red";

            if (conn.customRoute?.coordinates?.length > 0) {
                const polyline = L.polyline(conn.customRoute.coordinates, {
                    color,
                    weight: 5,
                    opacity: 1,
                });
                polyline.addTo(mapInstance!);
                customPolylines.push(polyline);
            } else {
                const control = L.Routing.control({
                    router: L.Routing.osrmv1({
                        serviceUrl: "https://osrm.1dev.win/route/v1",
                    }),
                    waypoints: [L.latLng(latA, lngA), L.latLng(latB, lngB)],
                    addWaypoints: false,
                    createMarker: () => null,
                    lineOptions: { styles: [{ color, opacity: 1, weight: 5 }] },
                }).addTo(mapInstance!);
                routingControls.push(control);
            }
        });
        console.log("STEP 4: Map content drawing finished.");
    };

    // --- Custom Route Editing ---
    const saveCustomRoute = async (
        connId: number,
        coords: [number, number][],
    ) => {
        try {
            const res = await fetch(
                `${API_BASE_URL}/nodes/connections/${connId}/custom-route`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ coordinates: coords }),
                },
            );
            if (!res.ok) throw new Error(await res.text());
            alert("Custom route saved!");
            await fetchAllData();
        } catch (e) {
            console.error("Failed to save custom route:", e);
            alert("Failed to save custom route.");
        } finally {
            stopDrawing();
        }
    };

    const startDrawing = (connection: any) => {
        if (!mapInstance) return;
        editingCustomRoute = false;
        selectedConnectionForDrawing = connection;

        drawnItems?.remove();
        drawnItems = new L.FeatureGroup().addTo(mapInstance);

        if (connection.customRoute?.coordinates?.length > 0) {
            const polyline = L.polyline(connection.customRoute.coordinates, {
                color: "orange",
            });
            drawnItems.addLayer(polyline);
        }

        drawControl?.remove();
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
            saveCustomRoute(
                selectedConnectionForDrawing.id,
                e.layer.getLatLngs().map((ll: any) => [ll.lat, ll.lng]),
            ),
        );
        mapInstance.on(L.Draw.Event.EDITED, (e: any) =>
            e.layers.eachLayer((layer: any) =>
                saveCustomRoute(
                    selectedConnectionForDrawing.id,
                    layer.getLatLngs().map((ll: any) => [ll.lat, ll.lng]),
                ),
            ),
        );
        mapInstance.on(L.Draw.Event.DELETED, () =>
            saveCustomRoute(selectedConnectionForDrawing.id, []),
        );
    };

    const stopDrawing = () => {
        if (!mapInstance) return;
        drawControl?.remove();
        drawnItems?.remove();
        drawControl = null;
        drawnItems = null;
        selectedConnectionForDrawing = null;
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

            console.log("Initializing map...");
            mapInstance = L.map(mapContainer).setView([-8.3, 114.25], 10);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            }).addTo(mapInstance);

            await fetchAllData();

            eventSource = new EventSource(
                `${API_BASE_URL}/nodes/status/events`,
            );
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
        // This effect now explicitly depends on allNodes and connections
        const nodes = allNodes;
        const conns = connections;

        if (mapInstance) {
            drawMapContent();
        }
    });
</script>

<div class="bg-base-100 rounded-2xl shadow-xl border border-base-300 p-6 mb-8">
    <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-bold text-base-content">Network Map</h2>
        {#if !selectedConnectionForDrawing}
            <button
                class="btn btn-primary"
                on:click={() => (editingCustomRoute = true)}
                >Edit Custom Routes</button
            >
        {:else}
            <button class="btn btn-error" on:click={stopDrawing}
                >Cancel Drawing</button
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

<!-- Edit Custom Routes Modal -->
{#if editingCustomRoute}
    <div class="modal modal-open" role="dialog">
        <div class="modal-box w-11/12 max-w-5xl">
            <h3 class="font-bold text-lg">Select Connection to Edit</h3>
            <div class="overflow-x-auto max-h-[60vh] py-4">
                <table class="table table-zebra w-full">
                    <thead>
                        <tr>
                            <th>Connection</th>
                            <th>Has Custom Route</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each connections as conn}
                            {@const nodeA = allNodes.find(
                                (n) => n.deviceId === conn.deviceAId,
                            )}
                            {@const nodeB = allNodes.find(
                                (n) => n.deviceId === conn.deviceBId,
                            )}
                            <tr>
                                <td>
                                    <div class="font-bold">
                                        {conn.description}
                                    </div>
                                    <div class="text-sm opacity-50">
                                        {nodeA?.name ?? "?"} &harr; {nodeB?.name ??
                                            "?"}
                                    </div>
                                </td>
                                <td>
                                    {#if conn.customRoute?.coordinates?.length > 0}
                                        <span class="badge badge-success"
                                            >Yes</span
                                        >
                                    {:else}
                                        <span class="badge badge-ghost">No</span
                                        >
                                    {/if}
                                </td>
                                <td>
                                    <button
                                        class="btn btn-sm btn-info"
                                        on:click={() => startDrawing(conn)}
                                    >
                                        {conn.customRoute?.coordinates?.length >
                                        0
                                            ? "Edit"
                                            : "Create"}
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            <div class="modal-action">
                <button
                    class="btn"
                    on:click={() => (editingCustomRoute = false)}>Close</button
                >
            </div>
        </div>
    </div>
{/if}

<style>
    :global(.leaflet-routing-container) {
        display: none;
    }
</style>
