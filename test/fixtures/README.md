Fixtures to exercise Containerlab link formats used by the extension.

Files
- veth-short.yaml: Short-form veth links with endpoints ["node:if","node:if"].
- veth-extended.yaml: Extended veth with object endpoints, mtu, labels.
- mgmt-net.yaml: mgmt-net link with host-interface and endpoint.
- macvlan.yaml: macvlan link with host-interface, optional mode.
- host.yaml: host link with host-interface and endpoint.
- vxlan.yaml: vxlan link with remote, vni, udp-port, endpoint.
- vxlan-stitched.yaml: vxlan-stitch variant with same required fields.
- dummy.yaml: dummy link with endpoint.

Acceptance criteria (Phase 1)
- Each file validates against the bundled schema (schema/clab.schema.json).
- Names are unique and minimal; nodes defined where required.
- Covers both short and extended representation where applicable.

Note: Later phases will use these fixtures to verify parsing, rendering, save round-trips, and editor behaviors.

