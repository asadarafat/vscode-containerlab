import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeYaml } from '../../src/topoViewer/utilities/normalizeLinks';

function readFixture(name: string): string {
  // Resolve from project root so compiled test path doesn’t need fixture copies
  const fixturePath = path.resolve(process.cwd(), 'test', 'fixtures', name);
  return fs.readFileSync(fixturePath, 'utf8');
}

describe('normalizeLinks', () => {
  it('short veth endpoints', () => {
    const yaml = readFixture('veth-short.yaml');
    const links = normalizeYaml(yaml);
    expect(links).to.have.length(1);
    const l = links[0];
    expect(l.provenance).to.equal('short');
    expect(l.linkType).to.equal('short');
    expect(l.sourceNode).to.equal('n1');
    expect(l.sourceIface).to.equal('eth1');
    expect(l.targetNode).to.equal('n2');
    expect(l.targetIface).to.equal('eth1');
  });

  it('extended veth', () => {
    const yaml = readFixture('veth-extended.yaml');
    const [l] = normalizeYaml(yaml);
    expect(l.provenance).to.equal('extended');
    expect(l.linkType).to.equal('veth');
    expect(l.sourceNode).to.equal('n1');
    expect(l.targetNode).to.equal('n2');
    expect(l.sourceIface).to.equal('eth1');
    expect(l.targetIface).to.equal('eth1');
  });

  it('mgmt-net endpoint', () => {
    const yaml = readFixture('mgmt-net.yaml');
    const [l] = normalizeYaml(yaml);
    expect(l.linkType).to.equal('mgmt-net');
    expect(l.sourceNode).to.equal('n1');
    expect(l.targetNode).to.equal('mgmt-net');
    expect(l.targetIface).to.equal('br-mgmt');
    expect(l.meta?.hostInterface).to.equal('br-mgmt');
  });

  it('macvlan endpoint', () => {
    const yaml = readFixture('macvlan.yaml');
    const [l] = normalizeYaml(yaml);
    expect(l.linkType).to.equal('macvlan');
    expect(l.sourceNode).to.equal('n1');
    expect(l.targetNode).to.equal('macvlan:eth0');
    expect(l.meta?.hostInterface).to.equal('eth0');
    expect(l.meta?.mode).to.equal('bridge');
  });

  it('host endpoint', () => {
    const yaml = readFixture('host.yaml');
    const [l] = normalizeYaml(yaml);
    expect(l.linkType).to.equal('host');
    expect(l.sourceNode).to.equal('n1');
    expect(l.targetNode).to.equal('host');
    expect(l.targetIface).to.equal('tap0');
    expect(l.meta?.hostInterface).to.equal('tap0');
  });

  it('vxlan endpoint', () => {
    const yaml = readFixture('vxlan.yaml');
    const [l] = normalizeYaml(yaml);
    expect(l.linkType).to.equal('vxlan');
    expect(l.sourceNode).to.equal('n1');
    expect(l.targetNode).to.equal('vxlan:192.0.2.10/1001');
    expect(l.meta?.remote).to.equal('192.0.2.10');
    expect(l.meta?.vni).to.equal(1001);
    expect(l.meta?.udpPort).to.equal(4789);
  });

  it('vxlan-stitched endpoint', () => {
    const yaml = readFixture('vxlan-stitched.yaml');
    const [l] = normalizeYaml(yaml);
    expect(l.linkType).to.equal('vxlan-stitch');
    expect(l.sourceNode).to.equal('n1');
    expect(l.targetNode).to.equal('vxlan-stitch:198.51.100.20/2002');
    expect(l.meta?.remote).to.equal('198.51.100.20');
    expect(l.meta?.vni).to.equal(2002);
    expect(l.meta?.udpPort).to.equal(8472);
  });

  it('dummy endpoint', () => {
    const yaml = readFixture('dummy.yaml');
    const [l] = normalizeYaml(yaml);
    expect(l.linkType).to.equal('dummy');
    expect(l.sourceNode).to.equal('n1');
    expect(l.sourceIface).to.equal('eth5');
    expect(l.targetNode).to.equal('dummy:n1:eth5');
  });
});
/* eslint-env mocha */
/* global describe, it */
