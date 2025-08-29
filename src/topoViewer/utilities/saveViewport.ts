import * as fs from 'fs';
import * as YAML from 'yaml';

import { log } from '../logging/logger';
import { TopoViewerAdaptorClab } from '../core/topoViewerAdaptorClab';
import { resolveNodeConfig } from '../core/nodeConfig';
import { ClabTopology } from '../types/topoViewerType';
import { annotationsManager } from './annotationsManager';
import { CloudNodeAnnotation, NodeAnnotation } from '../types/topoViewerGraph';
import { isSpecialEndpoint } from './specialNodes';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function computeEndpointsStr(data: any): string | null {
  // Prefer explicit endpoints array when present, as special endpoints already correct encoded
  if (data.endpoints && Array.isArray(data.endpoints) && data.endpoints.length === 2) {
    const valid = data.endpoints.every((ep: any) => typeof ep === 'string' && ep.includes(':'));
    if (valid) {
      return (data.endpoints as string[]).join(',');
    }
  }
  if (data.sourceEndpoint && data.targetEndpoint) {
    return `${data.source}:${data.sourceEndpoint},${data.target}:${data.targetEndpoint}`;
  }
  return null;
}

export interface SaveViewportParams {
  mode: 'edit' | 'view';
  yamlFilePath: string;
  payload: string;
  adaptor?: TopoViewerAdaptorClab;
  linkSaveFormat?: 'flat' | 'extended';
  setInternalUpdate?: (_arg: boolean) => void; // eslint-disable-line no-unused-vars
}

export async function saveViewport({
  mode,
  yamlFilePath,
  payload,
  adaptor,
  setInternalUpdate,
  linkSaveFormat = 'flat',
}: SaveViewportParams): Promise<void> {
  const payloadParsed: any[] = JSON.parse(payload);
  let doc: YAML.Document.Parsed | undefined;
  if (mode === 'edit') {
    doc = adaptor?.currentClabDoc;
    if (!doc) {
      throw new Error('No parsed Document found (adaptor.currentClabDoc is undefined).');
    }
  } else {
    const yamlContent = await fs.promises.readFile(yamlFilePath, 'utf8');
    doc = YAML.parseDocument(yamlContent);
    if (!doc) {
      throw new Error('Failed to parse YAML document');
    }
  }

  const updatedKeys = new Map<string, string>();

  const nodesMaybe = doc.getIn(['topology', 'nodes'], true);
  if (!YAML.isMap(nodesMaybe)) {
    throw new Error('YAML topology nodes is not a map');
  }
  const yamlNodes: YAML.YAMLMap = nodesMaybe;
  // Ensure block style for the nodes mapping (avoid inline `{}` flow style)
  yamlNodes.flow = false;

  const topoObj = mode === 'edit' ? (doc.toJS() as ClabTopology) : undefined;

  // Regular (non-cloud, non-special-endpoint) nodes → persist/update under topology.nodes
  payloadParsed
    .filter(el => el.group === 'nodes'
      && el.data.topoViewerRole !== 'group'
      && el.data.topoViewerRole !== 'cloud'
      && el.data.topoViewerRole !== 'freeText'
      && !isSpecialEndpoint(el.data.id))
    .forEach(element => {
      const nodeId: string = element.data.id;
      let nodeYaml = yamlNodes.get(nodeId, true) as YAML.YAMLMap | undefined;

      if (mode === 'edit') {
        if (!nodeYaml) {
          nodeYaml = new YAML.YAMLMap();
          // Ensure new node maps are block style
          nodeYaml.flow = false;
          yamlNodes.set(nodeId, nodeYaml);
        }
        const nodeMap = nodeYaml;
        const extraData = element.data.extraData || {};
        const existingKind = (nodeMap.get('kind', true) as any)?.value;
        const existingImage = (nodeMap.get('image', true) as any)?.value;
        const existingType = (nodeMap.get('type', true) as any)?.value;
        const groupName = extraData.group ?? (nodeMap.get('group', true) as any)?.value;
        const desiredKind = extraData.kind ?? existingKind ?? element.data.topoViewerRole;
        const desiredImage = extraData.image ?? existingImage;
        const desiredType = extraData.type ?? existingType;
        const inherit = resolveNodeConfig(topoObj!, { group: groupName });

        if (groupName) {
          nodeMap.set('group', doc.createNode(groupName));
        } else {
          nodeMap.delete('group');
        }

        if (desiredKind && desiredKind !== inherit.kind) {
          nodeMap.set('kind', doc.createNode(desiredKind));
        } else {
          nodeMap.delete('kind');
        }

        if (desiredImage && desiredImage !== inherit.image) {
          nodeMap.set('image', doc.createNode(desiredImage));
        } else {
          nodeMap.delete('image');
        }

        const nokiaKinds = ['nokia_srlinux', 'nokia_srsim', 'nokia_sros'];
        if (nokiaKinds.includes(desiredKind) && desiredType !== undefined && desiredType !== '' && desiredType !== inherit.type) {
          nodeMap.set('type', doc.createNode(desiredType));
        } else {
          nodeMap.delete('type');
        }

        const newKey = element.data.name;
        if (nodeId !== newKey) {
          yamlNodes.set(newKey, nodeMap);
          yamlNodes.delete(nodeId);
          updatedKeys.set(nodeId, newKey);
        }
      } else {
        if (!nodeYaml) {
          log.warn(`Node ${nodeId} not found in YAML, skipping`);
          return;
        }
      }
    });

  if (mode === 'edit') {
    // Bridge/OVS-bridge cloud nodes are special in the viewer, but materialize as nodes in YAML
    const cloudBridgeNodes = payloadParsed.filter(el =>
      el.group === 'nodes' && el.data.topoViewerRole === 'cloud' &&
      (el.data?.extraData?.kind === 'bridge' || el.data?.extraData?.kind === 'ovs-bridge')
    );
    for (const cloud of cloudBridgeNodes) {
      const nodeId: string = cloud.data.id;
      let nodeYaml = yamlNodes.get(nodeId, true) as YAML.YAMLMap | undefined;
      if (!nodeYaml) {
        nodeYaml = new YAML.YAMLMap();
        nodeYaml.flow = false;
        yamlNodes.set(nodeId, nodeYaml);
      }
      const desiredKind = cloud.data?.extraData?.kind;
      if (desiredKind) {
        nodeYaml.set('kind', doc.createNode(desiredKind));
      }
    }

    // Host cloud nodes are always treated as special and are NOT materialized as topology.nodes

    const payloadNodeIds = new Set(
      payloadParsed
        .filter(el => (
            el.group === 'nodes' &&
            el.data.topoViewerRole !== 'freeText' &&
            // Include regular nodes and cloud bridges/ovs-bridges for add/remove tracking
            ((el.data.topoViewerRole !== 'cloud' && !isSpecialEndpoint(el.data.id)) ||
             (el.data.topoViewerRole === 'cloud' && (el.data?.extraData?.kind === 'bridge' || el.data?.extraData?.kind === 'ovs-bridge')))
        ))
        .map(el => el.data.id)
    );
    for (const item of [...yamlNodes.items]) {
      const keyStr = String(item.key);
      if (!payloadNodeIds.has(keyStr) && ![...updatedKeys.values()].includes(keyStr)) {
        // Do not auto-delete legacy special nodes (host/bridge/ovs-bridge) from older YAMLs
        const nodeVal = item.value;
        let kindStr = '';
        if (YAML.isMap(nodeVal)) {
          const kindNode = (nodeVal as YAML.YAMLMap).get('kind', true) as any;
          kindStr = String(kindNode?.value ?? kindNode ?? '');
        }
        const preserve = kindStr === 'host' || kindStr === 'bridge' || kindStr === 'ovs-bridge';
        if (!preserve) {
          yamlNodes.delete(item.key);
        }
      }
    }

    const maybeLinksNode = doc.getIn(['topology', 'links'], true);
    let linksNode: YAML.YAMLSeq;
    if (YAML.isSeq(maybeLinksNode)) {
      linksNode = maybeLinksNode;
    } else {
      linksNode = new YAML.YAMLSeq();
      const topologyNode = doc.getIn(['topology'], true);
      if (YAML.isMap(topologyNode)) {
        topologyNode.set('links', linksNode);
      }
    }
    // Ensure links list renders with indented hyphens (block style)
    linksNode.flow = false;

    payloadParsed.filter(el => el.group === 'edges').forEach(element => {
      const data = element.data;
      const endpointsStr = computeEndpointsStr(data);
      if (!endpointsStr) return;

      const srcId: string = data.source;
      const tgtId: string = data.target;
      const srcEp: string = data.sourceEndpoint || '';
      const tgtEp: string = data.targetEndpoint || '';
      const isSrcSpecial = isSpecialEndpoint(srcId);
      const isTgtSpecial = isSpecialEndpoint(tgtId);

      // If extended mode and exactly one side is special, prepare an extended key
      const extCandidate = (linkSaveFormat === 'extended') && (isSrcSpecial !== isTgtSpecial);
      const buildExtKeyFromVals = (kind: string, hostIf: string, nodeName: string, iface: string) => `ext:${kind}|${hostIf}|${nodeName}|${iface}`;
      const parseSpecial = (id: string): { kind: string; hostIf: string } | null => {
        const kinds = ['host', 'mgmt-net', 'macvlan'];
        for (const k of kinds) {
          if (id.startsWith(`${k}:`)) {
            return { kind: k, hostIf: id.substring(k.length + 1) };
          }
        }
        return null;
      };
      const special = extCandidate ? parseSpecial(isSrcSpecial ? srcId : tgtId) : null;
      const contNode = isSrcSpecial ? tgtId : srcId;
      const contIf = isSrcSpecial ? tgtEp : srcEp;
      const desiredExtKey = (special && contNode && contIf) ? buildExtKeyFromVals(special.kind, special.hostIf, contNode, contIf) : '';

      // Scan existing links to avoid duplicates (both flat and extended)
      let linkFound = false;
      for (const linkItem of linksNode.items) {
        if (!YAML.isMap(linkItem)) continue;
        (linkItem as YAML.YAMLMap).flow = false; // normalize style
        if ((linkItem as YAML.YAMLMap).has('type')) {
          // Extended entry
          if (desiredExtKey) {
            const t = String(((linkItem as YAML.YAMLMap).get('type', true) as any)?.value ?? ((linkItem as YAML.YAMLMap).get('type', true) as any) ?? '');
            const hi = String(((linkItem as YAML.YAMLMap).get('host-interface', true) as any)?.value ?? ((linkItem as YAML.YAMLMap).get('host-interface', true) as any) ?? '');
            const epNode = (linkItem as YAML.YAMLMap).get('endpoint', true);
            let epNodeName = '';
            let epIface = '';
            if (YAML.isMap(epNode)) {
              const epMap = epNode as YAML.YAMLMap;
              epNodeName = String((epMap.get('node', true) as any)?.value ?? epMap.get('node', true) ?? '');
              epIface = String((epMap.get('interface', true) as any)?.value ?? epMap.get('interface', true) ?? '');
            }
            const key = buildExtKeyFromVals(t, hi, epNodeName, epIface);
            if (key === desiredExtKey) {
              linkFound = true;
              break;
            }
          }
        } else {
          // Short-form entry
          const eps = linkItem.get('endpoints', true);
          if (YAML.isSeq(eps)) {
            const yamlEndpointsStr = eps.items
              .map(item => String((item as any).value ?? item))
              .join(',');
            if (yamlEndpointsStr === endpointsStr) {
              linkFound = true;
              break;
            }
          }
        }
      }

      if (linkFound) return;

      // Add either extended or flat, depending on mode and candidate
      if (extCandidate && special && contNode && contIf) {
        const m = new YAML.YAMLMap();
        m.flow = false;
        m.set('type', doc!.createNode(special.kind));
        m.set('host-interface', doc!.createNode(special.hostIf));
        const epMap = new YAML.YAMLMap();
        epMap.set('node', doc!.createNode(contNode));
        epMap.set('interface', doc!.createNode(contIf));
        m.set('endpoint', epMap);
        linksNode.add(m);
      } else {
        const newLink = new YAML.YAMLMap();
        newLink.flow = false;
        const endpoints = endpointsStr.split(',');
        const endpointsNode = doc.createNode(endpoints) as YAML.YAMLSeq;
        endpointsNode.flow = true;
        newLink.set('endpoints', endpointsNode);
        linksNode.add(newLink);
      }
    });

    const payloadEdgeEndpoints = new Set(
      payloadParsed
        .filter(el => el.group === 'edges' && el.data?.yamlProvenance !== 'extended')
        .map(el => computeEndpointsStr(el.data))
        .filter((s): s is string => Boolean(s))
    );
    // Track special cloud nodes present in the viewport (e.g., host:eth1, mgmt-net:mgmt1, macvlan:net1)
    const payloadSpecialCloudIds = new Set(
      payloadParsed
        .filter(el => el.group === 'nodes' && el.data.topoViewerRole === 'cloud' && typeof el.data?.id === 'string' && isSpecialEndpoint(el.data.id))
        .map(el => el.data.id as string)
    );
    linksNode.items = linksNode.items.filter(linkItem => {
      if (YAML.isMap(linkItem)) {
        // Preserve or remove extended link entries based on presence of corresponding cloud node
        if ((linkItem as YAML.YAMLMap).has('type')) {
          const typeVal = (linkItem as YAML.YAMLMap).get('type', true) as any;
          const typeStr = String(typeVal?.value ?? typeVal ?? '');
          if (typeStr === 'host' || typeStr === 'mgmt-net' || typeStr === 'macvlan') {
            const hiVal = (linkItem as YAML.YAMLMap).get('host-interface', true) as any;
            const hostIf = String(hiVal?.value ?? hiVal ?? '');
            const specialId = `${typeStr}:${hostIf}`;
            // Keep only if the corresponding special cloud node still exists in the viewport payload
            return payloadSpecialCloudIds.has(specialId);
          }
          // For other extended types (vxlan, dummy, etc.), keep as-is
          return true;
        }
        const endpointsNode = linkItem.get('endpoints', true);
        if (YAML.isSeq(endpointsNode)) {
          const endpointsStr = endpointsNode.items
            .map(item => String((item as any).value ?? item))
            .join(',');
          return payloadEdgeEndpoints.has(endpointsStr);
        }
      }
      return true;
    });

    for (const linkItem of linksNode.items) {
      if (!YAML.isMap(linkItem)) continue;
      const linkMap = linkItem as YAML.YAMLMap;
      // Always use block style for link entry
      linkMap.flow = false;

      // Extended links: update endpoint node names on rename, preserve structure
      if (linkMap.has('type')) {
        const typeNode = linkMap.get('type', true) as any;
        const typeStr = String(typeNode?.value ?? typeNode ?? '');

        if (typeStr === 'veth') {
          const eps = linkMap.get('endpoints', true);
          if (YAML.isSeq(eps)) {
            eps.items = eps.items.map(epItem => {
              if (YAML.isMap(epItem)) {
                const epMap = epItem as YAML.YAMLMap;
                const nodeScalar = epMap.get('node', true) as any;
                const nodeVal = String(nodeScalar?.value ?? nodeScalar ?? '');
                if (updatedKeys.has(nodeVal)) {
                  epMap.set('node', doc.createNode(updatedKeys.get(nodeVal)));
                }
                return epMap;
              }
              return epItem;
            });
          }
        } else {
          const ep = linkMap.get('endpoint', true);
          if (YAML.isMap(ep)) {
            const epMap = ep as YAML.YAMLMap;
            const nodeScalar = epMap.get('node', true) as any;
            const nodeVal = String(nodeScalar?.value ?? nodeScalar ?? '');
            if (updatedKeys.has(nodeVal)) {
              epMap.set('node', doc.createNode(updatedKeys.get(nodeVal)));
            }
          }
        }
        // done with extended link
        continue;
      }

      // Short-form links: update renamed node keys in endpoints strings
      const endpointsNode = linkMap.get('endpoints', true);
      if (YAML.isSeq(endpointsNode)) {
        endpointsNode.items = endpointsNode.items.map(item => {
          let endpointStr = String((item as any).value ?? item);
          if (endpointStr.includes(':')) {
            const [nodeKey, rest] = endpointStr.split(':');
            if (updatedKeys.has(nodeKey)) {
              endpointStr = `${updatedKeys.get(nodeKey)}:${rest}`;
            }
          } else if (updatedKeys.has(endpointStr)) {
            endpointStr = updatedKeys.get(endpointStr)!;
          }
          return doc.createNode(endpointStr);
        });
        // Ensure endpoints list renders inline with []
        (endpointsNode as YAML.YAMLSeq).flow = true;
      }
    }
  }

  const annotations = await annotationsManager.loadAnnotations(yamlFilePath);
  annotations.nodeAnnotations = [];
  annotations.cloudNodeAnnotations = [];

  const regularNodes = payloadParsed.filter(
    el => el.group === 'nodes' && el.data.topoViewerRole !== 'group' && el.data.topoViewerRole !== 'cloud' && el.data.topoViewerRole !== 'freeText' && !isSpecialEndpoint(el.data.id)
  );
  for (const node of regularNodes) {
    const nodeAnnotation: NodeAnnotation = {
      id: node.data.id,
      position: {
        x: Math.round(node.position?.x || 0),
        y: Math.round(node.position?.y || 0)
      },
      icon: node.data.topoViewerRole,
    };
    if (node.data.lat && node.data.lng) {
      const lat = parseFloat(node.data.lat);
      const lng = parseFloat(node.data.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        nodeAnnotation.geoCoordinates = { lat, lng };
      }
    }
    if (node.data.groupLabelPos) {
      nodeAnnotation.groupLabelPos = node.data.groupLabelPos;
    }
    // Add group and level if node has a parent
    if (node.parent) {
      const parts = node.parent.split(':');
      if (parts.length === 2) {
        nodeAnnotation.group = parts[0];
        nodeAnnotation.level = parts[1];
      }
    }
    annotations.nodeAnnotations!.push(nodeAnnotation);
  }

  const cloudNodes = payloadParsed.filter(el => el.group === 'nodes' && el.data.topoViewerRole === 'cloud');
  for (const cloudNode of cloudNodes) {
    const cloudNodeAnnotation: CloudNodeAnnotation = {
      id: cloudNode.data.id,
      type: cloudNode.data.extraData?.kind || 'host',
      label: cloudNode.data.name || cloudNode.data.id,
      position: {
        x: cloudNode.position?.x || 0,
        y: cloudNode.position?.y || 0
      }
    };
    if (cloudNode.parent) {
      const parts = cloudNode.parent.split(':');
      if (parts.length === 2) {
        cloudNodeAnnotation.group = parts[0];
        cloudNodeAnnotation.level = parts[1];
      }
    }
    annotations.cloudNodeAnnotations!.push(cloudNodeAnnotation);
  }

  await annotationsManager.saveAnnotations(yamlFilePath, annotations);

  const updatedYamlString = doc.toString();
  if (mode === 'edit' && setInternalUpdate) {
    setInternalUpdate(true);
    await fs.promises.writeFile(yamlFilePath, updatedYamlString, 'utf8');
    await sleep(50);
    setInternalUpdate(false);
    log.info('Saved topology with preserved comments!');
    log.info(doc);
    log.info(yamlFilePath);
  } else {
    await fs.promises.writeFile(yamlFilePath, updatedYamlString, 'utf8');
    log.info('Saved viewport positions and groups successfully');
    log.info(`Updated file: ${yamlFilePath}`);
  }
}
