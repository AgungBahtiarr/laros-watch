
import L from "leaflet";
import "leaflet-routing-machine";
import type { Node, Connection } from "$lib/types";

import { PUBLIC_OSRM_SERVICE_URL } from "$env/static/public";

const OSRM_SERVICE_URL = PUBLIC_OSRM_SERVICE_URL;

export const greenIcon = new L.Icon({
    iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
    shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

export const redIcon = new L.Icon({
    iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
    shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

let highlightedControl: L.Routing.Control | null = null;
let originalHighlightStyle: L.PathOptions | null = null;

export const clearHighlight = () => {
    if (highlightedControl && originalHighlightStyle) {
        const line = (highlightedControl as any)._line;
        if (line) {
            try {
                if (line.eachLayer && typeof line.eachLayer === "function") {
                    line.eachLayer((layer: any) => {
                        if (layer.setStyle && typeof layer.setStyle === "function") {
                            layer.setStyle(originalHighlightStyle);
                        }
                    });
                } else if (line.setStyle && typeof line.setStyle === "function") {
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

export const createRoute = (
    conn: Connection,
    nodeA: Node,
    nodeB: Node,
    mapInstance: L.Map,
    routeControlCounter: number,
) => {
    const controlId = `route-${conn.id}-${Date.now()}-${routeControlCounter}`;
    const latA = parseFloat(nodeA.lat);
    const lngA = parseFloat(nodeA.lng);
    const latB = parseFloat(nodeB.lat);
    const lngB = parseFloat(nodeB.lng);
    if ([latA, lngA, latB, lngB].some(isNaN)) return null;

    const isOnline = nodeA.status === true && nodeB.status === true;
    const color = isOnline
        ? `#${Math.floor(Math.random() * 16777215)
              .toString(16)
              .padStart(6, "0")}`
        : "red";

    const start = L.latLng(latA, lngA);
    const end = L.latLng(latB, lngB);

    const waypoints: L.LatLng[] = [start];

    if (conn.customRoute?.coordinates?.length > 0) {
        let coords: L.LatLng[] = conn.customRoute.coordinates.map((c: [number, number]) =>
            L.latLng(c[0], c[1]),
        );

        if (coords.length > 0) {
            const distFirstToA = coords[0].distanceTo(start);
            const distFirstToB = coords[0].distanceTo(end);
            if (distFirstToB < distFirstToA) {
                coords = coords.reverse();
            }
        }

        const minEdgeDist = 5;
        coords = coords.filter((p) => {
            const closeToA = p.distanceTo(start) <= minEdgeDist;
            const closeToB = p.distanceTo(end) <= minEdgeDist;
            return !(closeToA || closeToB);
        });

        const deduped: L.LatLng[] = [];
        const minStepDist = 1;
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
            pane: paneName,
        } as any,
    });

    (control as any)._controlId = controlId;

    control.on("routingerror", (e: any) => {
        console.error("Routing error:", e.error);
    });

    control.on("routesfound", (e: any) => {
        (control as any)._routes = e.routes;
        (control as any)._connectionInfo = {
            connection: conn,
            nodeA: nodeA,
            nodeB: nodeB,
            color: color,
            controlId: controlId,
        };
        const line = (control as any)._line;
        try {
            if (line && (line as any).eachLayer && typeof (line as any).eachLayer === "function") {
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
            console.warn("Failed to set data attributes on route path:", err);
        }
    });

    return control;
};

export function highlightRoute(control: L.Routing.Control, color: string) {
    clearHighlight();

    highlightedControl = control;
    originalHighlightStyle = {
        color: color || "#000",
        opacity: 1,
        weight: 5,
    };

    const line = (control as any)._line;
    if (line) {
        try {
            const style = {
                color: "yellow",
                weight: 8,
                opacity: 0.8,
                dashArray: "10, 5",
            };
            if (line.eachLayer && typeof line.eachLayer === "function") {
                line.eachLayer((layer: any) => {
                    if (layer.setStyle && typeof layer.setStyle === "function") {
                        layer.setStyle(style);
                    }
                });
            } else if (line.setStyle && typeof line.setStyle === "function") {
                line.setStyle(style);
            }
        } catch (err) {
            console.error("❌ Failed to apply highlight:", err);
        }
    }
}
