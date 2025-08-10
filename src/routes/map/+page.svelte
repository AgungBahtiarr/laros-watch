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

    // --- Connections Management (list/edit/delete) ---
    let managingConnections = $state(false);
    let manageConnLoading = $state(false);
    let manageConnError = $state<string | null>(null);
    let deletingConnId = $state<number | null>(null);
    let editingConnection = $state<any | null>(null);
    let editConn = $state<{
        id: number | null;
        deviceAId: number | null;
        portAId: number | null;
        deviceBId: number | null;
        portBId: number | null;
        description: string;
    }>({
        id: null,
        deviceAId: null,
        portAId: null,
        deviceBId: null,
        portBId: null,
        description: "",
    });

    const beginEdit = (conn: any) => {
        manageConnError = null;
        editingConnection = conn;
        editConn = {
            id: conn.id,
            deviceAId: conn.deviceAId,
            portAId: conn.portAId,
            deviceBId: conn.deviceBId,
            portBId: conn.portBId,
            description: conn.description ?? "",
        };
    };

    const cancelEdit = () => {
        editingConnection = null;
        editConn = {
            id: null,
            deviceAId: null,
            portAId: null,
            deviceBId: null,
            portBId: null,
            description: "",
        };
    };

    const submitEditConnection = async () => {
        manageConnError = null;
        if (
            !editConn.id ||
            !editConn.deviceAId ||
            !editConn.portAId ||
            !editConn.deviceBId ||
            !editConn.portBId
        ) {
            manageConnError = "Please complete all required fields.";
            return;
        }
        manageConnLoading = true;
        try {
            const res = await fetch(
                `${API_BASE_URL}/nodes/connections/${editConn.id}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        deviceAId: Number(editConn.deviceAId),
                        portAId: Number(editConn.portAId),
                        deviceBId: Number(editConn.deviceBId),
                        portBId: Number(editConn.portBId),
                        description: editConn.description ?? "",
                    }),
                },
            );
            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }
            await fetchAllData();
            cancelEdit();
        } catch (e) {
            manageConnError = (e as Error).message;
        } finally {
            manageConnLoading = false;
        }
    };

    const deleteConnection = async (id: number) => {
        if (!confirm("Are you sure you want to delete this connection?"))
            return;
        deletingConnId = id;
        manageConnError = null;
        try {
            const res = await fetch(`${API_BASE_URL}/nodes/connections/${id}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }
            await fetchAllData();
        } catch (e) {
            manageConnError = (e as Error).message;
        } finally {
            deletingConnId = null;
        }
    };

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
    let routeControlCounter = 0;
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
        // Assign a unique control id for this connection to avoid cross-route collisions
        const controlId = `route-${conn.id}-${Date.now()}-${routeControlCounter++}`;
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

        const start = L.latLng(latA, lngA);
        const end = L.latLng(latB, lngB);

        const waypoints: L.LatLng[] = [start];

        if (conn.customRoute?.coordinates?.length > 0) {
            // Map to LatLng
            let coords: L.LatLng[] = conn.customRoute.coordinates.map(
                (c: [number, number]) => L.latLng(c[0], c[1]),
            );

            // If first custom point is closer to B than A, reverse to ensure A -> ... -> B
            if (coords.length > 0) {
                const distFirstToA = coords[0].distanceTo(start);
                const distFirstToB = coords[0].distanceTo(end);
                if (distFirstToB < distFirstToA) {
                    coords = coords.reverse();
                }
            }

            // Drop points too close to A or B (<= 5m) to avoid duplicate/looping hops
            const minEdgeDist = 5; // meters
            coords = coords.filter((p) => {
                const closeToA = p.distanceTo(start) <= minEdgeDist;
                const closeToB = p.distanceTo(end) <= minEdgeDist;
                return !(closeToA || closeToB);
            });

            // Deduplicate consecutive points that are too close (<= 1m)
            const deduped: L.LatLng[] = [];
            const minStepDist = 1; // meters
            for (const p of coords) {
                if (
                    deduped.length === 0 ||
                    deduped[deduped.length - 1].distanceTo(p) > minStepDist
                ) {
                    deduped.push(p);
                }
            }

            waypoints.push(...deduped);
        }

        waypoints.push(end);

        const lineStyle: L.PathOptions = { color, opacity: 1, weight: 5 };
        // Create a unique pane per connection to prevent interactivity collisions
        const paneName = `route-pane-${conn.id}`;
        if (mapInstance && !(mapInstance as any)._panes[paneName]) {
            mapInstance.createPane(paneName);
            const pane = (mapInstance as any)._panes[paneName] as HTMLElement;
            pane.style.zIndex = (450 + (conn.id % 50)).toString();
            pane.style.pointerEvents = "auto";
        }

        const control = L.Routing.control({
            router: L.Routing.osrmv1({ serviceUrl: OSRM_SERVICE_URL }),
            waypoints,
            addWaypoints: false,
            createMarker: () => null,
            lineOptions: {
                styles: [lineStyle],
                addWaypoints: false,
                // put route in its own pane so it's isolated
                pane: paneName,
            } as any,
        });
        // tag control with unique id for later matching
        (control as any)._controlId = controlId;

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
                controlId: controlId,
            };
            // Attach data attributes to the rendered SVG path(s) for robust hit-testing
            const line = (control as any)._line;
            try {
                if (
                    line &&
                    (line as any).eachLayer &&
                    typeof (line as any).eachLayer === "function"
                ) {
                    (line as any).eachLayer((layer: any) => {
                        if (layer && layer._path) {
                            layer._path.dataset.controlId = controlId;
                            layer._path.dataset.connectionId = String(conn.id);
                        }
                    });
                } else if (line && (line as any)._path) {
                    (line as any)._path.dataset.controlId = controlId;
                    (line as any)._path.dataset.connectionId = String(conn.id);
                }
            } catch (err) {
                console.warn(
                    "Failed to set data attributes on route path:",
                    err,
                );
            }
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

                    // Prefer robust matching by data-control-id on the path
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
                                console.log(
                                    "✅ Matched path to control by controlId:",
                                    dataControlId,
                                );
                                break;
                            }
                        }
                    } else {
                        // Fallback: match by color only if no controlId present
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
                                console.log(
                                    "✅ Matched path to control by color (fallback):",
                                    clickedConnection.connection.description,
                                );
                                break;
                            }
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
                            color: clickedConnection.color || "#000",
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
                <button
                    class="btn btn-secondary"
                    onclick={() => (addingConnection = true)}
                    >Add Connection</button
                >
                <button
                    class="btn btn-accent"
                    onclick={() => (managingConnections = true)}
                    >Manage Connections</button
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

<!-- Manage Connections Modal -->
{#if managingConnections}
    <div class="modal modal-open" role="dialog">
        <div class="modal-box w-11/12 max-w-7xl max-h-[90vh] flex flex-col">
            <!-- Modal Header -->
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold text-base-content">
                    Manage Connections
                </h3>
                <button
                    class="btn btn-sm btn-circle btn-ghost"
                    onclick={() => (managingConnections = false)}>✕</button
                >
            </div>

            <!-- Error Alert -->
            {#if manageConnError}
                <div class="alert alert-error mb-4 shadow-lg">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="stroke-current flex-shrink-0 h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <span>{manageConnError}</span>
                </div>
            {/if}

            <!-- Connections List -->
            <div class="flex-1 overflow-hidden flex flex-col">
                <div class="flex justify-between items-center mb-4">
                    <h4 class="text-lg font-semibold">
                        <span class="text-secondary">🔗</span> Existing
                        Connections
                        <span class="badge badge-neutral"
                            >{connections.length}</span
                        >
                    </h4>
                </div>

                <div
                    class="overflow-x-auto overflow-y-auto flex-1 bg-base-100 rounded-xl shadow-sm border border-base-300"
                >
                    <table class="table table-zebra w-full">
                        <thead class="sticky top-0 bg-base-200 z-10">
                            <tr>
                                <th class="w-12 text-center">#</th>
                                <th class="min-w-[200px]">Connection Details</th
                                >
                                <th class="min-w-[150px]">Device A</th>
                                <th class="min-w-[100px]">Port A</th>
                                <th class="min-w-[150px]">Device B</th>
                                <th class="min-w-[100px]">Port B</th>
                                <th class="min-w-[140px] text-center"
                                    >Actions</th
                                >
                            </tr>
                        </thead>
                        <tbody>
                            {#each connections as conn, i}
                                {@const nodeA = allNodes.find(
                                    (n) => n.deviceId === conn.deviceAId,
                                )}
                                {@const nodeB = allNodes.find(
                                    (n) => n.deviceId === conn.deviceBId,
                                )}

                                {#if editingConnection?.id === conn.id}
                                    <!-- Edit Row -->
                                    <tr
                                        class="bg-warning/10 border-l-4 border-warning"
                                    >
                                        <td class="text-center font-bold"
                                            >{i + 1}</td
                                        >
                                        <td colspan="5" class="p-4">
                                            <div
                                                class="bg-base-100 rounded-lg p-4 shadow-sm"
                                            >
                                                <div
                                                    class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4"
                                                >
                                                    <!-- Description -->
                                                    <div
                                                        class="form-control xl:col-span-3"
                                                    >
                                                        <label class="label">
                                                            <span
                                                                class="label-text font-medium"
                                                                >Description</span
                                                            >
                                                        </label>
                                                        <input
                                                            class="input input-bordered"
                                                            bind:value={
                                                                editConn.description
                                                            }
                                                            placeholder="Connection description"
                                                        />
                                                    </div>

                                                    <!-- Device A -->
                                                    <div class="form-control">
                                                        <label class="label">
                                                            <span
                                                                class="label-text font-medium"
                                                                >Device A</span
                                                            >
                                                        </label>
                                                        <Select
                                                            items={filterDevices(
                                                                "",
                                                            ).map((n: any) => ({
                                                                label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                                                                value: n.deviceId,
                                                                raw: n,
                                                            }))}
                                                            value={filterDevices(
                                                                "",
                                                            )
                                                                .map(
                                                                    (
                                                                        n: any,
                                                                    ) => ({
                                                                        label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                                                                        value: n.deviceId,
                                                                        raw: n,
                                                                    }),
                                                                )
                                                                .find(
                                                                    (o: any) =>
                                                                        o.value ===
                                                                        editConn.deviceAId,
                                                                )}
                                                            on:select={(e) => {
                                                                editConn.deviceAId =
                                                                    Number(
                                                                        e.detail
                                                                            ?.value ??
                                                                            null,
                                                                    );
                                                                editConn.portAId =
                                                                    null;
                                                            }}
                                                            clearable={true}
                                                            searchable={true}
                                                            placeholder="Select device..."
                                                            noOptionsMessage="No devices found"
                                                            --listMaxHeight="300px"
                                                        />
                                                    </div>

                                                    <!-- Port A -->
                                                    <div class="form-control">
                                                        <label class="label">
                                                            <span
                                                                class="label-text font-medium"
                                                                >Port A</span
                                                            >
                                                        </label>
                                                        <Select
                                                            items={filterInterfaces(
                                                                editConn.deviceAId,
                                                                "",
                                                            ).map(
                                                                (itf: any) => ({
                                                                    label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                                                                    value: itf.id,
                                                                    raw: itf,
                                                                }),
                                                            )}
                                                            value={filterInterfaces(
                                                                editConn.deviceAId,
                                                                "",
                                                            )
                                                                .map(
                                                                    (
                                                                        itf: any,
                                                                    ) => ({
                                                                        label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                                                                        value: itf.id,
                                                                        raw: itf,
                                                                    }),
                                                                )
                                                                .find(
                                                                    (o: any) =>
                                                                        o.value ===
                                                                        editConn.portAId,
                                                                )}
                                                            on:select={(e) =>
                                                                (editConn.portAId =
                                                                    Number(
                                                                        e.detail
                                                                            ?.value ??
                                                                            null,
                                                                    ))}
                                                            clearable={true}
                                                            searchable={true}
                                                            placeholder={editConn.deviceAId
                                                                ? "Select port..."
                                                                : "Select device first"}
                                                            noOptionsMessage={editConn.deviceAId
                                                                ? "No ports found"
                                                                : "Select device first"}
                                                            disabled={!editConn.deviceAId}
                                                            --listMaxHeight="300px"
                                                        />
                                                    </div>

                                                    <!-- Device B -->
                                                    <div class="form-control">
                                                        <label class="label">
                                                            <span
                                                                class="label-text font-medium"
                                                                >Device B</span
                                                            >
                                                        </label>
                                                        <Select
                                                            items={filterDevices(
                                                                "",
                                                            ).map((n: any) => ({
                                                                label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                                                                value: n.deviceId,
                                                                raw: n,
                                                            }))}
                                                            value={filterDevices(
                                                                "",
                                                            )
                                                                .map(
                                                                    (
                                                                        n: any,
                                                                    ) => ({
                                                                        label: `${n.name} (ID: ${n.deviceId}) — ${n.ipMgmt ?? "-"}`,
                                                                        value: n.deviceId,
                                                                        raw: n,
                                                                    }),
                                                                )
                                                                .find(
                                                                    (o: any) =>
                                                                        o.value ===
                                                                        editConn.deviceBId,
                                                                )}
                                                            on:select={(e) => {
                                                                editConn.deviceBId =
                                                                    Number(
                                                                        e.detail
                                                                            ?.value ??
                                                                            null,
                                                                    );
                                                                editConn.portBId =
                                                                    null;
                                                            }}
                                                            clearable={true}
                                                            searchable={true}
                                                            placeholder="Select device..."
                                                            noOptionsMessage="No devices found"
                                                            --listMaxHeight="300px"
                                                        />
                                                    </div>

                                                    <!-- Port B -->
                                                    <div class="form-control">
                                                        <label class="label">
                                                            <span
                                                                class="label-text font-medium"
                                                                >Port B</span
                                                            >
                                                        </label>
                                                        <Select
                                                            items={filterInterfaces(
                                                                editConn.deviceBId,
                                                                "",
                                                            ).map(
                                                                (itf: any) => ({
                                                                    label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                                                                    value: itf.id,
                                                                    raw: itf,
                                                                }),
                                                            )}
                                                            value={filterInterfaces(
                                                                editConn.deviceBId,
                                                                "",
                                                            )
                                                                .map(
                                                                    (
                                                                        itf: any,
                                                                    ) => ({
                                                                        label: `${itf.ifName} — ${itf.ifDescr ?? "-"} (id: ${itf.id})`,
                                                                        value: itf.id,
                                                                        raw: itf,
                                                                    }),
                                                                )
                                                                .find(
                                                                    (o: any) =>
                                                                        o.value ===
                                                                        editConn.portBId,
                                                                )}
                                                            on:select={(e) =>
                                                                (editConn.portBId =
                                                                    Number(
                                                                        e.detail
                                                                            ?.value ??
                                                                            null,
                                                                    ))}
                                                            clearable={true}
                                                            searchable={true}
                                                            placeholder={editConn.deviceBId
                                                                ? "Select port..."
                                                                : "Select device first"}
                                                            noOptionsMessage={editConn.deviceBId
                                                                ? "No ports found"
                                                                : "Select device first"}
                                                            disabled={!editConn.deviceBId}
                                                            --listMaxHeight="300px"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="p-4">
                                            <div class="flex flex-col gap-2">
                                                <button
                                                    class="btn btn-sm btn-success"
                                                    class:loading={manageConnLoading}
                                                    disabled={manageConnLoading}
                                                    onclick={() =>
                                                        submitEditConnection()}
                                                >
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        class="h-4 w-4"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            stroke-linecap="round"
                                                            stroke-linejoin="round"
                                                            stroke-width="2"
                                                            d="M5 13l4 4L19 7"
                                                        />
                                                    </svg>
                                                    Save
                                                </button>
                                                <button
                                                    class="btn btn-sm btn-ghost"
                                                    onclick={() => cancelEdit()}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                {:else}
                                    <!-- Regular Row -->
                                    <tr class="hover:bg-base-50">
                                        <td
                                            class="text-center font-mono text-sm"
                                            >{i + 1}</td
                                        >
                                        <td>
                                            <div class="space-y-1">
                                                <div
                                                    class="font-semibold text-base-content"
                                                >
                                                    {conn.description ||
                                                        `Connection ${conn.id}`}
                                                </div>
                                                <div
                                                    class="text-xs text-base-content/60 font-mono"
                                                >
                                                    ID: {conn.id}
                                                </div>
                                                <div
                                                    class="flex items-center gap-2 text-xs"
                                                >
                                                    <span
                                                        class="badge badge-outline badge-xs"
                                                    >
                                                        {nodeA?.name ??
                                                            "Unknown"} ↔ {nodeB?.name ??
                                                            "Unknown"}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div class="space-y-1">
                                                <div
                                                    class="font-medium text-sm"
                                                >
                                                    {nodeA?.name ??
                                                        "Unknown Device"}
                                                </div>
                                                <div
                                                    class="text-xs text-base-content/60"
                                                >
                                                    {nodeA?.ipMgmt ?? "-"}
                                                </div>
                                                <div
                                                    class="text-xs text-base-content/40 font-mono"
                                                >
                                                    ID: {conn.deviceAId}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div
                                                class="badge badge-neutral badge-sm font-mono"
                                            >
                                                {conn.portAId}
                                            </div>
                                        </td>
                                        <td>
                                            <div class="space-y-1">
                                                <div
                                                    class="font-medium text-sm"
                                                >
                                                    {nodeB?.name ??
                                                        "Unknown Device"}
                                                </div>
                                                <div
                                                    class="text-xs text-base-content/60"
                                                >
                                                    {nodeB?.ipMgmt ?? "-"}
                                                </div>
                                                <div
                                                    class="text-xs text-base-content/40 font-mono"
                                                >
                                                    ID: {conn.deviceBId}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div
                                                class="badge badge-neutral badge-sm font-mono"
                                            >
                                                {conn.portBId}
                                            </div>
                                        </td>
                                        <td>
                                            <div
                                                class="flex justify-center gap-1"
                                            >
                                                <button
                                                    class="btn btn-xs btn-info"
                                                    onclick={() =>
                                                        beginEdit(conn)}
                                                    title="Edit connection"
                                                >
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        class="h-3 w-3"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            stroke-linecap="round"
                                                            stroke-linejoin="round"
                                                            stroke-width="2"
                                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                                        />
                                                    </svg>
                                                </button>
                                                <button
                                                    class="btn btn-xs btn-error"
                                                    class:loading={deletingConnId ===
                                                        conn.id}
                                                    onclick={() =>
                                                        deleteConnection(
                                                            conn.id,
                                                        )}
                                                    disabled={deletingConnId ===
                                                        conn.id}
                                                    title="Delete connection"
                                                >
                                                    {#if deletingConnId === conn.id}
                                                        <span
                                                            class="loading loading-spinner loading-xs"
                                                        ></span>
                                                    {:else}
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            class="h-3 w-3"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                stroke-linecap="round"
                                                                stroke-linejoin="round"
                                                                stroke-width="2"
                                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                            />
                                                        </svg>
                                                    {/if}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                {/if}
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Modal Footer -->
            <div class="flex justify-end mt-6 pt-4 border-t border-base-300">
                <button
                    class="btn btn-neutral"
                    onclick={() => (managingConnections = false)}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                    Close
                </button>
            </div>
        </div>
    </div>
{/if}

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
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold">Add Connection</h3>
                <button
                    class="btn btn-sm btn-circle btn-ghost"
                    onclick={closeAddConnection}>✕</button
                >
            </div>

            {#if addConnError}
                <div class="alert alert-error mb-4 shadow-sm">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="stroke-current flex-shrink-0 h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <span>{addConnError}</span>
                </div>
            {/if}

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Device A -->
                <div class="form-control">
                    <label class="label">
                        <span class="label-text font-medium"
                            >Device A <span class="text-error">*</span></span
                        >
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
                        --listMaxHeight="300px"
                    />
                </div>

                <!-- Port A -->
                <div class="form-control">
                    <label class="label">
                        <span class="label-text font-medium"
                            >Port A <span class="text-error">*</span></span
                        >
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
                        --listMaxHeight="300px"
                    />
                </div>

                <!-- Device B -->
                <div class="form-control">
                    <label class="label">
                        <span class="label-text font-medium"
                            >Device B <span class="text-error">*</span></span
                        >
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
                        --listMaxHeight="300px"
                    />
                </div>

                <!-- Port B -->
                <div class="form-control">
                    <label class="label">
                        <span class="label-text font-medium"
                            >Port B <span class="text-error">*</span></span
                        >
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
                        --listMaxHeight="300px"
                    />
                </div>

                <!-- Description -->
                <div class="form-control md:col-span-2">
                    <label class="label">
                        <span class="label-text font-medium"
                            >Description (optional)</span
                        >
                    </label>
                    <input
                        class="input input-bordered w-full"
                        bind:value={newConn.description}
                        placeholder="Enter connection description..."
                    />
                </div>
            </div>

            <div class="modal-action">
                <button class="btn btn-ghost" onclick={closeAddConnection}
                    >Cancel</button
                >
                <button
                    class="btn btn-primary"
                    onclick={submitNewConnection}
                    class:loading={addConnLoading}
                    disabled={addConnLoading}
                >
                    {addConnLoading ? "Creating..." : "Create Connection"}
                </button>
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

    /* Custom dropdown styling for better visibility */
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

    /* Better input styling */
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

    /* Ensure dropdown appears above other elements */
    :global(.svelte-select.focused .list-container) {
        z-index: 10000 !important;
    }
</style>
