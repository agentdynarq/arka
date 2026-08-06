import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ArkaStack } from '../lib/stacks/arka-stack';

/**
 * CDK assertion tests for the Arka stack.
 *
 * These tests verify the structural correctness of the synthesized
 * CloudFormation template without requiring an AWS account.
 * Run with: npm test
 */
describe('ArkaStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();

    // Dummy AMI avoids MachineImage.lookup() which requires AWS API calls
    const dummyAmi = ec2.MachineImage.genericLinux({
      'ap-south-1': 'ami-test1234567890',
    });

    const stack = new ArkaStack(app, 'TestArkaStack', {
      env: { account: '123456789012', region: 'ap-south-1' },
      operatorIp: '203.0.113.1/32',
      keyName: 'arkakeypair',
      instanceType: 't3.small',
      controlPlaneVpcCidr: '10.10.0.0/16',
      cells: {
        'cell-1': { vpcCidr: '10.1.0.0/16' },
        'cell-2': { vpcCidr: '10.2.0.0/16' },
      },
      machineImage: dummyAmi,
    });

    template = Template.fromStack(stack);
  });

  // -----------------------------------------------------------------
  // VPC isolation: the core architecture claim
  // -----------------------------------------------------------------

  test('creates exactly 3 VPCs (control + 2 cells)', () => {
    template.resourceCountIs('AWS::EC2::VPC', 3);
  });

  test('creates no VPC peering connections', () => {
    template.resourceCountIs('AWS::EC2::VPCPeeringConnection', 0);
  });

  test('creates no transit gateway', () => {
    template.resourceCountIs('AWS::EC2::TransitGateway', 0);
  });

  test('creates no NAT gateways (cost savings)', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
  });

  // -----------------------------------------------------------------
  // EC2 instances
  // -----------------------------------------------------------------

  test('creates exactly 3 EC2 instances', () => {
    template.resourceCountIs('AWS::EC2::Instance', 3);
  });

  test('all instances use the specified instance type', () => {
    const instances = template.findResources('AWS::EC2::Instance');
    for (const [, resource] of Object.entries(instances)) {
      expect(resource.Properties.InstanceType).toBe('t3.small');
    }
  });

  test('all instances enforce IMDSv2', () => {
    template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
      LaunchTemplateData: Match.objectLike({
        MetadataOptions: Match.objectLike({
          HttpTokens: 'required',
        }),
      }),
    });
  });

  // -----------------------------------------------------------------
  // Elastic IPs
  // -----------------------------------------------------------------

  test('creates exactly 3 Elastic IPs (control + 2 cells)', () => {
    template.resourceCountIs('AWS::EC2::EIP', 3);
  });

  test('all EIPs are associated with instances', () => {
    template.resourceCountIs('AWS::EC2::EIPAssociation', 3);
  });

  // -----------------------------------------------------------------
  // Security groups
  // -----------------------------------------------------------------

  test('creates exactly 3 security groups', () => {
    template.resourceCountIs('AWS::EC2::SecurityGroup', 3);
  });

  test('no security group allows inbound on port 5432 (Postgres)', () => {
    const securityGroups = template.findResources('AWS::EC2::SecurityGroup');
    for (const [, sg] of Object.entries(securityGroups)) {
      const ingress = sg.Properties.SecurityGroupIngress || [];
      for (const rule of ingress) {
        expect(rule.FromPort).not.toBe(5432);
        expect(rule.ToPort).not.toBe(5432);
      }
    }
  });

  test('no security group allows inbound on port 6379 (Redis)', () => {
    const securityGroups = template.findResources('AWS::EC2::SecurityGroup');
    for (const [, sg] of Object.entries(securityGroups)) {
      const ingress = sg.Properties.SecurityGroupIngress || [];
      for (const rule of ingress) {
        expect(rule.FromPort).not.toBe(6379);
        expect(rule.ToPort).not.toBe(6379);
      }
    }
  });

  test('SSH is restricted to operator IP only', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      SecurityGroupIngress: Match.arrayWith([
        Match.objectLike({
          FromPort: 22,
          ToPort: 22,
          CidrIp: '203.0.113.1/32',
        }),
      ]),
    });
  });

  // -----------------------------------------------------------------
  // Input validation
  // -----------------------------------------------------------------

  test('throws if operatorIp is not set', () => {
    const app = new cdk.App();
    const dummyAmi = ec2.MachineImage.genericLinux({ 'ap-south-1': 'ami-test' });
    expect(() => {
      new ArkaStack(app, 'BadStack', {
        env: { account: '123456789012', region: 'ap-south-1' },
        operatorIp: 'REPLACE_WITH_YOUR_IP/32',
        keyName: 'arkakeypair',
        instanceType: 't3.small',
        controlPlaneVpcCidr: '10.10.0.0/16',
        cells: { 'cell-1': { vpcCidr: '10.1.0.0/16' } },
        machineImage: dummyAmi,
      });
    }).toThrow(/operatorIp must be set/);
  });

  test('throws if no cells are defined', () => {
    const app = new cdk.App();
    const dummyAmi = ec2.MachineImage.genericLinux({ 'ap-south-1': 'ami-test' });
    expect(() => {
      new ArkaStack(app, 'EmptyStack', {
        env: { account: '123456789012', region: 'ap-south-1' },
        operatorIp: '203.0.113.1/32',
        keyName: 'arkakeypair',
        instanceType: 't3.small',
        controlPlaneVpcCidr: '10.10.0.0/16',
        cells: {},
        machineImage: dummyAmi,
      });
    }).toThrow(/At least one cell/);
  });
});
