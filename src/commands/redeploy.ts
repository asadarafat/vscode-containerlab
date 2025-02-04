import { ClabLabTreeNode } from "../clabTreeDataProvider";
import { ClabCommand } from "./clabCommand";
import { SpinnerMsg } from "./command";

export function redeploy(node: ClabLabTreeNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Redeploying Lab... Check the Output window (Containerlab) for detailed progress.",
    successMsg: "Lab redeployed successfully!"
  };
  const redeployCmd = new ClabCommand("redeploy", node, spinnerMessages);
  redeployCmd.run();
}

export function redeployCleanup(node: ClabLabTreeNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Redeploying Lab (cleanup)... Check the Output window (Containerlab) for detailed progress.",
    successMsg: "Lab redeployed (cleanup) successfully!"
  };
  const redeployCmd = new ClabCommand("redeploy", node, spinnerMessages);
  redeployCmd.run(["-c"]);
}
