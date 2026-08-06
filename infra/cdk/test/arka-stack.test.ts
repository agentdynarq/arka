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
      controlInstanceType: 't3.small',
      cellInstanceType: 't3.small',
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

  test('control plane uses its configured instance type (t3.small)', () => {
    // The control plane instance is tagged with Role=control-plane.
    // t3.small is used because this account restricts EC2 to free-tier
    // eligible types; the control/cell split is still threaded through
    // separate context values so the two can diverge without code change.
    const instances = template.findResources('AWS::EC2::Instance');
    const controlInstances = Object.values(instances).filter((r: any) =>
      r.Properties.Tags?.some(
        (t: any) => t.Key === 'Role' && t.Value === 'control-plane',
      ),
    );
    expect(controlInstances).toHaveLength(1);
    expect(controlInstances[0].Properties.InstanceType).toBe('t3.small');
  });

  test('cell instances use their configured instance type (t3.small)', () => {
    const instances = template.findResources('AWS::EC2::Instance');
    const cellInstances = Object.values(instances).filter((r: any) =>
      r.Properties.Tags?.some(
        (t: any) => t.Key === 'Role' && t.Value === 'cell',
      ),
    );
    expect(cellInstances).toHaveLength(2);
    for (const inst of cellInstances) {
      expect(inst.Properties.InstanceType).toBe('t3.small');
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

  test('cell SGs allow Postgres 5432 from control plane EIP only', () => {
    // Cell SGs should have a 5432 rule. The source is a Fn::Join token.
    const securityGroups = template.findResources('AWS::EC2::SecurityGroup');
    const cellSGs = Object.values(securityGroups).filter((sg: any) =>
      sg.Properties.GroupDescription?.includes('DB from control only'),
    );
    expect(cellSGs.length).toBe(2);
    for (const sg of cellSGs) {
      const pgRule = sg.Properties.SecurityGroupIngress.find(
        (r: any) => r.FromPort === 5432 && r.ToPort === 5432,
      );
      expect(pgRule).toBeDefined();
      // Source is a Fn::Join constructing "<EIP>/32", not 0.0.0.0/0
      expect(pgRule.CidrIp).not.toBe('0.0.0.0/0');
      expect(pgRule.CidrIp['Fn::Join']).toBeDefined();
    }
  });

  test('cell SGs allow Redis 6379 from control plane EIP only', () => {
    const securityGroups = template.findResources('AWS::EC2::SecurityGroup');
    const cellSGs = Object.values(securityGroups).filter((sg: any) =>
      sg.Properties.GroupDescription?.includes('DB from control only'),
    );
    expect(cellSGs.length).toBe(2);
    for (const sg of cellSGs) {
      const redisRule = sg.Properties.SecurityGroupIngress.find(
        (r: any) => r.FromPort === 6379 && r.ToPort === 6379,
      );
      expect(redisRule).toBeDefined();
      expect(redisRule.CidrIp).not.toBe('0.0.0.0/0');
      expect(redisRule.CidrIp['Fn::Join']).toBeDefined();
    }
  });

  test('control plane SG does NOT open 5432 or 6379', () => {
    const securityGroups = template.findResources('AWS::EC2::SecurityGroup');
    const controlSGs = Object.values(securityGroups).filter((sg: any) =>
      sg.Properties.GroupDescription?.includes('control plane'),
    );
    expect(controlSGs.length).toBe(1);
    const ingress = controlSGs[0].Properties.SecurityGroupIngress || [];
    for (const rule of ingress) {
      expect(rule.FromPort).not.toBe(5432);
      expect(rule.ToPort).not.toBe(5432);
      expect(rule.FromPort).not.toBe(6379);
      expect(rule.ToPort).not.toBe(6379);
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
  // ECR repository
  // -----------------------------------------------------------------

  test('creates one ECR repository named arka with scan on push', () => {
    template.resourceCountIs('AWS::ECR::Repository', 1);
    template.hasResourceProperties('AWS::ECR::Repository', {
      RepositoryName: 'arka',
      ImageScanningConfiguration: { ScanOnPush: true },
    });
  });

  // -----------------------------------------------------------------
  // Instance profiles: SSM reach + ECR pull, no SSH key needed
  // -----------------------------------------------------------------

  test('every instance has an instance profile (3 total)', () => {
    template.resourceCountIs('AWS::IAM::InstanceProfile', 3);
  });

  test('all three instance roles attach AmazonSSMManagedInstanceCore', () => {
    const roles = template.findResources('AWS::IAM::Role');
    const ssmRoles = Object.values(roles).filter((r: any) =>
      (r.Properties.ManagedPolicyArns || []).some((arn: any) =>
        JSON.stringify(arn).includes('AmazonSSMManagedInstanceCore'),
      ),
    );
    expect(ssmRoles).toHaveLength(3);
  });

  // -----------------------------------------------------------------
  // GitHub OIDC release role
  // -----------------------------------------------------------------

  test('creates a GitHub OIDC provider with the sts audience', () => {
    template.hasResourceProperties('Custom::AWSCDKOpenIdConnectProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIDList: ['sts.amazonaws.com'],
    });
  });

  test('the release role trusts only the arka repository, not a wildcard', () => {
    const roles = template.findResources('AWS::IAM::Role');
    const deployRole = Object.values(roles).find(
      (r: any) => r.Properties.RoleName === 'arka-github-deploy',
    ) as any;
    expect(deployRole).toBeDefined();
    const stmt = deployRole.Properties.AssumeRolePolicyDocument.Statement[0];
    expect(
      stmt.Condition.StringLike['token.actions.githubusercontent.com:sub'],
    ).toBe('repo:agentdynarq/arka:*');
    expect(
      stmt.Condition.StringEquals['token.actions.githubusercontent.com:aud'],
    ).toBe('sts.amazonaws.com');
  });

  test('the release role can push to ECR and run SSM, and SendCommand is scoped', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    const allStatements: any[] = [];
    for (const pol of Object.values(policies) as any[]) {
      allStatements.push(...pol.Properties.PolicyDocument.Statement);
    }

    const hasAction = (action: string) =>
      allStatements.some((s) => {
        const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
        return actions.includes(action);
      });

    expect(hasAction('ecr:PutImage')).toBe(true);
    expect(hasAction('ecr:GetAuthorizationToken')).toBe(true);
    expect(hasAction('ssm:SendCommand')).toBe(true);

    // ssm:SendCommand must be scoped to specific ARNs, never "*".
    const sendCommandStmts = allStatements.filter((s) => {
      const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
      return actions.includes('ssm:SendCommand');
    });
    expect(sendCommandStmts.length).toBeGreaterThan(0);
    for (const s of sendCommandStmts) {
      expect(s.Resource).not.toBe('*');
      expect(Array.isArray(s.Resource)).toBe(true);
      expect(s.Resource).not.toContain('*');
    }
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
        controlInstanceType: 't3.small',
        cellInstanceType: 't3.small',
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
        controlInstanceType: 't3.small',
        cellInstanceType: 't3.small',
        controlPlaneVpcCidr: '10.10.0.0/16',
        cells: {},
        machineImage: dummyAmi,
      });
    }).toThrow(/At least one cell/);
  });
});
