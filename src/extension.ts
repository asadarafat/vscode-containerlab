import * as vscode from 'vscode';
import { ContainerlabTreeDataProvider, ContainerlabNode } from './containerlabTreeDataProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new ContainerlabTreeDataProvider();
  vscode.window.registerTreeDataProvider('containerlabExplorer', provider);

  const refreshCmd = vscode.commands.registerCommand('containerlab.refresh', () => {
    provider.refresh();
  });
  context.subscriptions.push(refreshCmd);

  const openLabFileCmd = vscode.commands.registerCommand('containerlab.openLabFile', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No lab node selected.');
      return;
    }
    const labPath = node.details?.labPath;
    if (!labPath) {
      vscode.window.showErrorMessage('No labPath found for this lab.');
      return;
    }
    const fileUri = vscode.Uri.file(labPath);
    vscode.commands.executeCommand('vscode.open', fileUri);
  });
  context.subscriptions.push(openLabFileCmd);

  const startNodeCmd = vscode.commands.registerCommand('containerlab.startNode', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No container node selected.');
      return;
    }
    const containerId = node.details?.containerId;
    if (!containerId) {
      vscode.window.showErrorMessage('No containerId found to start.');
      return;
    }
    const terminal = vscode.window.createTerminal({ name: 'Containerlab Start Node' });
    terminal.sendText(`docker start ${containerId}`);
    terminal.show();
  });
  context.subscriptions.push(startNodeCmd);

  const stopNodeCmd = vscode.commands.registerCommand('containerlab.stopNode', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No container node selected.');
      return;
    }
    const containerId = node.details?.containerId;
    if (!containerId) {
      vscode.window.showErrorMessage('No containerId found to stop.');
      return;
    }
    const terminal = vscode.window.createTerminal({ name: 'Containerlab Stop Node' });
    terminal.sendText(`docker stop ${containerId}`);
    terminal.show();
  });
  context.subscriptions.push(stopNodeCmd);

  const attachShellCmd = vscode.commands.registerCommand('containerlab.attachShell', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No container node selected.');
      return;
    }
    const containerId = node.details?.containerId;
    if (!containerId) {
      vscode.window.showErrorMessage('No containerId for shell attach.');
      return;
    }
    const terminal = vscode.window.createTerminal({ name: 'Containerlab Shell' });
    terminal.sendText(`docker exec -it ${containerId} sh`);
    terminal.show();
  });
  context.subscriptions.push(attachShellCmd);

  const sshNodeCmd = vscode.commands.registerCommand('containerlab.sshNode', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No container node selected.');
      return;
    }
    const sshIp = node.details?.sshIp;
    if (!sshIp) {
      vscode.window.showErrorMessage('No IPv4 address found for SSH.');
      return;
    }
    const terminal = vscode.window.createTerminal({ name: 'Containerlab SSH' });
    terminal.sendText(`ssh admin@${sshIp}`);
    terminal.show();
  });
  context.subscriptions.push(sshNodeCmd);

  const showLogsCmd = vscode.commands.registerCommand('containerlab.showLogs', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No container node selected.');
      return;
    }
    const containerId = node.details?.containerId;
    if (!containerId) {
      vscode.window.showErrorMessage('No containerId to show logs.');
      return;
    }
    const terminal = vscode.window.createTerminal({ name: 'Containerlab Logs' });
    terminal.sendText(`docker logs -f ${containerId}`);
    terminal.show();
  });
  context.subscriptions.push(showLogsCmd);

  const destroyLabCmd = vscode.commands.registerCommand('containerlab.destroyLab', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No lab node selected.');
      return;
    }
    const labPath = node.details?.labPath;
    if (!labPath) {
      vscode.window.showErrorMessage('No labPath found to destroy.');
      return;
    }
    const terminal = vscode.window.createTerminal({ name: 'Containerlab Destroy Lab' });
    terminal.sendText(`sudo containerlab destroy -c -t ${labPath}`);
    terminal.show();
  });
  context.subscriptions.push(destroyLabCmd);

  const deployLabCmd = vscode.commands.registerCommand('containerlab.deployLab', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No lab node selected.');
      return;
    }
    const labPath = node.details?.labPath;
    if (!labPath) {
      vscode.window.showErrorMessage('No labPath found to reconfigure.');
      return;
    }
    const terminal = vscode.window.createTerminal({ name: 'Containerlab Deploy Lab' });
    terminal.sendText(`sudo containerlab deploy -c -t ${labPath}`);
    terminal.show();
  });
  context.subscriptions.push(deployLabCmd);

  const intervalId = setInterval(() => {
    provider.refresh();
  }, 10000);
  context.subscriptions.push({ dispose: () => clearInterval(intervalId) });

  vscode.window.showInformationMessage('Containerlab Extension is now active!');
}

export function deactivate() {
}
