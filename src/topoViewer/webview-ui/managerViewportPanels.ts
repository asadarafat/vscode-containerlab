// file: managerViewportPanels.ts

import cytoscape from 'cytoscape';
import { ManagerSaveTopo } from './managerSaveTopo';
import { VscodeMessageSender } from './managerVscodeWebview';
import { extractNodeIcons } from './managerCytoscapeBaseStyles';
import { log } from '../logging/logger';
import { isSpecialNodeOrBridge } from '../utilities/specialNodes';


/**
 * ManagerViewportPanels handles the UI panels associated with the Cytoscape viewport.
 * It manages the node editor panel and toggles panels based on user interactions.
 */
export class ManagerViewportPanels {
  private saveManager: ManagerSaveTopo;
  private cy: cytoscape.Core;
  private messageSender: VscodeMessageSender | undefined;
  private isPanel01Cy = false;
  public nodeClicked: boolean = false;
  public edgeClicked: boolean = false;
  // Variables to store the current selection for dropdowns.
  private panelNodeEditorKind: string = "nokia_srlinux";
  private panelNodeEditorType: string = "";
  private panelNodeEditorUseDropdownForType: boolean = false;
  private panelNodeEditorTopoViewerRole: string = "pe";
  private nodeSchemaData: any = null;
  private panelNodeEditorNode: cytoscape.NodeSingular | null = null;
  /**
   * Creates an instance of ManagerViewportPanels.
   * @param saveManager - The ManagerSaveTopo instance.
   * @param cy - The Cytoscape instance.
   */
    constructor(
      saveManager: ManagerSaveTopo,
      cy: cytoscape.Core,
      messageSender?: VscodeMessageSender
    ) {
      this.saveManager = saveManager;
      this.cy = cy;
      this.messageSender = messageSender;
      this.toggleHidePanels("cy"); // Initialize the toggle for hiding panels.
    }

  /**
   * Toggle to hide UI panels.
   * If no node or edge was clicked, it hides overlay panels and viewport drawers.
   *
   * @param containerId - The ID of the Cytoscape container (e.g., "cy").
   */
  public toggleHidePanels(containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) {
      log.warn(`Cytoscape container not found: ${containerId}`);
      return;
    }

    container.addEventListener('click', async () => {
      log.debug('cy container clicked');

      // Execute toggle logic only when no node or edge was clicked.
      if (!this.nodeClicked && !this.edgeClicked) {
        if (!this.isPanel01Cy) {
          // Remove all overlay panels.
          const panelOverlays = document.getElementsByClassName('panel-overlay');
          for (let i = 0; i < panelOverlays.length; i++) {
            (panelOverlays[i] as HTMLElement).style.display = 'none';
          }

          // Hide viewport drawers.
          const viewportDrawers = document.getElementsByClassName('viewport-drawer');
          for (let i = 0; i < viewportDrawers.length; i++) {
            (viewportDrawers[i] as HTMLElement).style.display = 'none';
          }

          // Hide any elements with the class "ViewPortDrawer".
          const viewPortDrawerElements = document.getElementsByClassName('ViewPortDrawer');
          Array.from(viewPortDrawerElements).forEach((element) => {
            (element as HTMLElement).style.display = 'none';
          });
        } else {
          this.removeElementById('Panel-01');
          this.appendMessage('try to remove panel01-Cy');
        }
      }
      // Reset the click flags.
      this.nodeClicked = false;
      this.edgeClicked = false;
    });
  }

  /**
   * Displays the node editor panel for the provided node.
   * Removes any overlay panels, updates editor fields with the node's data,
   * and fetches additional configuration from a JSON schema.
   *
   * @param node - The Cytoscape node for which to show the editor.
   * @returns A promise that resolves when the panel is configured.
   */
  public async panelNodeEditor(node: cytoscape.NodeSingular): Promise<void> {
    // mark that a node interaction occurred so global click handler doesn't immediately hide the panel
    this.nodeClicked = true;
    this.panelNodeEditorNode = node;
    // Remove all overlay panels.
    const panelOverlays = document.getElementsByClassName("panel-overlay");
    Array.from(panelOverlays).forEach((panel) => {
      (panel as HTMLElement).style.display = "none";
    });

    log.debug(`panelNodeEditor - node ID: ${node.data('id')}`);

    // Set the node ID in the editor.
    const panelNodeEditorIdLabel = document.getElementById("panel-node-editor-id");
    if (panelNodeEditorIdLabel) {
      panelNodeEditorIdLabel.textContent = node.data("id");
    }

    // Set the node name in the editor.
    const panelNodeEditorNameInput = document.getElementById("panel-node-editor-name") as HTMLInputElement;
    if (panelNodeEditorNameInput) {
      panelNodeEditorNameInput.value = node.data("name");
    }

    // Grab extraData from the node for populating fields.
    const extraData = node.data('extraData') || {};

    // Set the node image in the editor based on YAML data or fallback.
    const panelNodeEditorImageLabel = document.getElementById('panel-node-editor-image') as HTMLInputElement;
    if (panelNodeEditorImageLabel) {
      panelNodeEditorImageLabel.value = extraData.image ?? '';
    }

    // Set the node type in the editor.
    this.panelNodeEditorKind = extraData.kind || this.panelNodeEditorKind;
    this.panelNodeEditorType = extraData.type || '';
    this.panelNodeEditorUseDropdownForType = false;

    // Set the node group in the editor.
    const panelNodeEditorGroupLabel = document.getElementById("panel-node-editor-group") as HTMLInputElement;
    if (panelNodeEditorGroupLabel) {
      const parentNode = node.parent();
      const parentLabel = parentNode.nonempty() ? (parentNode.data('name') as string) : '';
      log.debug(`Parent Node Label: ${parentLabel}`);
      panelNodeEditorGroupLabel.value = parentLabel;
    }

    // Display the node editor panel.
    const panelNodeEditor = document.getElementById("panel-node-editor");
    if (panelNodeEditor) {
      panelNodeEditor.style.display = "block";
    }

    // Fetch JSON schema.
    const url = window.schemaUrl;
    if (!url) throw new Error('Schema URL is undefined.');
    try {
        const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const jsonData = await response.json();

      this.nodeSchemaData = jsonData;

      // Get kind enums from the JSON schema.
      const { kindOptions } = this.panelNodeEditorGetKindEnums(jsonData);
      log.debug(`Kind Enum: ${JSON.stringify(kindOptions)}`);
      // Populate the kind dropdown.
      this.panelNodeEditorPopulateKindDropdown(kindOptions);

      const typeOptions = this.panelNodeEditorGetTypeEnumsByKindPattern(jsonData, `(${this.panelNodeEditorKind})`);
      this.panelNodeEditorSetupTypeField(typeOptions);

      // Then call the function:
      const nodeIcons = extractNodeIcons();
      log.debug(`Extracted node icons: ${JSON.stringify(nodeIcons)}`);

      this.panelNodeEditorPopulateTopoViewerRoleDropdown(nodeIcons);



      // Register the close button event.
      const panelNodeEditorCloseButton = document.getElementById("panel-node-editor-close-button");
      if (panelNodeEditorCloseButton && panelNodeEditor) {
        panelNodeEditorCloseButton.addEventListener("click", () => {
          panelNodeEditor.style.display = "none";
        });
      }

      // Register the save button event.
      const panelNodeEditorSaveButton = document.getElementById("panel-node-editor-save-button");
      if (panelNodeEditorSaveButton) {
        // Clone to remove any existing event listeners
        const newSaveButton = panelNodeEditorSaveButton.cloneNode(true) as HTMLElement;
        panelNodeEditorSaveButton.parentNode?.replaceChild(newSaveButton, panelNodeEditorSaveButton);
        newSaveButton.addEventListener("click", async () => {
          await this.updateNodeFromEditor(node);
          const suppressNotification = false;
          await this.saveManager.viewportButtonsSaveTopo(this.cy, suppressNotification);
        });
      }

      // Add global click handler to close dropdowns when clicking outside
      this.setupDropdownCloseHandler();
    } catch (error: any) {
      log.error(`Error fetching or processing JSON data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Updates the network editor fields based on the selected network type.
   * @param networkType - The selected network type.
   */
  // Removed static field toggling in favor of schema-driven rendering

  /**
   * Displays the network editor panel for a cloud network node.
   * @param node - The Cytoscape node representing the network.
   */
  public async panelNetworkEditor(node: cytoscape.NodeSingular): Promise<void> {
    this.nodeClicked = true;

    const panelOverlays = document.getElementsByClassName('panel-overlay');
    Array.from(panelOverlays).forEach(panel => {
      (panel as HTMLElement).style.display = 'none';
    });

    // Parse the node ID to extract network type and interface
    const nodeId = node.data('id') as string;
    const nodeData = node.data();
    const parts = nodeId.split(':');
    const networkType = nodeData.extraData?.kind || parts[0] || 'host';

    // Set fields
    const idLabel = document.getElementById('panel-network-editor-id');
    if (idLabel) {
      idLabel.textContent = nodeId;
    }

    // Initialize network type filterable dropdown
    const networkTypeOptions = ['host', 'mgmt-net', 'macvlan', 'bridge', 'ovs-bridge', 'vxlan', 'vxlan-stitch', 'dummy'];
    this.createFilterableDropdown(
      'panel-network-type-dropdown-container',
      networkTypeOptions,
      networkType,
      (selectedValue: string) => {
        log.debug(`Network type ${selectedValue} selected`);
        // Render dynamic fields based on the schema for the selected type
        this.renderDynamicNetworkFields(node, selectedValue);
      },
      'Search for network type...'
    );

    // Ensure the fields for the initially selected type are visible
    await this.renderDynamicNetworkFields(node, networkType);

    // Update field based on network type
    if (networkType === 'bridge' || networkType === 'ovs-bridge') {
      // For bridges, ID equals bridge name; dynamic form will not be used.
    } else {
      // dynamic form handles extended types
    }

    const panel = document.getElementById('panel-network-editor');
    if (panel) {
      panel.style.display = 'block';
    }

    const closeBtn = document.getElementById('panel-network-editor-close-button');
    if (closeBtn && panel) {
      closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
      });
    }

    // Extended types (vxlan, vxlan-stitch, dummy) are read-only in this phase; show details
    const detailsRow = document.getElementById('panel-network-editor-details-row') as HTMLElement | null;
    const roNote = document.getElementById('panel-network-editor-ro-note') as HTMLElement | null;
    const saveBtn = document.getElementById('panel-network-editor-save-button') as HTMLButtonElement | null;
    const typeFilterInput = document.getElementById('panel-network-type-dropdown-container-filter-input') as HTMLInputElement | null;
    const isExtended = networkType !== 'bridge' && networkType !== 'ovs-bridge';
    if (detailsRow) detailsRow.style.display = 'none';
    if (roNote) roNote.style.display = 'none';
    if (saveBtn) saveBtn.disabled = false;
    if (typeFilterInput) typeFilterInput.disabled = false;

    if (saveBtn) {
      const newSaveBtn = saveBtn.cloneNode(true) as HTMLElement;
      saveBtn.parentNode?.replaceChild(newSaveBtn, saveBtn);
      newSaveBtn.addEventListener('click', async () => {
        // Generic validation: ensure Name is provided and colon-free; update node ID accordingly
        const typeFilterInputNow = document.getElementById('panel-network-type-dropdown-container-filter-input') as HTMLInputElement | null;
        const selectedType = typeFilterInputNow?.value || networkType;
        const nameInputGeneric = document.getElementById('panel-network-name') as HTMLInputElement | null;
        const nameValGeneric = (nameInputGeneric?.value || '').trim();
        if (!nameValGeneric) {
          const note = document.getElementById('panel-network-editor-ro-note') as HTMLElement | null;
          if (note) { note.textContent = 'Name is required'; note.style.display = 'block'; }
          return;
        }
        if (nameValGeneric.includes(':')) {
          const note = document.getElementById('panel-network-editor-ro-note') as HTMLElement | null;
          if (note) { note.textContent = 'Name must not contain a colon'; note.style.display = 'block'; }
          return;
        }

        await this.updateNetworkFromEditor(node);

        if (isExtended) {
          // Build payload to update extended link using dynamic form
          const connectedEdge = node.connectedEdges().first();
          if (!connectedEdge || connectedEdge.length === 0) return;
          const sourceId = connectedEdge.data('source') as string;
          const targetId = connectedEdge.data('target') as string;
          const cloudId = node.data('id') as string;
          const isSourceCloud = sourceId === cloudId;
          const containerNode = isSourceCloud ? targetId : sourceId;
          const containerIface = isSourceCloud ? (connectedEdge.data('targetEndpoint') as string) : (connectedEdge.data('sourceEndpoint') as string);

          // Basic schema-aligned validation
          const showError = (msg: string) => {
            const note = document.getElementById('panel-network-editor-ro-note') as HTMLElement | null;
            if (note) {
              note.textContent = msg;
              note.style.display = 'block';
            }
          };
          const clearError = () => {
            const note = document.getElementById('panel-network-editor-ro-note') as HTMLElement | null;
            if (note) {
              note.textContent = '';
              note.style.display = 'none';
            }
          };

          clearError();

          // Collect values from dynamic form
          const getVal = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '';

          const payload: any = { type: selectedType };
          // endpoint
          const epNode = getVal('panel-network-field-endpoint-node').toString().trim() || containerNode;
          const epIface = getVal('panel-network-field-endpoint-interface').toString().trim() || containerIface;
          const epMac = getVal('panel-network-field-endpoint-mac').toString().trim();
          payload.endpoint = { node: epNode, interface: epIface };
          if (epMac) payload.endpoint.mac = epMac;

          // host-interface
          const hostIf = getVal('panel-network-field-host-interface').toString().trim();
          if (hostIf) payload['host-interface'] = hostIf;

          // mode
          const mode = getVal('panel-network-field-mode').toString().trim();
          if (mode) payload.mode = mode;

          // vxlan specifics
          const remote = getVal('panel-network-field-remote').toString().trim();
          const vniRaw = getVal('panel-network-field-vni').toString().trim();
          const udpRaw = getVal('panel-network-field-udp-port').toString().trim();
          if (remote) payload.remote = remote;
          if (vniRaw) payload.vni = parseInt(vniRaw, 10);
          if (udpRaw) payload['udp-port'] = parseInt(udpRaw, 10);

          // mtu
          const mtuRaw = getVal('panel-network-field-mtu').toString().trim();
          if (mtuRaw) payload.mtu = parseInt(mtuRaw, 10);

          // labels/vars as JSON
          const labelsRaw = getVal('panel-network-field-labels').toString().trim();
          const varsRaw = getVal('panel-network-field-vars').toString().trim();
          try {
            if (labelsRaw) payload.labels = JSON.parse(labelsRaw);
          } catch {
            showError('Labels must be valid JSON');
            return;
          }
          try {
            if (varsRaw) payload.vars = JSON.parse(varsRaw);
          } catch {
            showError('Vars must be valid JSON');
            return;
          }

          // Minimal validations per type
          if (selectedType === 'vxlan' || selectedType === 'vxlan-stitch') {
            if (!payload.remote) { showError('Remote is required'); return; }
            if (!(Number.isInteger(payload.vni) && payload.vni >= 1 && payload.vni <= 16777215)) { showError('VNI must be 1..16777215'); return; }
            if (!(Number.isInteger(payload['udp-port']) && payload['udp-port'] >= 1 && payload['udp-port'] <= 65535)) { showError('UDP Port must be 1..65535'); return; }
          }
          if (selectedType === 'macvlan') {
            if (!payload['host-interface']) { showError('Host Interface is required'); return; }
          }
          if (selectedType === 'host' || selectedType === 'mgmt-net') {
            if (!payload['host-interface']) { showError('Host Interface is required'); return; }
          }

          if (this.messageSender) {
            await this.messageSender.sendMessageToVscodeEndpointPost('topo-editor-update-extended-link', payload);
            // Reload to update cloud node labels if needed
            await this.messageSender.sendMessageToVscodeEndpointPost('topo-editor-reload-viewport', '{}');
            clearError();
          } else {
            log.warn('messageSender not available; cannot post extended-link update');
          }
        } else {
          const suppressNotification = false;
          await this.saveManager.viewportButtonsSaveTopo(this.cy, suppressNotification);
        }
      });
    }
  }

  // Map selected type to schema definition id
  private mapTypeToDefKey(t: string): string | undefined {
    switch (t) {
      case 'veth': return 'link-type-veth';
      case 'mgmt-net': return 'link-type-mgmt-net';
      case 'macvlan': return 'link-type-macvlan';
      case 'host': return 'link-type-host';
      case 'vxlan': return 'link-type-vxlan';
      case 'vxlan-stitch': return 'link-type-vxlan-stitched';
      case 'dummy': return 'link-type-dummy';
      default: return undefined;
    }
  }

  private async ensureSchemaLoaded(): Promise<void> {
    if (this.nodeSchemaData) return;
    const url = (window as any).schemaUrl;
    if (!url) return;
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      this.nodeSchemaData = await response.json();
    } catch (e) {
      log.warn(`Failed to load schema for dynamic form: ${e}`);
    }
  }

  private getRef(defPath: string): any {
    if (!this.nodeSchemaData) return undefined;
    const m = defPath.match(/^#\/definitions\/(.+)$/);
    if (!m) return undefined;
    const key = m[1];
    return this.nodeSchemaData.definitions?.[key];
  }

  private getEnumForProperty(prop: any): string[] | undefined {
    if (!prop) return undefined;
    if (Array.isArray(prop.enum)) return prop.enum;
    if (prop.$ref) {
      const ref = this.getRef(prop.$ref);
      if (ref && Array.isArray(ref.enum)) return ref.enum;
    }
    return undefined;
  }

  private getRangeForProperty(prop: any): { min?: number; max?: number } {
    let min: number | undefined;
    let max: number | undefined;
    const resolve = (p: any) => {
      if (typeof p?.minimum === 'number') min = p.minimum;
      if (typeof p?.maximum === 'number') max = p.maximum;
    };
    resolve(prop);
    if (prop?.$ref) resolve(this.getRef(prop.$ref));
    return { min, max };
  }

  // Suggest a default Name value based on type and existing nodes
  private suggestNameForType(networkType: string): string {
    const ids = this.cy.nodes().map(n => n.id());
    const nextOrdinal = (regex: RegExp, start = 1): number => {
      const nums = ids
        .map(id => {
          const m = id.match(regex);
          return m ? parseInt(m[1], 10) : null;
        })
        .filter((n): n is number => n !== null);
      return nums.length > 0 ? Math.max(...nums) + 1 : start;
    };
    const ensureUnique = (candidate: string, isBridgeKind: boolean): string => {
      let unique = candidate;
      let counter = 1;
      while (ids.includes(isBridgeKind ? unique : `${networkType}:${unique}`)) {
        unique = `${candidate}-${counter++}`;
      }
      return unique;
    };

    switch (networkType) {
      case 'bridge': {
        const n = nextOrdinal(/^br(\d+)$/, 0);
        return ensureUnique(`br${n}`, true);
      }
      case 'ovs-bridge': {
        const n = nextOrdinal(/^ovs(\d+)$/, 0);
        return ensureUnique(`ovs${n}`, true);
      }
      case 'host': {
        const n = nextOrdinal(/^host:eth(\d+)$/);
        return ensureUnique(`eth${n}`, false);
      }
      case 'mgmt-net': {
        const n = nextOrdinal(/^mgmt-net:mgmt(\d+)$/);
        return ensureUnique(`mgmt${n}`, false);
      }
      case 'macvlan': {
        const n = nextOrdinal(/^macvlan:net(\d+)$/);
        return ensureUnique(`net${n}`, false);
      }
      case 'vxlan':
      case 'vxlan-stitch':
      case 'dummy': {
        let base = 'pending';
        let candidate = base;
        let counter = 1;
        while (ids.includes(`${networkType}:${candidate}`)) {
          candidate = `${base}-${counter++}`;
        }
        return candidate;
      }
      default:
        return 'eth1';
    }
  }

  private async renderDynamicNetworkFields(node: cytoscape.NodeSingular, networkType: string): Promise<void> {
    await this.ensureSchemaLoaded();
    const container = document.getElementById('panel-network-dynamic-fields');
    if (!container) return;
    container.innerHTML = '';

    // Generic Name field used to compute ID for all types
    const currentId = node.data('id') as string;
    let suggestedName = '';
    if (networkType === 'bridge' || networkType === 'ovs-bridge') {
      suggestedName = currentId.includes(':') ? this.suggestNameForType(networkType) : currentId;
    } else {
      if (currentId.includes(':')) {
        const [prefix, ...rest] = currentId.split(':');
        suggestedName = (prefix === networkType) ? rest.join(':') : this.suggestNameForType(networkType);
      } else {
        suggestedName = this.suggestNameForType(networkType);
      }
    }
    const nameRow = document.createElement('div');
    nameRow.className = 'my-1';
    nameRow.innerHTML = `
      <div class="p-0.5">
        <div class="flex items-center">
          <div class="w-2/5 pr-1">
            <label class="label text-right text-base font-semibold">Name</label>
          </div>
          <div class="w-3/5 pl-2 pr-2">
            <input type="text" id="panel-network-name" class="input-field w-full" placeholder="Enter ${networkType} name" value="${suggestedName}" />
          </div>
        </div>
      </div>`;
    container.appendChild(nameRow);

    // For bridges, no extra dynamic fields
    if (networkType === 'bridge' || networkType === 'ovs-bridge') {
      return;
    }

    const defKey = this.mapTypeToDefKey(networkType);
    const def = defKey && this.nodeSchemaData?.definitions?.[defKey];
    if (!def || !def.properties) return;

    // Pull existing YAML info to pre-fill
    const connectedEdge = node.connectedEdges().first();
    const info = (connectedEdge && connectedEdge.length > 0) ? (connectedEdge.data('yamlLinkInfo') as Record<string, any> | undefined) : undefined;
    const sourceId = connectedEdge?.data('source') as string | undefined;
    const targetId = connectedEdge?.data('target') as string | undefined;
    const cloudId = node.data('id') as string;
    const isSourceCloud = sourceId === cloudId;
    const containerNode = isSourceCloud ? (targetId || '') : (sourceId || '');
    const containerIface = isSourceCloud ? String(connectedEdge?.data('targetEndpoint') || '') : String(connectedEdge?.data('sourceEndpoint') || '');

    const required: string[] = Array.isArray(def.required) ? def.required : [];

    const addRow = (label: string, innerHtml: string) => {
      const row = document.createElement('div');
      row.className = 'my-1';
      row.innerHTML = `
        <div class="p-0.5">
          <div class="flex items-center">
            <div class="w-2/5 pr-1">
              <label class="label text-right text-base font-semibold">${label}</label>
            </div>
            <div class="w-3/5 pl-2 pr-2">${innerHtml}</div>
          </div>
        </div>`;
      container.appendChild(row);
    };

    for (const [propName, propSpecAny] of Object.entries(def.properties as Record<string, any>)) {
      const propSpec: any = propSpecAny;
      if (propName === 'type') continue; // fixed const
      if (propName === 'endpoints') continue; // not supported in this panel
      if (propName === 'endpoint') {
        // Endpoint group
        const ep = (info && typeof info.endpoint === 'object') ? (info.endpoint as any) : {};
        const nodeVal = ep.node || containerNode;
        const ifaceVal = ep.interface || containerIface;
        const macVal = ep.mac || '';
        addRow('Endpoint Node', `<input type="text" id="panel-network-field-endpoint-node" class="input-field w-full" value="${nodeVal}" disabled />`);
        addRow('Endpoint Interface', `<input type="text" id="panel-network-field-endpoint-interface" class="input-field w-full" value="${ifaceVal}" />`);
        addRow('Endpoint MAC', `<input type="text" id="panel-network-field-endpoint-mac" class="input-field w-full" value="${macVal}" placeholder="aa:bb:cc:dd:ee:ff" />`);
        continue;
      }

      // Scalars
      const enumOptions = this.getEnumForProperty(propSpec);
      const range = this.getRangeForProperty(propSpec);
      const inputId = `panel-network-field-${propName}`;
      const currentVal = info && info[propName as keyof typeof info] !== undefined ? String(info[propName as keyof typeof info]) : '';

      if (enumOptions && enumOptions.length) {
        const selectHtml = `
          <select id="${inputId}" class="input-field w-full">
            ${enumOptions.map(v => `<option value="${v}" ${currentVal === String(v) ? 'selected' : ''}>${v}</option>`).join('')}
          </select>`;
        addRow(this.prettyLabel(propName), selectHtml);
      } else {
        // Decide input type
        let type = 'text';
        if (propSpec?.type === 'integer' || propSpec?.type === 'number' || propSpec?.$ref === '#/definitions/mtu') type = 'number';
        const minAttr = range.min !== undefined ? `min="${range.min}"` : '';
        const maxAttr = range.max !== undefined ? `max="${range.max}"` : '';
        // Provide textarea for labels/vars (object)
        if (propSpec.type === 'object' || propName === 'labels' || propName === 'vars') {
          const jsonVal = currentVal ? currentVal : (propName === 'labels' || propName === 'vars') ? '' : '';
          addRow(this.prettyLabel(propName), `<textarea id="${inputId}" class="input-field w-full" rows="3" placeholder="{\n  "key": "value"\n}">${jsonVal}</textarea>`);
        } else {
          addRow(this.prettyLabel(propName), `<input type="${type}" ${minAttr} ${maxAttr} id="${inputId}" class="input-field w-full" value="${currentVal}" />`);
        }
      }
    }

    // Show required hints
    if (required.length) {
      const hint = document.createElement('div');
      hint.className = 'text-xs text-muted pl-2';
      hint.textContent = `Required: ${required.join(', ')}`;
      container.appendChild(hint);
    }
  }

  private prettyLabel(name: string): string {
    return name
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }


  /**
   * Displays the edge editor panel for the provided edge.
   * Removes any overlay panels, updates form fields with the edge's current source/target endpoints,
   * and wires up the Close/Save buttons.
   *
   * @param edge - The Cytoscape edge to edit.
   * @returns A promise that resolves when the panel is fully configured and shown.
   */
  public async panelEdgeEditor(edge: cytoscape.EdgeSingular): Promise<void> {
    try {
      // Mark that an edge interaction occurred so global click handler doesn't immediately hide the panel
      this.edgeClicked = true;

      // 1) Hide other overlays
      const overlays = document.getElementsByClassName("panel-overlay");
      Array.from(overlays).forEach(el => (el as HTMLElement).style.display = "none");

      // 2) Grab the static parts and initial data
      const panelLinkEditor = document.getElementById("panel-link-editor");
      const panelLinkEditorIdLabel = document.getElementById("panel-link-editor-id");
      const panelLinkEditorIdLabelSrcInput = document.getElementById("panel-link-editor-source-endpoint") as HTMLInputElement | null;
      const panelLinkEditorIdLabelTgtInput = document.getElementById("panel-link-editor-target-endpoint") as HTMLInputElement | null;
      const panelLinkEditorIdLabelCloseBtn = document.getElementById("panel-link-editor-close-button");
      const panelLinkEditorIdLabelSaveBtn = document.getElementById("panel-link-editor-save-button");

      if (!panelLinkEditorIdLabel || !panelLinkEditor || !panelLinkEditorIdLabelSrcInput || !panelLinkEditorIdLabelTgtInput || !panelLinkEditorIdLabelCloseBtn || !panelLinkEditorIdLabelSaveBtn) {
        log.error('panelEdgeEditor: missing required DOM elements');
        this.edgeClicked = false;
        return;
      }
      const source = edge.data("source") as string;
      const target = edge.data("target") as string;
      const sourceEP = (edge.data("sourceEndpoint") as string) || "";
      const targetEP = (edge.data("targetEndpoint") as string) || "";
      const yamlProvenance = (edge.data('yamlProvenance') as string) || '';
      const yamlLinkType = (edge.data('yamlLinkType') as string) || '';

      // Populate inputs with current endpoint values
      panelLinkEditorIdLabelSrcInput.value = sourceEP;
      panelLinkEditorIdLabelTgtInput.value = targetEP;

      // Helper to sync the ID label from whatever is in the inputs right now
      const updateLabel = () => {
        const s = panelLinkEditorIdLabelSrcInput.value.trim();
        const t = panelLinkEditorIdLabelTgtInput.value.trim();
        panelLinkEditorIdLabel.innerHTML =
          `┌ ${source} :: ${s}<br>` +
          `└ ${target} :: ${t}`;
      };

      // Initial label fill
      updateLabel();

      // 3) Show the panel
      panelLinkEditor.style.display = "block";

      // 3a) Extended link handling (read-only in this phase)
      const typeRow = document.getElementById('panel-link-editor-type-row') as HTMLElement | null;
      const detailsRow = document.getElementById('panel-link-editor-details-row') as HTMLElement | null;
      const roNote = document.getElementById('panel-link-editor-ro-note') as HTMLElement | null;

      const isExtended = yamlProvenance === 'extended' && yamlLinkType && yamlLinkType !== 'short';
      if (isExtended) {
        // For extended links, show a read-only note and defer details to the Network Properties panel
        if (typeRow) typeRow.style.display = 'none';
        if (detailsRow) detailsRow.style.display = 'none';
        if (roNote) roNote.style.display = 'block';

        // Disable inputs and save button
        panelLinkEditorIdLabelSrcInput.disabled = true;
        panelLinkEditorIdLabelTgtInput.disabled = true;
      } else {
        // Hide extended-only UI for short links
        if (typeRow) typeRow.style.display = 'none';
        if (detailsRow) detailsRow.style.display = 'none';
        if (roNote) roNote.style.display = 'none';
        panelLinkEditorIdLabelSrcInput.disabled = false;
        panelLinkEditorIdLabelTgtInput.disabled = false;
      }

      // 4) Re-wire Close button (one-shot)
      const freshClose = panelLinkEditorIdLabelCloseBtn.cloneNode(true) as HTMLElement;
      panelLinkEditorIdLabelCloseBtn.parentNode!.replaceChild(freshClose, panelLinkEditorIdLabelCloseBtn);
      freshClose.addEventListener("click", () => {
        panelLinkEditor.style.display = "none";
        this.edgeClicked = false;
      }, { once: true });

      // 5) Wire real-time preview (optional but helpful)
      panelLinkEditorIdLabelSrcInput.addEventListener("input", updateLabel);
      panelLinkEditorIdLabelTgtInput.addEventListener("input", updateLabel);

      // 6) Wire up Save button
      if (panelLinkEditorIdLabelSaveBtn) {
        const freshSave = panelLinkEditorIdLabelSaveBtn.cloneNode(true) as HTMLElement;
        panelLinkEditorIdLabelSaveBtn.parentNode?.replaceChild(freshSave, panelLinkEditorIdLabelSaveBtn);

        // Disable save for extended links in this phase
        if (isExtended) {
          (freshSave as HTMLButtonElement).disabled = true;
          freshSave.classList.add('btn-disabled');
        }

        freshSave.addEventListener(
          "click",
          async () => {
            if (isExtended) {
              // No-op for extended links in this phase
              panelLinkEditor.style.display = "none";
              this.edgeClicked = false;
              return;
            }
            try {
              // 6a) Update edge data from inputs
              const newSourceEP = panelLinkEditorIdLabelSrcInput.value.trim();
              const newTargetEP = panelLinkEditorIdLabelTgtInput.value.trim();
              edge.data({
                sourceEndpoint: newSourceEP,
                targetEndpoint: newTargetEP
              });

              // 6b) Persist changes (with notification)
              await this.saveManager.viewportButtonsSaveTopo(
                this.cy,
                /* suppressNotification */ false
              );

              // 6c) Refresh the ID label so it shows saved values
              if (panelLinkEditorIdLabel) {
                panelLinkEditorIdLabel.innerHTML =
                  `┌ ${source} :: ${newSourceEP}<br>` +
                  `└ ${target} :: ${newTargetEP}`;
              }

              // 6d) Hide the panel
              panelLinkEditor.style.display = "none";
              // Reset the edgeClicked flag
              this.edgeClicked = false;
            } catch (saveErr) {
              log.error(`panelEdgeEditor: error during save: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
              // TODO: show user-facing notification if needed
            }
          },
          { once: true }
        );
      }

      // Reset the edgeClicked flag after a small delay to ensure the panel stays open
      setTimeout(() => {
        this.edgeClicked = false;
      }, 100);

    } catch (err) {
      log.error(`panelEdgeEditor: unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      this.edgeClicked = false;
      // TODO: show user-facing notification if needed
    }
  }


  /**
   * Updates the provided Cytoscape node with data from the editor panel.
   * This method retrieves updated values from the editor and applies them to the node.
   *
   * @param node - The Cytoscape node to update.
   * @returns A promise that resolves when the node data has been updated.
   */
  public async updateNodeFromEditor(node: cytoscape.NodeSingular): Promise<void> {
    // Ensure we target a single node even if a collection is passed.
    const targetNode: cytoscape.NodeSingular = (node as any).length && (node as any).length > 1 ? (node as any)[0] : node;

    // Get the input values.
    const nodeNameInput = document.getElementById("panel-node-editor-name") as HTMLInputElement;
    const nodeImageInput = document.getElementById("panel-node-editor-image") as HTMLInputElement;
    const typeDropdownInput = document.getElementById("panel-node-type-dropdown-container-filter-input") as HTMLInputElement;
    const typeInput = document.getElementById("panel-node-editor-type-input") as HTMLInputElement;

    // Retrieve dropdown selections.
    const kindDropdownInput = document.getElementById("panel-node-kind-dropdown-container-filter-input") as HTMLInputElement;
    const topoViewerRoleDropdownInput = document.getElementById("panel-node-topoviewerrole-dropdown-container-filter-input") as HTMLInputElement;

    // Retrieve current node data.
    const currentData = targetNode.data();
    const oldName = currentData.name as string;              // remember old name
    const newName = nodeNameInput.value;                    // the new name

    // Build updated extraData, preserving other fields.
    const typeValue = this.panelNodeEditorUseDropdownForType
      ? (typeDropdownInput ? typeDropdownInput.value || '' : '')
      : (typeInput ? typeInput.value : '');

    const updatedExtraData = {
      ...currentData.extraData,
      name: nodeNameInput.value,
      image: nodeImageInput.value,
      kind: kindDropdownInput ? kindDropdownInput.value : 'nokia_srlinux',
    };

    if (this.panelNodeEditorUseDropdownForType || typeValue.trim() !== '') {
      updatedExtraData.type = typeValue;
    } else if ('type' in updatedExtraData) {
      delete updatedExtraData.type;
    }

    // Build the updated data object.
    const updatedData = {
      ...currentData,
      name: nodeNameInput.value,
      topoViewerRole: topoViewerRoleDropdownInput ? topoViewerRoleDropdownInput.value : 'pe',
      extraData: updatedExtraData,
    };

    // Update the Cytoscape node data.
    targetNode.data(updatedData);
    log.debug(`Cytoscape node updated with new data: ${JSON.stringify(updatedData)}`);

    // If the node’s name actually changed, update connected edges.
    if (oldName !== newName) {
      const edges = targetNode.connectedEdges();
      edges.forEach(edge => {
        const edgeData = edge.data();
        let modified = false;
        const updatedEdgeData: any = { ...edgeData };

        // Update sourceName if it pointed to our old name
        if (edgeData.sourceName === oldName) {
          updatedEdgeData.sourceName = newName;
          modified = true;
        }
        // Update targetName if it pointed to our old name
        if (edgeData.targetName === oldName) {
          updatedEdgeData.targetName = newName;
          modified = true;
        }
        if (modified) {
          edge.data(updatedEdgeData);
          log.debug(`Edge ${edge.id()} updated to reflect node rename: ${JSON.stringify(updatedEdgeData)}`);
        }
      });
    }

    // Optionally, hide the node editor panel.
    const panelNodeEditor = document.getElementById("panel-node-editor");
    if (panelNodeEditor) {
      panelNodeEditor.style.display = "none";
    }
  }

  /**
   * Updates a network node based on the network editor inputs.
   * @param node - The Cytoscape node representing the network.
   */
  public async updateNetworkFromEditor(node: cytoscape.NodeSingular): Promise<void> {
    const targetNode: cytoscape.NodeSingular = (node as any).length && (node as any).length > 1 ? (node as any)[0] : node;

    const networkTypeInput = document.getElementById('panel-network-type-dropdown-container-filter-input') as HTMLInputElement | null;
    const nameInput = document.getElementById('panel-network-name') as HTMLInputElement | null;

    const currentData = targetNode.data();
    const oldId = currentData.id as string;
    const oldName = currentData.name as string;

    // Build new ID from network type and interface
    const networkType = networkTypeInput ? networkTypeInput.value : 'host';
    const isBridgeType = networkType === 'bridge' || networkType === 'ovs-bridge';
    const enteredName = nameInput ? nameInput.value.trim() : '';
    const newId = isBridgeType ? (enteredName || oldId) : `${networkType}:${enteredName || 'eth1'}`;
    const newName = newId;

    // If ID hasn't changed, just update the data
    if (oldId === newId) {
      const updatedData = {
        ...currentData,
        name: newName,
        topoViewerRole: 'cloud',
        extraData: {
          ...currentData.extraData,
          kind: networkType
        }
      };
      targetNode.data(updatedData);
    } else {
      // ID has changed - we need to recreate the node since Cytoscape IDs are immutable
      const position = targetNode.position();
      const connectedEdges = targetNode.connectedEdges().map(edge => {
        const edgeData = edge.data();
        return {
          id: edge.id(),
          source: edgeData.source,
          target: edgeData.target,
          sourceEndpoint: edgeData.sourceEndpoint,
          targetEndpoint: edgeData.targetEndpoint,
          data: edgeData,
          classes: edge.classes()
        };
      });

      // Remove the old node (this also removes connected edges)
      this.cy.remove(targetNode);

      // Create new node with new ID
      const newNodeData = {
        ...currentData,
        id: newId,
        name: newName,
        topoViewerRole: 'cloud',
        extraData: {
          ...currentData.extraData,
          kind: networkType
        }
      };

      this.cy.add({
        group: 'nodes',
        data: newNodeData,
        position: position
      });

      // Recreate edges with updated references
      connectedEdges.forEach(edgeInfo => {
        const newEdgeData = { ...edgeInfo.data };

        // Update source/target references
        if (newEdgeData.source === oldId) {
          newEdgeData.source = newId;
        }
        if (newEdgeData.target === oldId) {
          newEdgeData.target = newId;
        }

        // sourceName and targetName should also be updated
        if (newEdgeData.sourceName === oldName) {
          newEdgeData.sourceName = newName;
        }
        if (newEdgeData.targetName === oldName) {
          newEdgeData.targetName = newName;
        }

        // Determine if edge should have stub-link class based on special endpoints
        let edgeClasses = edgeInfo.classes || [];
        const isStubLink = isSpecialNodeOrBridge(newEdgeData.source, this.cy) || isSpecialNodeOrBridge(newEdgeData.target, this.cy);

        // Ensure stub-link class is present for special endpoints
        if (isStubLink && !edgeClasses.includes('stub-link')) {
          edgeClasses = [...edgeClasses, 'stub-link'];
        }

        // Add the edge back
        this.cy.add({
          group: 'edges',
          data: newEdgeData,
          classes: edgeClasses.join(' ')
        });
      });
    }

    const panel = document.getElementById('panel-network-editor');
    if (panel) {
      panel.style.display = 'none';
    }
  }


  /**
   * Updates connected edge endpoints when a node's kind changes.
   * Only endpoints matching the old kind's pattern are updated.
   *
   * @param node - The node whose connected edges should be updated.
   * @param oldKind - The previous kind of the node.
   * @param newKind - The new kind of the node.
   */
  public updateNodeEndpointsForKindChange(
    node: cytoscape.NodeSingular,
    oldKind: string,
    newKind: string
  ): void {
    const ifaceMap = window.ifacePatternMapping || {};
    const oldPattern = ifaceMap[oldKind] || 'eth{n}';
    const newPattern = ifaceMap[newKind] || 'eth{n}';
    const nodeId = node.id();

    const placeholder = '__N__';
    const escaped = oldPattern
      .replace('{n}', placeholder)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexStr = '^' + escaped.replace(placeholder, '(\\d+)') + '$';
    const patternRegex = new RegExp(regexStr);

    const edges = this.cy.edges(`[source = "${nodeId}"], [target = "${nodeId}"]`);
    edges.forEach(edge => {
      ['sourceEndpoint', 'targetEndpoint'].forEach(key => {
        const endpoint = edge.data(key);
        const isNodeEndpoint =
          (edge.data('source') === nodeId && key === 'sourceEndpoint') ||
          (edge.data('target') === nodeId && key === 'targetEndpoint');
        if (!endpoint || !isNodeEndpoint) return;
        const match = endpoint.match(patternRegex);
        if (match) {
          const newEndpoint = newPattern.replace('{n}', match[1]);
          edge.data(key, newEndpoint);
        }
      });
    });
  }

  // --- Private helper methods ---

  /**
   * Extracts the kind enumeration options from the JSON schema.
   *
   * @param jsonData - The JSON schema data.
   * @returns An object containing the kindOptions array and the original schema data.
   * @throws Will throw an error if the JSON structure is invalid or 'kind' enum is not found.
   */
  private panelNodeEditorGetKindEnums(jsonData: any): { kindOptions: string[]; schemaData: any } {
    let kindOptions: string[] = [];
    if (jsonData && jsonData.definitions && jsonData.definitions['node-config']) {
      kindOptions = jsonData.definitions['node-config'].properties.kind.enum || [];
    } else {
      throw new Error("Invalid JSON structure or 'kind' enum not found");
    }
    return { kindOptions, schemaData: jsonData };
  }

  /**
   * Populates the kind dropdown with the provided options.
   *
   * @param options - An array of kind option strings.
   */
  private panelNodeEditorPopulateKindDropdown(options: string[]): void {
    this.createFilterableDropdown(
      'panel-node-kind-dropdown-container',
      options,
      this.panelNodeEditorKind,
      (selectedValue: string) => {
        const previousKind = this.panelNodeEditorKind;
        this.panelNodeEditorKind = selectedValue;
        log.debug(`${this.panelNodeEditorKind} selected`);

        const typeOptions = this.panelNodeEditorGetTypeEnumsByKindPattern(this.nodeSchemaData, `(${selectedValue})`);
        // Reset the stored type when kind changes
        this.panelNodeEditorType = "";
        this.panelNodeEditorSetupTypeField(typeOptions);

        if (this.panelNodeEditorNode && window.updateLinkEndpointsOnKindChange) {
          this.updateNodeEndpointsForKindChange(this.panelNodeEditorNode, previousKind, selectedValue);
        }

        const imageMap = window.imageMapping || {};
        const imageInput = document.getElementById('panel-node-editor-image') as HTMLInputElement;
        if (imageInput) {
          const mappedImage = imageMap[selectedValue];
          if (mappedImage !== undefined) {
            imageInput.value = mappedImage;
            imageInput.dispatchEvent(new Event('input'));
          } else if (mappedImage === undefined) {
            imageInput.value = '';
            imageInput.dispatchEvent(new Event('input'));
          }
        }
      },
      'Search for kind...'
    );
  }

  private panelNodeEditorSetupTypeField(options: string[]): void {
    const dropdownContainer = document.getElementById("panel-node-type-dropdown-container");
    const input = document.getElementById("panel-node-editor-type-input") as HTMLInputElement;

    if (!dropdownContainer || !input) {
      log.error('Type input elements not found in the DOM.');
      return;
    }

    if (options.length > 0) {
      dropdownContainer.style.display = "";
      input.style.display = "none";
      this.panelNodeEditorUseDropdownForType = true;
      // Ensure type matches available options
      if (!options.includes(this.panelNodeEditorType)) {
        this.panelNodeEditorType = options[0];
      }
      this.panelNodeEditorPopulateTypeDropdown(options);
    } else {
      dropdownContainer.style.display = "none";
      input.style.display = "";
      this.panelNodeEditorUseDropdownForType = false;
      input.value = this.panelNodeEditorType || "";
      input.oninput = () => {
        this.panelNodeEditorType = input.value;
      };
    }
  }

  private panelNodeEditorPopulateTypeDropdown(options: string[]): void {
    if (!options.includes(this.panelNodeEditorType)) {
      this.panelNodeEditorType = options.length > 0 ? options[0] : "";
    }

    this.createFilterableDropdown(
      'panel-node-type-dropdown-container',
      options,
      this.panelNodeEditorType,
      (selectedValue: string) => {
        this.panelNodeEditorType = selectedValue;
        log.debug(`Type ${this.panelNodeEditorType} selected`);
      },
      'Search for type...'
    );
  }

  /**
   * Populates the topoViewerRole dropdown with the provided options.
   *
   * @param options - An array of topoViewerRole option strings.
   */
  private panelNodeEditorPopulateTopoViewerRoleDropdown(options: string[]): void {
    this.createFilterableDropdown(
      'panel-node-topoviewerrole-dropdown-container',
      options,
      this.panelNodeEditorTopoViewerRole,
      (selectedValue: string) => {
        this.panelNodeEditorTopoViewerRole = selectedValue;
        log.debug(`${this.panelNodeEditorTopoViewerRole} selected`);
      },
      'Search for role...'
    );
  }

  /**
    * Displays the TopoViewer panel
    * Removes any overlay panels, updates form fields with the edge’s current source/target endpoints,
    *
    * @returns A promise that resolves when the panel is fully configured and shown.
    */
  public async panelAbout(): Promise<void> {
    try {
      // 1) Hide other overlays
      const overlays = document.getElementsByClassName("panel-overlay");
      Array.from(overlays).forEach(el => (el as HTMLElement).style.display = "none");

      // 2) Grab the static parts and initial data
      const panelTopoviewerAbout = document.getElementById("panel-topoviewer-about");

      if (!panelTopoviewerAbout) {
        log.error('panelTopoviewerAbout: missing required DOM elements');
        return;
      }

      // 3) Show the panel
      panelTopoviewerAbout.style.display = "block";

    }
    catch (err) {
      log.error(`panelEdgeEditor: unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      // TODO: surface user-facing notification
    }
  }


  /**
   * Extracts type enumeration options from the JSON schema based on a kind pattern.
   *
   * @param jsonData - The JSON schema data.
   * @param pattern - A regex pattern (as a string) to match the kind property.
   * @returns An array of type enum strings.
   */
  private panelNodeEditorGetTypeEnumsByKindPattern(jsonData: any, pattern: string): string[] {
    // Extract the kind from the pattern (e.g., "(nokia_srlinux)" -> "nokia_srlinux")
    const kindMatch = pattern.match(/\(([^)]+)\)/);
    const kind = kindMatch ? kindMatch[1] : '';

    // Only return type options for Nokia kinds
    const nokiaKinds = ['nokia_srlinux', 'nokia_srsim', 'nokia_sros'];
    if (!nokiaKinds.includes(kind)) {
      return [];
    }

    if (
      jsonData &&
      jsonData.definitions &&
      jsonData.definitions['node-config'] &&
      jsonData.definitions['node-config'].allOf
    ) {
      for (const condition of jsonData.definitions['node-config'].allOf) {
        if (
          condition.if &&
          condition.if.properties &&
          condition.if.properties.kind &&
          condition.if.properties.kind.pattern === pattern
        ) {
          if (condition.then && condition.then.properties && condition.then.properties.type) {
            const typeProp = condition.then.properties.type;
            if (typeProp.enum) {
              return typeProp.enum;
            }
            if (Array.isArray(typeProp.anyOf)) {
              for (const sub of typeProp.anyOf) {
                if (sub.enum) {
                  return sub.enum;
                }
              }
            }
          }
        }
      }
    }
    return [];
  }

  /**
   * Displays and populates the node's parent group editor panel.
   *
   * @param newParentId - The new parent ID in the format "group:level".
   *
   * panelNodeEditorGroupEditor is not implemented here due to the complexity
   * of managing groups and the need for a more comprehensive UI handling.
   *
   */


  /**
   * Removes a DOM element by its ID.
   *
   * @param id - The ID of the element to remove.
   */
  private removeElementById(id: string): void {
    const el = document.getElementById(id);
    if (el) {
      el.remove();
    }
  }

  /**
   * Appends or logs a message.
   *
   * @param message - The message to display.
   */
  private appendMessage(message: string): void {
    log.debug(message);
    // Optionally, integrate with a VS Code message sender here if needed.
  }

  /**
   * Sets the flag indicating whether a node was clicked.
   *
   * @param flag - True if a node was clicked; otherwise, false.
   */
  public setNodeClicked(flag: boolean): void {
    this.nodeClicked = flag;
  }

  /**
   * Sets the flag indicating whether an edge was clicked.
   *
   * @param flag - True if an edge was clicked; otherwise, false.
   */
  public setEdgeClicked(flag: boolean): void {
    this.edgeClicked = flag;
  }

  /**
   * Sets the flag for panel 01 state in the Cytoscape container.
   *
   * @param flag - True to enable panel 01; otherwise, false.
   */
  public setPanel01Cy(flag: boolean): void {
    this.isPanel01Cy = flag;
  }

  /**
   * Sets up a global click handler to close dropdowns when clicking outside.
   */
  private setupDropdownCloseHandler(): void {
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Check if click is outside all dropdowns
      const dropdowns = ['panel-node-kind-dropdown', 'panel-node-topoviewerrole-dropdown', 'panel-node-type-dropdown'];

      dropdowns.forEach(dropdownId => {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown && !dropdown.contains(target)) {
          dropdown.classList.remove('is-active');
          const content = dropdown.querySelector('.dropdown-menu');
          if (content) {
            content.classList.add('hidden');
          }
        }
      });
    });
  }

  /**
   * Creates a filterable dropdown with search functionality.
   * @param containerId - The ID of the container element
   * @param options - Array of options to display
   * @param currentValue - Currently selected value
   * @param onSelect - Callback function when an option is selected
   * @param placeholder - Placeholder text for the filter input
   */
  private createFilterableDropdown(
    containerId: string,
    options: string[],
    currentValue: string,
    onSelect: (value: string) => void, // eslint-disable-line no-unused-vars
    placeholder: string = 'Type to filter...'
  ): void {
    const container = document.getElementById(containerId);
    if (!container) {
      log.error(`Container ${containerId} not found`);
      return;
    }

    // Clear existing content
    container.innerHTML = '';

    // Create the filterable dropdown structure
    const dropdownHtml = `
      <div class="filterable-dropdown relative w-full">
        <div class="filterable-dropdown-input-container relative">
          <input 
            type="text" 
            class="input-field w-full pr-8" 
            placeholder="${placeholder}"
            value="${currentValue}"
            id="${containerId}-filter-input"
          />
          <i class="fas fa-angle-down absolute right-2 top-1/2 transform -translate-y-1/2 cursor-pointer" 
             id="${containerId}-dropdown-arrow"></i>
        </div>
        <div class="filterable-dropdown-menu hidden absolute top-full left-0 mt-1 w-full max-h-40 overflow-y-auto z-[60] bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded shadow-lg" 
             id="${containerId}-dropdown-menu">
        </div>
      </div>
    `;

    container.innerHTML = dropdownHtml;

    const filterInput = document.getElementById(`${containerId}-filter-input`) as HTMLInputElement;
    const dropdownMenu = document.getElementById(`${containerId}-dropdown-menu`);
    const dropdownArrow = document.getElementById(`${containerId}-dropdown-arrow`);

    if (!filterInput || !dropdownMenu) {
      log.error(`Failed to create filterable dropdown elements for ${containerId}`);
      return;
    }

    // Function to populate dropdown options
    const populateOptions = (filteredOptions: string[]) => {
      dropdownMenu.innerHTML = '';

      filteredOptions.forEach(option => {
        const optionElement = document.createElement('a');
        optionElement.classList.add('dropdown-item', 'block', 'px-3', 'py-2', 'cursor-pointer');
        optionElement.style.color = 'var(--vscode-dropdown-foreground)';
        optionElement.style.backgroundColor = 'transparent';
        optionElement.style.fontSize = 'var(--vscode-font-size)';
        optionElement.style.fontFamily = 'var(--vscode-font-family)';
        optionElement.textContent = option;
        optionElement.href = '#';

        // Add hover effect
        optionElement.addEventListener('mouseenter', () => {
          optionElement.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
        });
        optionElement.addEventListener('mouseleave', () => {
          if (!optionElement.classList.contains('bg-highlight')) {
            optionElement.style.backgroundColor = 'transparent';
          }
        });

        optionElement.addEventListener('click', (e) => {
          e.preventDefault();
          filterInput.value = option;
          dropdownMenu.classList.add('hidden');
          onSelect(option);
        });

        dropdownMenu.appendChild(optionElement);
      });
    };

    // Initial population
    populateOptions(options);

    // Filter functionality
    filterInput.addEventListener('input', () => {
      const filterValue = filterInput.value.toLowerCase();
      const filteredOptions = options.filter(option =>
        option.toLowerCase().includes(filterValue)
      );
      populateOptions(filteredOptions);

      if (!dropdownMenu.classList.contains('hidden')) {
        // Keep dropdown open if it was already open
        dropdownMenu.classList.remove('hidden');
      }
    });

    // Show/hide dropdown on focus
    filterInput.addEventListener('focus', () => {
      dropdownMenu.classList.remove('hidden');
    });

    // Handle arrow click to toggle dropdown
    if (dropdownArrow) {
      dropdownArrow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdownMenu.classList.contains('hidden')) {
          dropdownMenu.classList.remove('hidden');
          filterInput.focus();
        } else {
          dropdownMenu.classList.add('hidden');
        }
      });
    }

    // Close dropdown when clicking outside
    // Use setTimeout to prevent immediate closing when clicking the arrow
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      // Check if click is outside the entire dropdown container
      if (!container.contains(target)) {
        setTimeout(() => {
          dropdownMenu.classList.add('hidden');
        }, 0);
      }
    });

    // Prevent closing when clicking inside the dropdown menu
    dropdownMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Handle keyboard navigation
    filterInput.addEventListener('keydown', (e) => {
      const items = dropdownMenu.querySelectorAll('.dropdown-item') as NodeListOf<HTMLElement>;
      let currentIndex = -1;

      // Find currently highlighted item
      items.forEach((item, index) => {
        if (item.classList.contains('bg-highlight')) {
          currentIndex = index;
        }
      });

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          // Remove current highlight
          if (currentIndex >= 0) {
            items[currentIndex].classList.remove('bg-highlight');
            (items[currentIndex] as HTMLElement).style.backgroundColor = 'transparent';
          }
          // Add highlight to next item
          currentIndex = Math.min(currentIndex + 1, items.length - 1);
          if (items[currentIndex]) {
            items[currentIndex].classList.add('bg-highlight');
            (items[currentIndex] as HTMLElement).style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
            // Scroll into view if needed
            items[currentIndex].scrollIntoView({ block: 'nearest' });
          }
          dropdownMenu.classList.remove('hidden');
          break;

        case 'ArrowUp':
          e.preventDefault();
          // Remove current highlight
          if (currentIndex >= 0) {
            items[currentIndex].classList.remove('bg-highlight');
            (items[currentIndex] as HTMLElement).style.backgroundColor = 'transparent';
          }
          // Add highlight to previous item
          currentIndex = Math.max(currentIndex - 1, 0);
          if (items[currentIndex]) {
            items[currentIndex].classList.add('bg-highlight');
            (items[currentIndex] as HTMLElement).style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
            // Scroll into view if needed
            items[currentIndex].scrollIntoView({ block: 'nearest' });
          }
          dropdownMenu.classList.remove('hidden');
          break;

        case 'Enter':
          e.preventDefault();
          if (currentIndex >= 0 && items[currentIndex]) {
            const selectedValue = items[currentIndex].textContent || '';
            filterInput.value = selectedValue;
            dropdownMenu.classList.add('hidden');
            onSelect(selectedValue);
          }
          break;

        case 'Escape':
          dropdownMenu.classList.add('hidden');
          break;
      }
    });
  }
}
