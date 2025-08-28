import * as YAML from 'yaml';
import {
  ClabTopology,
  ClabLink,
  ClabLinkShort,
  LinkTypeVeth,
  LinkTypeMgmtNet,
  LinkTypeMacvlan,
  LinkTypeHost,
  LinkTypeVxlan,
  LinkTypeVxlanStitched,
  LinkTypeDummy,
} from '../types/topoViewerType';

export type LinkProvenance = 'short' | 'extended';

export interface NormalizedLinkMeta {
  hostInterface?: string;
  mode?: string;
  remote?: string;
  vni?: number;
  udpPort?: number;
}

export interface NormalizedLink {
  sourceNode: string;
  sourceIface: string;
  targetNode: string;
  targetIface: string;
  provenance: LinkProvenance;
  linkType: 'short' | 'veth' | 'mgmt-net' | 'macvlan' | 'host' | 'vxlan' | 'vxlan-stitch' | 'dummy';
  meta?: NormalizedLinkMeta;
}

function splitEndpoint(ep: string): { node: string; iface: string } {
  const idx = ep.indexOf(':');
  if (idx === -1) return { node: ep, iface: '' };
  return { node: ep.slice(0, idx), iface: ep.slice(idx + 1) };
}

export function normalizeLinks(topo: ClabTopology): NormalizedLink[] {
  const links = topo.topology?.links ?? [];
  const result: NormalizedLink[] = [];

  for (const raw of links as ClabLink[]) {
    if (Array.isArray((raw as ClabLinkShort).endpoints) && typeof (raw as any).type !== 'string') {
      // short-form
      const sf = raw as ClabLinkShort;
      if (sf.endpoints.length !== 2) continue;
      const a = splitEndpoint(sf.endpoints[0]);
      const b = splitEndpoint(sf.endpoints[1]);
      result.push({
        sourceNode: a.node,
        sourceIface: a.iface,
        targetNode: b.node,
        targetIface: b.iface,
        provenance: 'short',
        linkType: 'short',
      });
      continue;
    }

    const t = (raw as any).type as string | undefined;
    if (!t) continue;

    switch (t) {
      case 'veth': {
        const v = raw as LinkTypeVeth;
        const epA = v.endpoints[0];
        const epB = v.endpoints[1];
        result.push({
          sourceNode: epA.node,
          sourceIface: epA.interface,
          targetNode: epB.node,
          targetIface: epB.interface,
          provenance: 'extended',
          linkType: 'veth',
        });
        break;
      }
      case 'mgmt-net': {
        const v = raw as LinkTypeMgmtNet;
        result.push({
          sourceNode: v.endpoint.node,
          sourceIface: v.endpoint.interface,
          targetNode: 'mgmt-net',
          targetIface: v['host-interface'] ?? '',
          provenance: 'extended',
          linkType: 'mgmt-net',
          meta: { hostInterface: v['host-interface'] },
        });
        break;
      }
      case 'host': {
        const v = raw as LinkTypeHost;
        result.push({
          sourceNode: v.endpoint.node,
          sourceIface: v.endpoint.interface,
          targetNode: 'host',
          targetIface: v['host-interface'] ?? '',
          provenance: 'extended',
          linkType: 'host',
          meta: { hostInterface: v['host-interface'] },
        });
        break;
      }
      case 'macvlan': {
        const v = raw as LinkTypeMacvlan;
        const hi = v['host-interface'] ?? '';
        result.push({
          sourceNode: v.endpoint.node,
          sourceIface: v.endpoint.interface,
          targetNode: `macvlan:${hi}`,
          targetIface: '',
          provenance: 'extended',
          linkType: 'macvlan',
          meta: { hostInterface: hi, mode: v.mode },
        });
        break;
      }
      case 'vxlan': {
        const v = raw as LinkTypeVxlan;
        result.push({
          sourceNode: v.endpoint.node,
          sourceIface: v.endpoint.interface,
          targetNode: `vxlan:${v.remote}/${v.vni}`,
          targetIface: '',
          provenance: 'extended',
          linkType: 'vxlan',
          meta: { remote: v.remote, vni: v.vni, udpPort: v['udp-port'] },
        });
        break;
      }
      case 'vxlan-stitch': {
        const v = raw as LinkTypeVxlanStitched;
        result.push({
          sourceNode: v.endpoint.node,
          sourceIface: v.endpoint.interface,
          targetNode: `vxlan-stitch:${v.remote}/${v.vni}`,
          targetIface: '',
          provenance: 'extended',
          linkType: 'vxlan-stitch',
          meta: { remote: v.remote, vni: v.vni, udpPort: v['udp-port'] },
        });
        break;
      }
      case 'dummy': {
        const v = raw as LinkTypeDummy;
        result.push({
          sourceNode: v.endpoint.node,
          sourceIface: v.endpoint.interface,
          targetNode: `dummy:${v.endpoint.node}:${v.endpoint.interface}`,
          targetIface: '',
          provenance: 'extended',
          linkType: 'dummy',
        });
        break;
      }
      default: {
        // Unknown type: skip gracefully
        break;
      }
    }
  }

  return result;
}

// Helper for tests: parse YAML string and normalize.
export function normalizeYaml(yaml: string): NormalizedLink[] {
  const topo = YAML.parse(yaml) as ClabTopology;
  return normalizeLinks(topo);
}

