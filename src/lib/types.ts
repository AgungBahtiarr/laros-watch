
export interface Interface {
    ifIndex: number;
    ifOperStatus: 1 | 2; // 1 is up, 2 is down
    ifName: string;
    ifDescr: string;
    opticalRx?: string;
    opticalTx?: string;
    id: number;
}

export interface Node {
    deviceId: number;
    name: string;
    ipMgmt: string;
    popLocation: string;
    status: boolean;
    lat: string;
    lng: string;
    interfaces: Interface[];
}

export interface CustomRoute {
    coordinates: [number, number][];
}

export interface Connection {
    id: number;
    deviceAId: number;
    portAId: number;
    deviceBId: number;
    portBId: number;
    description?: string;
    customRoute?: CustomRoute;
}

export interface OdpPoint {
    id: number;
    name: string;
    location: string;
    lat: string;
    lng: string;
    notes: string;
    createdAt: string;
    updatedAt: string;
}
