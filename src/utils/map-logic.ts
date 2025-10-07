import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as turf from "@turf/turf";
import type { Node, Connection } from "../types";

interface Route {
    geometry: any;
    distance: number;
    connectionId: number;
}

interface PageData {
    nodes: Node[];
    connections: Connection[];
    nodesWithLocation: Node[];
    routes: Route[];
    apiBaseUrl: string;
}

export function init({
    nodes,
    connections,
    nodesWithLocation,
    routes,
    apiBaseUrl
}: PageData) {

    // --- Helper Functions ---
    function stringToColor(str: string): string {
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

    // --- Map Initialization ---
    const map = L.map("map").setView([-2.5, 118], 5); // Default view of Indonesia
    if (nodesWithLocation.length > 0) {
        map.setView(
            [
                parseFloat(nodesWithLocation[0].lat),
                parseFloat(nodesWithLocation[0].lng),
            ],
            8,
        );
    }
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
    }).addTo(map);
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
        L.marker([parseFloat(node.lat), parseFloat(node.lng)], { icon: icon })
            .addTo(map)
            .bindPopup(
                `<b>${node.name}</b><br>Status: ${node.status ? "Up" : "Down"}`,
            );
    });
    let selectedRouteLayer: L.Layer & { originalStyle?: L.PathOptions } | null = null;
    let findPointMarker: L.Marker | null = null;
    map.on("click", () => {
        if (selectedRouteLayer) {
            (selectedRouteLayer as L.Path).setStyle(selectedRouteLayer.originalStyle!);
            selectedRouteLayer = null;
        }
    });
    const routeLayers: { [key: number]: L.GeoJSON } = {};
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
                const color = stringToColor(routeData.connectionId.toString());

                const routeLayer = L.geoJSON(routeData.geometry, {
                    style: { color: color, weight: 3, opacity: 0.8 },
                    onEachFeature: function (feature, layer) {
                        layer.bindPopup(popupContent);
                        (layer as any).originalStyle = {
                            color: color,
                            weight: 3,
                            opacity: 0.8,
                        };

                        layer.on("click", (e) => {
                            if (selectedRouteLayer) {
                                (selectedRouteLayer as L.Path).setStyle(selectedRouteLayer.originalStyle!);
                            }
                            (layer as L.Path).setStyle({
                                color: "#FFFF00",
                                weight: 5,
                                opacity: 1,
                            });
                            (layer as L.Path).bringToFront();
                            selectedRouteLayer = layer as L.Layer & { originalStyle?: L.PathOptions; };
                            if (e.originalEvent) {
                                L.DomEvent.stopPropagation(e); // prevent map click from firing
                            }
                        });
                    },
                }).addTo(map);
                routeLayers[routeData.connectionId] = routeLayer;
            }
        });
    }

    // --- Modal and Form Logic ---
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const connectionMap = new Map(
        connections.map((conn) => [conn.id, conn]),
    );
    const form = document.getElementById("connection-form") as HTMLFormElement;
    const modalToggle = document.getElementById(
        "add-connection-modal",
    ) as HTMLInputElement;
    const modalTitle = document.getElementById("modal-title") as HTMLElement;
    const connectionIdInput = document.getElementById(
        "connection-id",
    ) as HTMLInputElement;
    const descriptionInput = document.getElementById(
        "description",
    ) as HTMLInputElement;
    const deviceASelect = document.getElementById("deviceAId") as HTMLSelectElement;
    const portASelect = document.getElementById("portAId") as HTMLSelectElement;
    const deviceBSelect = document.getElementById("deviceBId") as HTMLSelectElement;
    const portBSelect = document.getElementById("portBId") as HTMLSelectElement;
    const odpPathInput = document.getElementById("odpPath") as HTMLInputElement;

    const findPointModalToggle = document.getElementById(
        "find-point-modal",
    ) as HTMLInputElement;
    const findPointForm = document.getElementById(
        "find-point-form",
    ) as HTMLFormElement;
    const findPointConnectionIdInput = document.getElementById(
        "find-point-connection-id",
    ) as HTMLInputElement;
    const startNodeSelect = document.getElementById(
        "start-node-select",
    ) as HTMLSelectElement;
    const distanceInput = document.getElementById(
        "distance-input",
    ) as HTMLInputElement;

    function populatePorts(
        deviceSelect: HTMLSelectElement,
        portSelect: HTMLSelectElement,
        selectedPortId?: number,
    ) {
        const selectedNodeId = deviceSelect.value;
        portSelect.innerHTML = "";
        portSelect.disabled = true;
        if (!selectedNodeId) return;

        const node = nodeMap.get(parseInt(selectedNodeId));
        if (node && node.interfaces) {
            portSelect.disabled = false;
            node.interfaces.forEach((iface) => {
                const option = document.createElement("option");
                option.value = iface.id.toString();
                option.textContent = `${iface.ifName} (${iface.ifDescr})`;
                if (iface.id === selectedPortId) {
                    option.selected = true;
                }
                portSelect.appendChild(option);
            });
        }
    }

    function resetForm() {
        form.reset();
        connectionIdInput.value = "";
        modalTitle.textContent = "Add New Connection";
        portASelect.innerHTML = "";
        portASelect.disabled = true;
        portBSelect.innerHTML = "";
        portBSelect.disabled = true;
    }

    deviceASelect.addEventListener("change", () =>
        populatePorts(deviceASelect, portASelect),
    );
    deviceBSelect.addEventListener("change", () =>
        populatePorts(deviceBSelect, portBSelect),
    );
    modalToggle.addEventListener("change", () => {
        if (!modalToggle.checked) {
            resetForm();
        }
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const connectionId = connectionIdInput.value;
        const isEdit = !!connectionId;
        const formData = new FormData(form);
        const data = {
            deviceAId: parseInt(formData.get("deviceAId") as string),
            portAId: parseInt(formData.get("portAId") as string),
            deviceBId: parseInt(formData.get("deviceBId") as string),
            portBId: parseInt(formData.get("portBId") as string),
            description: formData.get("description"),
            odpPath: (formData.get("odpPath") as string)
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
            modalToggle.checked = false;
            location.reload();
        } catch (error) {
            console.error(error);
            alert("Error: " + (error as Error).message);
        }
    });

    // --- Table Button Logic ---
    document.querySelectorAll(".btn-view").forEach((button) => {
        button.addEventListener("click", (e) => {
            const row = (e.target as HTMLElement).closest("tr");
            if (!row) return;
            const connectionId = row.dataset.connectionId;
            if (!connectionId) return;
            const routeLayer = routeLayers[parseInt(connectionId)];
            if (routeLayer) {
                const bounds = routeLayer.getBounds();
                map.fitBounds(bounds.pad(0.1));
                routeLayer.eachLayer((layer) => {
                    (layer as L.Path).fire("click");
                    layer.openPopup();
                });
            }
        });
    });

    document.querySelectorAll(".btn-delete").forEach((button) => {
        button.addEventListener("click", async (e) => {
            const row = (e.target as HTMLElement).closest("tr");
            if (!row) return;
            const connectionId = row.dataset.connectionId;
            if (!connectionId) return;
            if (confirm("Are you sure you want to delete this connection?")) {
                try {
                    const response = await fetch(
                        `${apiBaseUrl}/api/nodes/connections/${connectionId}`,
                        { method: "DELETE" },
                    );
                    if (!response.ok)
                        throw new Error("Failed to delete connection");
                    location.reload();
                } catch (error) {
                    console.error(error);
                    alert("Error: " + (error as Error).message);
                }
            }
        });
    });

    document.querySelectorAll(".btn-edit").forEach((button) => {
        button.addEventListener("click", (e) => {
            const row = (e.target as HTMLElement).closest("tr");
            if (!row) return;
            const connectionId = parseInt(row.dataset.connectionId || "");
            const conn = connectionMap.get(connectionId);

            if (conn) {
                modalTitle.textContent = "Edit Connection";
                connectionIdInput.value = conn.id.toString();
                descriptionInput.value = conn.description;
                deviceASelect.value = conn.deviceAId.toString();
                populatePorts(deviceASelect, portASelect, conn.portAId);
                deviceBSelect.value = conn.deviceBId.toString();
                populatePorts(deviceBSelect, portBSelect, conn.portBId);
                odpPathInput.value = conn.odpPath?.join(", ") || "";
                modalToggle.checked = true;
            }
        });
    });

    document.querySelectorAll(".btn-find-point").forEach((button) => {
        button.addEventListener("click", (e) => {
            const row = (e.target as HTMLElement).closest("tr");
            if (!row) return;
            const connectionId = parseInt(row.dataset.connectionId || "");
            const conn = connectionMap.get(connectionId);

            if (!conn) return;

            findPointConnectionIdInput.value = connectionId.toString();
            startNodeSelect.innerHTML = "";

            const nodeA = nodeMap.get(conn.deviceAId);
            const nodeB = nodeMap.get(conn.deviceBId);

            if (nodeA) {
                const optionA = document.createElement("option");
                optionA.value = nodeA.id.toString();
                optionA.textContent = nodeA.name;
                startNodeSelect.appendChild(optionA);
            }
            if (nodeB) {
                const optionB = document.createElement("option");
                optionB.value = nodeB.id.toString();
                optionB.textContent = nodeB.name;
                startNodeSelect.appendChild(optionB);
            }

            findPointModalToggle.checked = true;
        });
    });

    findPointForm.addEventListener("submit", (e) => {
        e.preventDefault();

        const connectionId = parseInt(findPointConnectionIdInput.value);
        const startNodeId = parseInt(startNodeSelect.value);
        const distanceMeters = parseFloat(distanceInput.value);

        if (isNaN(distanceMeters)) {
            alert("Invalid distance.");
            return;
        }

        const routeData = routes.find(
            (r) => r.connectionId === connectionId,
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

        const conn = connectionMap.get(connectionId);
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
        popupContent.innerHTML = `
            Point at ${distanceMeters}m from ${
            startNodeSelect.options[startNodeSelect.selectedIndex].text
        }
            <br><br>
            <button class="btn btn-sm btn-primary copy-gmaps-link-btn">Copy Google Maps Link</button>
        `;

        const copyButton = popupContent.querySelector(
            ".copy-gmaps-link-btn",
        ) as HTMLButtonElement;
        copyButton.addEventListener("click", () => {
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

        findPointModalToggle.checked = false;
        findPointForm.reset();
    });
}
