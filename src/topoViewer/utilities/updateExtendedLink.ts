import * as fs from 'fs';
import * as YAML from 'yaml';
import { TopoViewerAdaptorClab } from '../core/topoViewerAdaptorClab';

interface UpdatePayload {
  type: 'veth' | 'mgmt-net' | 'macvlan' | 'host' | 'vxlan' | 'vxlan-stitch' | 'dummy';
  endpoint: { node: string; interface: string; mac?: string };
  'host-interface'?: string;
  mode?: string;
  remote?: string;
  vni?: number;
  'udp-port'?: number;
  mtu?: number;
  labels?: Record<string, string | number>;
  vars?: Record<string, any>;
}

export async function updateExtendedLink({ adaptor, yamlFilePath, update }: { adaptor: TopoViewerAdaptorClab; yamlFilePath: string; update: UpdatePayload }): Promise<void> {
  let doc = adaptor.currentClabDoc;
  if (!doc) {
    const yaml = await fs.promises.readFile(yamlFilePath, 'utf8');
    doc = YAML.parseDocument(yaml);
  }
  if (!doc) throw new Error('Unable to load YAML document');

  const links = doc.getIn(['topology', 'links'], true);
  if (!YAML.isSeq(links)) {
    throw new Error('YAML topology links is not a sequence');
  }

  // Helpers (DRY): extract all candidate endpoints and rebuild link for target type
  const clearTypeSpecificFields = (m: YAML.YAMLMap) => ['remote','vni','udp-port','host-interface','mode','endpoint','endpoints'].forEach(k => m.delete(k));
  const setEndpoint = (m: YAML.YAMLMap, node: any, iface: any, mac?: any) => {
    const ep = new YAML.YAMLMap();
    ep.set('node', node);
    ep.set('interface', iface);
    if (mac !== undefined && mac !== '') ep.set('mac', mac);
    m.set('endpoint', ep);
  };

  const endpointsEqual = (aNode: string, aIf: string, bNode: string, bIf: string) => aNode === bNode && aIf === bIf;

  for (const item of links.items) {
    if (!YAML.isMap(item)) continue;
    const linkMap = item as YAML.YAMLMap;
    const typeNode = linkMap.get('type', true) as any;
    const typeStr = String(typeNode?.value ?? typeNode ?? '');

    // Gather candidate endpoints from current link
    const candidates: Array<{ node: string; iface: string }> = [];
    if (typeStr === 'veth') {
      const eps = linkMap.get('endpoints', true);
      if (YAML.isSeq(eps)) {
        for (const it of eps.items) {
          if (YAML.isMap(it)) {
            const n = String(((it as YAML.YAMLMap).get('node', true) as any)?.value ?? (it as YAML.YAMLMap).get('node', true));
            const f = String(((it as YAML.YAMLMap).get('interface', true) as any)?.value ?? (it as YAML.YAMLMap).get('interface', true));
            candidates.push({ node: n, iface: f });
          } else if (typeof it === 'string') {
            const idx = it.indexOf(':');
            if (idx !== -1) candidates.push({ node: it.slice(0, idx), iface: it.slice(idx + 1) });
          }
        }
      }
    } else {
      const ep = linkMap.get('endpoint', true);
      if (YAML.isMap(ep)) {
        const n = String(((ep as YAML.YAMLMap).get('node', true) as any)?.value ?? (ep as YAML.YAMLMap).get('node', true));
        const f = String(((ep as YAML.YAMLMap).get('interface', true) as any)?.value ?? (ep as YAML.YAMLMap).get('interface', true));
        candidates.push({ node: n, iface: f });
      }
    }

    // Check if any candidate matches the provided endpoint (so we can convert type freely)
    const matched = candidates.some(c => endpointsEqual(c.node, c.iface, update.endpoint.node, update.endpoint.interface));
    if (!matched) continue;

    // Rebuild link according to target type with DRY cleanup
    linkMap.set('type', doc.createNode(update.type));
    clearTypeSpecificFields(linkMap);
    setEndpoint(linkMap, doc.createNode(update.endpoint.node), doc.createNode(update.endpoint.interface), update.endpoint.mac ? doc.createNode(update.endpoint.mac) : undefined);

    switch (update.type) {
      case 'host':
      case 'mgmt-net':
        if (!update['host-interface'] || String(update['host-interface']).trim() === '') {
          throw new Error(`'host-interface' is required for type ${update.type}`);
        }
        linkMap.set('host-interface', doc.createNode(update['host-interface']));
        break;
      case 'macvlan':
        if (!update['host-interface'] || String(update['host-interface']).trim() === '') {
          throw new Error(`'host-interface' is required for type macvlan`);
        }
        linkMap.set('host-interface', doc.createNode(update['host-interface']));
        {
          const allowedModes = ['private', 'vepa', 'bridge', 'passthru', 'source'];
          const mode = update.mode && allowedModes.includes(update.mode) ? update.mode : 'bridge';
          linkMap.set('mode', doc.createNode(mode));
        }
        break;
      case 'vxlan':
      case 'vxlan-stitch':
        if (!update.remote || String(update.remote).trim() === '') {
          throw new Error(`'remote' is required for type ${update.type}`);
        }
        if (typeof update.vni !== 'number' || update.vni < 1 || update.vni > 16777215) {
          throw new Error(`'vni' must be an integer in [1,16777215] for type ${update.type}`);
        }
        if (typeof update['udp-port'] !== 'number' || update['udp-port'] < 1 || update['udp-port'] > 65535) {
          throw new Error(`'udp-port' must be an integer in [1,65535] for type ${update.type}`);
        }
        linkMap.set('remote', doc.createNode(update.remote));
        linkMap.set('vni', doc.createNode(update.vni));
        linkMap.set('udp-port', doc.createNode(update['udp-port']));
        break;
      case 'dummy':
        // only endpoint for dummy
        break;
      case 'veth':
        // Not supported via Network Properties (requires two endpoints)
        break;
    }

    // Generic optional fields applicable across types
    if (typeof update.mtu === 'number') linkMap.set('mtu', doc.createNode(update.mtu));
    if (update.labels && typeof update.labels === 'object') linkMap.set('labels', doc.createNode(update.labels));
    if (update.vars && typeof update.vars === 'object') linkMap.set('vars', doc.createNode(update.vars));

    return fs.promises.writeFile(yamlFilePath, doc.toString(), 'utf8');
  }

  throw new Error('Extended link not found for update');
}
