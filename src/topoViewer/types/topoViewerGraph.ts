// file: topoViewerGraph.ts
// Interfaces describing graph elements and annotations.

export interface ContainerDockerExtraAttribute {
  state?: string;
  status?: string;
}

export interface NodeExtraData {
  kind?: string;
  image?: string;
  type?: string;
  longname?: string;
  mgmtIpv4Address?: string;
  networkInterface?: string;
}

export interface NodeData {
  id: string;
  editor?: string;
  weight?: string;
  name?: string;
  parent?: string;
  topoViewerRole?: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  containerDockerExtraAttribute?: ContainerDockerExtraAttribute;
  extraData?: NodeExtraData;
}

export interface ParentNodeExtraData extends NodeExtraData {
  clabServerUsername: string;
  weight: string;
  name: string;
  topoViewerGroup: string;
  topoViewerGroupLevel: string;
}

export interface ParentNodeData extends NodeData {
  name: string;
  weight: string;
  topoViewerRole: string;
  extraData: ParentNodeExtraData;
  parent?: string;
}

export interface EdgeData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  editor?: string;
}

export interface FreeTextAnnotation {
  id: string;
  text: string;
  position: {
    x: number;
    y: number;
  };
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  fontFamily?: string;
  width?: number;
  height?: number;
  zIndex?: number;
}

export interface GroupStyleAnnotation {
  id: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dotted' | 'dashed' | 'double';
  borderRadius?: number;
  color?: string;
}

export interface CloudNodeAnnotation {
  id: string;
  type: 'host' | 'mgmt-net' | 'macvlan';
  label: string;
  position: {
    x: number;
    y: number;
  };
  group?: string;
  level?: string;
}

export interface NodeAnnotation {
  id: string;
  position?: {
    x: number;
    y: number;
  };
  geoCoordinates?: {
    lat: number;
    lng: number;
  };
  icon?: string;
  groupLabelPos?: string;
  group?: string;
  level?: string;
}

export interface TopologyAnnotations {
  freeTextAnnotations?: FreeTextAnnotation[];
  groupStyleAnnotations?: GroupStyleAnnotation[];
  cloudNodeAnnotations?: CloudNodeAnnotation[];
  nodeAnnotations?: NodeAnnotation[];
}
