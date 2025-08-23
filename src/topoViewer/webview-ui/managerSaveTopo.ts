// file: managerSaveTopo.ts

import cytoscape from 'cytoscape';
import loadCytoStyle from './managerCytoscapeBaseStyles';
import { VscodeMessageSender } from './managerVscodeWebview';
import { log } from '../logging/webviewLogger';
import topoViewerState from '../state';
import { generateEncodedSVG, NodeType } from './managerSvgGenerator';

/**
 * Recursively flatten an object into data-* attributes.
 * e.g. { fqdn: "srl_1.vlan.io", labels: { graph-posX: 393 } }
 *  → { "data-fqdn": "srl_1.vlan.io", "data-labels-graph-posX": "393" }
 */
function flattenExtraData(
  obj: Record<string, any>,
  prefix: string = ""
): Record<string, string> {
  const result: Record<string, string> = {};
  Object.entries(obj).forEach(([key, value]) => {
    const attrKey = prefix ? `${prefix}-${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenExtraData(value, attrKey));
    } else {
      result[`data-${attrKey}`] = String(value ?? "");
    }
  });
  return result;
}

/**
 * Injects data-cell-id and extraData attributes into node and edge <g> elements
 * using the Cytoscape JSON model, so they can later be wrapped
 * for Grafana Flow Panel compatibility.
 */
function injectCellIds(svgString: string, cy: cytoscape.Core): string {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(svgString, "image/svg+xml");

  // Grab top-level <g> groups from the exported SVG
  const gElements = Array.from(xmlDoc.querySelectorAll("svg > g"));

  // Cytoscape JSON gives us all nodes/edges in order
  const elements = cy.json().elements as any;

  elements.nodes?.forEach((node: any, idx: number) => {
    const gElem = gElements[idx];
    if (!gElem) return;

    gElem.setAttribute("data-cell-id", node.data.id);
    gElem.setAttribute("data-label", node.data.name || node.data.id);
    gElem.setAttribute("data-type", "node");

    // Inject flattened extraData
    if (node.data.extraData) {
      const attrs = flattenExtraData(node.data.extraData, "extra");
      Object.entries(attrs).forEach(([k, v]) => gElem.setAttribute(k, v));
    }
  });

  // Edge groups come after nodes in the export
  const edgeOffset = elements.nodes?.length || 0;
  elements.edges?.forEach((edge: any, idx: number) => {
    const gElem = gElements[edgeOffset + idx];
    if (!gElem) return;

    gElem.setAttribute("data-cell-id", edge.data.id);
    gElem.setAttribute("data-source", edge.data.source);
    gElem.setAttribute("data-target", edge.data.target);
    gElem.setAttribute("data-type", "edge");

    // Inject flattened extraData
    if (edge.data.extraData) {
      const attrs = flattenExtraData(edge.data.extraData, "extra");
      Object.entries(attrs).forEach(([k, v]) => gElem.setAttribute(k, v));
    }
  });

  const serializer = new XMLSerializer();
  return serializer.serializeToString(xmlDoc);
}

/**
 * Post-process SVG string to mimic draw.io's svgdata.js plugin.
 * Wraps <g data-cell-id="..."> children inside a new
 * <g id="cell-..."> group.
 */
function mimicSvgDataPlugin(svgString: string): string {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(svgString, "image/svg+xml");

  const gElements = Array.from(xmlDoc.querySelectorAll<SVGGElement>("g[data-cell-id]"));

  gElements.forEach((gElem) => {
    const cellId = gElem.getAttribute("data-cell-id");
    if (!cellId) return;

    // Prevent double-wrapping if already processed
    if (gElem.querySelector(`#cell-${cellId}`)) return;

    const newGroup = xmlDoc.createElementNS("http://www.w3.org/2000/svg", "g");
    newGroup.setAttribute("id", `cell-${cellId}`);

    // Move children into new group
    while (gElem.firstChild) {
      newGroup.appendChild(gElem.firstChild);
    }

    gElem.appendChild(newGroup);
  });

  const serializer = new XMLSerializer();
  return serializer.serializeToString(xmlDoc);
}

/**
 * Export the current Cytoscape viewport as a Smart SVG file.
 *
 * @param cy - Cytoscape core instance
 */
export function exportViewportAsSmartSvg(cy: cytoscape.Core): void {
  try {
    const cyWithSvg = cy as any;
    if (typeof cyWithSvg.svg === "function") {
      let svgContent = cyWithSvg.svg({ scale: 1, full: true });

      // Step 1: Inject Cytoscape IDs + extraData
      svgContent = injectCellIds(svgContent, cy);

      // Step 2: Wrap into Smart-SVG format
      svgContent = mimicSvgDataPlugin(svgContent);

      const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = "topology-smart.svg";
      link.click();

      URL.revokeObjectURL(url);
      log.info("Topology exported as Smart SVG with extraData");
    } else {
      log.error("SVG export not available - cytoscape-svg extension may not be loaded");
    }
  } catch (error) {
    log.error(`Error capturing topology: ${error}`);
  }
}

/**
 * Convert Cytoscape elements into a draw.io (mxGraph) XML and download it.
 * Nodes become vertex cells and edges become edge cells.
 */
export function exportViewportAsDrawio(cy: cytoscape.Core): void {
  try {
    const docId = `d-${Date.now().toString(36)}`;

    const xmlEscape = (s: string): string =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

    const cells: string[] = [];
    // Required root cells for draw.io/mxGraph
    cells.push('<mxCell id="0"/>');
    cells.push('<mxCell id="1" parent="0"/>');

    // Helpers to read computed numeric style
    const getStyleNumber = (el: any, prop: string): number | undefined => {
      try {
        const v = el.style(prop);
        if (v == null) return undefined;
        const n = parseFloat(String(v));
        return isNaN(n) ? undefined : n;
      } catch {
        return undefined;
      }
    };

    // Map topoViewerRole -> NodeType used by managerSvgGenerator
    const roleSvgMap: Record<string, NodeType> = {
      router: 'pe',
      default: 'pe',
      pe: 'pe',
      p: 'pe',
      controller: 'controller',
      pon: 'pon',
      dcgw: 'dcgw',
      leaf: 'leaf',
      switch: 'switch',
      rgw: 'rgw',
      'super-spine': 'super-spine',
      spine: 'spine',
      server: 'server',
      bridge: 'bridge',
      ue: 'ue',
      cloud: 'cloud',
      client: 'client'
    };

    // Collect eligible nodes (exclude groups, dummyChild, freeText)
    const exportableNodeSet = new Set<string>();
    cy.nodes().forEach((node) => {
      const role = node.data('topoViewerRole');
      if (role === 'group' || role === 'dummyChild' || role === 'freeText') {
        return;
      }
      const id = node.id();
      const label = (node.data('name') as string) || id;
      const w = Math.max(20, Math.round(node.width()));
      const h = Math.max(20, Math.round(node.height()));
      const pos = node.position();
      // mxGeometry uses top-left origin; Cytoscape position is center
      const x = Math.round(pos.x - w / 2);
      const y = Math.round(pos.y - h / 2);

      const value = xmlEscape(label);
      // Generate node SVG using the shared generator (ensures consistent icon)
      const svgType = roleSvgMap[String(role)] || roleSvgMap['default'];
      const fillColor = '#005aff';
      const imageUri = generateEncodedSVG(svgType as NodeType, fillColor);
      // The style string uses ';' as a delimiter; escape any ';' in data URI
      const imageStyleUri = imageUri.replace(/;/g, '%3B');
      // Node visual styles
      const borderWidth = getStyleNumber(node, 'border-width');
      const borderColor = (node as any).style?.('border-color') as string | undefined;
      const bgColor = (node as any).style?.('background-color') as string | undefined;
      const fontColor = (node as any).style?.('color') as string | undefined;
      const fontSizeNum = getStyleNumber(node, 'font-size');

      // draw.io image vertex
      const styleParts = [
        'shape=image',
        imageStyleUri ? `image=${xmlEscape(imageStyleUri)}` : '',
        'imageAspect=0',
        bgColor ? `imageBackground=${xmlEscape(bgColor)}` : '',
        borderWidth && borderWidth > 0 ? 'imageBorder=1' : '',
        borderColor ? `imageBorderColor=${xmlEscape(borderColor)}` : '',
        fontColor ? `fontColor=${xmlEscape(fontColor)}` : '',
        fontSizeNum ? `fontSize=${Math.round(fontSizeNum)}` : '',
        'verticalLabelPosition=bottom',
        'verticalAlign=top',
        'whiteSpace=wrap',
        'html=1'
      ].filter(Boolean);
      const style = styleParts.join(';') + ';';

      cells.push(
        `<mxCell id="${xmlEscape(id)}" value="${value}" style="${style}" vertex="1" parent="1">` +
          `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>` +
        `</mxCell>`
      );
      exportableNodeSet.add(id);
    });

    // Map edges to edge cells
    const mapArrow = (shape: string | undefined): { name: string; fill: number } => {
      switch ((shape || '').toLowerCase()) {
        case 'triangle':
          return { name: 'block', fill: 1 };
        case 'vee':
          return { name: 'classic', fill: 0 };
        case 'tee':
          return { name: 'open', fill: 0 };
        case 'square':
          return { name: 'box', fill: 1 };
        case 'circle':
          return { name: 'oval', fill: 1 };
        case 'diamond':
          return { name: 'diamond', fill: 1 };
        case 'none':
        default:
          return { name: 'none', fill: 0 };
      }
    };

    cy.edges().forEach((edge) => {
      const id = edge.id();
      const src = edge.data('source') as string;
      const tgt = edge.data('target') as string;
      if (!exportableNodeSet.has(src) || !exportableNodeSet.has(tgt)) {
        return;
      }
      const label = (edge.data('label') as string) || '';
      const value = xmlEscape(label);
      // Edge visual styles
      const stroke = (edge as any).style?.('line-color') as string | undefined;
      const width = getStyleNumber(edge, 'width');
      const lineStyle = (edge as any).style?.('line-style') as string | undefined;
      const curveStyle = (edge as any).style?.('curve-style') as string | undefined;
      const fontColorEdge = (edge as any).style?.('color') as string | undefined;
      const fontSizeEdge = getStyleNumber(edge, 'font-size');

      const tgtArrowShape = (edge as any).style?.('target-arrow-shape') as string | undefined;
      const srcArrowShape = (edge as any).style?.('source-arrow-shape') as string | undefined;
      const tgtArrow = mapArrow(tgtArrowShape);
      const srcArrow = mapArrow(srcArrowShape);

      const stylePartsEdge = [
        'rounded=0',
        'html=1',
        stroke ? `strokeColor=${xmlEscape(stroke)}` : '',
        width ? `strokeWidth=${Math.max(1, Math.round(width))}` : '',
        lineStyle && lineStyle !== 'solid' ? 'dashed=1' : '',
        lineStyle === 'dotted' ? 'dashPattern=1 4' : '',
        (curveStyle && (curveStyle.includes('bezier'))) ? 'curved=1' : '',
        tgtArrow.name !== 'none' ? `endArrow=${tgtArrow.name}` : 'endArrow=none',
        `endFill=${tgtArrow.fill}`,
        srcArrow.name !== 'none' ? `startArrow=${srcArrow.name}` : '',
        srcArrow.name !== 'none' ? `startFill=${srcArrow.fill}` : '',
        fontColorEdge ? `fontColor=${xmlEscape(fontColorEdge)}` : '',
        fontSizeEdge ? `fontSize=${Math.round(fontSizeEdge)}` : ''
      ].filter(Boolean);
      const style = stylePartsEdge.join(';') + ';';

      cells.push(
        `<mxCell id="${xmlEscape(id)}" value="${value}" style="${style}" edge="1" parent="1" source="${xmlEscape(src)}" target="${xmlEscape(tgt)}">` +
          `<mxGeometry relative="1" as="geometry"/>` +
        `</mxCell>`
      );
    });

    const mxGraphModel =
      '<mxGraphModel dx="1000" dy="1000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">' +
        '<root>' +
          cells.join('') +
        '</root>' +
      '</mxGraphModel>';

    const diagram = `<diagram id="${docId}" name="Topology">${mxGraphModel}</diagram>`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<mxfile host="vscode-containerlab" modified="${new Date().toISOString()}" agent="topoViewer" version="21.6.9" etag="${docId}">` +
        diagram +
      `</mxfile>`;

    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'topology.drawio';
    link.click();

    URL.revokeObjectURL(url);
    log.info('Topology exported as draw.io diagram with nodes and links');
  } catch (error) {
    log.error(`Error exporting to draw.io: ${error}`);
  }
}

/**
 * Handles saving topology data from the Cytoscape viewport.
 */
export class ManagerSaveTopo {
  private messageSender: VscodeMessageSender;

  constructor(messageSender: VscodeMessageSender) {
    this.messageSender = messageSender;
  }

  /**
   * Updates node positions and sends the topology data to the backend.
   */
  public async viewportButtonsSaveTopo(
    cy: cytoscape.Core,
    suppressNotification = false
  ): Promise<void> {
    const isVscodeDeployment = true;
    if (!isVscodeDeployment) return;

    try {
      log.debug('viewportButtonsSaveTopo triggered');

      const layoutMgr = topoViewerState.editorEngine?.layoutAlgoManager;
      const updatedNodes = cy.nodes().map((node: cytoscape.NodeSingular) => {
        const nodeJson: any = node.json();

        let posX = node.position().x;
        let posY = node.position().y;
        if (layoutMgr?.isGeoMapInitialized) {
          const origX = node.data('_origPosX');
          const origY = node.data('_origPosY');
          if (origX !== undefined && origY !== undefined) {
            posX = origX;
            posY = origY;
          }
        }
        nodeJson.position = { x: posX, y: posY };

        if (layoutMgr?.isGeoMapInitialized && layoutMgr.cytoscapeLeafletMap) {
          nodeJson.data = nodeJson.data || {};
          const lat = node.data('lat');
          const lng = node.data('lng');
          if (lat !== undefined && lng !== undefined) {
            nodeJson.data.lat = lat.toString();
            nodeJson.data.lng = lng.toString();
          } else {
            const latlng = layoutMgr.cytoscapeLeafletMap.containerPointToLatLng({
              x: node.position().x,
              y: node.position().y
            });
            nodeJson.data.lat = latlng.lat.toString();
            nodeJson.data.lng = latlng.lng.toString();
          }
        }

        const parentCollection = node.parent();
        const parentId: string = parentCollection.nonempty() ? parentCollection[0].id() : '';
        nodeJson.parent = parentId;
        if (nodeJson.data?.extraData?.labels && parentId) {
          const parts = parentId.split(':');
          nodeJson.data.extraData.labels['graph-group'] = parts[0] || '';
          nodeJson.data.extraData.labels['graph-level'] = parts[1] || '';

          const validLabelClasses = [
            'top-center',
            'top-left',
            'top-right',
            'bottom-center',
            'bottom-left',
            'bottom-right'
          ];
          const parentElement = cy.getElementById(parentId);
          const classArray: string[] = parentElement.classes();
          const validParentClasses = classArray.filter((cls: string) =>
            validLabelClasses.includes(cls)
          );
          nodeJson.data.groupLabelPos =
            validParentClasses.length > 0 ? validParentClasses[0] : '';
        }
        return nodeJson;
      });

      const updatedEdges = cy.edges().reduce((acc: any[], edge: cytoscape.EdgeSingular) => {
        const edgeJson: any = edge.json();

        if (edgeJson.data) {
          const sourceId = edgeJson.data.source;
          const targetId = edgeJson.data.target;
          const sourceEp = edgeJson.data.sourceEndpoint;
          const targetEp = edgeJson.data.targetEndpoint;

          // Check if source or target are special nodes (host, mgmt-net, macvlan)
          const isSourceSpecial = sourceId.startsWith('host:') || sourceId.startsWith('mgmt-net:') || sourceId.startsWith('macvlan:');
          const isTargetSpecial = targetId.startsWith('host:') || targetId.startsWith('mgmt-net:') || targetId.startsWith('macvlan:');

          if (
            (isSourceSpecial || (typeof sourceEp === 'string' && sourceEp)) &&
            (isTargetSpecial || (typeof targetEp === 'string' && targetEp))
          ) {
            // For special nodes, the ID already contains the full endpoint
            const sourceEndpoint = isSourceSpecial ? sourceId : `${sourceId}:${sourceEp}`;
            const targetEndpoint = isTargetSpecial ? targetId : `${targetId}:${targetEp}`;

            edgeJson.data.endpoints = [sourceEndpoint, targetEndpoint];
            acc.push(edgeJson);
          } else if (
            Array.isArray(edgeJson.data.endpoints) &&
            edgeJson.data.endpoints.length === 2 &&
            edgeJson.data.endpoints.every((ep: any) => typeof ep === 'string' && ep.includes(':'))
          ) {
            acc.push(edgeJson);
          }
        }

        return acc;
      }, [] as any[]);

      if (!suppressNotification) {
        loadCytoStyle(cy);

        // Reapply group styles after loadCytoStyle to maintain visual consistency
        if (topoViewerState.editorEngine?.groupStyleManager) {
          const groupStyles = topoViewerState.editorEngine.groupStyleManager.getGroupStyles();
          groupStyles.forEach((style: any) => {
            topoViewerState.editorEngine.groupStyleManager.applyStyleToNode(style.id);
          });
        }
      } else {
        const lm = topoViewerState.editorEngine?.layoutAlgoManager;
        if (lm?.isGeoMapInitialized) {
          const factor = lm.calculateGeoScale();
          lm.applyGeoScale(true, factor);
        }
      }

      const updatedElements = [...updatedNodes, ...updatedEdges];
      log.debug(`Updated Topology Data: ${JSON.stringify(updatedElements, null, 2)}`);

      // Determine the correct endpoint based on the mode
      const mode = (window as any).topoViewerMode;
      let endpoint: string;

      if (mode === 'view') {
        // View mode uses a single endpoint and doesn't support suppress notification
        endpoint = 'topo-viewport-save';
      } else {
        // Edit mode uses different endpoints based on suppressNotification
        endpoint = suppressNotification
          ? 'topo-editor-viewport-save-suppress-notification'
          : 'topo-editor-viewport-save';
      }

      const response = await this.messageSender.sendMessageToVscodeEndpointPost(
        endpoint,
        updatedElements
      );
      log.debug(`Response from backend: ${JSON.stringify(response)}`);

      // Note: Free text annotations save themselves when they change,
      // so we don't need to save them here

      // Note: The backend handles showing the notification message in view mode
    } catch (err) {
      log.error(`Backend call failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
