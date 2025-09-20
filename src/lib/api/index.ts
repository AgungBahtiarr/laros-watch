
import type { Connection } from "../types";

import { PUBLIC_API_BASE_URL } from "$env/static/public";

const API_BASE_URL = PUBLIC_API_BASE_URL;

export const fetchAllNodes = async () => {
    const res = await fetch(`${API_BASE_URL}/nodes`);
    if (!res.ok) throw new Error(`Nodes fetch failed: HTTP ${res.status}`);
    return await res.json();
};

export const fetchAllConnections = async () => {
    const res = await fetch(`${API_BASE_URL}/nodes/connections`);
    if (!res.ok) throw new Error(`Connections fetch failed: HTTP ${res.status}`);
    const rawConns = await res.json();
    const unique = new Map();
    rawConns.forEach((c: any) => {
        const key = [c.deviceAId, c.deviceBId]
            .sort((a, b) => a - b)
            .join("-");
        if (!unique.has(key)) unique.set(key, c);
    });
    return Array.from(unique.values()) as Connection[];
};

export const updateConnection = async (conn: Partial<Connection>) => {
    const res = await fetch(`${API_BASE_URL}/nodes/connections/${conn.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            deviceAId: Number(conn.deviceAId),
            portAId: Number(conn.portAId),
            deviceBId: Number(conn.deviceBId),
            portBId: Number(conn.portBId),
            description: conn.description ?? "",
            odpPath: conn.odpPath?.map((odp: any) => odp.id) ?? [],
        }),
    });
    if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
    }
};

export const deleteConnection = async (id: number) => {
    const res = await fetch(`${API_BASE_URL}/nodes/connections/${id}`, {
        method: "DELETE",
    });
    if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
    }
};

export const createConnection = async (conn: any) => {
    const res = await fetch(`${API_BASE_URL}/nodes/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conn),
    });
    if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
    }
    return await res.json();
};

export const saveCustomRoute = async (connId: number, coords: [number, number][]) => {
    const res = await fetch(`${API_BASE_URL}/nodes/connections/${connId}/custom-route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: coords }),
    });
    if (!res.ok) throw new Error(await res.text());
};

export const deleteCustomRoute = async (connId: number) => {
    const res = await fetch(`${API_BASE_URL}/nodes/connections/${connId}/custom-route`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error(await res.text());
};

export const fetchAllOdpPoints = async () => {
    const res = await fetch(`${API_BASE_URL}/nodes/odp`);
    if (!res.ok) throw new Error(`ODP points fetch failed: HTTP ${res.status}`);
    return await res.json();
};

export type SaveOdpPointPayload = {
    name: string;
    location: string;
    notes: string;
    lat: number;
    lng: number;
};

export const saveOdpPoint = async (payload: SaveOdpPointPayload) => {
    const res = await fetch(`${API_BASE_URL}/nodes/odp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, lat: String(payload.lat), lng: String(payload.lng) }),
    });
    if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
    }
    return await res.json();
};

export const getEventSource = () => {
    return new EventSource(`${API_BASE_URL}/nodes/status/events`);
};
