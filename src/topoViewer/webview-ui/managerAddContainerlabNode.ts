// file: managerAddContainerlabNode.ts

import cytoscape from 'cytoscape';
import type { NodeData } from '../types/topoViewerGraph';
import topoViewerState from '../state';

/**
 * Adds new Containerlab nodes into the Cytoscape canvas.
 */
export class ManagerAddContainerlabNode {
  private static nodeCounter: number = 0;

  public viewportButtonsAddContainerlabNode(
    cy: cytoscape.Core,
    event: cytoscape.EventObject
  ): void {
    if (ManagerAddContainerlabNode.nodeCounter === 0) {
      const existingNodeIds = cy.nodes().map(node => node.id());
      const maxId = existingNodeIds
        .filter(id => id.startsWith('nodeId-'))
        .map(id => parseInt(id.replace('nodeId-', ''), 10))
        .filter(num => !isNaN(num))
        .reduce((max, current) => Math.max(max, current), 0);
      ManagerAddContainerlabNode.nodeCounter = maxId;
    }


    ManagerAddContainerlabNode.nodeCounter++;
    const newNodeId = `nodeId-${ManagerAddContainerlabNode.nodeCounter}`;


    const defaultKind = window.defaultKind || 'nokia_srlinux';
    const nokiaKinds = ['nokia_srlinux', 'nokia_srsim', 'nokia_sros'];
    const shouldIncludeType = nokiaKinds.includes(defaultKind);

    const newNodeData: NodeData = {
      id: newNodeId,
      editor: 'true',
      weight: '30',
      name: newNodeId,
      parent: '',
      topoViewerRole: 'pe',
      sourceEndpoint: '',
      targetEndpoint: '',
      containerDockerExtraAttribute: { state: '', status: '' },
      extraData: {
        kind: defaultKind,
        longname: '',
        image: '',
        ...(shouldIncludeType && { type: window.defaultType || 'ixrd1' }),
        mgmtIpv4Address: ''
      }
    };

    const imageMap = window.imageMapping || {};
    const kind = newNodeData.extraData?.kind || 'nokia_srlinux';
    newNodeData.extraData!.image = imageMap[kind] || '';

    const extent = cy.extent();
    let position = event.position;

    if (
      !position ||
      position.x < extent.x1 ||
      position.x > extent.x2 ||
      position.y < extent.y1 ||
      position.y > extent.y2
    ) {
      const viewportCenterX = (extent.x1 + extent.x2) / 2;
      const viewportCenterY = (extent.y1 + extent.y2) / 2;
      const viewportWidth = extent.x2 - extent.x1;
      const viewportHeight = extent.y2 - extent.y1;

      const maxOffsetX = viewportWidth * 0.3;
      const maxOffsetY = viewportHeight * 0.3;

      position = {
        x: viewportCenterX + (Math.random() - 0.5) * maxOffsetX,
        y: viewportCenterY + (Math.random() - 0.5) * maxOffsetY
      };
    }

    cy.add({ group: 'nodes', data: newNodeData, position });

    const layoutMgr = topoViewerState.editorEngine?.layoutAlgoManager;
    if (layoutMgr?.isGeoMapInitialized && layoutMgr.cytoscapeLeafletMap) {
      const latlng = layoutMgr.cytoscapeLeafletMap.containerPointToLatLng({
        x: position.x,
        y: position.y
      });
      const node = cy.getElementById(newNodeId);
      node.data('lat', latlng.lat.toString());
      node.data('lng', latlng.lng.toString());
    }
  }

  public viewportButtonsAddNetworkNode(
    cy: cytoscape.Core,
    event: cytoscape.EventObject
  ): void {
    // Default to host; type can be changed from the Network Properties panel
    let networkType = 'host';

    // Determine next available host interface number (eth1, eth2, ...)
    const existingNodeIds = cy.nodes().map(node => node.id());
    const nextOrdinal = (prefixRegex: RegExp, base: number = 1) => {
      const nums = existingNodeIds
        .map(id => {
          const m = id.match(prefixRegex);
          return m ? parseInt(m[1], 10) : null;
        })
        .filter((n): n is number => n !== null);
      return nums.length > 0 ? Math.max(...nums) + 1 : base;
    };

    let newNodeId = '';
    let interfaceName = '';
    if (networkType === 'host') {
      const n = nextOrdinal(/^host:eth(\d+)$/);
      interfaceName = `eth${n}`;
      newNodeId = `host:${interfaceName}`;
    } else {
      // Fallback to host pattern
      const n = nextOrdinal(/^host:eth(\d+)$/);
      interfaceName = `eth${n}`;
      newNodeId = `host:${interfaceName}`;
      networkType = 'host';
    }

    const newNodeData: NodeData = {
      id: newNodeId,
      editor: 'true',
      weight: '30',
      name: newNodeId,
      parent: '',
      topoViewerRole: 'cloud',
      sourceEndpoint: '',
      targetEndpoint: '',
      containerDockerExtraAttribute: { state: '', status: '' },
      extraData: {
        kind: networkType,
        longname: '',
        image: '',
        networkInterface: interfaceName // add this for future need
      }
    };

    const extent = cy.extent();
    let position = event.position;

    if (
      !position ||
      position.x < extent.x1 ||
      position.x > extent.x2 ||
      position.y < extent.y1 ||
      position.y > extent.y2
    ) {
      const viewportCenterX = (extent.x1 + extent.x2) / 2;
      const viewportCenterY = (extent.y1 + extent.y2) / 2;
      const viewportWidth = extent.x2 - extent.x1;
      const viewportHeight = extent.y2 - extent.y1;

      const maxOffsetX = viewportWidth * 0.3;
      const maxOffsetY = viewportHeight * 0.3;

      position = {
        x: viewportCenterX + (Math.random() - 0.5) * maxOffsetX,
        y: viewportCenterY + (Math.random() - 0.5) * maxOffsetY
      };
    }

    cy.add({ group: 'nodes', data: newNodeData, position });

    const layoutMgr = topoViewerState.editorEngine?.layoutAlgoManager;
    if (layoutMgr?.isGeoMapInitialized && layoutMgr.cytoscapeLeafletMap) {
      const latlng = layoutMgr.cytoscapeLeafletMap.containerPointToLatLng({
        x: position.x,
        y: position.y
      });
      const node = cy.getElementById(newNodeId);
      node.data('lat', latlng.lat.toString());
      node.data('lng', latlng.lng.toString());
    }
  }
}
