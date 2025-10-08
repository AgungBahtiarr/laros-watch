export interface Interface {
  id: number;
  nodeId: number;
  ifIndex: number;
  ifName: string;
  ifDescr: string;
  ifType: string;
  ifPhysAddress: string;
  ifOperStatus: number;
  opticalTx: string | null;
  opticalRx: string | null;
  sfpInfo: any | null;
  lastChange: string;
  createdAt: string;
  updatedAt: string;
}

export interface Node {
  id: number;
  deviceId: number;
  name: string;
  popLocation: string;
  lat: string;
  lng: string;
  ipMgmt: string;
  snmpCommunity: string;
  status: boolean;
  os: string;
  cpuUsage: number;
  ramUsage: number;
  createdAt: string;
  updatedAt: string;
  interfaces: Interface[];
}

export interface Domain {
  id: number;
  name: string;
  whois: any | null;
  status: string;
  expiresAt: string;
  lastChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomRoute {
  id: number;
  connectionId: number;
  coordinates: [number, number][];
  createdAt: string;
  updatedAt: string;
}

export interface Connection {
  id: number;
  deviceAId: number;
  portAId: number;
  deviceBId: number;
  portBId: number;
  odpPath: number[];
  description: string;
  createdAt: string;
  updatedAt: string;
  customRoute: CustomRoute | null;
}

export interface Odp {
  id: number;
  name: string;
  location: string | null;
  lat: string | null;
  lng: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  connections: Connection[];
}
