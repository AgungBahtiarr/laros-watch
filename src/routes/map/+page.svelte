<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";
    import "leaflet-routing-machine";
    import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
    import "leaflet-draw";
    import "leaflet-draw/dist/leaflet.draw.css";
    import Select from "svelte-select";

    // --- Constants ---
    const API_BASE_URL = "http://localhost:3000/api";
    const OSRM_SERVICE_URL = "https://osrm.1dev.win/route/v1";

    // --- Component State ---
    let mapContainer: HTMLElement;
    let mapInstance: L.Map | null = null;
    let allNodes = $state<any[]>([]);
    let connections = $state<any[]>([]);
    let connectionError = $state<any>(null);
    let editingCustomRoute = $state(false);
    let selectedConnectionForDrawing = $state<any>(null);

    // --- Manual Connection Creation (with device/port dropdowns) ---
    let addingConnection = $state(false);
    let addConnLoading = $state(false);
    let addConnError = $state<string | null>(null);
    let newConn = $state<{
        deviceAId: number | null;
        portAId: number | null;
        deviceBId: number | null;
        portBId: number | null;
    }>({
        deviceAId: null,
        portAId: null,
        deviceBId: null,
        portBId: null,
    });

    // Helpers for device/port selection
    const nodeByDeviceId = (deviceId: number | null) =>
        allNodes.find((n: any) => n.deviceId === deviceId);

    const availableInterfaces = (deviceId: number | null) => {
        const node = nodeByDeviceId(deviceId ?? null);
        return node?.interfaces ?? [];
    };

    // Search queries
    let qDeviceA = $state("");
    let qDeviceB = $state("");
    let qPortA = $state("");
    let qPortB = $state("");

    // Filtering helpers
    const filterDevices = (q: string) => {
        const s = (q || "").toLowerCase();
        if (!s) return allNodes;
        return allNodes.filter((n: any) => {
            return (
                (n.name && n.name.toLowerCase().includes(s)) ||
                (n.deviceId + "").includes(s) ||
                (n.ipMgmt && n.ipMgmt.toLowerCase().includes(s)) ||
                (n.popLocation && n.popLocation.toLowerCase().includes(s))
            );
        });
    };

    const filterInterfaces = (deviceId: number | null, q: string) => {
        const s = (q || "").toLowerCase();
        const list = availableInterfaces(deviceId);
        if (!s) return list;
        return list.filter((itf: any) => {
            return (
                (itf.ifName && itf.ifName.toLowerCase().includes(s)) ||
                (itf.ifDescr && itf.ifDescr.toLowerCase().includes(s)) ||
                (itf.id + "").includes(s) ||
                (itf.ifIndex + "").includes(s)
            );
        });
    };

    const openAddConnection = () => {
        addConnError = null;
        newConn = {
            deviceAId: null,
            portAId: null,
            deviceBId: null,
            portBId: null,
        };
        addingConnection = true;
    };

    const closeAddConnection = () => {
        addingConnection = false;
    };

    const onSelectDeviceA = (value: string) => {
        const idNum = value ? Number(value) : null;
        newConn.deviceAId = idNum;
        // reset portA when deviceA changes
        newConn.portAId = null;
    };

    const onSelectDeviceB = (value: string) => {
        const idNum = value ? Number(value) : null;
        newConn.deviceBId = idNum;
        // reset portB when deviceB changes
        newConn.portBId = null;
    };

    const onSelectPortA = (value: string) => {
        newConn.portAId = value ? Number(value) : null;
    };

    const onSelectPortB = (value: string) => {
        newConn.portBId = value ? Number(value) : null;
    };

    const submitNewConnection = async () => {
        addConnError = null;

        // Basic validation
        if (
            !newConn.deviceAId ||
            !newConn.portAId ||
            !newConn.deviceBId ||
            !newConn.portBId
        ) {
            addConnError =
                "Please select Device A, Port A, Device B, and Port B.";
            return;
        }

        const payload: any = {
            deviceAId: Number(newConn.deviceAId),
            portAId: Number(newConn.portAId),
            deviceBId: Number(newConn.deviceBId),
            portBId: Number(newConn.portBId),
        };

        addConnLoading = true;
        try {
            const res = await fetch(`${API_BASE_URL}/nodes/connections`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }
            // Refresh data and close modal
            await fetchAllData();
            addingConnection = false;
        } catch (err) {
            addConnError = (err as Error).message;
        } finally {
            addConnLoading = false;
        }
    };

    // --- Map Interaction State ---
    let highlightedControl: L.Routing.Control | null = null;
    let originalHighlightStyle: L.PathOptions | null = null;

    // --- Leaflet Layers & Controls ---
    let markerLayer = L.layerGroup();
    let routingControls: L.Routing.Control[] = [];
    let drawControl: L.Control.Draw | null = null;
    let drawnItems: L.FeatureGroup | null = null;

    // --- Icons ---
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
            connections = Array.from(unique.values());
            allNodes = fetchedNodes;

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
    const clearHighlight = () => {
        if (highlightedControl && originalHighlightStyle) {
            console.log("Clearing highlight");
            const line = (highlightedControl as any)._line;
            if (line) {
                try {
                    // Check if line has eachLayer method (LayerGroup)
                    if (
                        line.eachLayer &&
                        typeof line.eachLayer === "function"
                    ) {
                        line.eachLayer((layer: any) => {
                            if (
                                layer.setStyle &&
                                typeof layer.setStyle === "function"
                            ) {
                                layer.setStyle(originalHighlightStyle);
                            }
                        });
                    } else if (
                        line.setStyle &&
                        typeof line.setStyle === "function"
                    ) {
                        // Direct setStyle for single layer
                        line.setStyle(originalHighlightStyle);
                    }
                } catch (err) {
                    console.error("❌ Failed to clear highlight:", err);
                }
            }
        }
        highlightedControl = null;
        originalHighlightStyle = null;
    };

    const setupRouteEvents = (
        control: L.Routing.Control,
        initialStyle: L.PathOptions,
        distance: string,
    ) => {
        // A short delay to ensure the line layer is created and available
        setTimeout(() => {
            const line = (control as any)._line as L.LayerGroup;
            if (!line) {
                console.error(
                    "❌ Could not find line layer on routing control after delay.",
                );
                return;
            }
            console.log("✅ Found line layer, attaching events.", line);

            line.on("click", (e: L.LeafletMouseEvent) => {
                console.log("🎉 Route path clicked!", e);
                L.DomEvent.stop(e); // Prevent map click event

                clearHighlight(); // Clear previous highlight

                // Apply new highlight
                highlightedControl = control;
                originalHighlightStyle = initialStyle;
                line.setStyle({ color: "yellow", weight: 8 });

                // Show popup
                L.popup()
                    .setLatLng(e.latlng)
                    .setContent(`<b>Distance:</b> ${distance} km`)
                    .openOn(mapInstance!);
            });
        }, 100); // Using a 100ms delay for more reliability
    };

    const createRoute = (conn: any, nodeA: any, nodeB: any) => {
        const latA = parseFloat(nodeA.lat);
        const lngA = parseFloat(nodeA.lng);
        const latB = parseFloat(nodeB.lat);
        const lngB = parseFloat(nodeB.lng);
        if ([latA, lngA, latB, lngB].some(isNaN)) return null;

        const isOnline = nodeA.status === 1 && nodeB.status === 1;
        const color = isOnline
            ? `#${Math.floor(Math.random() * 16777215)
                  .toString(16)
                  .padStart(6, "0")}`
            : "red";

        const waypoints = [L.latLng(latA, lngA)];
        if (conn.customRoute?.coordinates?.length > 0) {
            waypoints.push(
                ...conn.customRoute.coordinates.map((c: [number, number]) =>
                    L.latLng(c[0], c[1]),
                ),
            );
        }
        waypoints.push(L.latLng(latB, lngB));

        const lineStyle: L.PathOptions = { color, opacity: 1, weight: 5 };

        const control = L.Routing.control({
            router: L.Routing.osrmv1({ serviceUrl: OSRM_SERVICE_URL }),
            waypoints,
            addWaypoints: false,
            createMarker: () => null,
            lineOptions: { styles: [lineStyle], addWaypoints: false },
        });

        control.on("routingerror", (e: any) => {
            console.error("Routing error:", e.error);
        });

        // Store route data and connection info when routes are found
        control.on("routesfound", (e: any) => {
            console.log("🚀 Routes found for connection:", conn.description);
            (control as any)._routes = e.routes;
            (control as any)._connectionInfo = {
                connection: conn,
                nodeA: nodeA,
                nodeB: nodeB,
                color: color,
            };
            console.log("✅ Route data stored for:", conn.description);
        });

        return control;
    };

    const drawMapContent = () => {
        if (!mapInstance) {
            console.warn("Draw function called before map was ready.");
            return;
        }
        console.log(
            `STEP 3: Redrawing map with ${allNodes.length} nodes and ${connections.length} connections.`,
        );

        markerLayer.clearLayers();
        routingControls.forEach((control) => control.remove());
        routingControls = [];
        clearHighlight();

        allNodes.forEach((node) => {
            const lat = parseFloat(node.lat);
            const lng = parseFloat(node.lng);
            if (isNaN(lat) || isNaN(lng)) return;
            const icon = node.status === 1 ? greenIcon : redIcon;
            L.marker([lat, lng], { icon })
                .bindPopup(
                    `<b>${node.name}</b><br>IP: ${node.ipMgmt}<br>Status: ${
                        node.status === 1 ? "Online" : "Offline"
                    }`,
                )
                .addTo(markerLayer);
        });

        connections.forEach((conn) => {
            const nodeA = allNodes.find((n) => n.deviceId === conn.deviceAId);
            const nodeB = allNodes.find((n) => n.deviceId === conn.deviceBId);
            if (!nodeA || !nodeB) return;

            const routeControl = createRoute(conn, nodeA, nodeB);
            if (routeControl) {
                routeControl.addTo(mapInstance);
                routingControls.push(routeControl);
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
            await fetchAllData(); // This will trigger a redraw via $effect
        } catch (e) {
            console.error("Failed to save custom route:", e);
            alert("Failed to save custom route.");
        } finally {
            stopDrawing();
        }
    };

    const deleteCustomRoute = async (connId: number) => {
        if (!confirm("Are you sure you want to delete this custom route?"))
            return;
        try {
            const res = await fetch(
                `${API_BASE_URL}/nodes/connections/${connId}/custom-route`,
                {
                    method: "DELETE",
                },
            );
            if (!res.ok) throw new Error(await res.text());
            alert("Custom route deleted!");
            await fetchAllData(); // This will trigger a redraw via $effect
        } catch (e) {
            console.error("Failed to delete custom route:", e);
            alert(`Failed to delete custom route: ${(e as Error).message}`);
        }
    };

    const startDrawing = (connection: any) => {
        if (!mapInstance) return;
        editingCustomRoute = false; // Close the modal
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

            markerLayer.addTo(mapInstance);

            mapInstance.on("click", (e) => {
                console.log("🗺️ Map clicked at:", e.latlng);
                console.log("Click target:", e.originalEvent.target);

                const target = e.originalEvent.target as HTMLElement;

                // Check if click target is a route path
                if (
                    target &&
                    target.tagName === "path" &&
                    target.classList.contains("leaflet-interactive")
                ) {
                    console.log("🎯 Route path clicked detected!");

                    // Find which route this path belongs to by color matching
                    const targetColor = target.getAttribute("stroke");
                    let clickedConnection = null;
                    let clickedControl = null;

                    for (let i = 0; i < routingControls.length; i++) {
                        const control = routingControls[i];
                        const connectionInfo = (control as any)._connectionInfo;

                        if (
                            connectionInfo &&
                            connectionInfo.color === targetColor
                        ) {
                            clickedConnection = connectionInfo;
                            clickedControl = control;
                            console.log(
                                "✅ Matched path to control by color:",
                                clickedConnection.connection.description,
                            );
                            break;
                        }
                    }

                    if (clickedConnection && clickedControl) {
                        console.log(
                            "🎉 Found clicked route:",
                            clickedConnection.connection.description,
                        );

                        // Clear any existing highlight
                        clearHighlight();

                        // Set new highlight
                        highlightedControl = clickedControl;
                        originalHighlightStyle = {
                            color: targetColor || "#000",
                            opacity: 1,
                            weight: 5,
                        };

                        console.log("🎨 Applying highlight...");
                        // Apply highlight style
                        const line = (clickedControl as any)._line;
                        console.log("Line object for highlighting:", line);

                        if (line) {
                            try {
                                // Check if line has eachLayer method (LayerGroup)
                                if (
                                    line.eachLayer &&
                                    typeof line.eachLayer === "function"
                                ) {
                                    line.eachLayer((layer: any) => {
                                        if (
                                            layer.setStyle &&
                                            typeof layer.setStyle === "function"
                                        ) {
                                            layer.setStyle({
                                                color: "yellow",
                                                weight: 8,
                                                opacity: 0.8,
                                                dashArray: "10, 5",
                                            });
                                        }
                                    });
                                } else if (
                                    line.setStyle &&
                                    typeof line.setStyle === "function"
                                ) {
                                    // Direct setStyle for single layer
                                    line.setStyle({
                                        color: "yellow",
                                        weight: 8,
                                        opacity: 0.8,
                                        dashArray: "10, 5",
                                    });
                                }
                                console.log("✅ Highlight style applied");
                            } catch (err) {
                                console.error(
                                    "❌ Failed to apply highlight:",
                                    err,
                                );
                            }
                        } else {
                            console.error(
                                "❌ No line object found for highlighting",
                            );
                        }

                        // Get route data for distance calculation
                        const routes = (clickedControl as any)._routes;
                        console.log("Route data:", routes);

                        if (routes && routes.length > 0 && routes[0].summary) {
                            const route = routes[0];
                            const distanceKm = (
                                route.summary.totalDistance / 1000
                            ).toFixed(2);
                            const durationMin = Math.round(
                                route.summary.totalTime / 60,
                            );

                            console.log("📊 Route info:", {
                                distanceKm,
                                durationMin,
                            });

                            const popupContent = `
            							<div class="text-sm">
            								<div class="font-bold text-base mb-2">${clickedConnection.connection.description}</div>
            								<div><b>Jarak:</b> ${distanceKm} km</div>
            								<div><b>Estimasi Waktu:</b> ${durationMin} menit</div>
            								<div class="text-xs mt-2 opacity-70">
            									${clickedConnection.nodeA.name} ↔ ${clickedConnection.nodeB.name}
            								</div>
            							</div>
            						`;

                            try {
                                L.popup({
                                    maxWidth: 250,
                                    className: "route-popup",
                                })
                                    .setLatLng(e.latlng)
                                    .setContent(popupContent)
                                    .openOn(mapInstance!);
                                console.log("✅ Popup created and opened");
                            } catch (err) {
                                console.error(
                                    "❌ Failed to create popup:",
                                    err,
                                );
                            }
                        } else {
                            console.warn("⚠️ No route data found for popup");
                        }

                        // Prevent further processing
                        return;
                    } else {
                        console.warn(
                            "⚠️ No matching control found for clicked path",
                        );
                    }
                }

                // Only clear highlight if we're not currently drawing and didn't click a route
                if (!selectedConnectionForDrawing) {
                    clearHighlight();
                }
            });

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
        const _ = allNodes;
        const __ = connections;

        if (mapInstance) {
            drawMapContent();
        }
    });
</script>

<div class="bg-base-100 rounded-2xl shadow-xl border border-base-300 p-6 mb-8">
    <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-bold text-base-content">Network Map</h2>
        {#if !selectedConnectionForDrawing}
            <div class="flex gap-2">
                <button
                    class="btn btn-primary"
                    onclick={() => (editingCustomRoute = true)}
                    >Edit Custom Routes</button
                >
                <button class="btn btn-secondary" onclick={openAddConnection}
                    >Add Connection</button
                >
            </div>
        {:else}
            <button class="btn btn-error" onclick={stopDrawing}
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
                                        onclick={() => startDrawing(conn)}
                                    >
                                        {conn.customRoute?.coordinates?.length >
                                        0
                                            ? "Edit"
                                            : "Create"}
                                    </button>
                                    {#if conn.customRoute?.coordinates?.length > 0}
                                        <button
                                            class="btn btn-sm btn-error ml-2"
                                            onclick={() =>
                                                deleteCustomRoute(conn.id)}
                                        >
                                            Delete
                                        </button>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            <div class="modal-action">
                <button class="btn" onclick={() => (editingCustomRoute = false)}
                    >Close</button
                >
            </div>
        </div>
    </div>
{/if}

<!-- Add Connection Modal -->
{#if addingConnection}
    <div class="modal modal-open" role="dialog">
        <div class="modal-box w-11/12 max-w-4xl">
            <h3 class="font-bold text-lg mb-2">Add Connection Manually</h3>

            {#if addConnError}
                <div class="alert alert-error my-3">
                    <span>{addConnError}</span>
                </div>
            {/if}

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                <!-- Device A -->
                <div class="form-control">
                    <label class="label">
                        <span class="label-text">Device A*</span>
                    </label>

                    <Select
                        items={filterDevices(qDeviceA).map((n: any) => ({
                            label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                            value: n.deviceId,
                            raw: n,
                        }))}
                        value={filterDevices(qDeviceA)
                            .map((n: any) => ({
                                label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                                value: n.deviceId,
                                raw: n,
                            }))
                            .find((o: any) => o.value === newConn.deviceAId)}
                        on:select={(e) => onSelectDeviceA(e.detail?.value)}
                        clearable={true}
                        searchable={true}
                        placeholder="Select device..."
                        noOptionsMessage="No devices found"
                    />
                </div>

                <!-- Port A -->
                <div class="form-control">
                    <label class="label">
                        <span class="label-text">Port A*</span>
                    </label>

                    <Select
                        items={filterInterfaces(newConn.deviceAId, qPortA).map(
                            (itf: any) => ({
                                label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                                value: itf.id,
                                raw: itf,
                            }),
                        )}
                        value={filterInterfaces(newConn.deviceAId, qPortA)
                            .map((itf: any) => ({
                                label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                                value: itf.id,
                                raw: itf,
                            }))
                            .find((o: any) => o.value === newConn.portAId)}
                        on:select={(e) => onSelectPortA(e.detail?.value)}
                        clearable={true}
                        searchable={true}
                        placeholder={newConn.deviceAId
                            ? "Select port..."
                            : "Select device first"}
                        noOptionsMessage={newConn.deviceAId
                            ? "No ports found"
                            : "Select device first"}
                        disabled={!newConn.deviceAId}
                    />
                </div>

                <!-- Device B -->
                <div class="form-control">
                    <label class="label">
                        <span class="label-text">Device B*</span>
                    </label>

                    <Select
                        items={filterDevices(qDeviceB).map((n: any) => ({
                            label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                            value: n.deviceId,
                            raw: n,
                        }))}
                        value={filterDevices(qDeviceB)
                            .map((n: any) => ({
                                label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                                value: n.deviceId,
                                raw: n,
                            }))
                            .find((o: any) => o.value === newConn.deviceBId)}
                        on:select={(e) => onSelectDeviceB(e.detail?.value)}
                        clearable={true}
                        searchable={true}
                        placeholder="Select device..."
                        noOptionsMessage="No devices found"
                    />
                </div>

                <!-- Port B -->
                <div class="form-control">
                    <label class="label">
                        <span class="label-text">Port B*</span>
                    </label>

                    <Select
                        items={filterInterfaces(newConn.deviceBId, qPortB).map(
                            (itf: any) => ({
                                label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                                value: itf.id,
                                raw: itf,
                            }),
                        )}
                        value={filterInterfaces(newConn.deviceBId, qPortB)
                            .map((itf: any) => ({
                                label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                                value: itf.id,
                                raw: itf,
                            }))
                            .find((o: any) => o.value === newConn.portBId)}
                        on:select={(e) => onSelectPortB(e.detail?.value)}
                        clearable={true}
                        searchable={true}
                        placeholder={newConn.deviceBId
                            ? "Select port..."
                            : "Select device first"}
                        noOptionsMessage={newConn.deviceBId
                            ? "No ports found"
                            : "Select device first"}
                        disabled={!newConn.deviceBId}
                    />
                </div>
            </div>

            <div class="modal-action">
                <button
                    class="btn"
                    onclick={closeAddConnection}
                    disabled={addConnLoading}>Cancel</button
                >
                <button
                    class="btn btn-primary"
                    onclick={submitNewConnection}
                    class:loading={addConnLoading}
                    disabled={addConnLoading}
                    >{addConnLoading ? "Saving..." : "Save"}</button
                >
            </div>
        </div>
    </div>
{/if}

<style>
    :global(.leaflet-routing-container) {
        display: none;
    }

    /* Ensure the pane containing vector layers can receive mouse events */
    :global(.leaflet-overlay-pane) {
        z-index: 450 !important;
        pointer-events: none;
    }

    /* Ensure the SVG element and the path itself are clickable */
    :global(.leaflet-overlay-pane svg),
    :global(.leaflet-overlay-pane path),
    :global(path.leaflet-interactive) {
        pointer-events: auto !important;
        cursor: pointer !important;
    }

    /* Make sure routing lines are interactive */
    :global(.leaflet-routing-container path),
    :global(.leaflet-overlay-pane g),
    :global(.leaflet-overlay-pane g path) {
        pointer-events: auto !important;
        cursor: pointer !important;
    }

    /* Custom popup styling */
    :global(.route-popup .leaflet-popup-content-wrapper) {
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    :global(.route-popup .leaflet-popup-content) {
        margin: 12px 16px;
        line-height: 1.4;
    }

    /* Ensure route lines are properly styled for interaction */
    :global(.leaflet-routing-container-hide) {
        display: none;
    }

    :global(.leaflet-interactive) {
        cursor: pointer !important;
    }
</style>
