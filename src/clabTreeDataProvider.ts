import * as vscode from "vscode"
import * as utils from "./utils"
import { promisify } from "util";
import { exec, execSync } from "child_process";
import path = require("path");

const execAsync = promisify(exec);

// Enum to store types of container state icons.
enum CtrStateIcons {
  RUNNING = "icons/running.svg",
  STOPPED = "icons/stopped.svg",
  PARTIAL = "icons/partial.svg",
  UNDEPLOYED = "icons/undeployed.svg"
}

// Enum to store interface state icons.
enum IntfStateIcons {
  UP = "icons/ethernet-port-green.svg",
  DOWN = "icons/ethernet-port-red.svg",
  LIGHT = "icons/ethernet-port-light.svg",
  DARK = "icons/ethernet-port-dark.svg",
}

/**
 * A tree node for labs
 */
export class ClabLabTreeNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly labPath: LabPath,
    public readonly name?: string,
    public readonly owner?: string,
    public readonly containers?: ClabContainerTreeNode[],
    contextValue?: string,
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
  }
}

/**
 * Interface which stores relative and absolute lab path.
 */
export interface LabPath {
  absolute: string,
  relative: string
}

/**
 * Tree node for containers (children of ClabLabTreeNode)
 */
export class ClabContainerTreeNode extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly name: string,
    public readonly cID: string,
    public readonly state: string,
    public readonly kind: string,
    public readonly image: string,
    public readonly interfaces: ClabInterfaceTreeNode[],
    public readonly v4Address?: string,
    public readonly v6Address?: string,
    contextValue?: string,
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
  }

  // Get the IPv4 address without CIDR mask
  public get IPv4Address() {
    if (!(this.v4Address === "N/A")) {
      return this.v4Address?.split('/')[0];
    } else {
      return "";
    }
  }

  // Get the IPv6 address without CIDR mask
  public get IPv6Address() {
    if (!(this.v6Address === "N/A")) {
      return this.v6Address?.split('/')[0];
    } else {
      return "";
    }
  }
}

/**
 * Interface which stores fields we expect from
 * clab inspect data (in JSON format).
 */
interface ClabJSON {
  container_id: string,
  image: string,
  ipv4_address: string,
  ipv6_address: string,
  kind: string,
  lab_name: string,
  labPath: string,
  name: string,
  owner: string,
  state: string,
}

/**
 * Interface corresponding to fields in the
 *  the JSON output of 'clab ins interfaces'
 */
interface ClabInsIntfJSON {
  name: string,
  interfaces: [
    {
      name: string,
      type: string,
      state: string,
      alias: string,
      mac: string,
      mtu: number,
      ifindex: number,
    }
  ]
}

/**
 * Tree node to store information about a container interface.
 */
export class ClabInterfaceTreeNode extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly parentName: string, // name of the parent container/node
    public readonly cID: string,        // parent container ID
    public readonly name: string,       // the interface name itself
    public readonly type: string,       // the interface type (veth, dummy, etc.)
    public readonly alias: string,      // the interface name alias (ie ge-0/0/x -> ethX)
    public readonly mac: string,
    public readonly mtu: number,  
    public readonly ifIndex: number,
    contextValue?: string,
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
  }
}

export class ClabTreeDataProvider implements vscode.TreeDataProvider<ClabLabTreeNode | ClabContainerTreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ClabLabTreeNode | ClabContainerTreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) { }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ClabLabTreeNode | ClabContainerTreeNode): vscode.TreeItem {
    return element;
  }

  /**
   * Return tree children. If called with ClabLabTreeNode as args it will return the ClabLabTreeNode's
   * array of containers.
   */
  async getChildren(element?: ClabLabTreeNode | ClabContainerTreeNode | ClabInterfaceTreeNode): Promise<any> {
    // Discover labs to populate tree
    if (!element) { return this.discoverLabs(); }
    // Find containers belonging to a lab
    if (element instanceof ClabLabTreeNode) { return element.containers; }
    // For containers or interfaces we do not show further children
    if (element instanceof ClabContainerTreeNode) {
      return element.interfaces;
    }

    return [];
  }

  private async discoverLabs(): Promise<ClabLabTreeNode[]> {
    console.log("[discovery]:\tDiscovering labs");

    const localLabs = await this.discoverLocalLabs();     // Undeployed topologies
    const globalLabs = await this.discoverInspectLabs();  // Deployed labs from `clab inspect -a`

    if (!localLabs && !globalLabs) {
      console.error("[discovery]:\tNo labs found");
      return [
        new ClabLabTreeNode(
          "No labs found. Add a lab with the '+' icon.",
          vscode.TreeItemCollapsibleState.None,
          { absolute: "", relative: "" }
        )
      ];
    } else if (!globalLabs) {
      console.error("[discovery]:\tNo inspected labs found");
      return Object.values(localLabs!);
    } else if (!localLabs) {
      console.error("[discovery]:\tNo local labs found");
      return Object.values(globalLabs);
    }

    // Merge them into a single dictionary
    const labs: Record<string, ClabLabTreeNode> = { ...globalLabs };
    for (const labPath in localLabs) {
      if (!labs.hasOwnProperty(labPath)) {
        labs[labPath] = localLabs[labPath];
      }
    }

    // Convert the dict to an array and sort
    const sortedLabs = Object.values(labs).sort((a, b) => {
      if (a.contextValue === "containerlabLabDeployed" && b.contextValue === "containerlabLabUndeployed") {
        return -1;
      }
      if (a.contextValue === "containerlabLabUndeployed" && b.contextValue === "containerlabLabDeployed") {
        return 1;
      }
      return a.labPath.absolute.localeCompare(b.labPath.absolute);
    });

    console.log(`[discovery]:\tDiscovered ${sortedLabs.length} labs.`);
    return sortedLabs;
  }

  private async discoverLocalLabs(): Promise<Record<string, ClabLabTreeNode> | undefined> {
    console.log("[discovery]:\tDiscovering local labs...");

    const clabGlobPatterns = ["**/*.clab.yml", "**/*.clab.yaml"];
    const ignorePattern = "**/node_modules/**";

    let uris: vscode.Uri[] = [];
    for (const pattern of clabGlobPatterns) {
      const found = await vscode.workspace.findFiles(pattern, ignorePattern);
      uris.push(...found);
    }

    if (!uris.length) {
      return undefined;
    }

    const labs: Record<string, ClabLabTreeNode> = {};

    uris.forEach((uri) => {
      const normPath = utils.normalizeLabPath(uri.fsPath);
      if (!labs[normPath]) {
        const labNode = new ClabLabTreeNode(
          path.basename(uri.fsPath),
          vscode.TreeItemCollapsibleState.None,
          {
            relative: uri.fsPath,
            absolute: normPath
          },
          undefined,
          undefined,
          undefined,
          "containerlabLabUndeployed"
        );

        labNode.description = utils.getRelLabFolderPath(uri.fsPath);

        const icon = this.getResourceUri(CtrStateIcons.UNDEPLOYED);
        labNode.iconPath = { light: icon, dark: icon };

        labs[normPath] = labNode;
      }
    });

    return labs;
  }

  public async discoverInspectLabs(): Promise<Record<string, ClabLabTreeNode> | undefined> {
    console.log("[discovery]:\tDiscovering labs via inspect...");

    const inspectData = await this.getInspectData();
    if (!inspectData) {
      return undefined;
    }

    const labs: Record<string, ClabLabTreeNode> = {};

    // The 'containers' array in the JSON contains data for each deployed container
    inspectData.containers.forEach((container: ClabJSON) => {
      const normPath = utils.normalizeLabPath(container.labPath);
      if (!labs[normPath]) {
        const label = `${container.lab_name} (${container.owner})`;

        const labPathObj: LabPath = {
          absolute: normPath,
          relative: utils.getRelLabFolderPath(container.labPath)
        };

        // Discover the containers for this lab
        const discoveredContainers: ClabContainerTreeNode[] =
          this.discoverContainers(inspectData, container.labPath, labPathObj.absolute);

        // Count how many are running
        let runningCount = 0;
        for (const c of discoveredContainers) {
          if (c.state === "running") {
            runningCount++;
          }
        }

        // Pick icon
        let icon: string;
        if (runningCount === 0) {
          icon = CtrStateIcons.STOPPED;
        } else if (runningCount === discoveredContainers.length) {
          icon = CtrStateIcons.RUNNING;
        } else {
          icon = CtrStateIcons.PARTIAL;
        }

        const labNode = new ClabLabTreeNode(
          label,
          vscode.TreeItemCollapsibleState.Collapsed,
          labPathObj,
          container.lab_name,
          container.owner,
          discoveredContainers,
          "containerlabLabDeployed"
        );
        labNode.description = labPathObj.relative;

        const iconUri = this.getResourceUri(icon);
        labNode.iconPath = { light: iconUri, dark: iconUri };

        labs[normPath] = labNode;
      }
    });

    return labs;
  }

  private async getInspectData(): Promise<any> {
    const cmd = `${utils.getSudo()}containerlab inspect --all --format json`;

    let clabStdout;
    let clabStderr;
    try {
      const { stdout, stderr } = await execAsync(cmd);
      clabStdout = stdout;
      clabStderr = stderr;
    } catch (err) {
      throw new Error(`Could not run ${cmd}.\n${err}`);
    }

    if (clabStderr) {
      console.error(`[stderr]:\t${clabStderr}`.replace("\n", ""));
    }

    if (!clabStdout) {
      return undefined;
    }

    const inspectObject = JSON.parse(clabStdout);
    return inspectObject;
  }

  /**
   * Discover containers that belong to a specific lab path.
   */
  private discoverContainers(inspectData: any, labPath: string, absLabPath: string): ClabContainerTreeNode[] {
    console.log(`[discovery]:\tDiscovering containers for ${labPath}...`);

    // filter the data to only relevant containers
    const filtered = inspectData.containers.filter((container: ClabJSON) => container.labPath === labPath);

    let containers: ClabContainerTreeNode[] = [];

    filtered.forEach((container: ClabJSON) => {
      let tooltip = [
        `Container: ${container.name}`,
        `ID: ${container.container_id}`,
        `State: ${container.state}`,
        `Kind: ${container.kind}`,
        `Image: ${container.image}`
      ];

      if (!(container.ipv4_address === "N/A")) {
        const v4Addr = container.ipv4_address.split('/')[0];
        tooltip.push(`IPv4: ${v4Addr}`);
      }

      if (!(container.ipv6_address === "N/A")) {
        const v6Addr = container.ipv6_address.split('/')[0];
        tooltip.push(`IPv6: ${v6Addr}`);
      }

      let icon: string;
      if (container.state === "running") { icon = CtrStateIcons.RUNNING; }
      else { icon = CtrStateIcons.STOPPED; }

      // Gather container interfaces
      const interfaces: ClabInterfaceTreeNode[] = this.discoverContainerInterfaces(absLabPath, container.name, container.container_id)
        .sort((a, b) => a.name.localeCompare(b.name));

      const collapsible = interfaces.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

      const node = new ClabContainerTreeNode(
        container.name,
        collapsible,
        container.name,
        container.container_id,
        container.state,
        container.kind,
        container.image,
        interfaces,
        container.ipv4_address,
        container.ipv6_address,
        "containerlabContainer"
      );

      node.description = utils.titleCase(container.state);
      node.tooltip = tooltip.join("\n");

      const iconPath = this.getResourceUri(icon);
      node.iconPath = { light: iconPath, dark: iconPath };

      containers.push(node);
    });

    return containers;
  }

  /**
   * Handle OrbStack (fallback to `docker exec`).
   */
  private discoverContainerInterfaces(labPath: string, cName: string, cID: string): ClabInterfaceTreeNode[] {
    console.log(`[discovery]:\tDiscovering interfaces for container: ${cName}`);

    const cmd = `${utils.getSudo()}containerlab inspect interfaces -t ${labPath} -f json -n clab-${cName}`;

    let clabStdout;
    try {
      const stdout = execSync(cmd);
      if (!stdout) {
        return [];
      }
      clabStdout = stdout.toString();
    } catch (err) {
      console.error(
        `[discovery]:\tInterface detection failed for ${cName}`,
        err
      );
      return [];
    }

    let clabInsJSON: ClabInsIntfJSON[];
    try {
      clabInsJSON = JSON.parse(clabStdout);
    } catch (parseErr) {
      return [];
    }

    let interfaces: ClabInterfaceTreeNode[] = [];

    // when using node filter, node is always 0th in the list.
    clabInsJSON[0].interfaces.map((intf) => {
      if (intf.state === "unknown") {
        // Skip 'lo' or transitional interfaces that report UNKNOWN
        return;
      }


      let tooltip: string[] = [`Name: ${intf.name}`, `State: ${intf.state}`, `Type: ${intf.type}`, `MAC: ${intf.mac}`, `MTU: ${intf.mtu}`];
      let label: string = intf.name;
      let description: string = utils.titleCase(intf.state);

      if (intf.alias) {
        tooltip[1] = `Alias: ${intf.alias}`;
        description = `${utils.titleCase(intf.state)} - ${intf.alias}`;
      }

      // Determine the proper icons based on the interface state.
      let context = "containerlabInterface";
      let iconLight: vscode.Uri;
      let iconDark: vscode.Uri;

      if (intf.state === "up") {
        context = "containerlabInterfaceUp";
        iconLight = this.getResourceUri(IntfStateIcons.UP);
        iconDark = this.getResourceUri(IntfStateIcons.UP);
      } else if (intf.state === "down") {
        context = "containerlabInterfaceDown";
        iconLight = this.getResourceUri(IntfStateIcons.DOWN);
        iconDark = this.getResourceUri(IntfStateIcons.DOWN);
      } else {  
        iconLight = this.getResourceUri(IntfStateIcons.LIGHT);
        iconDark = this.getResourceUri(IntfStateIcons.DARK);
      }

      const node = new ClabInterfaceTreeNode(
        label,
        vscode.TreeItemCollapsibleState.None,
        cName,
        cID,
        intf.name,
        intf.type,
        intf.alias,
        intf.mac,
        intf.mtu,
        intf.ifindex,
        context
      );
      node.tooltip = tooltip.join("\n");
      node.description = description;
      node.iconPath = { light: iconLight, dark: iconDark };

      interfaces.push(node);
    });

    console.log(`[discovery]:\tDiscovered ${interfaces.length} interfaces for ${cName}`);
    return interfaces;
  }


  /**
  * Convert the filepath of something in the ./resources dir
  * to an extension context Uri.
  */
  private getResourceUri(resource: string) {
    return vscode.Uri.file(this.context.asAbsolutePath(path.join("resources", resource)));
  }
}
