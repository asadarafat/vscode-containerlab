// file: src/types/topoViewerType.ts


/**
 * Represents a Containerlab node definition as specified in the YAML configuration.
 */
export interface ClabNode {
    kind?: string;
    image?: string;
    type?: string;
    group?: string;
    labels?: Record<string, any>;
}

// Short-form link (existing format)
export interface ClabLinkShort {
    endpoints: [string, string];
}

// Extended link endpoint object
export interface ClabLinkEndpointObj {
    node: string;
    interface: string;
    mac?: string;
}

// Extended veth
export interface LinkTypeVeth {
    type: 'veth';
    endpoints: [ClabLinkEndpointObj, ClabLinkEndpointObj];
    mtu?: number;
    vars?: Record<string, any>;
    labels?: Record<string, any>;
}

// Extended mgmt-net
export interface LinkTypeMgmtNet {
    type: 'mgmt-net';
    endpoint: ClabLinkEndpointObj;
    'host-interface': string;
    mtu?: number;
    vars?: Record<string, any>;
    labels?: Record<string, any>;
}

// Extended macvlan
export interface LinkTypeMacvlan {
    type: 'macvlan';
    endpoint: ClabLinkEndpointObj;
    'host-interface': string;
    mode?: string;
    vars?: Record<string, any>;
    labels?: Record<string, any>;
}

// Extended host
export interface LinkTypeHost {
    type: 'host';
    endpoint: ClabLinkEndpointObj;
    'host-interface': string;
    mtu?: number;
    vars?: Record<string, any>;
    labels?: Record<string, any>;
}

// Extended vxlan
export interface LinkTypeVxlan {
    type: 'vxlan';
    endpoint: ClabLinkEndpointObj;
    remote: string; // ipv4/ipv6
    vni: number;
    'udp-port': number;
    mtu?: number;
    vars?: Record<string, any>;
    labels?: Record<string, any>;
}

// Extended vxlan-stitched (schema uses "vxlan-stitch")
export interface LinkTypeVxlanStitched {
    type: 'vxlan-stitch';
    endpoint: ClabLinkEndpointObj;
    remote: string;
    vni: number;
    'udp-port': number;
    mtu?: number;
    vars?: Record<string, any>;
    labels?: Record<string, any>;
}

// Extended dummy
export interface LinkTypeDummy {
    type: 'dummy';
    endpoint: ClabLinkEndpointObj;
    mtu?: number;
    vars?: Record<string, any>;
    labels?: Record<string, any>;
}

export type ClabLink =
    | ClabLinkShort
    | LinkTypeVeth
    | LinkTypeMgmtNet
    | LinkTypeMacvlan
    | LinkTypeHost
    | LinkTypeVxlan
    | LinkTypeVxlanStitched
    | LinkTypeDummy;

/**
 * Represents the main Containerlab topology structure as defined in the YAML configuration.
 */
export interface ClabTopology {
    name?: string
    prefix?: string;
    topology?: {
        defaults?: ClabNode;
        kinds?: Record<string, ClabNode>;
        groups?: Record<string, ClabNode>;
        nodes?: Record<string, ClabNode>;
        // Keep broad typing to avoid breaking existing code paths that expect short-form only
        links?: any[];
    };
}

/**
 * Represents a single Cytoscape element, either a node or an edge.
 */
export interface CyElement {
    group: 'nodes' | 'edges';
    data: Record<string, any>;
    position?: { x: number; y: number };
    removed?: boolean;
    selected?: boolean;
    selectable?: boolean;
    locked?: boolean;
    grabbed?: boolean;
    grabbable?: boolean;
    classes?: string;
}

/**
 * Represents the overall Cytoscape topology as an array of elements.
 */
export type CytoTopology = CyElement[];

/**
 * Represents the structure of the environment.json configuration file.
 */
export interface EnvironmentJson {
    workingDirectory: string;
    clabPrefix: string;
    clabName: string;
    clabServerAddress: string;
    clabAllowedHostname: string;
    clabAllowedHostname01: string;
    clabServerPort: string;
    deploymentType: string;
    topoviewerVersion: string;
    topviewerPresetLayout: string
    envCyTopoJsonBytes: CytoTopology | '';
}


// /**
//  * Represents CytoPosition for preset layout
//  */
// export interface CytoViewportSaveItem {
//     data: { id: string };
//     position: { x: number; y: number };
//   }
