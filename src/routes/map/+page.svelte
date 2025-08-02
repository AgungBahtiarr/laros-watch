<script lang="ts">
    import { onMount } from "svelte";
    import type L from "leaflet";
    import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

    let mapContainer: HTMLElement;
    let allNodes = $state<any[]>([]);
    let connections = $state<any[]>([]);
    let connectionError = $state<any>(null);
    let mapInstance: L.Map | null = null;
    let markers: L.Marker[] = [];
    let routingControls: any[] = [];

    // Function to draw/update markers on the map
    const drawMarkers = async () => {
        if (!mapInstance) return;

        const L = await import("leaflet");

        // Clear existing markers
        markers.forEach((marker) => marker.remove());
        markers = [];

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

            if (!isNaN(lat) && !isNaN(lng)) {
                const icon = node.status === 1 ? greenIcon : redIcon;
                const marker = L.marker([lat, lng], { icon })
                    .addTo(mapInstance!)
                    .bindPopup(
                        `<b>${node.name}</b><br>IP: ${node.ipMgmt}<br>Status: ${node.status === 1 ? "Online" : "Offline"}`,
                    );
                markers.push(marker);
            }
        });
    };

    const drawConnections = async () => {
        if (!mapInstance || allNodes.length === 0) return;

        const L = await import("leaflet");
        await import("leaflet-routing-machine");

        // Clear existing routing controls
        routingControls.forEach((control) => control.remove());
        routingControls = [];

        connections.forEach((conn) => {
            const nodeA = allNodes.find((n) => n.deviceId === conn.deviceAId);
            const nodeB = allNodes.find((n) => n.deviceId === conn.deviceBId);

            if (nodeA && nodeB) {
                const latA = parseFloat(nodeA.lat);
                const lngA = parseFloat(nodeA.lng);
                const latB = parseFloat(nodeB.lat);
                const lngB = parseFloat(nodeB.lng);

                if (
                    !isNaN(latA) &&
                    !isNaN(lngA) &&
                    !isNaN(latB) &&
                    !isNaN(lngB)
                ) {
                    const lineStatus = nodeA.status === 1 && nodeB.status === 1;
                    let color = "red"; // Default to red for offline
                    if (lineStatus) {
                        const letters = "0123456789ABCDEF";
                        let randomColor = "#";
                        for (let i = 0; i < 6; i++) {
                            randomColor +=
                                letters[Math.floor(Math.random() * 16)];
                        }
                        color = randomColor;
                    }

                    const control = L.Routing.control({
                        router: L.Routing.osrmv1({
                            serviceUrl: "https://osrm.1dev.win/route/v1",
                        }),
                        waypoints: [L.latLng(latA, lngA), L.latLng(latB, lngB)],
                        routeWhileDragging: false,
                        addWaypoints: false,
                        draggableWaypoints: false,
                        fitSelectedRoutes: false,
                        showAlternatives: false,
                        lineOptions: {
                            styles: [{ color, opacity: 1, weight: 5 }],
                        },
                        createMarker: function () {
                            return null;
                        },
                    }).addTo(mapInstance!);

                    routingControls.push(control);
                }
            }
        });
    };

    const drawMap = () => {
        drawMarkers();
        drawConnections();
    };

    onMount(async () => {
        if (mapContainer) {
            const L = await import("leaflet");
            await import("leaflet-routing-machine");
            mapInstance = L.map(mapContainer).setView([-8.3, 114.25], 10);

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            }).addTo(mapInstance);

            // Initial fetch and draw
            await fetchNodes();
            await fetchConnections();
            drawMap();
        }
    });

    const fetchNodes = async () => {
        try {
            const baseUrl = "http://localhost:3000/api";
            const response = await fetch(`${baseUrl}/nodes`);
            if (!response.ok)
                throw new Error(`HTTP error! status: ${response.status}`);
            allNodes = await response.json();
            connectionError = null;
        } catch (e) {
            console.error("Failed to fetch nodes data:", e);
            connectionError = {
                title: "Data Fetch Error",
                subtitle: "Could not retrieve data from the server.",
            };
        }
    };

    const fetchConnections = async () => {
        try {
            const baseUrl = "http://localhost:3000/api";
            const response = await fetch(`${baseUrl}/nodes/connections`);
            if (!response.ok)
                throw new Error(`HTTP error! status: ${response.status}`);
            const rawConnections = await response.json();
            const uniqueConnections = new Map();
            rawConnections.forEach((conn: any) => {
                const key = [conn.deviceAId, conn.deviceBId]
                    .sort((a, b) => a - b)
                    .join("-");
                if (!uniqueConnections.has(key)) {
                    uniqueConnections.set(key, conn);
                }
            });
            connections = Array.from(uniqueConnections.values());
        } catch (e) {
            console.error("Failed to fetch connections data:", e);
            // Optionally handle connection fetch error separately
        }
    };

    $effect(() => {
        const baseUrl = "http://localhost:3000/api";
        const eventSourceUrl = `${baseUrl}/nodes/status/events`;
        const eventSource = new EventSource(eventSourceUrl);

        eventSource.addEventListener("notification", (event) => {
            const data = JSON.parse(event.data);
            if (data.nodeChanges) {
                // Find the changed node and update its status
                const change = data.nodeChanges[0]; // Assuming one change at a time for simplicity
                const nodeIndex = allNodes.findIndex(
                    (n) => n.ipMgmt === change.ipMgmt,
                );
                if (nodeIndex !== -1) {
                    allNodes[nodeIndex].status = change.status;
                    drawMap(); // Redraw markers when status changes
                }
            }
        });

        return () => {
            eventSource.close();
        };
    });
</script>

<div class="bg-base-100 rounded-2xl shadow-xl border border-base-300 p-6 mb-8">
    <h2 class="text-2xl font-bold text-base-content mb-4">Network Map</h2>
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

<style>
    :global(.leaflet-routing-container) {
        display: none;
    }
</style>
